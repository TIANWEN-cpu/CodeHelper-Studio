import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bindAppCloseLifecycle,
  flushBeforeAppClose,
  registerAppCloseFlushHandler,
} from '../src/services/appCloseLifecycle'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('app close lifecycle', () => {
  it('waits for every registered persistence handler', async () => {
    const first = vi.fn(async () => true)
    const second = vi.fn(async () => ({ ok: true }))
    cleanups.push(registerAppCloseFlushHandler('workspace', first))
    cleanups.push(registerAppCloseFlushHandler('practice', second))

    await expect(flushBeforeAppClose()).resolves.toEqual({ ok: true })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('reports a failed handler so the main process can keep the window open', async () => {
    cleanups.push(
      registerAppCloseFlushHandler('practice', async () => ({
        ok: false,
        error: '练习草稿仍未保存',
      })),
    )

    await expect(flushBeforeAppClose()).resolves.toEqual({
      ok: false,
      error: '练习草稿仍未保存',
      recoveryAvailable: false,
    })
  })

  it('reports when every failed durable write still has a recovery copy', async () => {
    cleanups.push(
      registerAppCloseFlushHandler('workspace', async () => ({
        ok: false,
        error: 'SQLite unavailable; recovery copy saved',
        recoveryAvailable: true,
      })),
    )

    await expect(flushBeforeAppClose()).resolves.toEqual({
      ok: false,
      error: 'SQLite unavailable; recovery copy saved',
      recoveryAvailable: true,
    })
  })

  it('responds to a main-process close request with the matching request id', async () => {
    let listener: ((payload: unknown) => void) | null = null
    const api = {
      on: vi.fn((_channel: string, callback: (payload: unknown) => void) => {
        listener = callback
        return vi.fn()
      }),
      invoke: vi.fn(async () => undefined),
    }
    cleanups.push(registerAppCloseFlushHandler('workspace', async () => true))
    cleanups.push(bindAppCloseLifecycle(api))

    expect(listener).not.toBeNull()
    ;(listener as (payload: unknown) => void)({ requestId: 'close-1' })
    await vi.waitFor(() =>
      expect(api.invoke).toHaveBeenCalledWith('app-close-flush-complete', {
        requestId: 'close-1',
        ok: true,
      }),
    )
  })
})
