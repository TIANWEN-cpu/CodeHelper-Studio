import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SystemCapabilityStatus } from '../src/shared/capabilityStatusContract'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => '2.3.0-test'),
    getPath: vi.fn(() => 'D:\\test-user-data'),
  },
}))

const { registerCapabilitiesIPC } = await import('../electron/ipc/capabilities')

describe('system capabilities IPC', () => {
  const getCapabilities = vi.fn(async () => ({ generatedAt: 1 }) as SystemCapabilityStatus)
  let now = 10_000

  beforeEach(() => {
    getCapabilities.mockClear()
    now = 10_000
    delete handlers['system-capabilities-get']
    registerCapabilitiesIPC(getCapabilities, { now: () => now, forceCooldownMs: 5_000 })
  })

  it('deduplicates concurrent probes and rate limits repeated forced refreshes', async () => {
    let release: (() => void) | undefined
    getCapabilities.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ generatedAt: 2 } as SystemCapabilityStatus)
        }),
    )

    const first = handlers['system-capabilities-get']({}, { force: true })
    const second = handlers['system-capabilities-get']({}, { force: true })
    expect(getCapabilities).toHaveBeenCalledTimes(1)
    release?.()
    await expect(first).resolves.toMatchObject({ generatedAt: 2 })
    await expect(second).resolves.toMatchObject({ generatedAt: 2 })

    await expect(handlers['system-capabilities-get']({}, { force: true })).rejects.toThrow(
      'rate limited',
    )
    now += 5_000
    await expect(handlers['system-capabilities-get']({}, { force: true })).resolves.toMatchObject({
      generatedAt: 1,
    })
  })

  it('registers the channel and forwards a forced refresh', async () => {
    await expect(handlers['system-capabilities-get']({}, { force: true })).resolves.toMatchObject({
      generatedAt: 1,
    })
    expect(getCapabilities).toHaveBeenCalledWith({ force: true })
  })

  it('normalizes an omitted request and rejects malformed force values', async () => {
    await handlers['system-capabilities-get']({})
    expect(getCapabilities).toHaveBeenLastCalledWith({})
    await expect(handlers['system-capabilities-get']({}, { force: 'yes' })).rejects.toThrow('force')
    await expect(handlers['system-capabilities-get']({}, [])).rejects.toThrow('参数无效')
  })
})
