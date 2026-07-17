import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { rm } from 'fs/promises'
import type { UtilityProcess } from 'electron'
import { randomUUID } from 'crypto'
import { basename, dirname, join, resolve } from 'path'
import { tmpdir } from 'os'
import { splitSqlStatements, isQueryStatement } from './sqlUtils'
import {
  SQL_MAX_CELL_BYTES,
  SQL_MAX_INPUT_BYTES,
  SQL_MAX_OUTPUT_BYTES,
  SQL_MAX_ROWS,
  SQL_TIMEOUT_MS,
  type SqlRunnerRequest,
  type SqlRunnerResponse,
  isSqlRunnerResponse,
  validateSqlStatements,
} from './sqlRunnerProtocol'
import {
  detectToolchains,
  detectToolchainsAsync,
  findToolchainForLanguage,
  getIsolationInfo,
  missingToolchainError,
  type ExecutionMode,
  type IsolationInfo,
  type ToolchainEntry,
  type ToolchainReport,
} from './toolchainDetect'
import {
  startRunDirectoryQuotaMonitor,
  type RunDirectoryQuotaMonitor,
  type RunDirectoryQuotaViolation,
} from './runDirectoryQuota'
import type { CodeRunResult, CodeRunStage, CodeRunnerUtilityRequest } from './codeRunnerProtocol'
import { resolveUtilityEntryPath } from './utilityEntryPath'
import { runDockerIsolated } from './dockerRunner'

// ---------------------------------------------------------------------------
// Local execution guardrail constants
// ---------------------------------------------------------------------------

const MAX_OUTPUT_SIZE = 1024 * 1024 // 1 MB stdout/stderr cap
const MAX_CONCURRENT = 5
const TERMINATION_GRACE_MS = 2_000
const ROOT_OUTPUT_DRAIN_GRACE_MS = 500
const POSIX_PROCESS_GROUP_GRACE_MS = 250
const POSIX_PROCESS_GROUP_POLL_MS = 25
let activeProcesses = 0

/** Default execution timeout (ms) — overridable per-call. */
const DEFAULT_TIMEOUT = 10_000
/** Compile timeout (ms). */
const COMPILE_TIMEOUT = 15_000
/** Address-space limit for POSIX runtimes that can tolerate RLIMIT_AS. */
const MAX_MEMORY_BYTES = 256 * 1024 * 1024 // 256 MB
/** Maximum file size writable by sandboxed code (bytes). */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const RUN_DIRECTORY_SCAN_INTERVAL_MS = 200
const NODE_HEAP_LIMIT_MB = 256
const UTILITY_RUN_ROOT_ENV = 'CODEHELPER_INTERNAL_RUN_ROOT'

const IS_WIN = process.platform === 'win32'
const _IS_MAC = process.platform === 'darwin'
const EXE_EXT = IS_WIN ? '.exe' : ''

const resolvedPaths = new Map<string, string>()
const MAX_RESOLVED_PATHS = 50
let utilityProcessPromise: Promise<(typeof import('electron'))['utilityProcess']> | undefined

function loadUtilityProcess(): Promise<(typeof import('electron'))['utilityProcess']> {
  utilityProcessPromise ??= import('electron').then((runtime) => runtime.utilityProcess)
  return utilityProcessPromise
}

function resolveCommand(cmd: string): string {
  const cached = resolvedPaths.get(cmd)
  if (cached !== undefined) return cached
  try {
    const lookup = IS_WIN ? 'where' : 'which'
    const resolved = execFileSync(lookup, [cmd], { timeout: 5000, encoding: 'utf-8' })
      .trim()
      .split(/\r?\n/)[0]
    setResolvedPath(cmd, resolved)
    return resolved
  } catch {
    setResolvedPath(cmd, cmd)
    return cmd
  }
}

function setResolvedPath(cmd: string, resolved: string): void {
  // Evict oldest entries if cache is full (Map 维持插入顺序，作为简易 LRU)
  if (resolvedPaths.size >= MAX_RESOLVED_PATHS) {
    const oldest = resolvedPaths.keys().next()
    if (!oldest.done) resolvedPaths.delete(oldest.value)
  }
  // 先 delete 再 set：让重新解析的命令排到队尾，避免它一直停留在"最旧"位置
  // 被优先淘汰（真正的 LRU 语义）。对全新 key，delete 是 no-op。
  resolvedPaths.delete(cmd)
  resolvedPaths.set(cmd, resolved)
}

export type { ExecutionMode, ToolchainReport, ToolchainEntry, IsolationInfo }
export type { CodeRunResult, CodeRunStage }
export { detectToolchains, detectToolchainsAsync, getIsolationInfo }

