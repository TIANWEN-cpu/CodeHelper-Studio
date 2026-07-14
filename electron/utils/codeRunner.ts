import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { rm } from 'fs/promises'
import { app, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
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

// ---------------------------------------------------------------------------
// Local execution guardrail constants
// ---------------------------------------------------------------------------

const MAX_OUTPUT_SIZE = 1024 * 1024 // 1 MB stdout/stderr cap
const MAX_CONCURRENT = 5
const TERMINATION_GRACE_MS = 2_000
let activeProcesses = 0

/** Default execution timeout (ms) — overridable per-call. */
const DEFAULT_TIMEOUT = 10_000
/** Compile timeout (ms). */
const COMPILE_TIMEOUT = 15_000
/** Maximum memory for spawned processes (bytes). Used on Linux via ulimit. */
const MAX_MEMORY_BYTES = 256 * 1024 * 1024 // 256 MB
/** Maximum file size writable by sandboxed code (bytes). */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
const NODE_HEAP_LIMIT_MB = 256

const IS_WIN = process.platform === 'win32'
const _IS_MAC = process.platform === 'darwin'
const EXE_EXT = IS_WIN ? '.exe' : ''

const resolvedPaths = new Map<string, string>()
const MAX_RESOLVED_PATHS = 50

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

export type CodeRunStage = 'compile' | 'run' | 'sql'

export interface CodeRunResult {
  stdout: string
  stderr: string
  exitCode: number
  stage: CodeRunStage
  timedOut?: boolean
}

function createRunDir(): string {
  const rootDir = join(app.getPath('temp'), 'codehelper-run')
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

export async function runCodeSnippet(
  code: string,
  language: string,
  stdin?: string,
): Promise<CodeRunResult> {
  switch (language) {
    case 'python':
      return runPython(code, stdin)
    case 'c':
      return runCFamily(code, stdin, 'gcc')
    case 'cpp':
      return runCFamily(code, stdin, 'g++')
    case 'csharp':
      return runCSharp(code, stdin)
    case 'javascript':
    case 'node':
      return runNode(code, stdin)
    case 'sql':
      return runSql(code)
    default:
      return { stdout: '', stderr: `不支持的语言: ${language}`, exitCode: 1, stage: 'run' }
  }
}

async function runPython(code: string, stdin?: string): Promise<CodeRunResult> {
  const runDir = createRunDir()
  const file = join(runDir, 'main.py')
  let processResult: ProcessRunResult | null = null
  try {
    writeFileSync(file, code)
    // On some Linux distributions, only 'python3' is available (not 'python')
    const pythonCmd = IS_WIN ? 'python' : 'python3'
    processResult = await runProcess(
      resolveCommand(pythonCmd),
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

async function runNode(code: string, stdin?: string): Promise<CodeRunResult> {
  const runDir = createRunDir()
  const file = join(runDir, 'main.js')
  let processResult: ProcessRunResult | null = null
  try {
    writeFileSync(file, code)
    processResult = await runProcess(
      resolveCommand('node'),
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
): Promise<CodeRunResult> {
  const runDir = createRunDir()
  const ext = compiler === 'gcc' ? 'c' : 'cpp'
  const srcFile = join(runDir, `main.${ext}`)
  const outFile = join(runDir, `main${EXE_EXT}`)
  let processResult: ProcessRunResult | null = null

  try {
    writeFileSync(srcFile, code)
    processResult = await runProcess(
      resolveCommand(compiler),
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

async function runCSharp(code: string, stdin?: string): Promise<CodeRunResult> {
  const runDir = createRunDir()
  const srcFile = join(runDir, 'Main.cs')
  const outFile = join(runDir, 'Main.exe')
  let processResult: ProcessRunResult | null = null

  try {
    writeFileSync(srcFile, code)
    // Windows uses .NET Framework csc; macOS/Linux use Mono mcs.
    const compiler = IS_WIN ? 'csc' : 'mcs'
    const compilerArgs = IS_WIN ? ['/out:' + outFile, srcFile] : ['-out:' + outFile, srcFile]
    processResult = await runProcess(
      resolveCommand(compiler),
      compilerArgs,
      undefined,
      COMPILE_TIMEOUT,
      runDir,
    )
    if (processResult.exitCode !== 0) {
      return toCodeRunResult({ ...processResult, stdout: '' }, 'compile')
    }

    const runCommand = IS_WIN ? outFile : resolveCommand('mono')
    const runArgs = IS_WIN ? [] : [outFile]
    processResult = await runProcess(runCommand, runArgs, stdin, DEFAULT_TIMEOUT, runDir)
    return toCodeRunResult(processResult, 'run')
  } finally {
    await cleanupAfterExecution(runDir, processResult)
  }
}

function forceKillUtilityProcess(child: UtilityProcess): boolean {
  const pid = child.pid
  if (pid === undefined) return true
  try {
    process.kill(pid, 'SIGKILL')
    return true
  } catch {
    return child.kill()
  }
}

function runSqlUtility(request: SqlRunnerRequest, runDir: string): Promise<SqlUtilityRunResult> {
  if (activeProcesses >= MAX_CONCURRENT) {
    return Promise.resolve({
      error: '并发执行数量已达上限，请稍后重试',
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
      killRequested = child.kill()
    }

    const ensureExit = () => {
      if (processExited) return
      child.kill()
      if (!timers.responseExit) {
        timers.responseExit = setTimeout(() => forceKillUtilityProcess(child), 1_000)
      }
    }

    try {
      child = utilityProcess.fork(join(__dirname, 'sqlRunnerUtility.js'), [], {
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
 * On Linux/macOS we use `ulimit` via `sh -c` to enforce file-size and optional
 * address-space limits. Node uses V8's heap limit instead because a low
 * RLIMIT_AS prevents the runtime from reserving its code range. On Windows we
 * rely on runtime limits, timeout, and the output cap (no native ulimit).
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

  // Linux / macOS: wrap in ulimit to cap memory and file size
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

/**
 * Spawn a child process with local resource and lifecycle guardrails.
 *
 * Safety measures:
 * 1. Hard timeout (default 10 s) with SIGKILL fallback
 * 2. Address-space limit via ulimit on POSIX, or a V8 heap limit for Node
 * 3. File-size limit via ulimit on POSIX (50 MB)
 * 4. Output cap at 1 MB
 * 5. Concurrency cap (5 simultaneous)
 * 6. Process-group kill on timeout AND output overflow to catch child forks
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
    let terminationConfirmed = false
    let killRequested: boolean | undefined
    let outputBytes = 0
    let slotReleased = false
    const timers: { run?: NodeJS.Timeout; termination?: NodeJS.Timeout } = {}
    let stdout = ''
    let stderr = ''

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
        env: buildChildEnv(runDir ?? app.getPath('temp')),
        stdio: 'pipe',
      })
    } catch (error) {
      terminationConfirmed = true
      releaseSlot()
      settle({
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      })
      return
    }

    const terminationResult = () => {
      const terminationStatus = terminationConfirmed
        ? '进程已终止'
        : killRequested === false
          ? '终止命令失败，已停止等待'
          : '未收到进程退出确认，已停止等待'
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
      if (timers.termination || settled) return
      if (timers.run) clearTimeout(timers.run)
      timers.termination = setTimeout(() => settle(terminationResult()), TERMINATION_GRACE_MS)
      killRequested = killProcessTree(proc)
      if (settled && timers.termination) clearTimeout(timers.termination)
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

    proc.on('close', (code) => {
      terminationConfirmed = true
      releaseSlot()
      if (outputExceeded || timedOut) settle(terminationResult())
      else settle({ stdout, stderr, exitCode: code ?? 1 })
    })
    proc.on('error', (error) => {
      if (proc.pid === undefined) {
        terminationConfirmed = true
        releaseSlot()
      }
      if (outputExceeded || timedOut) settle(terminationResult())
      else settle({ stdout, stderr: error.message, exitCode: 1 })
    })
  })
}
