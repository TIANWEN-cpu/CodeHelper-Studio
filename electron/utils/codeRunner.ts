import Database from 'better-sqlite3'
import { spawn, spawnSync, execFileSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { splitSqlStatements, isQueryStatement, formatRows } from './sqlUtils'

// ---------------------------------------------------------------------------
// Security sandbox constants
// ---------------------------------------------------------------------------

const MAX_OUTPUT_SIZE = 1024 * 1024 // 1 MB stdout/stderr cap
const MAX_CONCURRENT = 5
let activeProcesses = 0

/** Default execution timeout (ms) — overridable per-call. */
const DEFAULT_TIMEOUT = 10_000
/** Compile timeout (ms). */
const COMPILE_TIMEOUT = 15_000
/** Maximum memory for spawned processes (bytes). Used on Linux via ulimit. */
const MAX_MEMORY_BYTES = 256 * 1024 * 1024 // 256 MB
/** Maximum file size writable by sandboxed code (bytes). */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
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
  // Evict oldest entries if cache is full
  if (resolvedPaths.size >= MAX_RESOLVED_PATHS) {
    const oldest = resolvedPaths.keys().next()
    if (!oldest.done) resolvedPaths.delete(oldest.value)
  }
  resolvedPaths.set(cmd, resolved)
}

export type CodeRunStage = 'compile' | 'run' | 'sql'

export interface CodeRunResult {
  stdout: string
  stderr: string
  exitCode: number
  stage: CodeRunStage
}

function getTempDir(): string {
  const tempDir = join(app.getPath('temp'), 'codehelper-run')
  mkdirSync(tempDir, { recursive: true })
  return tempDir
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
    case 'sql':
      return runSql(code)
    default:
      return { stdout: '', stderr: `不支持的语言: ${language}`, exitCode: 1, stage: 'run' }
  }
}

async function runPython(code: string, stdin?: string): Promise<CodeRunResult> {
  const file = join(getTempDir(), `main_${randomUUID()}.py`)
  writeFileSync(file, code)
  // On some Linux distributions, only 'python3' is available (not 'python')
  const pythonCmd = IS_WIN ? 'python' : 'python3'
  const result = await runProcess(resolveCommand(pythonCmd), [file], stdin)
  return { ...result, stage: 'run' as const }
}

async function runCFamily(
  code: string,
  stdin: string | undefined,
  compiler: 'gcc' | 'g++',
): Promise<CodeRunResult> {
  const tempDir = getTempDir()
  const uid = randomUUID()
  const ext = compiler === 'gcc' ? 'c' : 'cpp'
  const srcFile = join(tempDir, `main_${uid}.${ext}`)
  const outFile = join(tempDir, `main_${uid}${EXE_EXT}`)
  writeFileSync(srcFile, code)

  const compile = spawnSync(resolveCommand(compiler), [srcFile, '-o', outFile], {
    timeout: COMPILE_TIMEOUT,
  })
  if (compile.status !== 0) {
    return {
      stdout: '',
      stderr: String(compile.stderr ?? ''),
      exitCode: compile.status ?? 1,
      stage: 'compile' as const,
    }
  }

  const result = await runProcess(resolveCommand(outFile), [], stdin)
  return { ...result, stage: 'run' as const }
}

async function runCSharp(code: string, stdin?: string): Promise<CodeRunResult> {
  const tempDir = getTempDir()
  const uid = randomUUID()
  const srcFile = join(tempDir, `Main_${uid}.cs`)
  const outFile = join(tempDir, `Main_${uid}${EXE_EXT}`)
  writeFileSync(srcFile, code)

  // Windows uses .NET Framework csc; macOS/Linux use Mono mcs
  const compiler = IS_WIN ? 'csc' : 'mcs'
  const compilerArgs = IS_WIN ? ['/out:' + outFile, srcFile] : ['-out:' + outFile, srcFile]
  const compile = spawnSync(resolveCommand(compiler), compilerArgs, { timeout: COMPILE_TIMEOUT })
  if (compile.status !== 0) {
    return {
      stdout: '',
      stderr: String(compile.stderr ?? ''),
      exitCode: compile.status ?? 1,
      stage: 'compile' as const,
    }
  }

  const result = await runProcess(resolveCommand(outFile), [], stdin)
  return { ...result, stage: 'run' as const }
}

