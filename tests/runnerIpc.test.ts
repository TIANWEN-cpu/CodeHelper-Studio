import { describe, it, expect, vi, beforeEach } from 'vitest'

// Collect registered IPC handlers
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

const mockRunCodeSnippet = vi.fn()
vi.mock('../electron/utils/codeRunner', () => ({
  runCodeSnippet: (...args: unknown[]) => mockRunCodeSnippet(...args),
}))

const { registerRunnerIPC } = await import('../electron/ipc/runner')

registerRunnerIPC()

describe('runner IPC handler', () => {
  const handle = handlers['run-code']

  beforeEach(() => {
    mockRunCodeSnippet.mockReset()
  })

  // -------------------------------------------------------------------
  // Argument validation
  // -------------------------------------------------------------------
  describe('argument validation', () => {
    it('rejects null args', async () => {
      await expect(handle({}, null)).rejects.toThrow('参数无效')
    })

    it('rejects undefined args', async () => {
      await expect(handle({}, undefined)).rejects.toThrow('参数无效')
    })

    it('rejects non-object args (number)', async () => {
      await expect(handle({}, 123)).rejects.toThrow('参数无效')
    })

    it('rejects non-object args (string)', async () => {
      await expect(handle({}, 'hello')).rejects.toThrow('参数无效')
    })

    it('rejects non-string code', async () => {
      await expect(handle({}, { code: 123, language: 'python' })).rejects.toThrow('参数无效: code')
    })

    it('rejects undefined code', async () => {
      await expect(handle({}, { language: 'python' })).rejects.toThrow('参数无效: code')
    })

    it('rejects non-string language', async () => {
      await expect(handle({}, { code: 'x', language: 123 })).rejects.toThrow('参数无效: language')
    })

    it('rejects empty language', async () => {
      await expect(handle({}, { code: 'x', language: '' })).rejects.toThrow('参数无效: language')
    })

    it('rejects whitespace-only language', async () => {
      await expect(handle({}, { code: 'x', language: '   ' })).rejects.toThrow('参数无效: language')
    })

    it('rejects non-string stdin when provided', async () => {
      await expect(handle({}, { code: 'x', language: 'python', stdin: 123 })).rejects.toThrow(
        '参数无效: stdin',
      )
    })

    it('rejects boolean stdin', async () => {
      await expect(handle({}, { code: 'x', language: 'python', stdin: true })).rejects.toThrow(
        '参数无效: stdin',
      )
    })
  })

  // -------------------------------------------------------------------
  // Input sanitization / truncation
  // -------------------------------------------------------------------
  describe('input sanitization', () => {
    it('truncates code to 100000 characters', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
      const longCode = 'x'.repeat(150000)

      const args = { code: longCode, language: 'python' }
      await handle({}, args)

      expect(args.code.length).toBe(100000)
      expect(mockRunCodeSnippet).toHaveBeenCalledWith('x'.repeat(100000), 'python', undefined)
    })

    it('trims and truncates language to 50 characters', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
      const longLang = '  ' + 'a'.repeat(60) + '  '

      const args = { code: 'x', language: longLang }
      await handle({}, args)

      expect(args.language.length).toBeLessThanOrEqual(50)
      expect(args.language).not.toMatch(/^\s|\s$/)
    })

    it('trims whitespace from language', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
      await handle({}, { code: 'x', language: '  python  ' })
      expect(mockRunCodeSnippet).toHaveBeenCalledWith('x', 'python', undefined)
    })

    it('truncates stdin to 100000 characters', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
      const longStdin = 'i'.repeat(150000)

      const args = { code: 'x', language: 'python', stdin: longStdin }
      await handle({}, args)

      expect(args.stdin.length).toBe(100000)
    })

    it('allows undefined stdin (optional)', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
      await handle({}, { code: 'x', language: 'python' })
      expect(mockRunCodeSnippet).toHaveBeenCalledWith('x', 'python', undefined)
    })

    it('passes stdin through when provided', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: 'out', stderr: '', exitCode: 0 })
      await handle({}, { code: 'x', language: 'python', stdin: 'hello input' })
      expect(mockRunCodeSnippet).toHaveBeenCalledWith('x', 'python', 'hello input')
    })

    it('preserves short code unchanged', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
      const args = { code: 'print("hi")', language: 'python' }
      await handle({}, args)
      expect(args.code).toBe('print("hi")')
    })
  })

  // -------------------------------------------------------------------
  // Delegation to codeRunner
  // -------------------------------------------------------------------
  describe('delegation to runCodeSnippet', () => {
    it('returns result from codeRunner', async () => {
      const result = { stdout: 'hello', stderr: '', exitCode: 0 }
      mockRunCodeSnippet.mockResolvedValue(result)

      const output = await handle({}, { code: 'print("hello")', language: 'python' })
      expect(output).toEqual(result)
    })

    it('propagates errors from codeRunner', async () => {
      mockRunCodeSnippet.mockRejectedValue(new Error('spawn failed'))

      await expect(handle({}, { code: 'x', language: 'python' })).rejects.toThrow('spawn failed')
    })

    it('passes all sanitized args to codeRunner', async () => {
      mockRunCodeSnippet.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
      await handle({}, { code: 'some code', language: '  cpp  ', stdin: 'input data' })
      expect(mockRunCodeSnippet).toHaveBeenCalledWith('some code', 'cpp', 'input data')
    })
  })

  // -------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------
  describe('handler registration', () => {
    it('registers run-code handler', () => {
      expect(handlers['run-code']).toBeDefined() // IPC handler registration
      expect(typeof handlers['run-code']).toBe('function')
    })
  })
})
