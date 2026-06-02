/**
 * DashboardView -- Main dashboard / landing page module.
 *
 * Provides a quick overview of user progress, recent activity, and
 * actionable suggestions. Uses chart components for visual flair.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Flame,
  Target,
  Calendar,
  TrendingUp,
  ArrowRight,
  BookOpen,
  Zap,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import type { Problem } from '../../types/problem'
import { LineChart } from '../../components/charts/LineChart'
import { HeatMap } from '../../components/charts/HeatMap'
import { useAppStore } from '../../stores/appStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalSolved: number
  totalProblems: number
  todaySolved: number
  streak: number
  longestStreak: number
  weeklyMinutes: number
  weeklyData: Array<{ label: string; value: number }>
  heatmapData: Array<{ date: string; value: number }>
  recentActivity: ActivityItem[]
  suggestedAction: SuggestedAction
}

interface ActivityItem {
  id: string
  type: 'solved' | 'attempted' | 'streak' | 'milestone'
  title: string
  detail: string
  time: string
}

interface SuggestedAction {
  title: string
  description: string
  module: 'problems' | 'editor' | 'stats' | 'mistakes'
  icon: 'target' | 'trending' | 'book' | 'zap'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'codehelper-stats-tracking'

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function loadTrackingData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return {
    dailyMinutes: {} as Record<string, number>,
    solvedByDate: {} as Record<string, number>,
    streak: 0,
    longestStreak: 0,
    lastActiveDate: '',
  }
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Welcome card with greeting, name and streak */
function WelcomeCard({ streak, todaySolved }: { streak: number; todaySolved: number }) {
  return (
    <div className="ui-card relative overflow-hidden p-6">
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          background: 'linear-gradient(135deg, var(--theme-accent) 0%, transparent 60%)',
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">
              {getGreeting()}，开发者
            </h1>
            <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
              {todaySolved > 0
                ? `今天已解 ${todaySolved} 道题，继续保持！`
                : '今天还没有解题，来挑战一道吧'}
            </p>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--theme-accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--theme-accent)]">
              <Flame size={16} />
              {streak} 天连续
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Quick stat mini-card */
function QuickStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Target
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className="ui-card flex items-center gap-3 p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          accent
            ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]'
            : 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
        }`}
      >
        <Icon size={18} aria-hidden="true" />
      </div>
      <div>
        <div className="text-lg font-bold text-[var(--theme-text-primary)]">{value}</div>
        <div className="text-xs text-[var(--theme-text-muted)]">{label}</div>
      </div>
    </div>
  )
}

/** Activity feed item */
function ActivityItem({ item }: { item: ActivityItem }) {
  const iconMap = {
    solved: <CheckCircle2 size={16} className="text-[var(--theme-success)]" />,
    attempted: <Target size={16} className="text-[var(--theme-warning)]" />,
    streak: <Flame size={16} className="text-[var(--theme-accent)]" />,
    milestone: <TrendingUp size={16} className="text-[var(--theme-accent)]" />,
  }

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">{iconMap[item.type]}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--theme-text-primary)] truncate">
          {item.title}
        </p>
        <p className="text-xs text-[var(--theme-text-muted)]">{item.detail}</p>
      </div>
      <span className="shrink-0 text-[10px] text-[var(--theme-text-muted)]">{item.time}</span>
    </div>
  )
}

/** Suggested next action card */
function SuggestedActionCard({ action }: { action: SuggestedAction }) {
  const setActiveModule = useAppStore((s) => s.setActiveModule)
  const iconMap = {
    target: Target,
    trending: TrendingUp,
    book: BookOpen,
    zap: Zap,
  }
  const Icon = iconMap[action.icon]

  return (
    <button
      className="ui-card group flex w-full items-center gap-4 p-4 text-left transition-colors hover:border-[var(--theme-accent)]"
      onClick={() => setActiveModule(action.module)}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--theme-text-primary)]">{action.title}</div>
        <div className="text-xs text-[var(--theme-text-muted)]">{action.description}</div>
      </div>
      <ArrowRight
        size={16}
        className="shrink-0 text-[var(--theme-text-muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--theme-accent)]"
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardView() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const list = await typedInvoke('problems-list', {})
        if (!cancelled) setProblems(list)
      } catch (err) {
        console.error('[DashboardView] Failed to load problems:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const dashboardStats = useMemo<DashboardStats>(() => {
    const tracking = loadTrackingData()
    const today = getToday()
    const solved = problems.filter((p) => p.solved)
    const todaySolved = tracking.solvedByDate[today] || 0

    // Weekly coding time data (last 7 days)
    const weeklyData: Array<{ label: string; value: number }> = []
    let weeklyMinutes = 0
    for (let i = 6; i >= 0; i--) {
      const date = getDateString(i)
      const minutes = tracking.dailyMinutes[date] || 0
      weeklyMinutes += minutes
      weeklyData.push({ label: date, value: minutes })
    }

    // Heatmap data (last 60 days for compact view)
    const heatmapData: Array<{ date: string; value: number }> = []
    for (let i = 59; i >= 0; i--) {
      const date = getDateString(i)
      heatmapData.push({
        date,
        value: (tracking.dailyMinutes[date] || 0) + (tracking.solvedByDate[date] || 0) * 15,
      })
    }

    // Build recent activity feed
    const recentActivity: ActivityItem[] = []

    // Check for today's solves
    if (todaySolved > 0) {
      recentActivity.push({
        id: 'today-solved',
        type: 'solved',
        title: `今日解题 ${todaySolved} 道`,
        detail: '保持良好势头！',
        time: '今天',
      })
    }

    // Check streak
    if (tracking.streak >= 3) {
      recentActivity.push({
        id: 'streak',
        type: 'streak',
        title: `连续 ${tracking.streak} 天编码`,
        detail: `最长记录 ${tracking.longestStreak} 天`,
        time: '持续中',
      })
    }

    // Milestones
    if (solved.length >= 10 && solved.length < 50) {
      recentActivity.push({
        id: 'milestone-10',
        type: 'milestone',
        title: '已解 10+ 道题',
        detail: '初学者里程碑，继续加油！',
        time: '里程碑',
      })
    } else if (solved.length >= 50) {
      recentActivity.push({
        id: 'milestone-50',
        type: 'milestone',
        title: `已解 ${solved.length} 道题`,
        detail: '你的实力在稳步提升',
        time: '里程碑',
      })
    }

    // Recent days activity
    for (let i = 1; i <= 3; i++) {
      const date = getDateString(i)
      const mins = tracking.dailyMinutes[date] || 0
      const count = tracking.solvedByDate[date] || 0
      if (count > 0) {
        recentActivity.push({
          id: `past-${date}`,
          type: 'solved',
          title: `${date} 解题 ${count} 道`,
          detail: `编码 ${mins} 分钟`,
          time: `${i}天前`,
        })
      }
    }

    // If no activity at all
    if (recentActivity.length === 0) {
      recentActivity.push({
        id: 'no-activity',
        type: 'attempted',
        title: '暂无最近活动',
        detail: '开始解题来记录你的编码之旅',
        time: '',
      })
    }

    // Suggest next action
    let suggestedAction: SuggestedAction
    if (solved.length === 0) {
      suggestedAction = {
        title: '开始第一道题',
        description: '从简单难度开始，迈出第一步',
        module: 'problems',
        icon: 'target',
      }
    } else if (todaySolved === 0) {
      suggestedAction = {
        title: '今日尚未解题',
        description: '坚持每天练习，保持连续记录',
        module: 'problems',
        icon: 'zap',
      }
    } else if (solved.length < 20) {
      suggestedAction = {
        title: '查看学习统计',
        description: '了解你的学习进度和编码习惯',
        module: 'stats',
        icon: 'trending',
      }
    } else {
      suggestedAction = {
        title: '挑战中等难度',
        description: '突破舒适区，提升解题能力',
        module: 'problems',
        icon: 'target',
      }
    }

    return {
      totalSolved: solved.length,
      totalProblems: problems.length,
      todaySolved,
      streak: tracking.streak,
      longestStreak: tracking.longestStreak,
      weeklyMinutes,
      weeklyData,
      heatmapData,
      recentActivity,
      suggestedAction,
    }
  }, [problems])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-[var(--theme-text-muted)]">加载仪表盘...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl space-y-6">
        {/* Welcome card */}
        <WelcomeCard streak={dashboardStats.streak} todaySolved={dashboardStats.todaySolved} />

        {/* Quick stats grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <QuickStat
            icon={Target}
            label="今日解题"
            value={dashboardStats.todaySolved}
            accent={dashboardStats.todaySolved > 0}
          />
          <QuickStat
            icon={BookOpen}
            label="总解题数"
            value={`${dashboardStats.totalSolved}/${dashboardStats.totalProblems}`}
          />
          <QuickStat icon={Flame} label="连续天数" value={dashboardStats.streak} />
          <QuickStat icon={Clock} label="本周编码" value={`${dashboardStats.weeklyMinutes} 分钟`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-6">
            {/* Weekly coding trend */}
            <div className="ui-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
                <TrendingUp size={18} />
                本周编码趋势
              </h2>
              {dashboardStats.weeklyData.some((d) => d.value > 0) ? (
                <LineChart
                  data={dashboardStats.weeklyData}
                  height={140}
                  yLabel="分钟"
                  showDots
                  ariaLabel="本周编码时间趋势"
                />
              ) : (
                <div className="flex h-36 items-center justify-center text-sm text-[var(--theme-text-muted)]">
                  本周暂无编码记录
                </div>
              )}
            </div>

            {/* Activity heatmap */}
            <div className="ui-card p-6">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
                <Calendar size={18} />
                近期活跃度
              </h2>
              <HeatMap
                data={dashboardStats.heatmapData}
                weeks={9}
                cellSize={14}
                cellGap={3}
                ariaLabel="近期活跃度热力图"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Suggested action */}
            <SuggestedActionCard action={dashboardStats.suggestedAction} />

            {/* Recent activity */}
            <div className="ui-card p-6">
              <h2 className="mb-3 text-base font-semibold text-[var(--theme-text-primary)]">
                最近动态
              </h2>
              <div className="divide-y divide-[var(--theme-border)]">
                {dashboardStats.recentActivity.map((item) => (
                  <ActivityItem key={item.id} item={item} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
