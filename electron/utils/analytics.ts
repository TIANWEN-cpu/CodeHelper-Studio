/**
 * Local analytics collection utility.
 *
 * Privacy-first: all data stays local in the SQLite database.
 * No external services are contacted. Data never leaves the user's machine.
 *
 * Tracked event types:
 * - problem_solved    : a problem was successfully accepted
 * - ai_chat_sent      : a message was sent to the AI assistant
 * - code_run          : code was executed in the editor
 * - lesson_completed  : a lesson / knowledge doc was completed
 */

import { getDB } from '../db/index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalyticsEventType = 'problem_solved' | 'ai_chat_sent' | 'code_run' | 'lesson_completed'

export interface AnalyticsEvent {
  id: number
  event_type: AnalyticsEventType
  event_data: string
  timestamp: string
}

/** Aggregated stats row returned by summary queries. */
export interface AnalyticsSummary {
  totalEvents: number
  byType: Record<string, number>
  dailyCounts: Array<{ date: string; count: number }>
}

/** Weekly report data. */
export interface WeeklyReportData {
  weekStart: string
  weekEnd: string
  totalEvents: number
  byType: Record<string, number>
  dailyBreakdown: Array<{ date: string; count: number }>
  problemsSolved: number
  aiChatsSent: number
  codeRuns: number
  lessonsCompleted: number
  topLanguages: Array<{ language: string; count: number }>
  avgSessionDuration: number
}

// ---------------------------------------------------------------------------
// Event tracking
// ---------------------------------------------------------------------------

/**
 * Record an analytics event. All data is stored locally.
 */
export function trackEvent(
  eventType: AnalyticsEventType,
  eventData: Record<string, unknown> = {},
): void {
  const db = getDB()
  db.prepare(
    'INSERT INTO analytics_events (event_type, event_data, timestamp) VALUES (?, ?, CURRENT_TIMESTAMP)',
  ).run(eventType, JSON.stringify(eventData))
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get events filtered by type and optional date range.
 */
export function getEvents(
  eventType?: AnalyticsEventType,
  since?: string,
  until?: string,
): AnalyticsEvent[] {
  const db = getDB()
  let sql = 'SELECT * FROM analytics_events WHERE 1=1'
  const params: unknown[] = []

  if (eventType) {
    sql += ' AND event_type = ?'
    params.push(eventType)
  }
  if (since) {
    sql += ' AND timestamp >= ?'
    params.push(since)
  }
  if (until) {
    sql += ' AND timestamp <= ?'
    params.push(until)
  }

  sql += ' ORDER BY timestamp DESC'
  return db.prepare(sql).all(...params) as AnalyticsEvent[]
}

/**
 * Get aggregated summary: total counts by type and daily counts for a given period.
 */
export function getSummary(days = 30): AnalyticsSummary {
  const db = getDB()
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  const totalRow = db
    .prepare('SELECT COUNT(*) as cnt FROM analytics_events WHERE timestamp >= ?')
    .get(sinceStr) as { cnt: number }

  const byTypeRows = db
    .prepare(
      'SELECT event_type, COUNT(*) as cnt FROM analytics_events WHERE timestamp >= ? GROUP BY event_type',
    )
    .all(sinceStr) as Array<{ event_type: string; cnt: number }>

  const byType: Record<string, number> = {}
  for (const row of byTypeRows) {
    byType[row.event_type] = row.cnt
  }

  const dailyRows = db
    .prepare(
      `SELECT DATE(timestamp) as date, COUNT(*) as cnt
       FROM analytics_events
       WHERE timestamp >= ?
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`,
    )
    .all(sinceStr) as Array<{ date: string; cnt: number }>

  return {
    totalEvents: totalRow.cnt,
    byType,
    dailyCounts: dailyRows.map((r) => ({ date: r.date, count: r.cnt })),
  }
}

/**
 * Get weekly report data for the current or specified week.
 */
export function getWeeklyReport(weekOffset = 0): WeeklyReportData {
  const db = getDB()

  // Calculate week boundaries (Monday to Sunday)
  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - dayOfWeek + 1 + weekOffset * 7)
  weekStart.setHours(0, 0, 0, 0)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const startStr = weekStart.toISOString().slice(0, 10)
  const endStr = weekEnd.toISOString().slice(0, 10) + ' 23:59:59'

  const totalRow = db
    .prepare('SELECT COUNT(*) as cnt FROM analytics_events WHERE timestamp BETWEEN ? AND ?')
    .get(startStr, endStr) as { cnt: number }

  const byTypeRows = db
    .prepare(
      'SELECT event_type, COUNT(*) as cnt FROM analytics_events WHERE timestamp BETWEEN ? AND ? GROUP BY event_type',
    )
    .all(startStr, endStr) as Array<{ event_type: string; cnt: number }>

  const byType: Record<string, number> = {}
  for (const row of byTypeRows) {
    byType[row.event_type] = row.cnt
  }

  const dailyRows = db
    .prepare(
      `SELECT DATE(timestamp) as date, COUNT(*) as cnt
       FROM analytics_events
       WHERE timestamp BETWEEN ? AND ?
       GROUP BY DATE(timestamp)
       ORDER BY date ASC`,
    )
    .all(startStr, endStr) as Array<{ date: string; cnt: number }>

  // Extract language breakdown from problem_solved and code_run events
  const langRows = db
    .prepare(
      `SELECT json_extract(event_data, '$.language') as language, COUNT(*) as cnt
       FROM analytics_events
       WHERE timestamp BETWEEN ? AND ?
         AND event_type IN ('problem_solved', 'code_run')
         AND json_extract(event_data, '$.language') IS NOT NULL
       GROUP BY language
       ORDER BY cnt DESC
       LIMIT 10`,
    )
    .all(startStr, endStr) as Array<{ language: string; cnt: number }>

  // Calculate average session duration from events with duration_ms
  const durationRow = db
    .prepare(
      `SELECT AVG(json_extract(event_data, '$.duration_ms')) as avg_dur
       FROM analytics_events
       WHERE timestamp BETWEEN ? AND ?
         AND json_extract(event_data, '$.duration_ms') IS NOT NULL`,
    )
    .get(startStr, endStr) as { avg_dur: number | null }

  return {
    weekStart: startStr,
    weekEnd: endStr,
    totalEvents: totalRow.cnt,
    byType,
    dailyBreakdown: dailyRows.map((r) => ({ date: r.date, count: r.cnt })),
    problemsSolved: byType['problem_solved'] ?? 0,
    aiChatsSent: byType['ai_chat_sent'] ?? 0,
    codeRuns: byType['code_run'] ?? 0,
    lessonsCompleted: byType['lesson_completed'] ?? 0,
    topLanguages: langRows.map((r) => ({ language: r.language, count: r.cnt })),
    avgSessionDuration: durationRow.avg_dur ?? 0,
  }
}

/**
 * Delete all analytics data. Available for user privacy control.
 */
export function clearAllAnalytics(): void {
  getDB().prepare('DELETE FROM analytics_events').run()
}
