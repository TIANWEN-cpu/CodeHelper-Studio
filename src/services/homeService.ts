import { invoke } from './ipc'

// ---- Types ----

export interface WeeklyStatItem {
  date: string
  score: number
}

export interface DailyTask {
  id: string
  title: string
  done: boolean
}

export interface ActivityItem {
  id: string
  type: string
  description: string
  timestamp: string
}

export interface ReviewItem {
  id: string
  title: string
  dueDate: string
  priority: string
}

export interface HeatmapItem {
  date: string
  count: number
}

export interface SuggestedLesson {
  trackId: string
  moduleId: string
  lessonId: string
  title: string
  moduleTitle: string
}

export interface HomeOverview {
  greetingName: string
  completedLessons: number
  totalLessons: number
  solvedProblems: number
  totalProblems: number
  streak: number
  level: number
  xp: number
  xpInLevel: number
  xpForNextLevel: number
  suggestedLesson: SuggestedLesson | null
}

// ---- IPC Response Types ----

interface LessonProgressItem {
  id: string
  title: string
  completed: boolean
}

interface ReviewScheduleRow {
  exercise_id: string
  interval_days: number
  ease_factor: number
  repetitions: number
  next_review: string | null
  last_reviewed: string | null
}

/** Raw shape returned by analytics-get-events. */
interface RawAnalyticsEvent {
  id: number
  event_type: string
  event_data: string
  timestamp: string
}

// ---- Service Functions ----

export async function getWeeklyStats(): Promise<WeeklyStatItem[]> {
  const summary = await invoke<{
    totalEvents: number
    byType: Record<string, number>
    dailyCounts: Array<{ date: string; count: number }>
  }>('analytics-get-summary', 7)
  return (summary.dailyCounts || []).map((d) => ({ date: d.date, score: d.count }))
}

export async function getStreakData(): Promise<number> {
  return invoke<number>('analytics-get-streak')
}

export async function getOverview(): Promise<HomeOverview> {
  return invoke<HomeOverview>('home-get-overview')
}

export async function getDailyTasks(): Promise<DailyTask[]> {
  const [lessons, reviews] = await Promise.all([
    invoke<LessonProgressItem[]>('lesson-get-progress'),
    invoke<ReviewScheduleRow[]>('review-due'),
  ])

  const lessonTasks: DailyTask[] = lessons.map((item) => ({
    id: `lesson-${item.id}`,
    title: item.title,
    done: item.completed,
  }))

  const reviewTasks: DailyTask[] = reviews.map((item) => ({
    id: `review-${item.exercise_id}`,
    title: `Review: ${item.exercise_id}`,
    done: false,
  }))

  return [...lessonTasks, ...reviewTasks]
}

// 真实事件类型 → 中文动作标签（与 HomeView 的图标/状态映射同源）。
const ACTIVITY_LABELS: Record<string, string> = {
  problem_solved: '解答通过',
  lesson_completed: '完成课程',
  code_run: '运行代码',
  ai_chat_sent: 'AI 辅导',
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  const events = await invoke<RawAnalyticsEvent[]>('analytics-get-events')
  return (events || []).slice(0, 10).map((e) => {
    const label = ACTIVITY_LABELS[e.event_type] ?? e.event_type
    let detail = ''
    try {
      const data = e.event_data ? (JSON.parse(e.event_data) as Record<string, unknown>) : {}
      if (e.event_type === 'code_run' && typeof data.language === 'string') {
        detail = data.language.toUpperCase()
      }
    } catch {
      /* event_data 非 JSON 时忽略细节 */
    }
    return {
      id: String(e.id),
      type: e.event_type,
      // 形如 "运行代码: PYTHON"；无细节时仅动作标签。HomeView 以 ':' 拆分标题/详情。
      description: detail ? `${label}: ${detail}` : label,
      timestamp: e.timestamp,
    }
  })
}

export async function getReviewReminders(): Promise<ReviewItem[]> {
  const rows = await invoke<ReviewScheduleRow[]>('review-due')
  return rows.map((r) => ({
    id: r.exercise_id,
    title: r.exercise_id,
    dueDate: r.next_review ?? '',
    priority: r.ease_factor < 1.8 ? 'high' : r.ease_factor < 2.3 ? 'medium' : 'low',
  }))
}

export async function getHeatmapData(): Promise<HeatmapItem[]> {
  const summary = await invoke<{
    totalEvents: number
    byType: Record<string, number>
    dailyCounts: Array<{ date: string; count: number }>
  }>('analytics-get-summary', 90)
  return (summary.dailyCounts || []).map((d) => ({ date: d.date, count: d.count }))
}

// ---- 活动汇总（供个人主页使用）----

export interface AnalyticsSummary {
  totalEvents: number
  byType: Record<string, number>
  dailyCounts: Array<{ date: string; count: number }>
}

/** 取最近 N 天的活动汇总：总事件数、按类型计数、每日计数。 */
export async function getAnalyticsSummary(days: number): Promise<AnalyticsSummary> {
  const summary = await invoke<AnalyticsSummary>('analytics-get-summary', days)
  return {
    totalEvents: summary?.totalEvents ?? 0,
    byType: summary?.byType ?? {},
    dailyCounts: summary?.dailyCounts ?? [],
  }
}
