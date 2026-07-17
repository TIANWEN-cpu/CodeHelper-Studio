import {
  spawn as defaultSpawn,
  execFile as defaultExecFile,
  type ChildProcess,
} from 'child_process'
import { chmodSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { CodeRunResult } from './codeRunnerProtocol'

export const DOCKER_TIMEOUT_MS = 10_000
export const DOCKER_OUTPUT_LIMIT = 1024 * 1024

/** Pinned tag + digest pairs for fail-closed strong isolation. Digests are not auto-updated. */
export const DOCKER_ISOLATION_IMAGES = {
  python: {
    tag: 'python:3.12-alpine',
    digest: 'sha256:6d43704baacd1bfbe7c295d7f13079d5d8104ed33568873133f8fc69980419df',
  },
  node: {
    tag: 'node:22-alpine',
    digest: 'sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2',
  },
  gcc: {
    tag: 'gcc:14',
    digest: 'sha256:1ea81e094f614fd2ed066316651dbac8eecb4d36add2ddd8a26151374c85c52c',
  },
  csharp: {
    tag: 'mcr.microsoft.com/dotnet/sdk:8.0-alpine',
    digest: 'sha256:5f12aa62868b69dcb41de9cd7f8759822f7d1f56c3b31908048ad65df0981e67',
  },
} as const

export type DockerImageSpec = (typeof DOCKER_ISOLATION_IMAGES)[keyof typeof DOCKER_ISOLATION_IMAGES]

export function dockerImageRef(image: DockerImageSpec): string {
  return `${image.tag}@${image.digest}`
}

/** All pinned image references required for strong isolation readiness. */
export const REQUIRED_DOCKER_IMAGE_REFS: readonly string[] = [
  dockerImageRef(DOCKER_ISOLATION_IMAGES.python),
  dockerImageRef(DOCKER_ISOLATION_IMAGES.node),
  dockerImageRef(DOCKER_ISOLATION_IMAGES.gcc),
  dockerImageRef(DOCKER_ISOLATION_IMAGES.csharp),
]

interface LanguageTarget {
  image: DockerImageSpec
  file: string
  command: string
  pidsLimit: number
}

const targets: Record<string, LanguageTarget> = {
  python: {
    image: DOCKER_ISOLATION_IMAGES.python,
    file: 'main.py',
    command: 'python3 /work/main.py',
    pidsLimit: 32,
  },
  javascript: {
    image: DOCKER_ISOLATION_IMAGES.node,
    file: 'main.js',
    command: 'node /work/main.js',
    pidsLimit: 32,
  },
  node: {
    image: DOCKER_ISOLATION_IMAGES.node,
    file: 'main.js',
    command: 'node /work/main.js',
    pidsLimit: 32,
  },
  c: {
    image: DOCKER_ISOLATION_IMAGES.gcc,
    file: 'main.c',
    command: 'gcc /work/main.c -o /tmp/main && /tmp/main',
    pidsLimit: 32,
  },
  cpp: {
    image: DOCKER_ISOLATION_IMAGES.gcc,
    file: 'main.cpp',
    command: 'g++ /work/main.cpp -o /tmp/main && /tmp/main',
    pidsLimit: 32,
  },
  csharp: {
    image: DOCKER_ISOLATION_IMAGES.csharp,
    file: 'Program.cs',
    command:
      'cp /work/Program.cs /tmp/Program.cs && printf \'<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\' >/tmp/run.csproj && dotnet restore /tmp/run.csproj --ignore-failed-sources && dotnet run --project /tmp/run.csproj --no-restore --configuration Release',
    // Roslyn / MSBuild spawn extra processes beyond the user program.
    pidsLimit: 128,
  },
}

export type DockerSpawn = (
  command: string,
  args: readonly string[],
  options: { stdio: 'pipe'; windowsHide: boolean },
) => ChildProcess

export type DockerExecFile = (
  command: string,
  args: readonly string[],
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => unknown

export interface DockerRunnerDeps {
  spawn: DockerSpawn
  execFile: DockerExecFile
  timeoutMs: number
  outputLimit: number
}

const defaultDeps: DockerRunnerDeps = {
  spawn: defaultSpawn as DockerSpawn,
  execFile: defaultExecFile as DockerExecFile,
  timeoutMs: DOCKER_TIMEOUT_MS,
  outputLimit: DOCKER_OUTPUT_LIMIT,
}

function readContainerId(cidFile: string): string | null {
  try {
    if (!existsSync(cidFile)) return null
    const id = readFileSync(cidFile, 'utf8').trim()
    return id.length > 0 ? id : null
  } catch {
    return null
  }
}

function forceRemoveContainer(execFile: DockerExecFile, containerId: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      execFile('docker', ['rm', '-f', containerId], (error) => resolve(error === null))
    } catch {
      resolve(false)
    }
  })
}

