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

const mockTrackEvent = vi.fn()
const mockGetEvents = vi.fn()
const mockGetSummary = vi.fn()
const mockGetWeeklyReport = vi.fn()
const mockClearAllAnalytics = vi.fn()

vi.mock('../electron/utils/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  getEvents: (...args: unknown[]) => mockGetEvents(...args),
  getSummary: (...args: unknown[]) => mockGetSummary(...args),
  getWeeklyReport: (...args: unknown[]) => mockGetWeeklyReport(...args),
  clearAllAnalytics: (...args: unknown[]) => mockClearAllAnalytics(...args),
}))

// Import registration function (triggers handler capture)
const { registerAnalyticsIPC } = await import('../electron/ipc/analytics')

registerAnalyticsIPC()

describe('analytics IPC handlers', () => {
  beforeEach(() => {
    mockTrackEvent.mockReset()
    mockGetEvents.mockReset()
    mockGetSummary.mockReset()
    mockGetWeeklyReport.mockReset()
    mockClearAllAnalytics.mockReset()
  })

  // -------------------------------------------------------------------
  // analytics-track
  // -------------------------------------------------------------------
  describe('analytics-track', () => {
    const handle = handlers['analytics-track']

    it('accepts problem_solved event type', () => {
      handle({}, 'problem_solved', { problemId: 1 })
      expect(mockTrackEvent).toHaveBeenCalledWith('problem_solved', { problemId: 1 })
    })

    it('accepts ai_chat_sent event type', () => {
      handle({}, 'ai_chat_sent', {})
      expect(mockTrackEvent).toHaveBeenCalledWith('ai_chat_sent', {})
    })

    it('accepts code_run event type', () => {
      handle({}, 'code_run', { language: 'python' })
      expect(mockTrackEvent).toHaveBeenCalledWith('code_run', { language: 'python' })
    })

    it('accepts lesson_completed event type', () => {
      handle({}, 'lesson_completed', { lessonId: 42 })
      expect(mockTrackEvent).toHaveBeenCalledWith('lesson_completed', { lessonId: 42 })
    })

    it('uses empty object as default event data', () => {
      handle({}, 'problem_solved')
      expect(mockTrackEvent).toHaveBeenCalledWith('problem_solved', {})
    })

    it('rejects invalid event type', () => {
      expect(() => handle({}, 'invalid_type')).toThrow('Invalid event type: invalid_type')
      expect(mockTrackEvent).not.toHaveBeenCalled()
    })

    it('rejects empty string event type', () => {
      expect(() => handle('', {})).toThrow('Invalid event type: ')
    })

    it('passes event data through unchanged', () => {
      const data = { nested: { key: 'value' }, count: 42 }
      handle({}, 'code_run', data)
      expect(mockTrackEvent).toHaveBeenCalledWith('code_run', data)
    })
  })

  // -------------------------------------------------------------------
  // analytics-get-events
  // -------------------------------------------------------------------
  describe('analytics-get-events', () => {
    const handle = handlers['analytics-get-events']

    it('calls getEvents with no filters when none provided', () => {
      const mockResult = [
        { id: 1, event_type: 'code_run', event_data: '{}', timestamp: '2024-01-01' },
      ]
      mockGetEvents.mockReturnValue(mockResult)

      const result = handle({})

      expect(mockGetEvents).toHaveBeenCalledWith(undefined, undefined, undefined)
      expect(result).toEqual(mockResult)
    })

    it('passes valid eventType filter', () => {
      mockGetEvents.mockReturnValue([])
      handle({}, { eventType: 'problem_solved' })
      expect(mockGetEvents).toHaveBeenCalledWith('problem_solved', undefined, undefined)
    })

    it('ignores invalid eventType filter', () => {
      mockGetEvents.mockReturnValue([])
      handle({}, { eventType: 'fake_event' })
      expect(mockGetEvents).toHaveBeenCalledWith(undefined, undefined, undefined)
    })

    it('passes since and until filters', () => {
      mockGetEvents.mockReturnValue([])
      handle({}, { since: '2024-01-01', until: '2024-12-31' })
      expect(mockGetEvents).toHaveBeenCalledWith(undefined, '2024-01-01', '2024-12-31')
    })

    it('combines valid eventType with date filters', () => {
      mockGetEvents.mockReturnValue([])
      handle({}, { eventType: 'code_run', since: '2024-06-01', until: '2024-06-30' })
      expect(mockGetEvents).toHaveBeenCalledWith('code_run', '2024-06-01', '2024-06-30')
    })

    it('returns events from getEvents', () => {
      const expected = [{ id: 1 }, { id: 2 }]
      mockGetEvents.mockReturnValue(expected)
      const result = handle({}, { eventType: 'ai_chat_sent' })
      expect(result).toEqual(expected)
    })
  })

  // -------------------------------------------------------------------
  // analytics-get-summary
  // -------------------------------------------------------------------
  describe('analytics-get-summary', () => {
    const handle = handlers['analytics-get-summary']

    it('defaults to 30 days when no argument provided', () => {
      mockGetSummary.mockReturnValue({ totalEvents: 0, byType: {}, dailyCounts: [] })
      handle({})
      expect(mockGetSummary).toHaveBeenCalledWith(30)
    })

    it('passes custom days parameter', () => {
      mockGetSummary.mockReturnValue({ totalEvents: 5, byType: { code_run: 5 }, dailyCounts: [] })
      handle({}, 7)
      expect(mockGetSummary).toHaveBeenCalledWith(7)
    })

    it('passes 0 days when explicitly set', () => {
      mockGetSummary.mockReturnValue({ totalEvents: 0, byType: {}, dailyCounts: [] })
      handle({}, 0)
      expect(mockGetSummary).toHaveBeenCalledWith(0)
    })

    it('returns summary data', () => {
      const summary = {
        totalEvents: 10,
        byType: { problem_solved: 5, code_run: 5 },
        dailyCounts: [{ date: '2024-01-01', count: 10 }],
      }
      mockGetSummary.mockReturnValue(summary)
      const result = handle({})
      expect(result).toEqual(summary)
    })
  })

  // -------------------------------------------------------------------
  // analytics-get-weekly-report
  // -------------------------------------------------------------------
  describe('analytics-get-weekly-report', () => {
    const handle = handlers['analytics-get-weekly-report']

    it('defaults to weekOffset 0 when no argument', () => {
      mockGetWeeklyReport.mockReturnValue({ totalEvents: 0 })
      handle({})
      expect(mockGetWeeklyReport).toHaveBeenCalledWith(0)
    })

    it('passes custom weekOffset', () => {
      mockGetWeeklyReport.mockReturnValue({ totalEvents: 3 })
      handle({}, -1)
      expect(mockGetWeeklyReport).toHaveBeenCalledWith(-1)
    })

    it('returns weekly report data', () => {
      const report = {
        weekStart: '2024-01-01',
        weekEnd: '2024-01-07',
        totalEvents: 15,
        byType: { problem_solved: 10, code_run: 5 },
        dailyBreakdown: [],
        problemsSolved: 10,
        aiChatsSent: 0,
        codeRuns: 5,
        lessonsCompleted: 0,
        topLanguages: [{ language: 'python', count: 8 }],
        avgSessionDuration: 1234,
      }
      mockGetWeeklyReport.mockReturnValue(report)
      const result = handle({})
      expect(result).toEqual(report)
    })
  })

  // -------------------------------------------------------------------
  // analytics-clear
  // -------------------------------------------------------------------
  describe('analytics-clear', () => {
    const handle = handlers['analytics-clear']

    it('calls clearAllAnalytics', () => {
      handle()
      expect(mockClearAllAnalytics).toHaveBeenCalledTimes(1)
    })

    it('does not throw on repeated calls', () => {
      handle()
      handle()
      expect(mockClearAllAnalytics).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------
  describe('handler registration', () => {
    it('registers all 5 analytics channels', () => {
      expect(Object.keys(handlers)).toEqual(
        expect.arrayContaining([
          'analytics-track',
          'analytics-get-events',
          'analytics-get-summary',
          'analytics-get-weekly-report',
          'analytics-clear',
        ]),
      )
    })
  })
})
