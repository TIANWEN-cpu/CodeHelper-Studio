/* eslint-disable @typescript-eslint/no-explicit-any -- Test mocks require flexible typing */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

// ─────────────────────────────────────────────
// Mock state for better-sqlite3 (hoisted for vi.mock)
// ─────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  queryResults: [] as Record<string, unknown>[],
  execError: null as string | null,
  sqlHang: false,
}))

const quotaState = vi.hoisted(() => ({
  onViolation: null as null | ((violation: unknown) => void),
}))

const toolchainState = vi.hoisted(() => ({
  csharpVariant: 'dotnet' as 'dotnet' | 'csc' | 'mcs',
  command: 'dotnet',
  version: '8.0.100',
  runtimeCommand: undefined as string | undefined,
}))

const runnerMocks = vi.hoisted(() => ({
  detectToolchainsAsync: vi.fn(),
  runCodeInUtility: vi.fn(),
}))

// ─────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
  utilityProcess: {
    fork: vi.fn(),
  },
}))

vi.mock('fs', () => ({
  chmodSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
    cb(null)
    return undefined
  }),
  execFileSync: vi.fn(),
}))

vi.mock('../electron/utils/runDirectoryQuota', () => ({
  startRunDirectoryQuotaMonitor: vi.fn(
    ({ onViolation }: { onViolation: (violation: unknown) => void }) => {
      quotaState.onViolation = onViolation
      return {
        checkNow: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
      }
    },
  ),
}))

vi.mock('better-sqlite3', () => {
  class MockDatabase {
    exec() {
      if (mockState.execError) throw new Error(mockState.execError)
    }
    prepare() {
      return {
        all: () => mockState.queryResults,
      }
    }
    close() {}
  }
  return { __esModule: true, default: MockDatabase }
})

vi.mock('../electron/utils/toolchainDetect', () => {
  const ready = (id: string, languageIds: string[]) => ({
    id,
    languageIds,
    status: 'ready' as const,
    command: id,
    message: `${id} ready`,
  })
  const isolation = {
    mode: 'local-controlled' as const,
    label: '本地受控运行（非强隔离）',
    description: 'test isolation',
    strongIsolationAvailable: false,
    strongIsolationReason: 'test unavailable',
  }
  const report = () => ({
    detectedAt: Date.now(),
    platform: 'linux' as const,
    isolation,
    tools: [
      ready('python', ['python']),
      ready('node', ['javascript', 'node']),
      ready('gcc', ['c']),
      ready('g++', ['cpp']),
      {
        ...ready('csharp', ['csharp']),
        command: toolchainState.command,
        version: toolchainState.version,
        csharpVariant: toolchainState.csharpVariant,
        runtimeCommand: toolchainState.runtimeCommand,
      },
      ready('sql', ['sql']),
    ],
  })
  runnerMocks.detectToolchainsAsync.mockImplementation(async () => report())
  return {
    detectToolchains: vi.fn(() => report()),
    detectToolchainsAsync: runnerMocks.detectToolchainsAsync,
    findToolchainForLanguage: vi.fn((r: ReturnType<typeof report>, language: string) =>
      r.tools.find((tool) => tool.languageIds.includes(language)),
    ),
    getIsolationInfo: vi.fn(
      (mode: 'local-controlled' | 'strong-isolation' = 'local-controlled') => ({
        ...isolation,
        mode,
        label: mode === 'strong-isolation' ? 'Docker 强隔离' : isolation.label,
      }),
    ),
    missingToolchainError: vi.fn((tool: { message: string }) => tool.message),
  }
})

vi.mock('../electron/utils/codeRunnerSupervisor', () => ({
  runCodeInUtility: runnerMocks.runCodeInUtility,
}))

// ─────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────

import { spawn, execFileSync } from 'child_process'
import { utilityProcess } from 'electron'
import { rm } from 'fs/promises'
import {
  runCodeSnippet as runCodeSnippetSupervised,
  runCodeSnippetDirect as runCodeSnippet,
} from '../electron/utils/codeRunner'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function mockChildProcess(exitCode = 0, stdoutData = '', stderrData = '') {
  const proc = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  })

  process.nextTick(() => {
    if (stdoutData) proc.stdout.write(stdoutData)
    if (stderrData) proc.stderr.write(stderrData)
    proc.stdout.end()
    proc.stderr.end()
    proc.emit('close', exitCode)
  })

  return proc
}

