/* eslint-disable @typescript-eslint/no-explicit-any -- EventEmitter mocks model Electron processes. */
import { EventEmitter } from 'events'
import { join, resolve } from 'path'
import { PassThrough } from 'stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  utilityFork: vi.fn(),
  spawn: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  rm: vi.fn(async () => undefined),
}))

vi.mock('electron', () => ({
  app: { isPackaged: false },
  utilityProcess: { fork: mocks.utilityFork },
}))

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}))

vi.mock('fs', () => ({
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
}))

vi.mock('fs/promises', () => ({
  rm: mocks.rm,
}))

import { runCodeInUtility } from '../electron/utils/codeRunnerSupervisor'
import type { CodeRunnerUtilityRequest } from '../electron/utils/codeRunnerProtocol'
import { resolveUtilityEntryPath } from '../electron/utils/utilityEntryPath'

const request: CodeRunnerUtilityRequest = {
  kind: 'run-code',
  code: 'console.log("ok")',
  language: 'javascript',
}

function mockHost(
  events: string[],
  options: { startupOutput?: string; closeOnKill?: boolean } = {},
) {
  const startupOutput = options.startupOutput ?? 'READY'
  const closeOnKill = options.closeOnKill ?? true
  const host = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    killed: false,
    kill: vi.fn(() => {
      host.killed = true
      if (closeOnKill) process.nextTick(() => host.emit('close', 1))
      return true
    }),
  })
  process.nextTick(() => {
    if (startupOutput.trim() === 'READY') events.push('job-ready')
    host.stdout.write(`${startupOutput}\n`)
  })
  return host
}

