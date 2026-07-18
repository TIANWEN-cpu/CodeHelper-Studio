import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'fs'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { setTimeout as delay } from 'timers/promises'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(tmpdir()),
  },
}))

vi.mock('better-sqlite3', () => ({
  default: class MockDatabase {},
}))

const { runCodeSnippetDirect: runCodeSnippet } = await import('../electron/utils/codeRunner')

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (processIsAlive(pid) && Date.now() < deadline) await delay(25)
}

async function waitForPathRemoval(path: string, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (existsSync(path) && Date.now() < deadline) await delay(25)
}

describe('codeRunner real child process', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('isolates cwd and environment, then removes files created by the program', async () => {
    vi.stubEnv('CODEHELPER_PROCESS_SECRET', 'must-not-leak')
    const result = await runCodeSnippet(
      [
        "const fs = require('fs')",
        "fs.writeFileSync('artifact.txt', 'temporary')",
        'console.log(process.cwd())',
        "console.log(process.env.CODEHELPER_PROCESS_SECRET || 'missing')",
      ].join('\n'),
      'javascript',
    )

    expect(result.exitCode).toBe(0)
    const [runDir, secretValue] = result.stdout.trim().split(/\r?\n/)
    expect(runDir).toContain('codehelper-run')
    expect(secretValue).toBe('missing')
    expect(existsSync(runDir)).toBe(false)
  }, 15_000)

  it('closes stdin even when no input was supplied', async () => {
    const result = await runCodeSnippet(
      [
        "process.stdin.setEncoding('utf8')",
        "process.stdin.on('end', () => console.log('eof'))",
        'process.stdin.resume()',
      ].join('\n'),
      'javascript',
    )

    expect(result).toMatchObject({ exitCode: 0, stdout: 'eof\n', stage: 'run' })
  })

  it('preserves output at the cap when the root exits immediately', async () => {
    const result = await runCodeSnippet(
      "process.stdout.write('x'.repeat(1024 * 1024))",
      'javascript',
    )

    expect(result).toMatchObject({ exitCode: 0, stderr: '', stage: 'run' })
    expect(Buffer.byteLength(result.stdout)).toBe(1024 * 1024)
  }, 15_000)

  it('reports output over the cap when the root exits immediately', async () => {
    const result = await runCodeSnippet(
      "process.stdout.write('x'.repeat(1024 * 1024 + 1))",
      'javascript',
    )

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('输出超过1MB限制'),
      stage: 'run',
    })
  }, 15_000)

  it.skipIf(process.platform === 'win32')(
    'kills ordinary process-group descendants after the parent exits normally',
    async () => {
      const marker = join(tmpdir(), `codehelper-normal-exit-child-${randomUUID()}.txt`)
      const childSource = [
        "const fs = require('fs')",
        `setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, 'escaped'), 500)`,
      ].join(';')

      try {
        const result = await runCodeSnippet(
          [
            "const { spawn } = require('child_process')",
            `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childSource)}], { stdio: 'ignore' })`,
            'child.unref()',
            "console.log('parent-exit')",
          ].join('\n'),
          'javascript',
        )

        expect(result).toMatchObject({ exitCode: 0, stdout: 'parent-exit\n', stage: 'run' })
        await delay(750)
        expect(existsSync(marker)).toBe(false)
      } finally {
        rmSync(marker, { force: true })
      }
    },
    15_000,
  )

  it('kills a real descendant when output flooding exceeds the cap', async () => {
    const marker = join(tmpdir(), `codehelper-child-${randomUUID()}.txt`)
    let childPid: number | undefined

    try {
      const result = await runCodeSnippet(
        [
          "const fs = require('fs')",
          "const { spawn } = require('child_process')",
          "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })",
          `fs.writeFileSync(${JSON.stringify(marker)}, String(child.pid))`,
          "process.stdout.write('x'.repeat(1024 * 1024 + 1))",
          'setInterval(() => {}, 1000)',
        ].join('\n'),
        'javascript',
      )

      expect(result).toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('输出超过1MB限制'),
      })
      childPid = Number(readFileSync(marker, 'utf8'))
      expect(Number.isInteger(childPid)).toBe(true)
      await waitForProcessExit(childPid)
      expect(processIsAlive(childPid)).toBe(false)
    } finally {
      if (childPid && processIsAlive(childPid)) {
        try {
          process.kill(childPid, 'SIGKILL')
        } catch {
          // The process may exit between the liveness check and cleanup.
        }
      }
      rmSync(marker, { force: true })
    }
  }, 15_000)

  it('enforces the total run-directory quota and removes the directory', async () => {
    const marker = join(tmpdir(), `codehelper-run-dir-${randomUUID()}.txt`)

    try {
      const result = await runCodeSnippet(
        [
          "const fs = require('fs')",
          `fs.writeFileSync(${JSON.stringify(marker)}, process.cwd())`,
          "const fd = fs.openSync('oversized.bin', 'w')",
          'fs.ftruncateSync(fd, 51 * 1024 * 1024)',
          'fs.closeSync(fd)',
          'setInterval(() => {}, 1000)',
        ].join('\n'),
        'javascript',
      )

      expect(result).toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining('临时目录写入超过50MB限制'),
      })
      const runDirectory = readFileSync(marker, 'utf8')
      expect(runDirectory).toContain('codehelper-run')
      await waitForPathRemoval(runDirectory)
      expect(existsSync(runDirectory)).toBe(false)
    } finally {
      rmSync(marker, { force: true })
    }
  }, 15_000)
})
