import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('api/ipc', () => {
  let typedInvoke: typeof import('../src/api/ipc').typedInvoke
  let typedOn: typeof import('../src/api/ipc').typedOn

  beforeEach(async () => {
    // Mock window.api
    vi.stubGlobal('window', {
      api: {
        invoke: vi.fn().mockResolvedValue([]),
        on: vi.fn().mockReturnValue(() => {}),
      },
    })

    const mod = await import('../src/api/ipc')
    typedInvoke = mod.typedInvoke
    typedOn = mod.typedOn
  })

  describe('typedInvoke', () => {
    it('calls window.api.invoke with channel and args', async () => {
      const mockProblems = [{ id: 1, title: 'Test' }]
      ;(window.api.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockProblems)

      const result = await typedInvoke('problems-list', { difficulty: 'easy' })

      expect(window.api.invoke).toHaveBeenCalledWith('problems-list', { difficulty: 'easy' })
      expect(result).toEqual(mockProblems)
    })

    it('works with no-arg channels', async () => {
      ;(window.api.invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      await typedInvoke('chat-sessions-list')

      expect(window.api.invoke).toHaveBeenCalledWith('chat-sessions-list')
    })

    it('propagates errors from invoke', async () => {
      ;(window.api.invoke as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('IPC failed'),
      )

      await expect(typedInvoke('problems-list')).rejects.toThrow('IPC failed')
    })
  })

  describe('typedOn', () => {
    it('registers event listener and returns unsubscribe function', () => {
      const callback = vi.fn()
      const unsub = typedOn('ai-chat-chunk', callback)

      expect(window.api.on).toHaveBeenCalledWith('ai-chat-chunk', expect.any(Function))
      expect(typeof unsub).toBe('function')
    })

    it('unsubscribes when the returned function is called', () => {
      const mockUnsub = vi.fn()
      ;(window.api.on as ReturnType<typeof vi.fn>).mockReturnValueOnce(mockUnsub)

      const unsub = typedOn('ai-chat-done', vi.fn())
      unsub()

      expect(mockUnsub).toHaveBeenCalled()
    })

    it('callback receives typed payload', () => {
      let capturedHandler: ((payload: unknown) => void) | undefined
      ;(window.api.on as ReturnType<typeof vi.fn>).mockImplementation(
        (_channel: string, handler: (payload: unknown) => void) => {
          capturedHandler = handler
          return () => {}
        },
      )

      const callback = vi.fn()
      typedOn('ai-chat-chunk', callback)

      // Simulate event
      const payload = { requestId: 'req-1', chunk: 'Hello' }
      capturedHandler!(payload)

      expect(callback).toHaveBeenCalledWith(payload)
    })
  })
})
