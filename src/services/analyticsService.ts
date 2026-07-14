// analyticsService.ts
// 统一的本地行为埋点入口：把真实用户动作写入 analytics_events，
// 驱动首页活动流 / 学习热力图 / 连续天数 / 经验等级等真实看板。
// 失败不应影响主流程，因此吞掉错误。

import { invoke } from './ipc'

/** 后端 AnalyticsEventType 对应的四类真实事件。 */
export type TrackedEvent = 'problem_solved' | 'ai_chat_sent' | 'code_run' | 'lesson_completed'

/** 行为埋点的客户端广播事件名；桌宠等 UI 据此即时反应（无需等 IPC 往返）。 */
export const ACTIVITY_EVENT = 'codehelper:activity'

/** 记录一次行为埋点（fire-and-forget）。 */
export function track(type: TrackedEvent, data: Record<string, unknown> = {}): void {
  // 先在本地广播，让桌宠等 UI 即时反应；与后端埋点互不阻塞。
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: { type, data } }))
    } catch {
      /* 广播失败不影响埋点 */
    }
  }
  void invoke<void>('analytics-track', type, data).catch(() => {
    /* 埋点失败静默，不影响主流程 */
  })
}

/** 周报数据结构（与后端 getWeeklyReport 返回一致）。 */
export interface WeeklyReport {
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

/**
 * 取某一周的学习周报。weekOffset=0 本周，-1 上周，依此类推。
 * 读失败返回 null（best-effort），调用方据此回退。
 */
export async function getWeeklyReport(weekOffset = 0): Promise<WeeklyReport | null> {
  try {
    return await invoke<WeeklyReport>('analytics-get-weekly-report', weekOffset)
  } catch {
    return null
  }
}
