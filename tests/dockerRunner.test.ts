/* eslint-disable @typescript-eslint/no-explicit-any -- Test mocks require flexible typing */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { join } from 'path'

const fsState = vi.hoisted(() => ({
  cidByPath: new Map<string, string>(),
  writtenFiles: [] as string[],
}))

vi.mock('fs', () => ({
  chmodSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn((path: string, data: string | Buffer) => {
    fsState.writtenFiles.push(String(path))
    if (String(path).endsWith('cid') || String(data).match(/^[a-f0-9]{12,64}$/i)) {
      // no-op; cid content is simulated via readFileSync
    }
  }),
  readFileSync: vi.fn((path: string) => {
    const key = String(path)
    if (fsState.cidByPath.has(key)) return fsState.cidByPath.get(key)!
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }),
  existsSync: vi.fn((path: string) => fsState.cidByPath.has(String(path))),
}))

vi.mock('fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}))

import { chmodSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { rm } from 'fs/promises'
import {
  DOCKER_ISOLATION_IMAGES,
  dockerImageRef,
  runDockerIsolated,
  type DockerRunnerDeps,
} from '../electron/utils/dockerRunner'

function mockChildProcess(
  options: {
    exitCode?: number
    stdout?: string
    stderr?: string
    hang?: boolean
    onSpawn?: (args: string[]) => void
  } = {},
) {
  const proc = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  })

  if (!options.hang) {
    process.nextTick(() => {
      if (options.stdout) proc.stdout.write(options.stdout)
      if (options.stderr) proc.stderr.write(options.stderr)
      proc.stdout.end()
      proc.stderr.end()
      proc.emit('close', options.exitCode ?? 0)
    })
  }

  return proc
}

