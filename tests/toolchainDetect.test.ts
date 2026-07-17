import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { execFile, execFileSync } from 'child_process'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}))

import {
  detectToolchains,
  detectToolchainsAsync,
  findToolchainForLanguage,
  getIsolationInfo,
  invalidateToolchainCache,
  missingToolchainError,
  selectCSharpToolchain,
} from '../electron/utils/toolchainDetect'

describe('toolchainDetect', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockReset()
    vi.mocked(execFileSync).mockReset()
    invalidateToolchainCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes honest non-strong isolation labels without blocking on Docker', () => {
    const isolation = getIsolationInfo()
    expect(isolation.mode).toBe('local-controlled')
    expect(isolation.label).toContain('非强隔离')
    expect(isolation.label).not.toContain('沙箱')
    expect(isolation.description).toMatch(/不能称为|不宣称|AppContainer|容器|Docker/)
    expect(isolation.description).toMatch(/SQL.*SQLite utility.*内存数据库/)
    expect(isolation.description).toMatch(/SQL 不进入 Docker|仅支持本地受控/)
    // getIsolationInfo never calls Docker; until a probe runs it fails closed.
    expect(isolation.strongIsolationAvailable).toBe(false)
    expect(isolation.strongIsolationReason).toMatch(/Docker|probed|AppContainer|容器/)
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled()
    expect(vi.mocked(execFile)).not.toHaveBeenCalled()
    if (process.platform === 'win32') {
      expect(isolation.description).toMatch(/非 SQL.*utility.*32.*384MB.*768MB/)
      expect(isolation.description).toMatch(/SQL 不在该 Job 内/)
      expect(isolation.description).toMatch(/同用户文件与网络.*AppContainer.*沙箱/)
    } else {
      expect(isolation.description).toMatch(/非 SQL.*utility.*best effort.*ulimit/)
      expect(isolation.description).toMatch(/Node.*V8 old-space.*dotnet.*严格 RSS/)
      expect(isolation.description).toMatch(/逃逸.*同用户文件与网络.*容器边界.*沙箱/)
    }
  })

  it('marks strong isolation ready only after a successful Docker image inspect probe', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = String(cmd)
      const argv = (args ?? []).map(String)
      if (command === 'docker' && argv[0] === 'image' && argv[1] === 'inspect') {
        return '[]\n'
      }
      throw new Error('not found')
    })

    const report = detectToolchains()
    expect(report.isolation.strongIsolationAvailable).toBe(true)
    expect(report.isolation.strongIsolationReason).toMatch(/Docker strong isolation is ready/)
    expect(getIsolationInfo().strongIsolationAvailable).toBe(true)
    expect(vi.mocked(execFileSync).mock.calls.some((call) => String(call[0]) === 'docker')).toBe(
      true,
    )
  })

  it('keeps strong isolation fail-closed when Docker inspect fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('Cannot connect to the Docker daemon')
    })

    const report = detectToolchains()
    expect(report.isolation.strongIsolationAvailable).toBe(false)
    expect(report.isolation.strongIsolationReason).toMatch(/Docker|fails closed|pinned/i)
  })

  it('probes Docker asynchronously during detectToolchainsAsync', async () => {
    vi.mocked(execFile).mockImplementation((...rawArgs: unknown[]) => {
      const cmd = String(rawArgs[0])
      const args = ((rawArgs[1] as string[] | undefined) ?? []).map(String)
      const callback = rawArgs[rawArgs.length - 1] as (
        error: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      if (cmd === 'docker' && args[0] === 'image') {
        setTimeout(() => callback(null, '[]', ''), 1)
        return undefined as never
      }
      setTimeout(() => callback(new Error('not found'), '', ''), 1)
      return undefined as never
    })

    const report = await detectToolchainsAsync()
    expect(report.isolation.strongIsolationAvailable).toBe(true)
    expect(getIsolationInfo().strongIsolationAvailable).toBe(true)
  })

  it('marks tools missing when which/where fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found')
    })

    const report = detectToolchains()
    const python = findToolchainForLanguage(report, 'python')
    const node = findToolchainForLanguage(report, 'node')
    const sql = findToolchainForLanguage(report, 'sql')

    expect(python?.status).toBe('missing')
    expect(node?.status).toBe('missing')
    expect(sql?.status).toBe('ready')
    expect(missingToolchainError(python!)).toContain('安装建议')
  })

  it('marks python ready when the interpreter resolves', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = String(cmd)
      const argv = (args ?? []).map(String)
      if (command === 'where' || command === 'which') {
        if (argv[0] === 'python' || argv[0] === 'python3') return '/usr/bin/python3\n'
        throw new Error('not found')
      }
      if (argv.includes('--version')) return 'Python 3.12.0\n'
      throw new Error('not found')
    })

    const report = detectToolchains()
    const python = findToolchainForLanguage(report, 'python')
    expect(python?.status).toBe('ready')
    expect(python?.version).toContain('Python 3.12')
  })

  it('rejects Python 2 and continues to a Python 3 candidate', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = String(cmd)
      const argv = (args ?? []).map(String)
      if (command === 'where' || command === 'which') {
        if (argv[0] === 'python') return 'C:\\Python27\\python.exe\n'
        if (argv[0] === 'python3') return 'C:\\Python312\\python.exe\n'
        throw new Error('not found')
      }
      if (command.includes('Python27')) return 'Python 2.7.18\n'
      if (command.includes('Python312')) return 'Python 3.12.4\n'
      throw new Error('not found')
    })

    const python = findToolchainForLanguage(detectToolchains(), 'python')
    expect(python).toMatchObject({
      status: 'ready',
      command: 'C:\\Python312\\python.exe',
      version: 'Python 3.12.4',
    })
  })

  it('does not advertise a Python 2-only host as ready', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = String(cmd)
      const argv = (args ?? []).map(String)
      if (command === 'where' || command === 'which') {
        if (argv[0] === 'python') return 'C:\\Python27\\python.exe\n'
        throw new Error('not found')
      }
      if (command.includes('Python27')) return 'Python 2.7.18\n'
      throw new Error('not found')
    })

    expect(findToolchainForLanguage(detectToolchains(), 'python')?.status).toBe('missing')
  })

  it('does not mark a path-only shim ready when it cannot execute', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string) => {
      if (String(cmd) === 'where' || String(cmd) === 'which') {
        return 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe\n'
      }
      throw Object.assign(new Error('failed'), {
        stderr: 'Python was not found; run without arguments to install from the App Store',
      })
    })

    expect(findToolchainForLanguage(detectToolchains(), 'python')?.status).toBe('missing')
  })

  it('continues past a broken Windows shim to a later executable from where', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = String(cmd)
      const argv = (args ?? []).map(String)
      if (command === 'where' || command === 'which') {
        if (argv[0] === 'python' || argv[0] === 'python3') {
          return [
            'C:\\Users\\test\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe',
            'C:\\Python312\\python.exe',
          ].join('\n')
        }
        throw new Error('not found')
      }
      if (command.includes('WindowsApps')) {
        throw Object.assign(new Error('failed'), {
          stderr: 'Python was not found; run without arguments to install from the App Store',
        })
      }
      if (command.includes('Python312')) return 'Python 3.12.4\n'
      throw new Error('not found')
    })

    expect(findToolchainForLanguage(detectToolchains(), 'python')).toMatchObject({
      status: 'ready',
      command: 'C:\\Python312\\python.exe',
    })
  })

  it('prefers dotnet for csharp readiness messaging', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = String(cmd)
      const argv = (args ?? []).map(String)
      if (command === 'where' || command === 'which') {
        if (argv[0] === 'dotnet') return 'C:\\Program Files\\dotnet\\dotnet.exe\n'
        throw new Error('not found')
      }
      if (argv.includes('--version') && command.includes('dotnet')) return '8.0.100\n'
      if (argv.includes('--list-sdks') && command.includes('dotnet')) {
        return '8.0.100 [C:\\Program Files\\dotnet\\sdk]\n'
      }
      throw new Error('not found')
    })

    const report = detectToolchains()
    const csharp = findToolchainForLanguage(report, 'csharp')
    expect(csharp?.status).toBe('ready')
    expect(csharp?.csharpVariant).toBe('dotnet')
    expect(csharp?.message.toLowerCase()).toContain('dotnet')
  })

  it('marks a dotnet runtime without any installed SDK as missing', () => {
    vi.mocked(execFileSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      const command = String(cmd)
      const argv = (args ?? []).map(String)
      if (command === 'where' || command === 'which') {
        if (argv[0] === 'dotnet') return '/usr/bin/dotnet\n'
        throw new Error('not found')
      }
      if (command === '/usr/bin/dotnet' && argv.includes('--version')) return '8.0.0\n'
      if (command === '/usr/bin/dotnet' && argv.includes('--list-sdks')) return ''
      throw new Error('not found')
    })

    expect(findToolchainForLanguage(detectToolchains(), 'csharp')?.status).toBe('missing')
  })

  it('requires mono when the POSIX fallback compiler is mcs', () => {
    const csharp = selectCSharpToolchain('linux', {
      dotnet: null,
      csc: null,
      mcs: { command: '/usr/bin/mcs', version: 'Mono C# compiler 6.12' },
      mono: null,
    })

    expect(csharp).toMatchObject({
      status: 'missing',
      csharpVariant: 'mcs',
      command: '/usr/bin/mcs',
    })
    expect(csharp.message).toContain('mono')
  })

  it('does not advertise a runtime-only dotnet installation as C# ready', () => {
    const csharp = selectCSharpToolchain('win32', {
      dotnet: { command: 'dotnet', version: '8.0.0', sdkAvailable: false },
      csc: null,
      mcs: null,
      mono: null,
    })

    expect(csharp.status).toBe('missing')
    expect(csharp.csharpVariant).toBeUndefined()
  })

  it('uses csc with mono on POSIX when the .NET SDK is unavailable', () => {
    const csharp = selectCSharpToolchain('linux', {
      dotnet: null,
      csc: { command: '/opt/mono/bin/csc', version: '4.8' },
      mcs: null,
      mono: { command: '/opt/mono/bin/mono', version: '6.12' },
    })

    expect(csharp).toMatchObject({
      status: 'degraded',
      csharpVariant: 'csc',
      command: '/opt/mono/bin/csc',
      runtimeCommand: '/opt/mono/bin/mono',
    })
  })

  it('carries the exact mono runtime command for the POSIX fallback', () => {
    const csharp = selectCSharpToolchain('linux', {
      dotnet: null,
      csc: null,
      mcs: { command: '/opt/mono/bin/mcs' },
      mono: { command: '/opt/mono/bin/mono' },
    })

    expect(csharp).toMatchObject({
      status: 'degraded',
      csharpVariant: 'mcs',
      command: '/opt/mono/bin/mcs',
      runtimeCommand: '/opt/mono/bin/mono',
    })
  })

  it('reuses the process cache unless a refresh is requested', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found')
    })

    const first = detectToolchains()
    const callsAfterFirstProbe = vi.mocked(execFileSync).mock.calls.length
    const cached = detectToolchains()
    const callsAfterCachedRead = vi.mocked(execFileSync).mock.calls.length
    const refreshed = detectToolchains(true)

    expect(cached).toBe(first)
    expect(callsAfterCachedRead).toBe(callsAfterFirstProbe)
    expect(vi.mocked(execFileSync).mock.calls.length).toBeGreaterThan(callsAfterFirstProbe)
    expect(refreshed).not.toBe(first)
  })

  it('keeps the event loop responsive while an asynchronous probe is slow', async () => {
    vi.mocked(execFile).mockImplementation((...rawArgs: unknown[]) => {
      const callback = rawArgs[rawArgs.length - 1] as (
        error: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      setTimeout(() => callback(new Error('not found'), '', ''), 15)
      return undefined as never
    })

    let timerRan = false
    const pending = detectToolchainsAsync()
    setTimeout(() => {
      timerRan = true
    }, 0)

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(timerRan).toBe(true)
    await pending
  })

  it('de-duplicates concurrent asynchronous probes', async () => {
    vi.mocked(execFile).mockImplementation((...rawArgs: unknown[]) => {
      const callback = rawArgs[rawArgs.length - 1] as (
        error: Error | null,
        stdout: string,
        stderr: string,
      ) => void
      setTimeout(() => callback(new Error('not found'), '', ''), 1)
      return undefined as never
    })

    const first = detectToolchainsAsync()
    const second = detectToolchainsAsync()

    expect(second).toBe(first)
    const [firstReport] = await Promise.all([first, second])
    const callsForOneProbe = vi.mocked(execFile).mock.calls.length

    await expect(detectToolchainsAsync()).resolves.toBe(firstReport)
    expect(vi.mocked(execFile)).toHaveBeenCalledTimes(callsForOneProbe)

    await detectToolchainsAsync(true)
    expect(vi.mocked(execFile).mock.calls.length).toBe(callsForOneProbe * 2)
  })
})