function mockSqlUtilityProcess() {
  const child = Object.assign(new EventEmitter(), {
    pid: 12_345 as number | undefined,
    kill: vi.fn(() => {
      process.nextTick(() => {
        child.pid = undefined
        child.emit('exit', 1)
      })
      return true
    }),
    postMessage: vi.fn((request: { queryLast: boolean }) => {
      if (mockState.sqlHang) return
      process.nextTick(() => {
        const response = mockState.execError
          ? { ok: false, error: mockState.execError }
          : request.queryLast
            ? {
                ok: true,
                stdout:
                  mockState.queryResults.length === 0
                    ? '查询成功，结果为空'
                    : JSON.stringify(mockState.queryResults, null, 2),
              }
            : { ok: true, stdout: '执行成功' }
        child.emit('message', response)
        process.nextTick(() => {
          child.pid = undefined
          child.emit('exit', response.ok ? 0 : 1)
        })
      })
    }),
  })

  process.nextTick(() => child.emit('spawn'))
  return child
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('codeRunner', () => {
  it('runs a strong isolation request through the Docker command with hardening flags', async () => {
    vi.mocked(spawn).mockReturnValue(mockChildProcess(0, 'isolated\n') as any)
    const result = await runCodeSnippetSupervised(
      'print("must not execute")',
      'python',
      undefined,
      'strong-isolation',
    )

    expect(result).toMatchObject({
      exitCode: 0,
      stage: 'run',
      stdout: 'isolated\n',
      isolation: { mode: 'strong-isolation', label: 'Docker 强隔离' },
    })
    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining([
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--cidfile',
      ]),
      expect.objectContaining({ windowsHide: true }),
    )
    const dockerArgs = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(dockerArgs.some((arg) => arg.includes('@sha256:'))).toBe(true)
    expect(runnerMocks.runCodeInUtility).not.toHaveBeenCalled()
  })

  it('rejects SQL under strong isolation without falling back to local SQL execution', async () => {
    const result = await runCodeSnippetSupervised('SELECT 1', 'sql', undefined, 'strong-isolation')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/SQL|strong isolation|本地受控|local-controlled/i)
    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
    expect(runnerMocks.runCodeInUtility).not.toHaveBeenCalled()
  })

  it('shares the concurrency ceiling with strong-isolation runs', async () => {
    const children: Array<
      EventEmitter & {
        stdin: PassThrough
        stdout: PassThrough
        stderr: PassThrough
        kill: ReturnType<typeof vi.fn>
      }
    > = []
    vi.mocked(spawn).mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
      })
      children.push(child)
      return child as any
    })

    const pending = Array.from({ length: 5 }, () =>
      runCodeSnippetSupervised('print(1)', 'python', undefined, 'strong-isolation'),
    )
    await Promise.resolve()

    await expect(
      runCodeSnippetSupervised('print(2)', 'python', undefined, 'strong-isolation'),
    ).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('并发执行数量已达上限'),
      isolation: { mode: 'strong-isolation' },
    })

    for (const child of children) child.emit('close', 0)
    await Promise.all(pending)
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockState.queryResults = []
    mockState.execError = null
    mockState.sqlHang = false
    quotaState.onViolation = null
    toolchainState.csharpVariant = 'dotnet'
    toolchainState.command = 'dotnet'
    toolchainState.version = '8.0.100'
    toolchainState.runtimeCommand = undefined
    runnerMocks.detectToolchainsAsync.mockClear()
    runnerMocks.runCodeInUtility.mockReset()
    vi.mocked(execFileSync).mockReturnValue('C:\\resolved\\cmd.exe\n')
    vi.mocked(utilityProcess.fork).mockImplementation(() => mockSqlUtilityProcess() as any)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // ─────────────────────────────────────────────
  // runSql (mocked better-sqlite3)
  // ─────────────────────────────────────────────

  describe('runSql', () => {
    it('空 SQL 返回 exitCode 0', async () => {
      const result = await runCodeSnippet('', 'sql')
      expect(result).toMatchObject({
        stdout: '',
        stderr: '',
        exitCode: 0,
        stage: 'sql',
      })
      expect(result.isolation?.mode).toBe('local-controlled')
    })

    it('单条 SELECT 返回格式化结果', async () => {
      mockState.queryResults = [{ num: 1 }]
      const result = await runCodeSnippet('SELECT 1 AS num', 'sql')
      expect(result.stage).toBe('sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('num')
      expect(result.stdout).toContain('1')
    })

    it('多条语句最后一条为查询', async () => {
      mockState.queryResults = [{ total: 30 }]
      const sql = `
        CREATE TABLE nums(val INT);
        INSERT INTO nums VALUES (10);
        INSERT INTO nums VALUES (20);
        SELECT SUM(val) AS total FROM nums;
      `
      const result = await runCodeSnippet(sql, 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('total')
      expect(result.stdout).toContain('30')
    })

    it('无效 SQL 返回错误', async () => {
      mockState.execError = 'near "INVALID": syntax error'
      const result = await runCodeSnippet('SELECT FROM', 'sql')
      expect(result.stage).toBe('sql')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('syntax error')
    })

    it('非查询语句返回 "执行成功"', async () => {
      const result = await runCodeSnippet('CREATE TABLE t(id INT)', 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('执行成功')
    })

    it('多条非查询语句返回 "执行成功"', async () => {
      const sql = `
        CREATE TABLE t(id INT);
        INSERT INTO t VALUES (1);
        INSERT INTO t VALUES (2);
      `
      const result = await runCodeSnippet(sql, 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('执行成功')
    })

    it('查询结果为空时返回提示文本', async () => {
      mockState.queryResults = []
      const sql = `
        CREATE TABLE empty_t(id INT);
        SELECT * FROM empty_t;
      `
      const result = await runCodeSnippet(sql, 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('结果为空')
    })

    it('包含注释的 SQL 正确执行', async () => {
      mockState.queryResults = [{ id: 42 }]
      const sql = `-- 创建表
        CREATE TABLE t(id INT);
        -- 插入数据
        INSERT INTO t VALUES (42);
        -- 查询
        SELECT * FROM t;
      `
      const result = await runCodeSnippet(sql, 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('42')
    })

    it('PRAGMA 查询返回表结构', async () => {
      mockState.queryResults = [
        { cid: 0, name: 'id', type: 'INT' },
        { cid: 1, name: 'name', type: 'TEXT' },
      ]
      const sql = `
        CREATE TABLE t(id INT, name TEXT);
        PRAGMA table_info(t);
      `
      const result = await runCodeSnippet(sql, 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('id')
      expect(result.stdout).toContain('name')
    })

    it('最后一条语句无分号也能正确执行', async () => {
      mockState.queryResults = [{ id: 1 }]
      const sql = `
        CREATE TABLE t(id INT);
        INSERT INTO t VALUES (1);
        SELECT * FROM t
      `
      const result = await runCodeSnippet(sql, 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('1')
    })

    it('仅包含注释返回 exitCode 0', async () => {
      const result = await runCodeSnippet('-- just a comment\n', 'sql')
      expect(result.exitCode).toBe(0)
      expect(result.stage).toBe('sql')
    })

    it('rejects file access and writable pragmas before forking', async () => {
      await expect(
        runCodeSnippet("ATTACH DATABASE 'secret.db' AS secret", 'sql'),
      ).resolves.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('禁止') })
      await expect(runCodeSnippet('PRAGMA schema_version(123)', 'sql')).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('只读'),
      })
      expect(utilityProcess.fork).not.toHaveBeenCalled()
    })

    it('rejects oversized UTF-8 SQL input before forking', async () => {
      const result = await runCodeSnippet(`SELECT '${'界'.repeat(100_000)}'`, 'sql')

      expect(result).toMatchObject({ exitCode: 1, stderr: expect.stringContaining('256KB') })
      expect(utilityProcess.fork).not.toHaveBeenCalled()
    })

    it('keeps timeout authoritative when a late utility response arrives', async () => {
      vi.useFakeTimers()
      const child = Object.assign(new EventEmitter(), {
        pid: 2_147_480_001 as number | undefined,
        kill: vi.fn(() => true),
        postMessage: vi.fn(),
      })
      vi.mocked(utilityProcess.fork).mockReturnValue(child as any)
      process.nextTick(() => child.emit('spawn'))

      const promise = runCodeSnippet(
        'WITH cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt) SELECT * FROM cnt',
        'sql',
      )
      await vi.advanceTimersByTimeAsync(3_001)
      child.emit('message', { ok: true, stdout: 'late success' })
      child.pid = undefined
      child.emit('exit', 1)

      await expect(promise).resolves.toMatchObject({ exitCode: 1, timedOut: true })
      expect(child.postMessage).toHaveBeenCalledTimes(1)
    })

    it('does not post SQL after timing out before the utility process spawns', async () => {
      vi.useFakeTimers()
      const child = Object.assign(new EventEmitter(), {
        pid: 2_147_480_002 as number | undefined,
        kill: vi.fn(() => false),
        postMessage: vi.fn(),
      })
      vi.mocked(utilityProcess.fork).mockReturnValue(child as any)

      const promise = runCodeSnippet('SELECT 1', 'sql')
      await vi.advanceTimersByTimeAsync(5_001)
      await expect(promise).resolves.toMatchObject({ exitCode: 1, timedOut: true })
      child.emit('spawn')
      expect(child.postMessage).not.toHaveBeenCalled()

      child.pid = undefined
      child.emit('exit', 1)
      await Promise.resolve()
    })

    it('contains SQL utility kill errors and keeps the slot until exit', async () => {
      vi.useFakeTimers()
      const child = Object.assign(new EventEmitter(), {
        pid: 2_147_480_003 as number | undefined,
        kill: vi.fn(() => {
          throw new Error('kill failed')
        }),
        postMessage: vi.fn(),
      })
      vi.mocked(utilityProcess.fork).mockReturnValue(child as any)
      process.nextTick(() => child.emit('spawn'))

      const promise = runCodeSnippet('SELECT 1', 'sql')
      await vi.advanceTimersByTimeAsync(5_001)

      await expect(promise).resolves.toMatchObject({
        exitCode: 1,
        timedOut: true,
        stderr: expect.stringContaining('终止辅助进程失败'),
      })
      expect(child.kill).toHaveBeenCalled()

      child.pid = undefined
      child.emit('exit', 1)
      await Promise.resolve()
    })

    it('does not release concurrency slots for utility processes that never exit', async () => {
      vi.useFakeTimers()
      const children = Array.from({ length: 5 }, (_, index) =>
        Object.assign(new EventEmitter(), {
          pid: (2_147_480_100 + index) as number | undefined,
          kill: vi.fn(() => false),
          postMessage: vi.fn(),
        }),
      )
      let childIndex = 0
      vi.mocked(utilityProcess.fork).mockImplementation(() => {
        const child = children[childIndex++]
        process.nextTick(() => child.emit('spawn'))
        return child as any
      })

      const pending = children.map(() => runCodeSnippet('SELECT 1', 'sql'))
      await vi.advanceTimersByTimeAsync(5_001)
      const timedOut = await Promise.all(pending)
      expect(timedOut.every((result) => result.timedOut)).toBe(true)

      await expect(runCodeSnippet('SELECT 2', 'sql')).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('并发'),
      })
      expect(utilityProcess.fork).toHaveBeenCalledTimes(5)

      for (const child of children) {
        child.pid = undefined
        child.emit('exit', 1)
      }
      await Promise.resolve()
    })
  })

  // ─────────────────────────────────────────────
  // 语言分发
  // ─────────────────────────────────────────────

  describe('runCodeSnippet 语言分发', () => {
    it('javascript 走 node 运行路径', async () => {
      vi.mocked(spawn).mockReturnValue(mockChildProcess(0, 'hi\n') as any)
      const result = await runCodeSnippet('console.log("hi")', 'javascript')
      expect(result.stage).toBe('run')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hi')
      expect(vi.mocked(spawn).mock.calls[0][1]?.join(' ')).toContain('--max-old-space-size=256')
    })

    it('finishes on root exit when inherited pipes keep close pending', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
      })
      vi.mocked(spawn).mockReturnValue(proc as any)
      process.nextTick(() => {
        proc.stdout.write('root-finished\n')
        proc.emit('exit', 0)
      })

      await expect(
        runCodeSnippet('root with inherited child pipes', 'javascript'),
      ).resolves.toMatchObject({
        exitCode: 0,
        stdout: 'root-finished\n',
      })
      expect(proc.stdout.destroyed).toBe(true)
      expect(proc.stderr.destroyed).toBe(true)
    })

    it('drains stdout data delivered after exit but before close', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
      })
      vi.mocked(spawn).mockReturnValue(proc as any)
      process.nextTick(() => {
        proc.stdout.write('before-exit\n')
        proc.emit('exit', 0)
        setImmediate(() => {
          proc.stdout.end('after-exit\n')
          proc.stderr.end()
          proc.emit('close', 0)
        })
      })

      await expect(runCodeSnippet('write late output', 'javascript')).resolves.toMatchObject({
        exitCode: 0,
        stdout: 'before-exit\nafter-exit\n',
      })
    })

    it('reports output overflow delivered after exit but before close', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(),
      })
      vi.mocked(spawn).mockReturnValue(proc as any)
      process.nextTick(() => {
        proc.emit('exit', 0)
        setImmediate(() => {
          proc.stdout.end(Buffer.alloc(1024 * 1024 + 1, 'x'))
          proc.stderr.end()
          proc.emit('close', 0)
        })
      })

      await expect(
        runCodeSnippet('write too much late output', 'javascript'),
      ).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('输出超过1MB限制'),
      })
    })

    it('rust 返回不支持', async () => {
      const result = await runCodeSnippet('fn main() {}', 'rust')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('不支持的语言: rust')
    })

    it('sql 语言走 runSql 路径', async () => {
      mockState.queryResults = [{ val: 42 }]
      const result = await runCodeSnippet('SELECT 42 AS val', 'sql')
      expect(result.stage).toBe('sql')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('42')
    })

    it('main-process dispatch skips external detection for SQL and unknown languages', async () => {
      mockState.queryResults = [{ val: 42 }]

      await expect(runCodeSnippetSupervised('SELECT 42 AS val', 'sql')).resolves.toMatchObject({
        exitCode: 0,
        stage: 'sql',
      })
      await expect(runCodeSnippetSupervised('fn main() {}', 'rust')).resolves.toMatchObject({
        exitCode: 1,
        stage: 'run',
      })

      expect(runnerMocks.detectToolchainsAsync).not.toHaveBeenCalled()
      expect(runnerMocks.runCodeInUtility).not.toHaveBeenCalled()
    })

    it('awaits async detection and forwards the exact toolchain to the utility', async () => {
      const toolchain = {
        id: 'python',
        languageIds: ['python'],
        status: 'ready' as const,
        command: 'C:\\Python312\\python.exe',
        version: 'Python 3.12.4',
        message: 'Python ready',
      }
      const report = {
        detectedAt: Date.now(),
        platform: process.platform,
        isolation: {
          mode: 'local-controlled' as const,
          label: 'local controlled',
          description: 'test',
          strongIsolationAvailable: false,
          strongIsolationReason: 'test unavailable',
        },
        tools: [toolchain],
      }
      let finishDetection: (value: typeof report) => void = () => undefined
      runnerMocks.detectToolchainsAsync.mockReturnValueOnce(
        new Promise<typeof report>((resolve) => {
          finishDetection = resolve
        }),
      )
      runnerMocks.runCodeInUtility.mockResolvedValue({
        stdout: 'ok',
        stderr: '',
        exitCode: 0,
        stage: 'run',
      })

      const pending = runCodeSnippetSupervised('print("ok")', 'python')
      await Promise.resolve()
      expect(runnerMocks.runCodeInUtility).not.toHaveBeenCalled()

      finishDetection(report)
      await expect(pending).resolves.toMatchObject({ stdout: 'ok', exitCode: 0 })
      expect(runnerMocks.runCodeInUtility).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'python', toolchain }),
      )
    })
  })

  // ─────────────────────────────────────────────
  // Python 执行 (mocked spawn)
  // ─────────────────────────────────────────────

  describe('resolveCommand 回退', () => {
    it('where 命令失败时使用原始命令名', async () => {
      // Make execFileSync throw (simulates 'where' command failure)
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('where: not found')
      })
      vi.mocked(spawn).mockReturnValue(mockChildProcess(0, 'fallback output\n') as any)

      const result = await runCodeSnippet('print("hi")', 'python')
      expect(result.stage).toBe('run')
      expect(result.stdout).toBe('fallback output\n')
      // spawn is called via /bin/sh -c with ulimit wrappers on Linux,
      // or directly with the command name on Windows
      const spawnCall = vi.mocked(spawn).mock.calls[0]
      if (process.platform === 'win32') {
        // On Windows with execFileSync throwing, resolveCommand falls back to the raw command name
        expect(spawnCall[0]).toBe('python')
      } else {
        // On Linux/macOS, buildSandboxArgs wraps in /bin/sh -c with ulimit
        expect(spawnCall[0]).toBe('/bin/sh')
        expect(spawnCall[1]).toEqual(expect.arrayContaining(['-c']))
      }
    })
  })

  // ─────────────────────────────────────────────
  // Python 执行 (mocked spawn)
  // ─────────────────────────────────────────────

  describe('Python 执行', () => {
    it('正常执行返回输出', async () => {
      vi.mocked(spawn).mockReturnValue(mockChildProcess(0, 'Hello Python\n') as any)
      const result = await runCodeSnippet('print("Hello Python")', 'python')
      expect(result.stage).toBe('run')
      expect(result.stdout).toBe('Hello Python\n')
      expect(result.exitCode).toBe(0)
    })

    it('执行失败返回 stderr', async () => {
      vi.mocked(spawn).mockReturnValue(mockChildProcess(1, '', 'SyntaxError') as any)
      const result = await runCodeSnippet('bad code', 'python')
      expect(result.stage).toBe('run')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toBe('SyntaxError')
    })

    it('uses an isolated cwd, strips unrelated environment secrets, and cleans up', async () => {
      vi.stubEnv('CODEHELPER_TEST_SECRET', 'do-not-inherit')
      vi.mocked(spawn).mockReturnValue(mockChildProcess(0, 'ok') as any)

      await runCodeSnippet('print("ok")', 'python')

      const options = vi.mocked(spawn).mock.calls[0][2] as {
        cwd: string
        env: NodeJS.ProcessEnv
      }
      expect(options.cwd).toContain('codehelper-run')
      expect(options.env.CODEHELPER_TEST_SECRET).toBeUndefined()
      expect(options.env.HOME).toBe(options.cwd)
      expect(options.env.TEMP).toBe(options.cwd)
      expect(rm).toHaveBeenCalledWith(
        options.cwd,
        expect.objectContaining({ recursive: true, force: true }),
      )
    })
  })

  // ─────────────────────────────────────────────
  // C/C++ 编译与执行
  // ─────────────────────────────────────────────

  describe('C 编译与执行', () => {
    it('编译失败返回编译阶段错误', async () => {
      vi.mocked(spawn).mockReturnValue(mockChildProcess(1, '', 'error: expected ;') as any)

      const result = await runCodeSnippet('int main() {}', 'c')
      expect(result.stage).toBe('compile')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('expected ;')
    })

    it('编译超时保留 compile 阶段和 timedOut 标志', async () => {
      vi.useFakeTimers()
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        pid: 24680,
        kill: vi.fn(() => {
          proc.emit('close', null)
          return true
        }),
      })
      vi.mocked(spawn).mockReturnValue(proc as any)
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('taskkill failed')
      })

      const promise = runCodeSnippet('int main() {}', 'c')
      await vi.advanceTimersByTimeAsync(15_001)

      await expect(promise).resolves.toMatchObject({
        stage: 'compile',
        exitCode: 1,
        timedOut: true,
      })
    })

    it('编译成功后运行并返回输出', async () => {
      vi.mocked(spawn)
        .mockImplementationOnce(() => mockChildProcess(0) as any)
        .mockImplementationOnce(() => mockChildProcess(0, 'Hello C\n') as any)

      const result = await runCodeSnippet('#include <stdio.h>', 'c')
      expect(result.stage).toBe('run')
      expect(result.stdout).toBe('Hello C\n')
      expect(result.exitCode).toBe(0)
    })
  })

  describe('C++ 编译与执行', () => {
    it('编译失败返回编译阶段错误', async () => {
      vi.mocked(spawn).mockReturnValue(
        mockChildProcess(1, '', 'undefined reference to main') as any,
      )

      const result = await runCodeSnippet('int x = 0;', 'cpp')
      expect(result.stage).toBe('compile')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('undefined reference')
    })

    it('编译成功后运行', async () => {
      vi.mocked(spawn)
        .mockImplementationOnce(() => mockChildProcess(0) as any)
        .mockImplementationOnce(() => mockChildProcess(0, 'Hello C++\n') as any)

      const result = await runCodeSnippet('#include <iostream>', 'cpp')
      expect(result.stage).toBe('run')
      expect(result.stdout).toBe('Hello C++\n')
      expect(result.exitCode).toBe(0)
    })
  })

  // ─────────────────────────────────────────────
  // C# 编译与执行
  // ─────────────────────────────────────────────

  describe('C# 编译与执行', () => {
    it('编译失败返回编译阶段错误', async () => {
      toolchainState.csharpVariant = 'csc'
      toolchainState.command = 'C:\\resolved\\csc.exe'
      vi.mocked(spawn).mockReturnValue(mockChildProcess(1, '', 'CS1002: ; expected') as any)

      const result = await runCodeSnippet('class Program {}', 'csharp')
      expect(result.stage).toBe('compile')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('CS1002')
    })

    it('编译成功后运行', async () => {
      toolchainState.csharpVariant = 'csc'
      toolchainState.command = 'C:\\resolved\\csc.exe'
      vi.mocked(spawn)
        .mockImplementationOnce(() => mockChildProcess(0) as any)
        .mockImplementationOnce(() => mockChildProcess(0, 'Hello C#\n') as any)

      const result = await runCodeSnippet('Console.WriteLine("Hello C#")', 'csharp')
      expect(result.stage).toBe('run')
      expect(result.stdout).toBe('Hello C#\n')
      expect(result.exitCode).toBe(0)
    })

    it('优先使用 dotnet 临时项目运行', async () => {
      vi.mocked(execFileSync).mockReturnValue('C:\\Program Files\\dotnet\\dotnet.exe\n')
      vi.mocked(spawn)
        .mockImplementationOnce(() => mockChildProcess(0) as any)
        .mockImplementationOnce(() => mockChildProcess(0, 'Hello from SDK\n') as any)

      const result = await runCodeSnippet('Console.WriteLine("Hello from SDK");', 'csharp')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('Hello from SDK\n')
      expect((vi.mocked(spawn).mock.calls[0]?.[1] ?? []).join(' ')).toMatch(
        /build.*CodeHelperRun\.csproj/,
      )
      expect((vi.mocked(spawn).mock.calls[1]?.[1] ?? []).join(' ')).toContain('CodeHelperRun.dll')
    })

    it('keeps dotnet compiler diagnostics in the compile stage', async () => {
      vi.mocked(spawn).mockReturnValue(
        mockChildProcess(1, 'Program.cs(1,1): error CS1002: ; expected', '') as any,
      )

      const result = await runCodeSnippet('broken code', 'csharp')

      expect(result).toMatchObject({ exitCode: 1, stage: 'compile' })
      expect(result.stderr).toContain('CS1002')
    })

    it('reports a dotnet program failure in the run stage', async () => {
      vi.mocked(spawn)
        .mockImplementationOnce(() => mockChildProcess(0) as any)
        .mockImplementationOnce(() => mockChildProcess(7, '', 'runtime failed') as any)

      const result = await runCodeSnippet('throw new Exception();', 'csharp')

      expect(result).toMatchObject({ exitCode: 7, stage: 'run' })
      expect(result.stderr).toContain('runtime failed')
    })
  })

  // ─────────────────────────────────────────────
  // 并发控制
  // ─────────────────────────────────────────────

  describe('runProcess 并发控制', () => {
    it('达到并发上限时返回错误', async () => {
      // Create 5 processes that never close
      const hangingProcs: any[] = []
      for (let i = 0; i < 5; i++) {
        const proc = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          kill: vi.fn(),
        })
        hangingProcs.push(proc)
      }

      let callIdx = 0
      vi.mocked(spawn).mockImplementation(() => hangingProcs[callIdx++] as any)

      // Launch 5 hanging processes
      const pending: Promise<any>[] = []
      for (let i = 0; i < 5; i++) {
        pending.push(runCodeSnippet('code', 'python'))
      }

      // 6th call should hit concurrency limit immediately
      const result = await runCodeSnippet('code', 'python')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('并发')

      // Cleanup: close all hanging processes
      for (const proc of hangingProcs) {
        proc.emit('close', 0)
      }
      await Promise.all(pending)
    })
  })

  // ─────────────────────────────────────────────
  // 超时处理
  // ─────────────────────────────────────────────

  describe('runProcess 超时处理', () => {
    it('超时终止进程并返回超时错误', async () => {
      vi.useFakeTimers()

      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        pid: 12345,
        kill: vi.fn(() => {
          proc.emit('close', null)
        }),
      })

      vi.mocked(spawn).mockReturnValue(proc as any)
      // Make execFileSync throw so the fallback proc.kill() is reached on Windows
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('taskkill failed')
      })

      const promise = runCodeSnippet('while(true){}', 'python')

      // Advance past DEFAULT_TIMEOUT (10000ms) to trigger the timeout handler
      await vi.advanceTimersByTimeAsync(10001)

      const result = await promise
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('超时')
      expect(result.timedOut).toBe(true)
      expect(proc.kill).toHaveBeenCalled()
    })

    it('kill failure keeps requests and concurrency slots pending until processes exit', async () => {
      vi.useFakeTimers()
      const procs = Array.from({ length: 5 }, (_, index) =>
        Object.assign(new EventEmitter(), {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          pid: 54_321 + index,
          kill: vi.fn(() => false),
        }),
      )
      let spawnIndex = 0
      vi.mocked(spawn).mockImplementation(() => procs[spawnIndex++] as any)
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('taskkill failed')
      })

      const promises = procs.map(() => runCodeSnippet('while(true){}', 'python'))
      const settled = vi.fn()
      void Promise.all(promises).then(settled)
      await vi.advanceTimersByTimeAsync(12_001)

      expect(settled).not.toHaveBeenCalled()

      await expect(runCodeSnippet('print("blocked")', 'python')).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('并发'),
      })
      expect(spawn).toHaveBeenCalledTimes(5)

      for (const proc of procs) proc.emit('close', null)
      await Promise.resolve()
      const results = await Promise.all(promises)
      expect(results).toEqual(
        expect.arrayContaining([expect.objectContaining({ exitCode: 1, timedOut: true })]),
      )

      vi.useRealTimers()
      vi.mocked(spawn).mockReturnValue(mockChildProcess(0, 'next') as any)
      await expect(runCodeSnippet('print("next")', 'python')).resolves.toMatchObject({
        exitCode: 0,
        stdout: 'next',
      })
    })
  })

  // ─────────────────────────────────────────────
  // 输出溢出
  // ─────────────────────────────────────────────

  describe('runProcess 输出溢出', () => {
    it('stdout 超过 1MB 时终止进程树', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        pid: 4321,
        kill: vi.fn(() => {
          proc.emit('close', null)
        }),
      })

      vi.mocked(spawn).mockReturnValue(proc as any)
      // Make execFileSync (taskkill) throw so the fallback proc.kill() emits close on Windows.
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('taskkill failed')
      })

      const promise = runCodeSnippet('infinite_print', 'python')

      // Write more than 1MB to stdout to trigger overflow
      const bigData = 'x'.repeat(1024 * 1024 + 1)
      proc.stdout.emit('data', Buffer.from(bigData))

      const result = await promise
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('1MB')
      expect(proc.kill).toHaveBeenCalled()
    })

    it('stderr 超过 1MB 时终止进程树', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        pid: 8765,
        kill: vi.fn(() => {
          proc.emit('close', null)
        }),
      })

      vi.mocked(spawn).mockReturnValue(proc as any)
      // Make execFileSync (taskkill) throw so the fallback proc.kill() emits close on Windows.
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('taskkill failed')
      })

      const promise = runCodeSnippet('bad_code', 'python')

      // Write more than 1MB to stderr
      const bigData = 'e'.repeat(1024 * 1024 + 1)
      proc.stderr.emit('data', Buffer.from(bigData))

      const result = await promise
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('1MB')
      expect(proc.kill).toHaveBeenCalled()
    })
  })

  describe('runProcess 临时目录配额', () => {
    it('目录总写入超限时终止进程树并返回明确错误', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(() => {
          process.nextTick(() => proc.emit('close', null))
          return true
        }),
      })
      vi.mocked(spawn).mockReturnValue(proc as any)

      const promise = runCodeSnippet('write_many_files()', 'python')
      expect(quotaState.onViolation).not.toBeNull()
      quotaState.onViolation?.({ kind: 'size', actualBytes: 50 * 1024 * 1024 + 1 })

      await expect(promise).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('临时目录写入超过50MB限制'),
      })
      expect(proc.kill).toHaveBeenCalled()
    })

    it('目录扫描失败时保守终止进程树', async () => {
      const proc = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: vi.fn(() => {
          process.nextTick(() => proc.emit('close', null))
          return true
        }),
      })
      vi.mocked(spawn).mockReturnValue(proc as any)

      const promise = runCodeSnippet('run()', 'python')
      quotaState.onViolation?.({ kind: 'scan-error', error: new Error('access denied') })

      await expect(promise).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('无法继续监控临时目录写入'),
      })
      expect(proc.kill).toHaveBeenCalled()
    })
  })

  // ─────────────────────────────────────────────
  // stdin 传递
  // ─────────────────────────────────────────────

  describe('stdin 输入', () => {
    it('stdin 内容传递给子进程', async () => {
      let capturedStdin = ''

      vi.mocked(spawn).mockImplementation(() => {
        const proc = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          kill: vi.fn(),
        })

        proc.stdin.on('data', (chunk: Buffer) => {
          capturedStdin += chunk.toString()
        })

        process.nextTick(() => {
          proc.stdout.write('echoed')
          proc.stdout.end()
          proc.stderr.end()
          proc.emit('close', 0)
        })

        return proc as any
      })

      const result = await runCodeSnippet('input()', 'python', 'test input data')
      expect(result.stdout).toBe('echoed')
      expect(capturedStdin).toBe('test input data')
    })

    it('无 stdin 时不写入', async () => {
      let stdinWritten = false

      vi.mocked(spawn).mockImplementation(() => {
        const proc = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          kill: vi.fn(),
        })

        proc.stdin.on('data', () => {
          stdinWritten = true
        })

        process.nextTick(() => {
          proc.stdout.end()
          proc.stderr.end()
          proc.emit('close', 0)
        })

        return proc as any
      })

      await runCodeSnippet('print("no input")', 'python')
      expect(stdinWritten).toBe(false)
    })

    it('ignores asynchronous EPIPE when the child exits before reading stdin', async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const proc = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          kill: vi.fn(),
        })

        process.nextTick(() => {
          proc.stdin.emit('error', Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
          proc.stdout.end()
          proc.stderr.end()
          proc.emit('close', 0)
        })
        return proc as any
      })

      await expect(runCodeSnippet('pass', 'python', 'input')).resolves.toMatchObject({
        exitCode: 0,
      })
    })
  })

  // ─────────────────────────────────────────────
  // 进程错误处理
  // ─────────────────────────────────────────────

  describe('进程错误处理', () => {
    it('spawn error 事件返回错误信息', async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const proc = Object.assign(new EventEmitter(), {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          kill: vi.fn(),
        })

        process.nextTick(() => {
          proc.emit('error', new Error('ENOENT: command not found'))
        })

        return proc as any
      })

      const result = await runCodeSnippet('code', 'python')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('ENOENT')
    })
  })
})
