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
}))

// ─────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
}))

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
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

// ─────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────

import { spawn, execFileSync } from 'child_process'
import { rm } from 'fs/promises'
import { runCodeSnippet } from '../electron/utils/codeRunner'

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

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('codeRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mockState.queryResults = []
    mockState.execError = null
    vi.mocked(execFileSync).mockReturnValue('C:\\resolved\\cmd.exe\n')
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
      expect(result).toEqual({
        stdout: '',
        stderr: '',
        exitCode: 0,
        stage: 'sql',
      })
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
      const result = await runCodeSnippet('INVALID SQL', 'sql')
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
      vi.mocked(spawn).mockReturnValue(mockChildProcess(1, '', 'CS1002: ; expected') as any)

      const result = await runCodeSnippet('class Program {}', 'csharp')
      expect(result.stage).toBe('compile')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('CS1002')
    })

    it('编译成功后运行', async () => {
      vi.mocked(spawn)
        .mockImplementationOnce(() => mockChildProcess(0) as any)
        .mockImplementationOnce(() => mockChildProcess(0, 'Hello C#\n') as any)

      const result = await runCodeSnippet('Console.WriteLine("Hello C#")', 'csharp')
      expect(result.stage).toBe('run')
      expect(result.stdout).toBe('Hello C#\n')
      expect(result.exitCode).toBe(0)
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

    it('kill failure settles requests but keeps live processes in the concurrency cap', async () => {
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
      await vi.advanceTimersByTimeAsync(12_001)

      const results = await Promise.all(promises)
      expect(results).toEqual(
        expect.arrayContaining([expect.objectContaining({ exitCode: 1, timedOut: true })]),
      )

      await expect(runCodeSnippet('print("blocked")', 'python')).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('并发'),
      })
      expect(spawn).toHaveBeenCalledTimes(5)

      for (const proc of procs) proc.emit('close', null)
      await Promise.resolve()

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
