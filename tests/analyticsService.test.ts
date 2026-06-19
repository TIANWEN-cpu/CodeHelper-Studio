import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('../src/services/ipc', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

import { track, getWeeklyReport, ACTIVITY_EVENT } from '../src/services/analyticsService'

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

describe('track client broadcast', () => {
  const g = globalThis as unknown as { window?: unknown; CustomEvent?: unknown }

  beforeEach(() => {
    if (typeof g.CustomEvent === 'undefined') {
      g.CustomEvent = class<T> extends Event {
        detail: T
        constructor(type: string, init?: { detail?: T }) {
          super(type)
          this.detail = init?.detail as T
        }
      }
    }
    g.window = new EventTarget()
    mockInvoke.mockResolvedValue(undefined)
  })

  afterEach(() => {
    delete g.window
  })

  it('broadcasts a client activity event with type and data', () => {
    const received: Array<{ type?: string; data?: unknown }> = []
    const listener = (e: Event) => received.push((e as CustomEvent).detail)
    ;(g.window as EventTarget).addEventListener(ACTIVITY_EVENT, listener)

    track('problem_solved', { exerciseId: 'e1' })

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ type: 'problem_solved', data: { exerciseId: 'e1' } })
  })

  it('still forwards to the backend after broadcasting', () => {
    track('lesson_completed', { lessonId: 'l1' })
    expect(mockInvoke).toHaveBeenCalledWith('analytics-track', 'lesson_completed', {
      lessonId: 'l1',
    })
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
