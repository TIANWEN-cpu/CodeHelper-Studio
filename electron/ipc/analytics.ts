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
      if (!eventData || typeof eventData !== 'object') {
        throw new Error('参数无效: eventData')
      }
      // Limit serialized size to prevent abuse
      const serialized = JSON.stringify(eventData)
      if (serialized.length > 10000) {
        throw new Error('eventData 数据过大')
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
      const since =
        filters?.since && typeof filters.since === 'string'
          ? filters.since.trim().slice(0, 30)
          : undefined
      const until =
        filters?.until && typeof filters.until === 'string'
          ? filters.until.trim().slice(0, 30)
          : undefined
      return getEvents(eventType, since, until)
    },
  )

  // Get aggregated summary
  ipcMain.handle('analytics-get-summary', (_e, days?: number) => {
    const d =
      typeof days === 'number' && Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30
    return getSummary(d)
  })

  // Get weekly report
  ipcMain.handle('analytics-get-weekly-report', (_e, weekOffset?: number) => {
    const offset =
      typeof weekOffset === 'number' && Number.isFinite(weekOffset) ? Math.floor(weekOffset) : 0
    return getWeeklyReport(offset)
  })

  // Clear all analytics data (privacy control)
  ipcMain.handle('analytics-clear', () => {
    clearAllAnalytics()
  })
}
