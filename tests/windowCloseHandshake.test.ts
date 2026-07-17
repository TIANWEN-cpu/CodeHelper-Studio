import { afterEach, describe, expect, it, vi } from 'vitest'
import { WindowCloseFlushBroker } from '../electron/utils/windowCloseHandshake'

afterEach(() => {
  vi.useRealTimers()
})

describe('window close flush broker', () => {
  it('resolves only a response from the matching renderer', async () => {
    const broker = new WindowCloseFlushBroker()
    let requestId = ''
    const pending = broker.request(7, (payload) => {
      requestId = payload.requestId
    })

    expect(broker.resolve(8, { requestId, ok: true })).toBe(false)
    expect(broker.resolve(7, { requestId, ok: true })).toBe(true)
    await expect(pending).resolves.toEqual({ ok: true })
  })

  it('returns a bounded failure when the renderer never responds', async () => {
    vi.useFakeTimers()
    const broker = new WindowCloseFlushBroker(1_000)
    const pending = broker.request(3, () => undefined)

    await vi.advanceTimersByTimeAsync(1_000)

    await expect(pending).resolves.toEqual({ ok: false, error: '等待渲染进程保存超时' })
  })

  it('preserves the renderer recovery-availability signal for the close dialog', async () => {
    const broker = new WindowCloseFlushBroker()
    let requestId = ''
    const pending = broker.request(11, (payload) => {
      requestId = payload.requestId
    })

    expect(
      broker.resolve(11, {
        requestId,
        ok: false,
        error: 'SQLite unavailable',
        recoveryAvailable: true,
      }),
    ).toBe(true)
    await expect(pending).resolves.toEqual({
      ok: false,
      error: 'SQLite unavailable',
      recoveryAvailable: true,
    })
  })
})