function withIsolation(
  result: CodeRunResult,
  mode: ExecutionMode = 'local-controlled',
): CodeRunResult {
  return { ...result, isolation: result.isolation ?? getIsolationInfo(mode) }
}

function detectLanguageToolchain(language: string): ToolchainEntry | undefined {
  const report = detectToolchains()
  return findToolchainForLanguage(report, language)
}

function toolchainBlocked(tool: ToolchainEntry | undefined): CodeRunResult | null {
  if (tool?.status === 'missing') {
    return withIsolation({
      stdout: '',
      stderr: missingToolchainError(tool),
      exitCode: 1,
      stage: 'run',
      toolchain: tool,
    })
  }
  return null
}

function formatSpawnError(error: Error, commandHint?: string): string {
  const message = error.message || String(error)
  if (/ENOENT/i.test(message) || /not found/i.test(message)) {
    const hint = commandHint ? `（命令：${commandHint}）` : ''
    return `未找到可执行文件${hint}。请在“运行环境”状态中查看工具链探测结果与安装建议。\n原始错误：${message}`
  }
  return message
}

function isFileSizeLimitFailure(
  stderr: string,
  signal: NodeJS.Signals | null | undefined,
): boolean {
  if (signal === 'SIGXFSZ') return true

  // Node reports RLIMIT_FSIZE failures as EFBIG, but the exact stack format
  // varies between releases. Requiring the errno and its description avoids
  // treating an unrelated mention of EFBIG as a quota violation.
  return /\bEFBIG\b/.test(stderr) && /file too large/i.test(stderr)
}

function createRunDir(): string {
  const defaultRoot = resolve(tmpdir(), 'codehelper-run')
  const configuredRoot = process.env[UTILITY_RUN_ROOT_ENV]
  const resolvedConfiguredRoot = configuredRoot ? resolve(configuredRoot) : null
  const rootDir =
    resolvedConfiguredRoot &&
    dirname(resolvedConfiguredRoot) === defaultRoot &&
    basename(resolvedConfiguredRoot).startsWith('utility_')
      ? resolvedConfiguredRoot
      : defaultRoot
  mkdirSync(rootDir, { recursive: true, mode: 0o700 })

  const runDir = join(rootDir, `run_${randomUUID()}`)
  mkdirSync(runDir, { mode: 0o700 })
  return runDir
}

async function cleanupRunDir(runDir: string): Promise<void> {
  try {
    await rm(runDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 })
  } catch {
    // Best-effort: the OS temp cleanup can reclaim a directory held by a failed process.
  }
}

interface ExecutionLifecycle {
  processExited: boolean
  exited: Promise<void>
}

interface ProcessRunResult extends ExecutionLifecycle {
  stdout: string
  stderr: string
  exitCode: number
  timedOut?: boolean
}

interface SqlUtilityRunResult extends ExecutionLifecycle {
  response?: SqlRunnerResponse
  error?: string
  timedOut?: boolean
}

async function cleanupAfterExecution(
  runDir: string,
  execution: ExecutionLifecycle | null,
): Promise<void> {
  if (execution && !execution.processExited) {
    void execution.exited.then(() => cleanupRunDir(runDir))
    return
  }
  await cleanupRunDir(runDir)
}

function toCodeRunResult(result: ProcessRunResult, stage: CodeRunStage): CodeRunResult {
  const output: CodeRunResult = {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    stage,
  }
  if (result.timedOut !== undefined) output.timedOut = result.timedOut
  return output
}

function buildChildEnv(runDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const inheritedKeys = [
    'PATH',
    'Path',
    'PATHEXT',
    'SystemRoot',
    'SYSTEMROOT',
    'SystemDrive',
    'WINDIR',
    'ComSpec',
    'COMSPEC',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TZ',
    'DOTNET_ROOT',
  ]

  for (const key of inheritedKeys) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }

  env.HOME = runDir
  env.USERPROFILE = runDir
  env.TMPDIR = runDir
  env.TMP = runDir
  env.TEMP = runDir
  return env
}

const SUPERVISED_LANGUAGES = new Set(['python', 'c', 'cpp', 'csharp', 'javascript', 'node'])