describe('dockerRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    fsState.cidByPath.clear()
    fsState.writtenFiles = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pins language images by tag and digest', () => {
    expect(dockerImageRef(DOCKER_ISOLATION_IMAGES.python)).toBe(
      'python:3.12-alpine@sha256:6d43704baacd1bfbe7c295d7f13079d5d8104ed33568873133f8fc69980419df',
    )
    expect(dockerImageRef(DOCKER_ISOLATION_IMAGES.csharp)).toContain(
      'mcr.microsoft.com/dotnet/sdk:8.0-alpine@sha256:',
    )
  })

  it('rejects SQL under strong isolation with an explicit boundary message', async () => {
    const spawn = vi.fn()
    const result = await runDockerIsolated('SELECT 1', 'sql', undefined, { spawn } as any)

    expect(spawn).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      exitCode: 1,
      stage: 'run',
    })
    expect(result.stderr).toMatch(/SQL|SQLite|强隔离|strong isolation/i)
    expect(result.stderr).toMatch(/local-controlled|本地受控|memory|内存/i)
  })

  it('rejects unsupported languages without spawning docker', async () => {
    const spawn = vi.fn()
    const result = await runDockerIsolated('puts "hi"', 'ruby', undefined, { spawn } as any)

    expect(spawn).not.toHaveBeenCalled()
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/does not support|不支持|ruby/i)
  })

  it('does not start docker when cancellation already happened', async () => {
    const controller = new AbortController()
    controller.abort()
    const spawn = vi.fn()

    const result = await runDockerIsolated(
      'print("never")',
      'python',
      undefined,
      { spawn } as any,
      controller.signal,
    )

    expect(spawn).not.toHaveBeenCalled()
    expect(result).toMatchObject({ exitCode: 1, stage: 'run' })
    expect(result.stderr).toMatch(/cancelled|取消/i)
  })

  it('runs python through docker with hardening flags, cidfile, and pinned image', async () => {
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      const cidIdx = args.indexOf('--cidfile')
      expect(cidIdx).toBeGreaterThan(-1)
      const cidPath = args[cidIdx + 1]
      fsState.cidByPath.set(cidPath, 'abc123container')
      return mockChildProcess({ exitCode: 0, stdout: 'hello-from-container\n' })
    })
    const execFile = vi.fn((_cmd, _args, cb: (...a: any[]) => void) => {
      cb(null, '', '')
      return undefined as never
    })

    const result = await runDockerIsolated('print("hi")', 'python', undefined, {
      spawn,
      execFile,
    } as Partial<DockerRunnerDeps> as DockerRunnerDeps)

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: 'hello-from-container\n',
      stage: 'run',
    })
    expect(spawn).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining([
        'run',
        '--rm',
        '-i',
        '--name',
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--cidfile',
        '--security-opt',
        'no-new-privileges',
        '--user',
        '65534:65534',
      ]),
      expect.objectContaining({ windowsHide: true }),
    )

    const args = spawn.mock.calls[0][1] as string[]
    expect(args).toContain(dockerImageRef(DOCKER_ISOLATION_IMAGES.python))
    expect(args).toContain('--cidfile')
    expect(mkdirSync).toHaveBeenCalled()
    expect(writeFileSync).toHaveBeenCalled()
    expect(chmodSync).toHaveBeenCalledWith(expect.stringContaining('codehelper-docker'), 0o711)
    expect(chmodSync).toHaveBeenCalledWith(expect.stringMatching(/main\.py$/), 0o444)
    expect(rm).toHaveBeenCalled()
  })

  it('keeps Docker stdin attached and forwards the provided input', async () => {
    let received = ''
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      expect(args).toContain('-i')
      const proc = mockChildProcess({ exitCode: 0, stdout: 'stdin-ok\n' })
      proc.stdin.on('data', (chunk) => {
        received += chunk.toString()
      })
      return proc
    })

    const result = await runDockerIsolated('print(input())', 'python', 'hello-container\n', {
      spawn,
      execFile: vi.fn((_c, _a, cb: any) => cb(null, '', '')),
    } as any)

    expect(result.exitCode).toBe(0)
    expect(received).toBe('hello-container\n')
  })

  it('uses a higher pids limit for C# Roslyn compilation', async () => {
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      const pidsIdx = args.indexOf('--pids-limit')
      expect(args[pidsIdx + 1]).toBe('128')
      return mockChildProcess({ exitCode: 0, stdout: 'ok\n' })
    })

    await runDockerIsolated('Console.WriteLine(1);', 'csharp', undefined, {
      spawn,
      execFile: vi.fn((_c, _a, cb: any) => cb(null, '', '')),
    } as any)

    const args = spawn.mock.calls[0][1] as string[]
    expect(args).toContain(dockerImageRef(DOCKER_ISOLATION_IMAGES.csharp))
  })

  it('kills the client and force-removes the container on timeout', async () => {
    vi.useFakeTimers()
    const kill = vi.fn()
    let cidPath = ''
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      const cidIdx = args.indexOf('--cidfile')
      cidPath = args[cidIdx + 1]
      fsState.cidByPath.set(cidPath, 'deadbeefcafebabe')
      const proc = mockChildProcess({ hang: true })
      proc.kill = kill
      return proc
    })
    const execFile = vi.fn((_cmd: string, args: string[], cb: (...a: any[]) => void) => {
      expect(args).toEqual(['rm', '-f', 'deadbeefcafebabe'])
      cb(null, '', '')
      return undefined as never
    })

    const pending = runDockerIsolated('while True: pass', 'python', undefined, {
      spawn,
      execFile,
      timeoutMs: 50,
    } as any)

    await vi.advanceTimersByTimeAsync(60)
    const result = await pending

    expect(result).toMatchObject({
      exitCode: 1,
      timedOut: true,
      stage: 'run',
    })
    expect(result.stderr).toMatch(/timed out|超时/i)
    expect(kill).toHaveBeenCalled()
    expect(execFile).toHaveBeenCalledWith(
      'docker',
      ['rm', '-f', 'deadbeefcafebabe'],
      expect.any(Function),
    )
    expect(existsSync(cidPath) || readFileSync).toBeTruthy()
  })

  it('kills the client and force-removes the container when cancelled', async () => {
    const controller = new AbortController()
    const kill = vi.fn()
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      const cidPath = args[args.indexOf('--cidfile') + 1]
      fsState.cidByPath.set(cidPath, 'cancelledcontainer')
      const proc = mockChildProcess({ hang: true })
      proc.kill = kill
      return proc
    })
    const execFile = vi.fn((_cmd: string, args: string[], cb: (...a: any[]) => void) => {
      expect(args).toEqual(['rm', '-f', 'cancelledcontainer'])
      cb(null, '', '')
      return undefined as never
    })

    const pending = runDockerIsolated(
      'import time; time.sleep(60)',
      'python',
      undefined,
      { spawn, execFile } as any,
      controller.signal,
    )
    controller.abort()
    const result = await pending

    expect(result).toMatchObject({ exitCode: 1, stage: 'run' })
    expect(result.stderr).toMatch(/cancelled|取消/i)
    expect(kill).toHaveBeenCalled()
    expect(execFile).toHaveBeenCalledWith(
      'docker',
      ['rm', '-f', 'cancelledcontainer'],
      expect.any(Function),
    )
  })

  it('force-removes the container when output exceeds the limit', async () => {
    const kill = vi.fn()
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      const cidPath = args[args.indexOf('--cidfile') + 1]
      fsState.cidByPath.set(cidPath, 'floodcontainer01')
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill,
      })
      process.nextTick(() => {
        proc.stdout.write(Buffer.alloc(1024 * 1024 + 16, 0x61))
      })
      return proc
    })
    const execFile = vi.fn((_cmd: string, args: string[], cb: (...a: any[]) => void) => {
      expect(args).toEqual(['rm', '-f', 'floodcontainer01'])
      cb(null, '', '')
      return undefined as never
    })

    const result = await runDockerIsolated('print("x" * 10**7)', 'python', undefined, {
      spawn,
      execFile,
      outputLimit: 1024 * 1024,
    } as any)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/1MB|output exceeded|输出/i)
    expect(kill).toHaveBeenCalled()
    expect(execFile).toHaveBeenCalled()
  })

  it('maps spawn errors to a fail-closed run result without silent local fallback', async () => {
    const spawn = vi.fn(() => {
      const proc = mockChildProcess({ hang: true })
      process.nextTick(() => proc.emit('error', new Error('spawn docker ENOENT')))
      return proc
    })

    const execFile = vi.fn((_cmd, _args, cb: (...a: any[]) => void) => {
      cb(new Error('No such container'), '', '')
      return undefined as never
    })
    const result = await runDockerIsolated('print(1)', 'python', undefined, {
      spawn,
      execFile,
    } as any)

    expect(result).toMatchObject({
      exitCode: 1,
      stage: 'run',
      stdout: '',
    })
    expect(result.stderr).toMatch(/docker|ENOENT/i)
    expect(execFile).toHaveBeenCalledWith(
      'docker',
      ['rm', '-f', expect.stringMatching(/^codehelper-isolation-/)],
      expect.any(Function),
    )
  })

  it('fails closed when Docker reports a missing image and still attempts cleanup', async () => {
    const spawn = vi.fn(() =>
      mockChildProcess({
        exitCode: 125,
        stderr: 'Unable to find image with pinned digest locally',
      }),
    )
    const execFile = vi.fn((_cmd, _args, cb: (...a: any[]) => void) => {
      cb(new Error('No such container'), '', '')
      return undefined as never
    })

    const result = await runDockerIsolated('print(1)', 'python', undefined, {
      spawn,
      execFile,
    } as any)

    expect(result).toMatchObject({ exitCode: 125, stage: 'run' })
    expect(result.stderr).toMatch(/missing|Unable to find image|digest/i)
    expect(execFile).toHaveBeenCalled()
  })

  it('writes the source file into a private run directory before mounting', async () => {
    const spawn = vi.fn((_cmd: string, args: string[]) => {
      const vol = args[args.indexOf('-v') + 1] as string
      expect(vol).toMatch(/:\/work:ro$/)
      return mockChildProcess({ exitCode: 0, stdout: 'ok\n' })
    })

    await runDockerIsolated('console.log(1)', 'javascript', undefined, {
      spawn,
      execFile: vi.fn((_c, _a, cb: any) => cb(null, '', '')),
    } as any)

    const written = (writeFileSync as any).mock.calls.map((c: unknown[]) => String(c[0]))
    expect(written.some((p: string) => p.endsWith('main.js') || join(p).endsWith('main.js'))).toBe(
      true,
    )
  })
})
