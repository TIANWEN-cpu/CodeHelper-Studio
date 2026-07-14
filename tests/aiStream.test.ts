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
})