export async function runCodeSnippet(
  code: string,
  language: string,
  stdin?: string,
  executionMode: ExecutionMode = 'local-controlled',
  signal?: AbortSignal,
): Promise<CodeRunResult> {
  if (executionMode === 'strong-isolation') {
    if (activeProcesses >= MAX_CONCURRENT) {
      return withIsolation(
        {
          stdout: '',
          stderr: '并发执行数量已达上限，请稍后重试',
          exitCode: 1,
          stage: 'run',
        },
        executionMode,
      )
    }
    activeProcesses++
    try {
      return withIsolation(
        await runDockerIsolated(code, language, stdin, {}, signal),
        executionMode,
      )
    } finally {
      activeProcesses--
    }
  }
  const normalized = language.trim().toLowerCase()
  if (normalized === 'sql' || !SUPERVISED_LANGUAGES.has(normalized)) {
    return runCodeSnippetDirect(code, normalized, stdin)
  }

  const report = await detectToolchainsAsync()
  const toolchain = findToolchainForLanguage(report, normalized)
  const blocked = toolchainBlocked(toolchain)
  if (blocked) return blocked

  if (activeProcesses >= MAX_CONCURRENT) {
    return withIsolation({
      stdout: '',
      stderr: '并发执行数量已达上限，请稍后重试',
      exitCode: 1,
      stage: 'run',
    })
  }

  activeProcesses++
  const request: CodeRunnerUtilityRequest = {
    kind: 'run-code',
    code,
    language: normalized,
    executionMode,
    ...(stdin !== undefined ? { stdin } : {}),
    ...(toolchain ? { toolchain } : {}),
  }
  try {
    const { runCodeInUtility } = await import('./codeRunnerSupervisor')
    return withIsolation(await runCodeInUtility(request))
  } finally {
    activeProcesses--
  }
}

/** Execute inside the already-isolated runner process. */
export async function runCodeSnippetDirect(
  code: string,
  language: string,
  stdin?: string,
  detectedToolchain?: ToolchainEntry,
): Promise<CodeRunResult> {
  const normalized = language.trim().toLowerCase()
  const toolchain =
    detectedToolchain ??
    (SUPERVISED_LANGUAGES.has(normalized) ? detectLanguageToolchain(normalized) : undefined)
  const blocked = toolchainBlocked(toolchain)
  if (blocked && normalized !== 'sql') return blocked

  switch (normalized) {
    case 'python':
      return withIsolation(await runPython(code, stdin, toolchain?.command))
    case 'c':
      return withIsolation(await runCFamily(code, stdin, 'gcc', toolchain?.command))
    case 'cpp':
      return withIsolation(await runCFamily(code, stdin, 'g++', toolchain?.command))
    case 'csharp':
      return withIsolation(await runCSharp(code, stdin, toolchain))
    case 'javascript':
    case 'node':
      return withIsolation(await runNode(code, stdin, toolchain?.command))
    case 'sql':
      return withIsolation(await runSql(code))
    default:
      return withIsolation({
        stdout: '',
        stderr: `不支持的语言: ${language}`,
        exitCode: 1,
        stage: 'run',
      })
  }
}

async function runPython(
  code: string,
  stdin?: string,
  detectedCommand?: string,
): Promise<CodeRunResult> {
  const runDir = createRunDir()
  const file = join(runDir, 'main.py')
  let processResult: ProcessRunResult | null = null
  try {
    writeFileSync(file, code)
    // On some Linux distributions, only 'python3' is available (not 'python')
    const pythonCmd = detectedCommand ?? (IS_WIN ? 'python' : 'python3')
    processResult = await runProcess(
      detectedCommand ? pythonCmd : resolveCommand(pythonCmd),
      [file],
      stdin,
      DEFAULT_TIMEOUT,
      runDir,
    )
    return toCodeRunResult(processResult, 'run')
  } finally {
    await cleanupAfterExecution(runDir, processResult)
  }
}

async function runNode(
  code: string,
  stdin?: string,
  detectedCommand?: string,
): Promise<CodeRunResult> {
  const runDir = createRunDir()
  const file = join(runDir, 'main.js')
  let processResult: ProcessRunResult | null = null
  try {
    writeFileSync(file, code)
    processResult = await runProcess(
      detectedCommand ?? resolveCommand('node'),
      [`--max-old-space-size=${NODE_HEAP_LIMIT_MB}`, file],
      stdin,
      DEFAULT_TIMEOUT,
      runDir,
      null,
    )
    return toCodeRunResult(processResult, 'run')
  } finally {
    await cleanupAfterExecution(runDir, processResult)
  }
}

async function runCFamily(
  code: string,
  stdin: string | undefined,
  compiler: 'gcc' | 'g++',
  detectedCommand?: string,
): Promise<CodeRunResult> {
  const runDir = createRunDir()
  const ext = compiler === 'gcc' ? 'c' : 'cpp'
  const srcFile = join(runDir, `main.${ext}`)
  const outFile = join(runDir, `main${EXE_EXT}`)
  let processResult: ProcessRunResult | null = null

  try {
    writeFileSync(srcFile, code)
    processResult = await runProcess(
      detectedCommand ?? resolveCommand(compiler),
      [srcFile, '-o', outFile],
      undefined,
      COMPILE_TIMEOUT,
      runDir,
    )
    if (processResult.exitCode !== 0) {
      return toCodeRunResult({ ...processResult, stdout: '' }, 'compile')
    }

    processResult = await runProcess(outFile, [], stdin, DEFAULT_TIMEOUT, runDir)
    return toCodeRunResult(processResult, 'run')
  } finally {
    await cleanupAfterExecution(runDir, processResult)
  }
}

