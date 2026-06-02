/**
 * StatsView -- Statistics Dashboard module.
 *
 * Data sources:
 * - Problems: via `problems-list` IPC (real-time)
 * - Activity tracking: via localStorage-backed tracking data
 *
 * Uses reusable SVG chart components from src/components/charts/.
 */

import { useState, useEffect, useMemo } from 'react'
import { Flame, Target, Clock, TrendingUp, Code, BarChart3 } from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import type { Problem } from '../../types/problem'
import { LineChart } from '../../components/charts/LineChart'
import { PieChart } from '../../components/charts/PieChart'
import { BarChart } from '../../components/charts/BarChart'
import { HeatMap } from '../../components/charts/HeatMap'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodingSession {
  date: string
  minutes: number
}

interface StatsData {
  totalSolved: number
  totalProblems: number
  byDifficulty: { easy: number; medium: number; hard: number }
  byLanguage: Record<string, number>
  streak: number
  longestStreak: number
  codingTime: CodingSession[]
  recentSolved: { date: string; count: number }[]
}

interface StatsTrackingData {
  dailyMinutes: Record<string, number>
  solvedByDate: Record<string, number>
  streak: number
  longestStreak: number
  lastActiveDate: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'codehelper-stats-tracking'

const DIFFICULTY_COLORS = {
  easy: 'var(--theme-success)',
  medium: 'var(--theme-warning)',
  hard: 'var(--theme-danger)',
}

const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

const LANGUAGE_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
]

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function emptyTrackingData(): StatsTrackingData {
  return {
    dailyMinutes: {},
    solvedByDate: {},
    streak: 0,
    longestStreak: 0,
    lastActiveDate: '',
  }
}

/** Trim tracking data older than 90 days to prevent localStorage bloat. */
const TRACKING_RETENTION_DAYS = 90

function trimTrackingData(data: StatsTrackingData): StatsTrackingData {
  const cutoff = getDateString(TRACKING_RETENTION_DAYS)
  const trimmedMinutes: Record<string, number> = {}
  const trimmedSolved: Record<string, number> = {}
  for (const [date, val] of Object.entries(data.dailyMinutes)) {
    if (date >= cutoff) trimmedMinutes[date] = val
  }
  for (const [date, val] of Object.entries(data.solvedByDate)) {
    if (date >= cutoff) trimmedSolved[date] = val
  }
  return { ...data, dailyMinutes: trimmedMinutes, solvedByDate: trimmedSolved }
}

function loadStatsTrackingData(): StatsTrackingData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...emptyTrackingData(), ...JSON.parse(raw) }
  } catch {
    // corrupted data -- reset
  }
  return emptyTrackingData()
}

function saveStatsTrackingData(data: StatsTrackingData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // quota exceeded -- silently ignore
  }
}

/**
 * Compute streak from a sorted array of active dates (ascending).
 */
