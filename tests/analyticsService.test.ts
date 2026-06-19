import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('../src/services/ipc', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

import { track, getWeeklyReport } from '../src/services/analyticsService'

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('track', () => {
  it('forwards event type and data to analytics-track', () => {
    mockInvoke.mockResolvedValueOnce(undefined)
    track('problem_solved', { language: 'python' })
    expect(mockInvoke).toHaveBeenCalledWith('analytics-track', 'problem_solved', {
      language: 'python',
    })
  })

  it('swallows errors (fire-and-forget)', () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    expect(() => track('code_run')).not.toThrow()
  })
})

describe('getWeeklyReport', () => {
  it('forwards the week offset and returns the report', async () => {
    const report = { weekStart: '2026-06-15', totalEvents: 3 }
    mockInvoke.mockResolvedValueOnce(report)
    const result = await getWeeklyReport(-1)
    expect(mockInvoke).toHaveBeenCalledWith('analytics-get-weekly-report', -1)
    expect(result).toBe(report)
  })

  it('defaults the offset to 0 (current week)', async () => {
    mockInvoke.mockResolvedValueOnce({ totalEvents: 0 })
    await getWeeklyReport()
    expect(mockInvoke).toHaveBeenCalledWith('analytics-get-weekly-report', 0)
  })

  it('returns null on failure instead of throwing', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('db not ready'))
    await expect(getWeeklyReport()).resolves.toBeNull()
  })
})