function dotnetTargetFramework(version?: string): string {
  const major = Number(version?.match(/(?:^|\s)(\d+)\./)?.[1])
  return Number.isSafeInteger(major) && major >= 6 && major <= 99 ? `net${major}.0` : 'net8.0'
}

function compileFailure(result: ProcessRunResult): CodeRunResult {
  return toCodeRunResult(
    {
      ...result,
      stdout: '',
      stderr: [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n'),
    },
    'compile',
  )
}

async function runCSharp(
  code: string,
  stdin?: string,
  toolchain?: ToolchainEntry,
): Promise<CodeRunResult> {
  const runDir = createRunDir()
  let processResult: ProcessRunResult | null = null

  try {
    // The detector's exact command drives execution; do not re-probe on every run.
    if (toolchain?.csharpVariant === 'dotnet') {
      const srcFile = join(runDir, 'Program.cs')
      const projectFile = join(runDir, 'CodeHelperRun.csproj')
      const outputDir = join(runDir, 'out')
      writeFileSync(srcFile, code)
      writeFileSync(
        projectFile,
        `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>${dotnetTargetFramework(toolchain.version)}</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`,
      )
      processResult = await runProcess(
        toolchain.command ?? resolveCommand('dotnet'),
        ['build', projectFile, '--nologo', '-c', 'Release', '-o', outputDir],
        undefined,
        COMPILE_TIMEOUT,
        runDir,
        null,
      )
      if (processResult.exitCode !== 0) return compileFailure(processResult)

      const assembly = join(outputDir, 'CodeHelperRun.dll')
      processResult = await runProcess(
        toolchain.command ?? resolveCommand('dotnet'),
        [assembly],
        stdin,
        DEFAULT_TIMEOUT,
        runDir,
        null,
      )
      return toCodeRunResult(processResult, 'run')
    }

    const srcFile = join(runDir, 'Main.cs')
    const outFile = join(runDir, `Main${EXE_EXT}`)
    writeFileSync(srcFile, code)
    const useMcs = toolchain?.csharpVariant === 'mcs' || (!IS_WIN && !toolchain?.csharpVariant)
    const usesMonoRuntime = !IS_WIN && (useMcs || toolchain?.csharpVariant === 'csc')
    const compiler = useMcs ? 'mcs' : 'csc'
    const compilerCommand = toolchain?.command ?? resolveCommand(compiler)
    const compilerArgs = useMcs ? ['-out:' + outFile, srcFile] : ['/out:' + outFile, srcFile]
    processResult = await runProcess(
      compilerCommand,
      compilerArgs,
      undefined,
      COMPILE_TIMEOUT,
      runDir,
    )
    if (processResult.exitCode !== 0) {
      return compileFailure(processResult)
    }

    const runCommand = usesMonoRuntime
      ? (toolchain?.runtimeCommand ?? resolveCommand('mono'))
      : outFile
    const runArgs = usesMonoRuntime ? [outFile] : []
    processResult = await runProcess(runCommand, runArgs, stdin, DEFAULT_TIMEOUT, runDir)
    return toCodeRunResult(processResult, 'run')
  } finally {
    await cleanupAfterExecution(runDir, processResult)
  }
}

function terminateUtilityProcess(child: UtilityProcess): boolean {
  try {
    return child.kill()
  } catch {
    return false
  }
}

function forceKillUtilityProcess(child: UtilityProcess): boolean {
  const pid = child.pid
  if (pid === undefined) return true
  try {
    process.kill(pid, 'SIGKILL')
    return true
  } catch {
    return terminateUtilityProcess(child)
  }
}

async function runSqlUtility(
  request: SqlRunnerRequest,
  runDir: string,
): Promise<SqlUtilityRunResult> {
  if (activeProcesses >= MAX_CONCURRENT) {
    return {
      error: '并发执行数量已达上限，请稍后重试',
      processExited: true,
      exited: Promise.resolve(),
    }
  }

  activeProcesses++

  // Node-only paths (including Docker isolation tests) must not require an
  // installed Electron binary merely by importing the shared runner module.
  let utilityProcess: (typeof import('electron'))['utilityProcess']
  try {
    utilityProcess = await loadUtilityProcess()
  } catch (error) {
    activeProcesses--
    return {
      error: error instanceof Error ? error.message : String(error),
      processExited: true,
      exited: Promise.resolve(),
    }
  }
  let resolveExited: () => void = () => undefined
  const exited = new Promise<void>((resolve) => {
    resolveExited = resolve
  })

  return new Promise((resolve) => {
    let child: UtilityProcess
    let settled = false
    let processExited = false
    let slotReleased = false
    let timedOut = false
    let killRequested: boolean | undefined
    let fatalError: string | undefined
    const timers: {
      run?: NodeJS.Timeout
      termination?: NodeJS.Timeout
      responseExit?: NodeJS.Timeout
    } = {}

    const releaseSlot = () => {
      if (slotReleased) return
      slotReleased = true
      activeProcesses--
      resolveExited()
    }

    const settle = (result: Omit<SqlUtilityRunResult, keyof ExecutionLifecycle>) => {
      if (settled) return
      settled = true
      if (timers.run) clearTimeout(timers.run)
      if (timers.termination) clearTimeout(timers.termination)
      resolve({ ...result, processExited, exited })
    }

    const timeoutError = () =>
      processExited
        ? 'SQL 执行超时，辅助进程已终止'
        : killRequested === false
          ? 'SQL 执行超时，终止辅助进程失败，已停止等待'
          : 'SQL 执行超时，未收到辅助进程退出确认，已停止等待'

    const terminate = () => {
      if (timers.termination || processExited) return
      timers.termination = setTimeout(() => {
        if (!processExited) killRequested = forceKillUtilityProcess(child)
        settle({ error: timeoutError(), timedOut: true })
      }, TERMINATION_GRACE_MS)
      killRequested = terminateUtilityProcess(child)
    }

    const ensureExit = () => {
      if (processExited) return
      terminateUtilityProcess(child)
      if (!timers.responseExit) {
        timers.responseExit = setTimeout(() => forceKillUtilityProcess(child), 1_000)
      }
    }

    try {
      child = utilityProcess.fork(resolveUtilityEntryPath(__dirname, 'sqlRunnerUtility.js'), [], {
        cwd: runDir,
        env: buildChildEnv(runDir) as Record<string, string>,
        execArgv: ['--max-old-space-size=128'],
        serviceName: 'CodeHelper SQL Runner',
        stdio: 'ignore',
        disclaim: true,
      })
    } catch (error) {
      processExited = true
      releaseSlot()
      settle({ error: error instanceof Error ? error.message : String(error) })
      return
    }

    timers.run = setTimeout(() => {
      timedOut = true
      terminate()
    }, SQL_TIMEOUT_MS)

    child.once('spawn', () => {
      if (timedOut || settled) {
        ensureExit()
        return
      }
      try {
        child.postMessage(request)
      } catch (error) {
        settle({ error: error instanceof Error ? error.message : String(error) })
        ensureExit()
      }
    })

    child.once('message', (message) => {
      if (settled || timedOut) return
      if (!isSqlRunnerResponse(message)) {
        settle({ error: 'SQL 辅助进程返回了无效响应' })
        ensureExit()
        return
      }
      settle({ response: message })
      timers.responseExit = setTimeout(() => forceKillUtilityProcess(child), 1_000)
    })

    child.on('error', (type, location) => {
      fatalError = `SQL 辅助进程错误: ${type}${location ? ` (${location})` : ''}`
    })

    child.on('exit', (code) => {
      processExited = true
      if (timers.responseExit) clearTimeout(timers.responseExit)
      releaseSlot()
      if (timedOut) settle({ error: timeoutError(), timedOut: true })
      else if (!settled) settle({ error: fatalError ?? `SQL 辅助进程异常退出 (${code})` })
    })
  })
}

async function runSql(code: string): Promise<CodeRunResult> {
  if (Buffer.byteLength(code, 'utf8') > SQL_MAX_INPUT_BYTES) {
    return {
      stdout: '',
      stderr: `SQL 输入不能超过 ${Math.floor(SQL_MAX_INPUT_BYTES / 1024)}KB`,
      exitCode: 1,
      stage: 'sql',
    }
  }

  const statements = splitSqlStatements(code)
  if (statements.length === 0) {
    return { stdout: '', stderr: '', exitCode: 0, stage: 'sql' }
  }

  const validationError = validateSqlStatements(statements)
  if (validationError) {
    return { stdout: '', stderr: validationError, exitCode: 1, stage: 'sql' }
  }

  const request: SqlRunnerRequest = {
    statements,
    queryLast: isQueryStatement(statements[statements.length - 1]),
    maxRows: SQL_MAX_ROWS,
    maxOutputBytes: SQL_MAX_OUTPUT_BYTES,
    maxCellBytes: SQL_MAX_CELL_BYTES,
  }
  const runDir = createRunDir()
  let utilityResult: SqlUtilityRunResult | null = null

  try {
    utilityResult = await runSqlUtility(request, runDir)
    if (utilityResult.timedOut || utilityResult.error) {
      const failure: CodeRunResult = {
        stdout: '',
        stderr: utilityResult.error ?? 'SQL 执行失败',
        exitCode: 1,
        stage: 'sql',
      }
      if (utilityResult.timedOut !== undefined) failure.timedOut = utilityResult.timedOut
      return failure
    }

    const response = utilityResult.response
    if (!response) {
      return { stdout: '', stderr: 'SQL 辅助进程未返回结果', exitCode: 1, stage: 'sql' }
    }
    if (!response.ok) {
      return { stdout: '', stderr: response.error, exitCode: 1, stage: 'sql' }
    }
    return {
      stdout: response.stdout,
      stderr: response.warning ?? '',
      exitCode: 0,
      stage: 'sql',
    }
  } finally {
    await cleanupAfterExecution(runDir, utilityResult)
  }
}

/**
 * Build guarded spawn options.
 *
 * On Linux/macOS we use `ulimit` via `sh -c` for file-size and optional,
 * runtime-specific address-space limits. Node uses only V8's old-space limit
 * because a low RLIMIT_AS prevents it from reserving its code range; dotnet
 * also runs without RLIMIT_AS. None of these is a strict RSS limit. On Windows
 * this direct runner relies on the outer Job Object plus the shared guards.
 */
function buildSandboxArgs(
  cmd: string,
  args: string[],
  addressSpaceLimitBytes: number | null,
): { shell: string; shellArgs: string[] } {
  if (IS_WIN) {
    // Windows: no ulimit equivalent; rely on timeout + output cap
    return { shell: cmd, shellArgs: args }
  }

  // Linux / macOS: always cap file size; apply address space only when compatible.
  const escaped = [cmd, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
  const memoryLimit =
    addressSpaceLimitBytes === null
      ? ''
      : `ulimit -v ${Math.floor(addressSpaceLimitBytes / 1024)} 2>/dev/null; `
  const ulimit = `${memoryLimit}ulimit -f ${Math.floor(MAX_FILE_SIZE_BYTES / 1024)} 2>/dev/null; ${escaped}`
  return { shell: '/bin/sh', shellArgs: ['-c', ulimit] }
}

/**
 * Forcefully terminate a spawned child and ALL of its descendants.
 *
 * On Windows we `taskkill /T` the process tree; on POSIX we SIGKILL the whole
 * process group (the child is spawned `detached`, so it leads its own group).
 * Falling back to a direct `proc.kill` keeps us safe if either path throws.
 *
 * Used by both the timeout path and the output-overflow path so a runaway
 * program can't leave orphaned child forks behind in either case.
 */
function killProcessTree(proc: ReturnType<typeof spawn>): boolean {
  try {
    if (IS_WIN) {
      try {
        if (proc.pid === undefined) return proc.kill('SIGKILL')
        execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
          timeout: 3000,
          stdio: 'ignore',
        })
        return true
      } catch {
        return proc.kill('SIGKILL')
      }
    }

    try {
      if (proc.pid !== undefined) {
        process.kill(-proc.pid, 'SIGKILL')
        return true
      }
      return proc.kill('SIGKILL')
    } catch {
      return proc.kill('SIGKILL')
    }
  } catch {
    return false
  }
}