function computeStreak(dailyCounts: Array<{ date: string; count: number }>): {
  streak: number
  longestStreak: number
} {
  if (dailyCounts.length === 0) return { streak: 0, longestStreak: 0 }

  const today = getToday()
  const yesterday = getDateString(1)
  const activeDates = new Set(dailyCounts.filter((d) => d.count > 0).map((d) => d.date))

  // Current streak: count backwards from today/yesterday
  let streak = 0
  let checkDate = activeDates.has(today) ? today : yesterday
  while (activeDates.has(checkDate)) {
    streak++
    const d = new Date(checkDate)
    d.setDate(d.getDate() - 1)
    checkDate = d.toISOString().slice(0, 10)
  }

  // Longest streak: scan all active dates
  const sorted = [...activeDates].sort()
  let longest = 0
  let current = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000
    if (diffDays === 1) {
      current++
    } else {
      longest = Math.max(longest, current)
      current = 1
    }
  }
  longest = Math.max(longest, current)

  return { streak, longestStreak: Math.max(longest, streak) }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Stat card */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof BarChart3
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="ui-card flex items-center gap-4 p-4" role="group" aria-label={label}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
        <Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <div className="text-xl font-bold text-[var(--theme-text-primary)]">{value}</div>
        <div className="text-xs text-[var(--theme-text-muted)]">{label}</div>
        {sub && <div className="text-[10px] text-[var(--theme-text-muted)]">{sub}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StatsView() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [trackingData, setTrackingData] = useState<StatsTrackingData>(loadStatsTrackingData)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const list = await typedInvoke('problems-list', {})
        if (!cancelled) setProblems(list)
      } catch (err) {
        console.error('[StatsView] Failed to load problems:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Calculate stats from problems
  const stats = useMemo<StatsData>(() => {
    const solved = problems.filter((p) => p.solved)
    const byDifficulty = { easy: 0, medium: 0, hard: 0 }
    const byLanguage: Record<string, number> = {}

    for (const p of solved) {
      const diff = p.difficulty?.toLowerCase()
      if (diff === 'easy' || diff === '简单') byDifficulty.easy++
      else if (diff === 'medium' || diff === '中等') byDifficulty.medium++
      else if (diff === 'hard' || diff === '困难') byDifficulty.hard++

      if (p.languages) {
        for (const lang of p.languages
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean)) {
          byLanguage[lang] = (byLanguage[lang] || 0) + 1
        }
      }
    }

    // Generate coding time data (from tracking)
    const codingTime: CodingSession[] = []
    for (let i = 29; i >= 0; i--) {
      const date = getDateString(i)
      codingTime.push({
        date,
        minutes: trackingData.dailyMinutes[date] || 0,
      })
    }

    // Recent solved (from tracking)
    const recentSolved = codingTime.map((ct) => ({
      date: ct.date,
      count: trackingData.solvedByDate[ct.date] || 0,
    }))

    return {
      totalSolved: solved.length,
      totalProblems: problems.length,
      byDifficulty,
      byLanguage,
      streak: trackingData.streak,
      longestStreak: trackingData.longestStreak,
      codingTime,
      recentSolved,
    }
  }, [problems, trackingData])

  // Track active time
  useEffect(() => {
    const interval = setInterval(() => {
      const data = loadStatsTrackingData()
      const today = getToday()

      // Update daily minutes
      data.dailyMinutes[today] = (data.dailyMinutes[today] || 0) + 1

      // Update streak
      if (data.lastActiveDate !== today) {
        const yesterday = getDateString(1)
        if (data.lastActiveDate === yesterday) {
          data.streak += 1
        } else if (data.lastActiveDate !== today) {
          data.streak = 1
        }
        data.lastActiveDate = today
        data.longestStreak = Math.max(data.longestStreak, data.streak)
      }

      saveStatsTrackingData(data)
      setTrackingData(data)
    }, 60000) // every minute

    // Trim old tracking data on mount to prevent localStorage bloat
    const trimmed = trimTrackingData(loadStatsTrackingData())
    saveStatsTrackingData(trimmed)
    setTrackingData(trimmed)

    return () => clearInterval(interval)
  }, [])

  // Chart data derivations
  const languageChartData = useMemo(
    () =>
      Object.entries(stats.byLanguage)
        .sort(([, a], [, b]) => b - a)
        .map(([label, value], i) => ({
          label,
          value,
          color: LANGUAGE_COLORS[i % LANGUAGE_COLORS.length],
        })),
    [stats.byLanguage],
  )

  const progressData = useMemo(
    () =>
      stats.codingTime.map((ct) => ({
        label: ct.date,
        value: ct.minutes,
      })),
    [stats.codingTime],
  )

  const difficultyChartData = useMemo(
    () =>
      (['easy', 'medium', 'hard'] as const).map((diff) => {
        const count = stats.byDifficulty[diff]
        const total = problems.filter(
          (p) =>
            p.difficulty?.toLowerCase() === diff ||
            p.difficulty?.toLowerCase() === DIFFICULTY_LABELS[diff],
        ).length
        return {
          label: DIFFICULTY_LABELS[diff],
          value: count,
          color: DIFFICULTY_COLORS[diff],
        }
      }),
    [stats.byDifficulty, problems],
  )

  const heatmapData = useMemo(
    () =>
      stats.codingTime.map((ct) => ({
        date: ct.date,
        value: ct.minutes,
      })),
    [stats.codingTime],
  )

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-[var(--theme-text-muted)]">加载统计数据...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="ui-section-title text-2xl">统计面板</h1>
        <p className="mt-2 text-sm text-[var(--theme-text-muted)]">查看你的学习进度和编码数据</p>
      </div>

      <div className="max-w-5xl space-y-6">
        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            icon={Target}
            label="已解题目"
            value={stats.totalSolved}
            sub={`共 ${stats.totalProblems} 题`}
          />
          <StatCard
            icon={Flame}
            label="连续天数"
            value={stats.streak}
            sub={`最长 ${stats.longestStreak} 天`}
          />
          <StatCard
            icon={Clock}
            label="本月编码时间"
            value={`${stats.codingTime.reduce((s, c) => s + c.minutes, 0)} 分钟`}
          />
          <StatCard
            icon={TrendingUp}
            label="完成率"
            value={`${stats.totalProblems > 0 ? ((stats.totalSolved / stats.totalProblems) * 100).toFixed(0) : 0}%`}
          />
        </div>

        {/* Difficulty distribution - Bar Chart */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <BarChart3 size={18} />
            难度分布
          </h2>
          {difficultyChartData.some((d) => d.value > 0) ? (
            <BarChart data={difficultyChartData} height={200} ariaLabel="题目难度分布柱状图" />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              解题后将显示难度分布
            </div>
          )}
        </div>

        {/* Language usage - Pie Chart */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Code size={18} />
            语言使用分布
          </h2>
          {languageChartData.length > 0 ? (
            <PieChart
              data={languageChartData}
              size={180}
              innerRadius={0.5}
              showPercent
              centerLabel={String(stats.totalSolved)}
              centerSub="总计"
              ariaLabel="语言使用分布饼图"
            />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              解题后将显示语言使用统计
            </div>
          )}
        </div>

        {/* Progress over time - Line Chart */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <TrendingUp size={18} />
            编码时间趋势 (近30天)
          </h2>
          {progressData.some((d) => d.value > 0) ? (
            <LineChart
              data={progressData}
              height={180}
              yLabel="分钟"
              ariaLabel="编码时间趋势折线图"
            />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              开始编码后将显示时间趋势
            </div>
          )}
        </div>

        {/* Activity heatmap */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Flame size={18} />
            活跃热力图 (近30天)
          </h2>
          <HeatMap
            data={heatmapData}
            weeks={5}
            cellSize={16}
            cellGap={4}
            ariaLabel="编码活跃热力图"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Track a problem submission for stats.
 * Call this when a problem is successfully solved.
 */
export function trackProblemSolved(_language: string) {
  const data = loadStatsTrackingData()
  const today = getToday()
  data.solvedByDate[today] = (data.solvedByDate[today] || 0) + 1
  saveStatsTrackingData(data)
}

/**
 * Track coding time. Call periodically while the editor is active.
 */
export function trackCodingMinutes(minutes: number) {
  const data = loadStatsTrackingData()
  const today = getToday()
  data.dailyMinutes[today] = (data.dailyMinutes[today] || 0) + minutes
  saveStatsTrackingData(data)
}
