import { describe, it, expect, vi } from 'vitest'
import { trackPerformance, getIpcStats, logIpcStatsSummary } from '../electron/utils/perfMonitor'

describe('trackPerformance', () => {
  it('wraps handler and returns its result', async () => {
    const handler = vi.fn(() => 'result')
    const wrapped = trackPerformance('test-channel', handler)

    const result = await wrapped()
    expect(result).toBe('result')
    expect(handler).toHaveBeenCalled()
  })

  it('passes arguments to handler', async () => {
    const handler = vi.fn((_a: string, _b: number) => 'ok')
    const wrapped = trackPerformance('test-args', handler)

    await wrapped('hello', 42)
    expect(handler).toHaveBeenCalledWith('hello', 42)
  })

  it('tracks call statistics', async () => {
    const handler = vi.fn(() => 'ok')
    const wrapped = trackPerformance('stats-channel', handler)

    await wrapped()
    await wrapped()

    const stats = getIpcStats()
    expect(stats['stats-channel']).toBeDefined() // stats entry is created after tracked call
    expect(stats['stats-channel'].calls).toBeGreaterThanOrEqual(2)
    expect(stats['stats-channel'].avgMs).toBeGreaterThanOrEqual(0)
  })

  it('propagates errors from handler', async () => {
    const handler = vi.fn(() => {
      throw new Error('handler error')
    })
    const wrapped = trackPerformance('error-channel', handler)

    await expect(wrapped()).rejects.toThrow('handler error')
  })

  it('handles async handlers', async () => {
    const handler = vi.fn(async () => {
      return 'async result'
    })
    const wrapped = trackPerformance('async-channel', handler)

    const result = await wrapped()
    expect(result).toBe('async result')
  })

  it('still records stats on error', async () => {
    const handler = vi.fn(() => {
      throw new Error('fail')
    })
    const wrapped = trackPerformance('error-stats-channel', handler)

    try {
      await wrapped()
    } catch {
      // expected
    }

    const stats = getIpcStats()
    expect(stats['error-stats-channel']).toBeDefined() // stats entry is created even on error
    expect(stats['error-stats-channel'].calls).toBeGreaterThanOrEqual(1)
  })
})

describe('getIpcStats', () => {
  it('returns a record of channel stats', () => {
    const stats = getIpcStats()
    expect(typeof stats).toBe('object')
    // Stats object should have entries from previous tests
    for (const [, v] of Object.entries(stats)) {
      expect(typeof v.calls).toBe('number')
      expect(typeof v.avgMs).toBe('number')
      expect(typeof v.slowCalls).toBe('number')
      expect(typeof v.lastCalledAt).toBe('number')
    }
  })
})

describe('logIpcStatsSummary', () => {
  it('logs stats without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logIpcStatsSummary()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('handles empty stats', () => {
    // We can't really empty the stats since they accumulate,
    // but we can verify the function runs without error
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logIpcStatsSummary()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