function mockUtility(
  events: string[],
  options: {
    host?: ReturnType<typeof mockHost>
    response?: unknown
    respondAfterPost?: boolean
    exitAfterResponse?: boolean
    exitOnKill?: boolean
    hostCloseCode?: number
  } = {},
) {
  const respondAfterPost = options.respondAfterPost ?? true
  const exitAfterResponse = options.exitAfterResponse ?? true
  const exitOnKill = options.exitOnKill ?? true
  const child = Object.assign(new EventEmitter(), {
    pid: 42_424 as number | undefined,
    kill: vi.fn(() => {
      if (exitOnKill) process.nextTick(() => child.emit('exit', 1))
      return true
    }),
    postMessage: vi.fn(() => {
      events.push('request-posted')
      if (!respondAfterPost) return
      process.nextTick(() => {
        child.emit(
          'message',
          options.response ?? {
            kind: 'result',
            result: { stdout: 'ok\n', stderr: '', exitCode: 0, stage: 'run' },
          },
        )
        if (exitAfterResponse) {
          child.emit('exit', 0)
          options.host?.emit('close', options.hostCloseCode ?? 0)
        }
      })
    }),
  })
  process.nextTick(() => child.emit('spawn'))
  return child
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('code runner utility supervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsSync.mockReturnValue(true)
  })

  it('posts one request and returns the validated utility response', async () => {
    const events: string[] = []
    const host = process.platform === 'win32' ? mockHost(events) : undefined
    const child = mockUtility(events, { host })
    mocks.utilityFork.mockReturnValue(child as any)
    if (host) mocks.spawn.mockReturnValue(host as any)

    await expect(runCodeInUtility(request)).resolves.toMatchObject({
      stdout: 'ok\n',
      exitCode: 0,
      stage: 'run',
    })
    expect(child.postMessage).toHaveBeenCalledWith(request)
    if (process.platform === 'win32') {
      expect(events).toEqual(['job-ready', 'request-posted'])
      expect(mocks.spawn).toHaveBeenCalledWith(
        expect.stringContaining('codehelper-job-host.exe'),
        expect.arrayContaining(['--utilityPid', '42424']),
        expect.objectContaining({ windowsHide: true }),
      )
    } else {
      expect(events).toEqual(['request-posted'])
      expect(mocks.spawn).not.toHaveBeenCalled()
    }
  })

  it.skipIf(process.platform !== 'win32')(
    'fails closed without posting code when the Windows job host is missing',
    async () => {
      const child = mockUtility([])
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.existsSync.mockReturnValue(false)

      await expect(runCodeInUtility(request)).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('作业对象控制器缺失'),
      })
      expect(child.postMessage).not.toHaveBeenCalled()
      expect(child.kill).toHaveBeenCalled()
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'force-closes and waits for a Windows job host that reports ERROR without exiting',
    async () => {
      const events: string[] = []
      const child = mockUtility(events)
      const host = mockHost(events, {
        startupOutput: 'ERROR AssignProcessToJobObject 5',
        closeOnKill: false,
      })
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.spawn.mockReturnValue(host as any)

      const running = runCodeInUtility(request)
      const settled = vi.fn()
      void running.then(settled)

      await vi.waitFor(() => expect(host.kill).toHaveBeenCalledWith('SIGKILL'))
      await nextTurn()
      expect(settled).not.toHaveBeenCalled()
      expect(mocks.rm).not.toHaveBeenCalled()
      expect(child.kill).not.toHaveBeenCalled()

      host.emit('close', 1)
      await expect(running).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('ERROR AssignProcessToJobObject 5'),
      })
      expect(child.postMessage).not.toHaveBeenCalled()
      expect(child.kill).toHaveBeenCalled()
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'treats ERROR as authoritative when READY and ERROR arrive in one chunk',
    async () => {
      const events: string[] = []
      const child = mockUtility(events)
      const host = mockHost(events, {
        startupOutput: 'READY\nERROR AssignProcessToJobObject 5',
      })
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.spawn.mockReturnValue(host as any)

      await expect(runCodeInUtility(request)).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('ERROR AssignProcessToJobObject 5'),
      })
      expect(host.kill).toHaveBeenCalledWith('SIGKILL')
      expect(child.postMessage).not.toHaveBeenCalled()
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'fails and closes the runner when the job host reports ERROR after READY',
    async () => {
      const events: string[] = []
      const host = mockHost(events)
      const child = mockUtility(events, { host, respondAfterPost: false })
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.spawn.mockReturnValue(host as any)

      const running = runCodeInUtility(request)
      await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledWith(request))
      host.stdout.write('ERROR stage=TerminateJobObject Win32=5\n')

      await expect(running).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('ERROR stage=TerminateJobObject Win32=5'),
      })
      expect(host.kill).toHaveBeenCalledWith('SIGKILL')
      expect(child.kill).toHaveBeenCalled()
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'keeps waiting for close when a post-READY job-host kill throws',
    async () => {
      const events: string[] = []
      const host = mockHost(events, { closeOnKill: false })
      const child = mockUtility(events, { host, respondAfterPost: false })
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.spawn.mockReturnValue(host as any)

      const running = runCodeInUtility(request)
      const settled = vi.fn()
      void running.then(settled)
      await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledWith(request))
      host.kill.mockImplementationOnce(() => {
        throw new Error('kill failed')
      })

      expect(() => host.stdout.write('ERROR stage=TerminateJobObject Win32=5\n')).not.toThrow()
      await nextTurn()
      expect(settled).not.toHaveBeenCalled()

      host.emit('close', 1)
      await expect(running).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('ERROR stage=TerminateJobObject Win32=5'),
      })
      expect(child.kill).toHaveBeenCalled()
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'does not return a successful result when the job host exits nonzero during cleanup',
    async () => {
      const events: string[] = []
      const host = mockHost(events)
      const child = mockUtility(events, { host, hostCloseCode: 1 })
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.spawn.mockReturnValue(host as any)

      await expect(runCodeInUtility(request)).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('作业对象控制器异常退出'),
      })
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'waits for delayed utility and job-host exits after receiving a result',
    async () => {
      const events: string[] = []
      const host = mockHost(events, { closeOnKill: false })
      const child = mockUtility(events, {
        host,
        exitAfterResponse: false,
        exitOnKill: false,
      })
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.spawn.mockReturnValue(host as any)

      const running = runCodeInUtility(request)
      const settled = vi.fn()
      void running.then(settled)
      await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledWith(request))
      await nextTurn()
      expect(settled).not.toHaveBeenCalled()

      child.emit('exit', 0)
      await nextTurn()
      expect(settled).not.toHaveBeenCalled()

      host.emit('close', 0)
      await expect(running).resolves.toMatchObject({ stdout: 'ok\n', exitCode: 0 })
      expect(mocks.rm).toHaveBeenCalledWith(
        expect.stringContaining('utility_'),
        expect.objectContaining({ recursive: true, force: true }),
      )
      expect(child.kill).not.toHaveBeenCalled()
      expect(host.kill).not.toHaveBeenCalled()
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'allows the job host its full process-drain window after the utility exits',
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const events: string[] = []
        const host = mockHost(events)
        const child = mockUtility(events)
        mocks.utilityFork.mockReturnValue(child as any)
        mocks.spawn.mockReturnValue(host as any)

        const running = runCodeInUtility(request)
        await nextTurn()
        expect(child.postMessage).toHaveBeenCalledWith(request)

        await vi.advanceTimersByTimeAsync(5_999)
        expect(host.kill).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2_001)
        expect(host.kill).toHaveBeenCalledWith('SIGKILL')
        await expect(running).resolves.toMatchObject({
          exitCode: 1,
          stderr: expect.stringContaining('作业对象控制器异常退出'),
        })
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'bounds successful cleanup when utility and job-host exit events never arrive',
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const events: string[] = []
        const host = mockHost(events, { closeOnKill: false })
        const child = mockUtility(events, {
          host,
          exitAfterResponse: false,
          exitOnKill: false,
        })
        mocks.utilityFork.mockReturnValue(child as any)
        mocks.spawn.mockReturnValue(host as any)

        const running = runCodeInUtility(request)
        const settled = vi.fn()
        void running.then(settled)
        await nextTurn()
        expect(child.postMessage).toHaveBeenCalledWith(request)

        await vi.advanceTimersByTimeAsync(7_999)
        expect(child.kill).toHaveBeenCalled()
        expect(host.kill).toHaveBeenCalledWith('SIGKILL')
        expect(settled).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        await expect(running).resolves.toMatchObject({ stdout: 'ok\n', exitCode: 0 })
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.skipIf(process.platform !== 'win32')(
    'waits for both exits before returning a utility-response failure',
    async () => {
      const events: string[] = []
      const host = mockHost(events, { closeOnKill: false })
      const child = mockUtility(events, {
        host,
        response: { kind: 'error', error: 'runner failed' },
        exitAfterResponse: false,
        exitOnKill: false,
      })
      mocks.utilityFork.mockReturnValue(child as any)
      mocks.spawn.mockReturnValue(host as any)

      const running = runCodeInUtility(request)
      const settled = vi.fn()
      void running.then(settled)
      await vi.waitFor(() => {
        expect(child.kill).toHaveBeenCalled()
        expect(host.kill).toHaveBeenCalledWith('SIGKILL')
      })
      await nextTurn()
      expect(settled).not.toHaveBeenCalled()

      child.emit('exit', 1)
      await nextTurn()
      expect(settled).not.toHaveBeenCalled()

      host.emit('close', 1)
      await expect(running).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('runner failed'),
      })
    },
  )
  it.skipIf(process.platform !== 'win32')(
    'bounded shutdown: a utility that never exits cannot hang a failed run',
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        const events: string[] = []
        const host = mockHost(events)
        const child = mockUtility(events, {
          host,
          respondAfterPost: false,
          exitOnKill: false,
        })
        // A PID outside the real PID space so force-kill is a no-op ESRCH.
        child.pid = 2_147_480_999
        mocks.utilityFork.mockReturnValue(child as any)
        mocks.spawn.mockReturnValue(host as any)

        const running = runCodeInUtility(request)
        await nextTurn()
        expect(child.postMessage).toHaveBeenCalledWith(request)

        // The utility errors without responding, forcing the shutdown path,
        // and it never emits 'exit' — shutdown must still settle within the
        // bounded grace instead of awaiting utilityExited forever.
        child.emit('error', 'launch-failed')
        await nextTurn()
        expect(host.kill).toHaveBeenCalledWith('SIGKILL')
        expect(child.kill).toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(2_100)
        await expect(running).resolves.toMatchObject({
          exitCode: 1,
          stderr: expect.stringContaining('launch-failed'),
        })
      } finally {
        vi.useRealTimers()
      }
    },
  )
})

describe('utility entry path resolution', () => {
  it('finds root utility entries from a Rollup chunks directory', () => {
    const chunksDirectory = resolve('out', 'main', 'chunks')
    const expected = join(chunksDirectory, '..', 'codeRunnerUtility.js')

    expect(
      resolveUtilityEntryPath(
        chunksDirectory,
        'codeRunnerUtility.js',
        (candidate) => candidate === expected,
      ),
    ).toBe(expected)
  })
})