async function forceRemoveKnownContainer(
  execFile: DockerExecFile,
  cidFile: string,
  containerName: string,
): Promise<void> {
  // The deterministic name closes the race before Docker writes the cidfile.
  for (let attempt = 0; attempt < 5; attempt++) {
    const target = readContainerId(cidFile) ?? containerName
    if (await forceRemoveContainer(execFile, target)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/**
 * SQL is intentionally outside Docker strong isolation.
 * It uses an in-memory SQLite utility process as a separate security boundary under
 * local-controlled mode only. Strong-isolation requests for SQL fail closed.
 */
function sqlStrongIsolationRejected(): CodeRunResult {
  return {
    stdout: '',
    stderr:
      'SQL is not available under strong isolation. SQL runs only in local-controlled mode via an in-memory SQLite utility process (separate security boundary). Switch execution mode to local-controlled to run SQL.',
    exitCode: 1,
    stage: 'run',
  }
}

export async function runDockerIsolated(
  code: string,
  language: string,
  stdin?: string,
  deps: Partial<DockerRunnerDeps> = {},
  signal?: AbortSignal,
): Promise<CodeRunResult> {
  const { spawn, execFile, timeoutMs, outputLimit } = { ...defaultDeps, ...deps }
  if (signal?.aborted) {
    return {
      stdout: '',
      stderr: 'Strong isolation cancelled',
      exitCode: 1,
      stage: 'run',
    }
  }
  const normalized = language.trim().toLowerCase()

  if (normalized === 'sql') {
    return sqlStrongIsolationRejected()
  }

  const target = targets[normalized]
  if (!target) {
    return {
      stdout: '',
      stderr: `Strong isolation does not support ${language}`,
      exitCode: 1,
      stage: 'run',
    }
  }

  const runId = randomUUID()
  const root = join(tmpdir(), 'codehelper-docker', runId)
  const sourceFile = join(root, target.file)
  const containerName = `codehelper-isolation-${runId}`
  mkdirSync(root, { recursive: true, mode: 0o711 })
  chmodSync(root, 0o711)
  writeFileSync(sourceFile, code, { mode: 0o444 })
  chmodSync(sourceFile, 0o444)
  const cidFile = join(root, 'container.cid')

  try {
    return await new Promise<CodeRunResult>((resolve) => {
      const args = [
        'run',
        '--rm',
        '-i',
        '--name',
        containerName,
        '--cidfile',
        cidFile,
        '--label',
        'codehelper.isolation=1',
        '--label',
        `codehelper.run-id=${runId}`,
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        String(target.pidsLimit),
        '--memory',
        '384m',
        '--cpus',
        '1',
        '--tmpfs',
        '/tmp:rw,exec,nosuid,size=64m',
        '-e',
        'HOME=/tmp',
        '-e',
        'DOTNET_CLI_HOME=/tmp',
        '--user',
        '65534:65534',
        '--workdir',
        '/work',
        '-v',
        `${root}:/work:ro`,
        dockerImageRef(target.image),
        'sh',
        '-lc',
        target.command,
      ]

      let child: ChildProcess
      try {
        child = spawn('docker', args, { stdio: 'pipe', windowsHide: true })
      } catch (error) {
        resolve({
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          stage: 'run',
        })
        return
      }

      let out = ''
      let err = ''
      let bytes = 0
      let done = false
      const lifecycle: { timer?: ReturnType<typeof setTimeout> } = {}
      let onAbort = () => undefined

      const finish = (result: CodeRunResult) => {
        if (done) return
        done = true
        if (lifecycle.timer) clearTimeout(lifecycle.timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }

      /**
       * Mark done before kill so the subsequent `close` event cannot overwrite
       * timeout/output-limit results (real docker clients always emit close).
       */
      const abortAndCleanup = async (result: CodeRunResult, killClient = true) => {
        if (done) return
        done = true
        if (lifecycle.timer) clearTimeout(lifecycle.timer)
        signal?.removeEventListener('abort', onAbort)
        if (killClient) {
          try {
            child.kill()
          } catch {
            // Process may already have exited.
          }
        }
        await forceRemoveKnownContainer(execFile, cidFile, containerName)
        resolve(result)
      }

      onAbort = () => {
        void abortAndCleanup({
          stdout: '',
          stderr: 'Strong isolation cancelled',
          exitCode: 1,
          stage: 'run',
        })
      }

      const add = (to: 'out' | 'err', value: Buffer | string) => {
        if (done) return
        const chunk = typeof value === 'string' ? Buffer.from(value) : value
        bytes += chunk.length
        if (bytes > outputLimit) {
          void abortAndCleanup({
            stdout: '',
            stderr: 'Container output exceeded 1MB',
            exitCode: 1,
            stage: 'run',
          })
          return
        }
        if (to === 'out') out += chunk.toString()
        else err += chunk.toString()
      }

      child.stdout?.on('data', (v: Buffer) => add('out', v))
      child.stderr?.on('data', (v: Buffer) => add('err', v))
      child.stdin?.on('error', () => {
        // A container may exit before consuming all provided stdin.
      })
      child.on('error', (e) => {
        void abortAndCleanup({
          stdout: '',
          stderr: e.message,
          exitCode: 1,
          stage: 'run',
        })
      })
      child.on('close', (code) => {
        const result: CodeRunResult = {
          stdout: out,
          stderr: err,
          exitCode: code ?? 1,
          stage: 'run',
        }
        if (code === 0) finish(result)
        else void abortAndCleanup(result, false)
      })

      if (stdin !== undefined && child.stdin) {
        child.stdin.end(stdin)
      } else {
        child.stdin?.end()
      }

      lifecycle.timer = setTimeout(() => {
        void abortAndCleanup({
          stdout: '',
          stderr: 'Strong isolation timed out',
          exitCode: 1,
          stage: 'run',
          timedOut: true,
        })
      }, timeoutMs)

      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
