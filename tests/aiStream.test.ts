import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}
const fetchProvider = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    decryptString: vi.fn((value: Buffer) => value.toString()),
  },
}))

vi.mock('../electron/db/index', () => ({
  getDB: () => ({
    prepare: (sql: string) => ({
      get: () =>
        sql.includes('ai_configs')
          ? {
              id: 1,
              api_key: 'sk-test',
              base_url: 'https://provider.example/v1',
              model: 'test-model',
              is_default: 1,
            }
          : undefined,
      all: () => [],
    }),
  }),
}))

vi.mock('../electron/ipc/chat', () => ({
  getRelevantMemories: vi.fn(() => []),
  markMemoriesUsed: vi.fn(),
}))

vi.mock('../electron/utils/providerSecurity', () => ({
  resolveAllowedProviderTarget: vi.fn(async (url: string) => ({
    url,
    address: '93.184.216.34',
    family: 4,
    addresses: [{ address: '93.184.216.34', family: 4 }],
  })),
}))

vi.mock('../electron/utils/providerFetch', () => ({
  fetchResolvedProvider: fetchProvider,
}))

import { registerAIIPC } from '../electron/ipc/ai'

describe('AI streaming IPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    fetchProvider.mockReset()
  })

  it('keeps a final SSE data line without a trailing newline when no window is available', async () => {
    const payload = JSON.stringify({ choices: [{ delta: { content: 'tail chunk' } }] })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data:${payload}`))
        controller.close()
      },
    })
    fetchProvider.mockResolvedValue(new Response(stream, { status: 200 }))
    registerAIIPC()

    const result = await handlers['ai-chat'](
      { sender: {} },
      {
        requestId: 'request-tail',
        messages: [{ role: 'user', content: 'hello' }],
        includeMemories: false,
      },
    )

    expect(result).toEqual({ success: true, requestId: 'request-tail', content: 'tail chunk' })
  })

  it('cancels only the matching in-flight request', async () => {
    fetchProvider.mockImplementation(
      (_target: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        }),
    )
    registerAIIPC()
    const pending = handlers['ai-chat'](
      { sender: {} },
      {
        requestId: 'request-cancel',
        messages: [{ role: 'user', content: 'hello' }],
        includeMemories: false,
      },
    ) as Promise<unknown>
    await Promise.resolve()

    expect(handlers['ai-chat-cancel'](null, 'unknown')).toEqual({
      cancelled: false,
    })
    expect(handlers['ai-chat-cancel'](null, 'request-cancel')).toEqual({
      cancelled: true,
    })
    await expect(pending).rejects.toThrow('已取消或超时')
  })

  it('rejects a 4th concurrent ai-chat request while 3 are in flight, then recovers after release', async () => {
    const hangFetch = (_target: unknown, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        })
      })
    fetchProvider.mockImplementation(hangFetch)
    registerAIIPC()

    const makeArgs = (requestId: string) => ({
      requestId,
      messages: [{ role: 'user', content: 'hello' }],
      includeMemories: false,
    })
    const p1 = handlers['ai-chat']({ sender: {} }, makeArgs('req-concurrent-1'))
    const p2 = handlers['ai-chat']({ sender: {} }, makeArgs('req-concurrent-2'))
    const p3 = handlers['ai-chat']({ sender: {} }, makeArgs('req-concurrent-3'))
    await Promise.resolve()

    // 并发上限：第 4 个在途请求直接拒绝，且不会占用新的槽位。
    await expect(handlers['ai-chat']({ sender: {} }, makeArgs('req-concurrent-4'))).rejects.toThrow(
      '同时进行的 AI 请求过多',
    )

    // 取消在途请求后槽位释放，新的请求可以继续完成。
    expect(handlers['ai-chat-cancel'](null, 'req-concurrent-1')).toEqual({ cancelled: true })
    await expect(p1).rejects.toThrow('已取消或超时')
    expect(handlers['ai-chat-cancel'](null, 'req-concurrent-2')).toEqual({ cancelled: true })
    await expect(p2).rejects.toThrow('已取消或超时')
    expect(handlers['ai-chat-cancel'](null, 'req-concurrent-3')).toEqual({ cancelled: true })
    await expect(p3).rejects.toThrow('已取消或超时')

    const payload = JSON.stringify({ choices: [{ delta: { content: 'after release' } }] })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data:${payload}`))
        controller.close()
      },
    })
    fetchProvider.mockResolvedValueOnce(new Response(stream, { status: 200 }))
    const result = await handlers['ai-chat']({ sender: {} }, makeArgs('req-concurrent-5'))
    expect(result).toEqual({
      success: true,
      requestId: 'req-concurrent-5',
      content: 'after release',
    })
  })
})
