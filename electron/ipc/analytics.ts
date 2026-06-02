/**
 * IPC handlers for analytics events.
 *
 * All analytics data is stored and queried locally — nothing is sent externally.
 */

import { ipcMain } from 'electron'
import {
  trackEvent,
  getEvents,
  getSummary,
  getWeeklyReport,
  clearAllAnalytics,
} from '../utils/analytics'
import type { AnalyticsEventType } from '../utils/analytics'

const VALID_EVENT_TYPES = new Set<string>([
  'problem_solved',
  'ai_chat_sent',
  'code_run',
  'lesson_completed',
])

export function registerAnalyticsIPC(): void {
  // Track a new analytics event
  ipcMain.handle(
    'analytics-track',
    (_e, eventType: string, eventData: Record<string, unknown> = {}) => {
      if (!VALID_EVENT_TYPES.has(eventType)) {
        throw new Error(`Invalid event type: ${eventType}`)
      }
      trackEvent(eventType as AnalyticsEventType, eventData)
    },
  )

  // Query events with optional filters
  ipcMain.handle(
    'analytics-get-events',
    (_e, filters?: { eventType?: string; since?: string; until?: string }) => {
      const eventType =
        filters?.eventType && VALID_EVENT_TYPES.has(filters.eventType)
          ? (filters.eventType as AnalyticsEventType)
          : undefined
      return getEvents(eventType, filters?.since, filters?.until)
    },
  )

  // Get aggregated summary
  ipcMain.handle('analytics-get-summary', (_e, days?: number) => {
    return getSummary(days ?? 30)
  })

  // Get weekly report
  ipcMain.handle('analytics-get-weekly-report', (_e, weekOffset?: number) => {
    return getWeeklyReport(weekOffset ?? 0)
  })

  // Clear all analytics data (privacy control)
  ipcMain.handle('analytics-clear', () => {
    clearAllAnalytics()
  })
}
