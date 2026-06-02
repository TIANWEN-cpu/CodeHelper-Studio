/**
 * Analytics types shared between main and renderer processes.
 */

export type AnalyticsEventType = 'problem_solved' | 'ai_chat_sent' | 'code_run' | 'lesson_completed'

export interface AnalyticsEvent {
  id: number
  event_type: AnalyticsEventType
  event_data: string
  timestamp: string
}

export interface AnalyticsSummary {
  totalEvents: number
  byType: Record<string, number>
  dailyCounts: Array<{ date: string; count: number }>
}

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
