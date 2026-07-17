import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { app, utilityProcess, type UtilityProcess } from 'electron'
import {
  isCodeRunnerUtilityResponse,
  type CodeRunnerUtilityRequest,
  type CodeRunResult,
} from './codeRunnerProtocol'
import { resolveUtilityEntryPath } from './utilityEntryPath'

const UTILITY_WALL_TIMEOUT_MS = 35_000
const EXIT_GRACE_MS = 2_000
const JOB_EXIT_GRACE_MS = 6_000
const JOB_HOST_READY_TIMEOUT_MS = 5_000
const JOB_ACTIVE_PROCESS_LIMIT = 32
const JOB_PROCESS_MEMORY_MB = 384
const JOB_TOTAL_MEMORY_MB = 768
const UTILITY_RUN_ROOT_ENV = 'CODEHELPER_INTERNAL_RUN_ROOT'

interface WindowsJobController {
  exited: Promise<void>
  completion: Promise<Error | null>
  terminate: () => void
}

function failure(message: string): CodeRunResult {
  return { stdout: '', stderr: message, exitCode: 1, stage: 'run' }
}

function inheritedUtilityEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
}

function createUtilityRunRoot(): string {
  const runRoot = join(tmpdir(), 'codehelper-run', `utility_${randomUUID()}`)
  mkdirSync(runRoot, { recursive: true, mode: 0o700 })
  return runRoot
}