async function runSql(code: string): Promise<CodeRunResult> {
  const db = new Database(':memory:')

  try {
    const statements = splitSqlStatements(code)
    if (statements.length === 0) {
      return { stdout: '', stderr: '', exitCode: 0, stage: 'sql' }
    }

    for (const statement of statements.slice(0, -1)) {
      db.exec(statement)
    }

    const last = statements[statements.length - 1]
    if (isQueryStatement(last)) {
      const rows = db.prepare(last).all() as Record<string, unknown>[]
      return {
        stdout: formatRows(rows),
        stderr: '',
        exitCode: 0,
        stage: 'sql',
      }
    }

    db.exec(last)
    return { stdout: '执行成功', stderr: '', exitCode: 0, stage: 'sql' }
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      stage: 'sql',
    }
  } finally {
    db.close()
  }
}

/**
 * Build sandboxed spawn options.
 *
 * On Linux/macOS we use `ulimit` via `sh -c` to enforce memory and file-size
 * limits. On Windows we rely on the timeout + output cap (no native ulimit).
 */
function buildSandboxArgs(cmd: string, args: string[]): { shell: string; shellArgs: string[] } {
  if (IS_WIN) {
    // Windows: no ulimit equivalent; rely on timeout + output cap
    return { shell: cmd, shellArgs: args }
  }

  // Linux / macOS: wrap in ulimit to cap memory and file size
  const escaped = [cmd, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
  const ulimit = `ulimit -v ${Math.floor(MAX_MEMORY_BYTES / 1024)} 2>/dev/null; ulimit -f ${Math.floor(MAX_FILE_SIZE_BYTES / 1024)} 2>/dev/null; ${escaped}`
  return { shell: '/bin/sh', shellArgs: ['-c', ulimit] }
}

/**
 * Spawn a child process with security sandbox constraints.
 *
 * Safety measures:
 * 1. Hard timeout (default 10 s) with SIGKILL fallback
 * 2. Memory limit via ulimit on POSIX (256 MB)
 * 3. File-size limit via ulimit on POSIX (50 MB)
 * 4. Output cap at 1 MB
 * 5. Concurrency cap (5 simultaneous)
 * 6. Process-group kill on timeout to catch child forks
 */
function runProcess(
  cmd: string,
  args: string[],
  stdin?: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (activeProcesses >= MAX_CONCURRENT) {
    return Promise.resolve({
      stdout: '',
      stderr: '并发执行数量已达上限，请稍后重试',
      exitCode: 1,
    })
  }

  activeProcesses++
  return new Promise((resolve) => {
    let outputExceeded = false
    let decremented = false
    let killed = false

    const { shell, shellArgs } = buildSandboxArgs(cmd, args)
    const proc = spawn(shell, shellArgs, {
      // Use process groups on POSIX so we can kill all children
      detached: !IS_WIN,
    })
    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      killed = true
      try {
        if (IS_WIN) {
          // Windows: taskkill the tree
          try {
            execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
              timeout: 3000,
              stdio: 'ignore',
            })
          } catch {
            proc.kill()
          }
        } else {
          // POSIX: kill the entire process group
          try {
            process.kill(-proc.pid, 'SIGKILL')
          } catch {
            proc.kill('SIGKILL')
          }
        }
      } catch {
        proc.kill('SIGKILL')
      }
    }, timeout)

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.length > MAX_OUTPUT_SIZE && !outputExceeded) {
        outputExceeded = true
        clearTimeout(timer)
        proc.kill()
      }
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > MAX_OUTPUT_SIZE && !outputExceeded) {
        outputExceeded = true
        clearTimeout(timer)
        proc.kill()
      }
    })

    if (stdin) {
      try {
        proc.stdin.write(stdin)
        proc.stdin.end()
      } catch (error) {
        console.warn('[codeRunner] Failed to write stdin:', error)
      }
    }

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (!decremented) {
        decremented = true
        activeProcesses--
      }
      if (outputExceeded) {
        resolve({ stdout: '', stderr: '输出超过1MB限制，进程已终止', exitCode: 1 })
      } else if (killed) {
        resolve({
          stdout,
          stderr: `执行超时（${timeout / 1000}s），进程已终止。可能原因：死循环或计算量过大`,
          exitCode: 1,
        })
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 1 })
      }
    })
    proc.on('error', (error) => {
      clearTimeout(timer)
      if (!decremented) {
        decremented = true
        activeProcesses--
      }
      resolve({ stdout, stderr: error.message, exitCode: 1 })
    })
  })
}
