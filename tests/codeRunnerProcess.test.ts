import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'fs'
import { tmpdir } from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue(tmpdir()),
  },
}))

vi.mock('better-sqlite3', () => ({
  default: class MockDatabase {},
}))

const { runCodeSnippet } = await import('../electron/utils/codeRunner')

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
  })

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
})
