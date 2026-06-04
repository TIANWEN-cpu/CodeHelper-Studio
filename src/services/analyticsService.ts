// analyticsService.ts
// 统一的本地行为埋点入口：把真实用户动作写入 analytics_events，
// 驱动首页活动流 / 学习热力图 / 连续天数 / 经验等级等真实看板。
// 失败不应影响主流程，因此吞掉错误。

import { invoke } from './ipc'

/** 后端 AnalyticsEventType 对应的四类真实事件。 */
export type TrackedEvent = 'problem_solved' | 'ai_chat_sent' | 'code_run' | 'lesson_completed'

/** 记录一次行为埋点（fire-and-forget）。 */
export function track(type: TrackedEvent, data: Record<string, unknown> = {}): void {
  void invoke<void>('analytics-track', type, data).catch(() => {
    /* 埋点失败静默，不影响主流程 */
  })
}
