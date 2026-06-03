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

export interface QuickLink {
  id: string
  title: string
  description: string
  icon: string
  view: string
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

export function getQuickLinks(): QuickLink[] {
  return [
    {
      id: 'learn',
      title: 'Start Learning',
      description: 'Continue your current lesson',
      icon: 'BookOpen',
      view: 'learn',
    },
    {
      id: 'practice',
      title: 'Practice',
      description: 'Test your skills with exercises',
      icon: 'Code',
      view: 'practice',
    },
    {
      id: 'review',
      title: 'Review',
      description: 'Review items due for spaced repetition',
      icon: 'RotateCcw',
      view: 'review',
    },
    {
      id: 'ai-tutor',
      title: 'AI Tutor',
      description: 'Ask questions and get explanations',
      icon: 'Bot',
      view: 'ai-tutor',
    },
  ]
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  const events = await invoke<RawAnalyticsEvent[]>('analytics-get-events')
  return (events || []).slice(0, 10).map((e) => ({
    id: String(e.id),
    type: e.event_type,
    description: e.event_type,
    timestamp: e.timestamp,
  }))
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

export async function trackEvent(type: string, data?: unknown): Promise<void> {
  return invoke<void>('analytics-track', type, data || {})
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