async function cleanupUtilityRunRoot(runRoot: string): Promise<void> {
  try {
    await rm(runRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch (error) {
    console.warn(`[codeRunner] Failed to remove utility run root ${runRoot}:`, error)
  }
}

function waitForUtilitySpawn(child: UtilityProcess): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const cleanup = () => {
      child.off('spawn', onSpawn)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    const onSpawn = () => {
      cleanup()
      resolvePromise()
    }
    const onError = (type: string, location?: string) => {
      cleanup()
      reject(new Error(`Runner utility error: ${type}${location ? ` (${location})` : ''}`))
    }
    const onExit = (code: number) => {
      cleanup()
      reject(new Error(`Runner utility exited before startup (${code})`))
    }
    child.once('spawn', onSpawn)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

function waitForUtilityResponse(
  child: UtilityProcess,
  request: CodeRunnerUtilityRequest,
): Promise<CodeRunResult> {
  return new Promise((resolvePromise, reject) => {
    let settled = false
    const timer = setTimeout(
      () => finish(new Error('Runner utility exceeded its wall-time limit')),
      UTILITY_WALL_TIMEOUT_MS,
    )

    const cleanup = () => {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    const finish = (error?: Error, result?: CodeRunResult) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else if (result) resolvePromise(result)
      else reject(new Error('Runner utility returned no result'))
    }
    const onMessage = (message: unknown) => {
      if (!isCodeRunnerUtilityResponse(message)) {
        finish(new Error('Runner utility returned an invalid response'))
      } else if (message.kind === 'error') {
        finish(new Error(message.error))
      } else {
        finish(undefined, message.result)
      }
    }
    const onError = (type: string, location?: string) =>
      finish(new Error(`Runner utility error: ${type}${location ? ` (${location})` : ''}`))
    const onExit = (code: number) =>
      finish(new Error(`Runner utility exited without a result (${code})`))

    child.on('message', onMessage)
    child.once('error', onError)
    child.once('exit', onExit)
    try {
      child.postMessage(request)
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function waitWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), timeoutMs)
    void promise.then(() => {
      clearTimeout(timer)
      resolvePromise(true)
    })
  })
}

async function failIfJobClosesBeforeResponse(job: WindowsJobController): Promise<never> {
  const error = await job.completion
  throw error ?? new Error('Windows 作业对象控制器在代码返回结果前退出')
}

function terminateUtility(child: UtilityProcess): void {
  try {
    child.kill()
  } catch {
    // A failed kill is not an exit; keep the lifecycle promise pending.
  }
}

function terminateJob(job: WindowsJobController | null): void {
  if (!job) return
  try {
    job.terminate()
  } catch {
    // Keep the concurrency slot reserved until the host actually closes.
  }
}

async function shutdownRunner(
  child: UtilityProcess,
  utilityExited: Promise<void>,
  job: WindowsJobController | null,
  allowGracefulExit: boolean,
): Promise<Error | null> {
  if (!allowGracefulExit) {
    terminateJob(job)
    terminateUtility(child)
    await Promise.all([utilityExited, ...(job ? [job.exited] : [])])
    return job ? await job.completion : null
  }

  if (!(await waitWithin(utilityExited, EXIT_GRACE_MS))) {
    terminateJob(job)
    terminateUtility(child)
    await Promise.all([utilityExited, ...(job ? [job.exited] : [])])
    return job ? await job.completion : null
  }

  if (job) {
    if (!(await waitWithin(job.exited, JOB_EXIT_GRACE_MS))) terminateJob(job)
    await job.exited
    return job.completion
  }
  return null
}

function resolveJobHostPath(): string | null {
  const override = process.env.CODEHELPER_JOB_HOST_PATH
  const executable = 'codehelper-job-host.exe'
  const candidates = [
    override ? resolve(override) : null,
    app.isPackaged
      ? join(process.resourcesPath, 'bin', 'win32-x64', executable)
      : join(__dirname, '..', '..', 'resources', 'bin', 'win32-x64', executable),
    join(process.cwd(), 'resources', 'bin', 'win32-x64', executable),
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export interface LocalRunnerHostReadiness {
  available: boolean
  utilityEntryAvailable: boolean
  windowsJobHostRequired: boolean
  windowsJobHostAvailable: boolean
  reason: string
}

export function getLocalRunnerHostReadiness(): LocalRunnerHostReadiness {
  const utilityEntryAvailable = existsSync(
    resolveUtilityEntryPath(__dirname, 'codeRunnerUtility.js'),
  )
  const windowsJobHostRequired = process.platform === 'win32'
  const windowsJobHostAvailable = !windowsJobHostRequired || resolveJobHostPath() !== null
  const available = utilityEntryAvailable && windowsJobHostAvailable
  return {
    available,
    utilityEntryAvailable,
    windowsJobHostRequired,
    windowsJobHostAvailable,
    reason: !utilityEntryAvailable
      ? '代码执行 utility 入口缺失；本地受控执行将 fail-closed。'
      : !windowsJobHostAvailable
        ? 'Windows Job Host 缺失；本地受控执行将 fail-closed。'
        : windowsJobHostRequired
          ? '代码执行 utility 与 Windows Job Host 均可用。'
          : '代码执行 utility 可用；POSIX 资源控制仍是 best-effort 边界。',
  }
}

function armWindowsJob(utilityPid: number): Promise<WindowsJobController> {
  const hostPath = resolveJobHostPath()
  if (!hostPath) {
    return Promise.reject(new Error('Windows 作业对象控制器缺失；为避免弱隔离执行，本次代码未运行'))
  }

  return new Promise((resolvePromise, reject) => {
    let host: ChildProcessWithoutNullStreams
    try {
      host = spawn(
        hostPath,
        [
          '--utilityPid',
          String(utilityPid),
          '--activeProcessLimit',
          String(JOB_ACTIVE_PROCESS_LIMIT),
          '--processMemoryMB',
          String(JOB_PROCESS_MEMORY_MB),
          '--jobMemoryMB',
          String(JOB_TOTAL_MEMORY_MB),
        ],
        { windowsHide: true, stdio: 'pipe' },
      )
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    let ready = false
    let hostClosed = false
    let startupFailure: Error | null = null
    let runtimeFailure: Error | null = null
    let stdout = ''
    let stderr = ''
    let resolveExited: () => void = () => undefined
    const exited = new Promise<void>((resolveExit) => {
      resolveExited = resolveExit
    })
    let resolveCompletion: (error: Error | null) => void = () => undefined
    const completion = new Promise<Error | null>((resolveResult) => {
      resolveCompletion = resolveResult
    })
    const terminateHost = () => {
      if (hostClosed || host.killed) return
      try {
        host.kill('SIGKILL')
      } catch {
        // Keep lifecycle promises pending until the host actually closes.
      }
    }
    const rejectBeforeReady = (message: string) => {
      if (ready || startupFailure) return
      startupFailure = new Error(message)
      clearTimeout(timer)
      terminateHost()
      void exited.then(() => reject(startupFailure as Error))
    }
    const timer = setTimeout(() => {
      rejectBeforeReady('Windows 作业对象控制器启动超时；本次代码未运行')
    }, JOB_HOST_READY_TIMEOUT_MS)

    host.stdout.setEncoding('utf8')
    host.stderr.setEncoding('utf8')
    host.stdout.on('data', (chunk: string) => {
      stdout = (stdout + chunk).slice(-8_192)
      const lines = stdout.split(/\r?\n/)
      const failureLine = lines.find((line) => line.trim().startsWith('ERROR'))
      if (failureLine) {
        if (!ready) rejectBeforeReady(failureLine.trim())
        else if (!runtimeFailure) {
          runtimeFailure = new Error(failureLine.trim())
          terminateHost()
        }
        return
      }
      if (lines.some((line) => line.trim() === 'READY') && !ready) {
        ready = true
        clearTimeout(timer)
        resolvePromise({
          exited,
          completion,
          terminate: terminateHost,
        })
      }
    })
    host.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8_192)
    })
    host.once('error', (error) => rejectBeforeReady(error.message))
    host.once('close', (code) => {
      hostClosed = true
      clearTimeout(timer)
      resolveExited()
      if (ready) {
        resolveCompletion(
          runtimeFailure ??
            (code === 0
              ? null
              : new Error(
                  `Windows 作业对象控制器异常退出 (${code})${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
                )),
        )
      }
      rejectBeforeReady(
        `Windows 作业对象控制器提前退出 (${code})${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
      )
    })
  })
}

/** Run one request in a disposable Electron utility process. */
export async function runCodeInUtility(request: CodeRunnerUtilityRequest): Promise<CodeRunResult> {
  let child: UtilityProcess | null = null
  let job: WindowsJobController | null = null
  let runRoot: string | null = null
  let resolveExited: () => void = () => undefined
  const utilityExited = new Promise<void>((resolveExit) => {
    resolveExited = resolveExit
  })

  try {
    runRoot = createUtilityRunRoot()
    child = utilityProcess.fork(resolveUtilityEntryPath(__dirname, 'codeRunnerUtility.js'), [], {
      env: { ...inheritedUtilityEnvironment(), [UTILITY_RUN_ROOT_ENV]: runRoot },
      execArgv: ['--max-old-space-size=256'],
      serviceName: 'CodeHelper Code Runner',
      stdio: 'ignore',
      disclaim: true,
    })
    child.once('exit', resolveExited)
    await waitForUtilitySpawn(child)
    if (process.platform === 'win32') {
      if (child.pid === undefined) throw new Error('Runner utility PID is unavailable')
      job = await armWindowsJob(child.pid)
    }

    const response = waitForUtilityResponse(child, request)
    const result = job
      ? await Promise.race([response, failIfJobClosesBeforeResponse(job)])
      : await response
    const shutdownError = await shutdownRunner(child, utilityExited, job, true)
    return shutdownError ? failure(shutdownError.message) : result
  } catch (error) {
    const result = failure(error instanceof Error ? error.message : String(error))
    if (child) await shutdownRunner(child, utilityExited, job, false)
    return result
  } finally {
    if (runRoot) await cleanupUtilityRunRoot(runRoot)
  }
}