function isPosixProcessGroupGone(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0)
    return false
  } catch (error) {
    // ESRCH is the only positive confirmation that the whole group is gone.
    // EPERM still means the group exists, even though it cannot be signalled.
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

function signalPosixProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-processGroupId, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      console.warn(
        `[codeRunner] Failed to send ${signal} to process group ${processGroupId}:`,
        error,
      )
    }
  }
}

async function waitForPosixProcessGroupExit(
  processGroupId: number,
  timeoutMs?: number,
): Promise<boolean> {
  const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs
  while (!isPosixProcessGroupGone(processGroupId)) {
    if (deadline !== undefined && Date.now() >= deadline) return false
    await new Promise<void>((resolve) => setTimeout(resolve, POSIX_PROCESS_GROUP_POLL_MS))
  }
  return true
}

async function terminateResidualPosixProcessGroup(processGroupId: number): Promise<void> {
  if (isPosixProcessGroupGone(processGroupId)) return

  signalPosixProcessGroup(processGroupId, 'SIGTERM')
  if (await waitForPosixProcessGroupExit(processGroupId, POSIX_PROCESS_GROUP_GRACE_MS)) return

  signalPosixProcessGroup(processGroupId, 'SIGKILL')
  // Keep the concurrency slot until kill(-pgid, 0) reports ESRCH. In
  // particular, EPERM is not an exit confirmation and must not release it.
  await waitForPosixProcessGroupExit(processGroupId)
}

/**
 * Spawn a child process with local resource and lifecycle guardrails.
 *
 * Safety measures:
 * 1. Hard timeout (default 10 s) with SIGKILL fallback
 * 2. Language-specific POSIX limits: address space where compatible, V8 old-space for Node
 * 3. File-size limit via ulimit on POSIX and total run-directory cap (50 MB)
 * 4. Output cap at 1 MB
 * 5. Concurrency cap (5 simultaneous)
 * 6. Process-group cleanup on timeout, output overflow, and normal root exit
 */
function runProcess(
  cmd: string,
  args: string[],
  stdin?: string,
  timeout = DEFAULT_TIMEOUT,
  runDir?: string,
  addressSpaceLimitBytes: number | null = MAX_MEMORY_BYTES,
): Promise<ProcessRunResult> {
  if (activeProcesses >= MAX_CONCURRENT) {
    return Promise.resolve({
      stdout: '',
      stderr: '并发执行数量已达上限，请稍后重试',
      exitCode: 1,
      processExited: true,
      exited: Promise.resolve(),
    })
  }

  activeProcesses++
  let resolveExited: () => void = () => undefined
  const exited = new Promise<void>((resolve) => {
    resolveExited = resolve
  })
  return new Promise((resolve) => {
    let outputExceeded = false
    let timedOut = false
    let settled = false
    let rootExited = false
    let terminationConfirmed = false
    let killRequested: boolean | undefined
    let processError: Error | null = null
    let directoryViolation: RunDirectoryQuotaViolation | null = null
    let outputBytes = 0
    let slotReleased = false
    const timers: { run?: NodeJS.Timeout; termination?: NodeJS.Timeout } = {}
    let directoryMonitor: RunDirectoryQuotaMonitor | null = null
    let stdout = ''
    let stderr = ''
    let resolveProcessClosed: () => void = () => undefined
    const processClosed = new Promise<void>((resolveClose) => {
      resolveProcessClosed = resolveClose
    })

    const releaseSlot = () => {
      if (slotReleased) return
      slotReleased = true
      activeProcesses--
      resolveExited()
    }

    const settle = (result: {
      stdout: string
      stderr: string
      exitCode: number
      timedOut?: boolean
    }) => {
      if (settled) return
      settled = true
      if (timers.run) clearTimeout(timers.run)
      if (timers.termination) clearTimeout(timers.termination)
      directoryMonitor?.stop()
      resolve({ ...result, processExited: terminationConfirmed, exited })
    }

    const { shell, shellArgs } = buildSandboxArgs(cmd, args, addressSpaceLimitBytes)
    let proc: ChildProcessWithoutNullStreams
    try {
      proc = spawn(shell, shellArgs, {
        // Explicitly disable shell on Windows to prevent cmd.exe injection.
        // On POSIX, shell execution is intentional for ulimit wrapping.
        shell: IS_WIN ? false : undefined,
        // Use process groups on POSIX so we can kill all children.
        detached: !IS_WIN,
        cwd: runDir,
        env: buildChildEnv(runDir ?? tmpdir()),
        stdio: 'pipe',
      })
    } catch (error) {
      terminationConfirmed = true
      releaseSlot()
      settle({
        stdout: '',
        stderr:
          error instanceof Error
            ? formatSpawnError(error, shell)
            : formatSpawnError(new Error(String(error)), shell),
        exitCode: 1,
      })
      return
    }
    const processGroupId = IS_WIN ? undefined : proc.pid

    const waitForOutputDrain = async (): Promise<boolean> => {
      let drainTimer: NodeJS.Timeout | undefined
      try {
        return await Promise.race([
          processClosed.then(() => true),
          new Promise<boolean>((resolveDrain) => {
            drainTimer = setTimeout(() => resolveDrain(false), ROOT_OUTPUT_DRAIN_GRACE_MS)
          }),
        ])
      } finally {
        if (drainTimer) clearTimeout(drainTimer)
      }
    }

    const terminationResult = () => {
      const terminationStatus = terminationConfirmed
        ? '进程已终止'
        : killRequested === false
          ? '终止命令失败，已停止等待'
          : '未收到进程退出确认，已停止等待'
      if (directoryViolation?.kind === 'size') {
        return {
          stdout: '',
          stderr: `临时目录写入超过${Math.floor(MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB限制，${terminationStatus}`,
          exitCode: 1,
        }
      }
      if (directoryViolation?.kind === 'scan-error') {
        return {
          stdout: '',
          stderr: `无法继续监控临时目录写入：${directoryViolation.error.message}，${terminationStatus}`,
          exitCode: 1,
        }
      }
      if (outputExceeded) {
        return { stdout: '', stderr: `输出超过1MB限制，${terminationStatus}`, exitCode: 1 }
      }
      return {
        stdout,
        stderr: `执行超时（${timeout / 1000}s），${terminationStatus}。可能原因：死循环或计算量过大`,
        exitCode: 1,
        timedOut: true,
      }
    }

    const terminate = () => {
      if (rootExited || timers.termination || settled) return
      if (timers.run) clearTimeout(timers.run)
      killRequested = killProcessTree(proc)
      timers.termination = setTimeout(() => {
        if (!rootExited) killRequested = killProcessTree(proc)
      }, TERMINATION_GRACE_MS)
    }

    if (runDir) {
      directoryMonitor = startRunDirectoryQuotaMonitor({
        directory: runDir,
        maxBytes: MAX_FILE_SIZE_BYTES,
        intervalMs: RUN_DIRECTORY_SCAN_INTERVAL_MS,
        onViolation: (violation) => {
          directoryViolation = violation
          if (!terminationConfirmed) terminate()
        },
      })
    }

    timers.run = setTimeout(() => {
      timedOut = true
      terminate()
    }, timeout)

    const appendOutput = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
      if (outputExceeded || settled) return
      const bytes = Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk)
      if (outputBytes + bytes > MAX_OUTPUT_SIZE) {
        outputExceeded = true
        proc.stdout.removeAllListeners('data')
        proc.stderr.removeAllListeners('data')
        proc.stdout.resume()
        proc.stderr.resume()
        terminate()
        return
      }
      outputBytes += bytes
      if (target === 'stdout') stdout += chunk.toString()
      else stderr += chunk.toString()
    }

    proc.stdout.on('data', (chunk: Buffer | string) => appendOutput('stdout', chunk))
    proc.stderr.on('data', (chunk: Buffer | string) => appendOutput('stderr', chunk))

    proc.stdin.on('error', () => {
      // EPIPE is expected when a short-lived program exits before consuming stdin.
    })
    try {
      const stdinData = stdin
        ? stdin.length > MAX_OUTPUT_SIZE
          ? stdin.slice(0, MAX_OUTPUT_SIZE)
          : stdin
        : undefined
      proc.stdin.end(stdinData)
    } catch (error) {
      console.warn('[codeRunner] Failed to close stdin:', error)
    }

    const finishAfterRootExit = (code: number | null, signal?: NodeJS.Signals | null) => {
      if (rootExited) return
      rootExited = true
      if (timers.run) clearTimeout(timers.run)
      if (timers.termination) clearTimeout(timers.termination)
      const finish = async () => {
        const [outputDrained] = await Promise.all([
          waitForOutputDrain(),
          processGroupId === undefined
            ? Promise.resolve()
            : terminateResidualPosixProcessGroup(processGroupId),
        ])
        if (!outputDrained) {
          // Descendants may inherit the root pipes. Do not let those handles
          // keep this disposable runner alive after the bounded drain window.
          proc.stdout.destroy()
          proc.stderr.destroy()
        }
        await directoryMonitor?.checkNow()
        // POSIX RLIMIT_FSIZE may reject ftruncate/write before the polling
        // monitor can observe an oversized file. Normalize that OS-level
        // failure to the same product quota result used by the monitor.
        if (!directoryViolation && code !== 0 && isFileSizeLimitFailure(stderr, signal)) {
          directoryViolation = {
            kind: 'size',
            actualBytes: MAX_FILE_SIZE_BYTES + 1,
          }
        }
        terminationConfirmed = true
        releaseSlot()
        if (directoryViolation || outputExceeded || timedOut) settle(terminationResult())
        else if (processError) {
          settle({ stdout, stderr: formatSpawnError(processError, shell), exitCode: 1 })
        } else settle({ stdout, stderr, exitCode: code ?? 1 })
      }
      void finish()
    }
    proc.once('exit', (code, signal) => finishAfterRootExit(code, signal))
    proc.once('close', (code, signal) => {
      // close confirms stdout/stderr have drained. Spawn failures may emit it
      // without a preceding exit, while inherited pipes may delay it forever.
      resolveProcessClosed()
      finishAfterRootExit(code, signal)
    })
    proc.on('error', (error) => {
      processError = error
      if (proc.pid === undefined) {
        rootExited = true
        terminationConfirmed = true
        releaseSlot()
        settle({ stdout, stderr: formatSpawnError(error, shell), exitCode: 1 })
        return
      }
      terminate()
    })
  })
}
