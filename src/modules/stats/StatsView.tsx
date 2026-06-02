/**
 * StatsView — Statistics Dashboard module.
 *
 * Displays:
 * - Problems solved by difficulty
 * - Language usage breakdown (pie chart via CSS)
 * - Daily/weekly coding time
 * - Streak tracking
 * - Progress over time (line chart via SVG)
 */

import { useState, useEffect, useMemo } from 'react'
import { BarChart3, Flame, Target, Clock, TrendingUp, Code } from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import type { Problem } from '../../types/problem'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Persist stats tracking data to localStorage.
 */
const STATS_KEY = 'codehelper-stats'

function loadStatsTrackingData(): {
  streak: number
  longestStreak: number
  lastActiveDate: string
  dailyMinutes: Record<string, number>
  solvedByDate: Record<string, number>
} {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (raw) return JSON.parse(raw) as ReturnType<typeof loadStatsTrackingData>
  } catch {
    // ignore
  }
  return { streak: 0, longestStreak: 0, lastActiveDate: '', dailyMinutes: {}, solvedByDate: {} }
}

function saveStatsTrackingData(data: ReturnType<typeof loadStatsTrackingData>) {
  localStorage.setItem(STATS_KEY, JSON.stringify(data))
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** CSS-only donut chart */
function DonutChart({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) return <div className="text-xs text-[var(--theme-text-muted)]">暂无数据</div>

  let cumulative = 0
  const gradients = data.map((d) => {
    const start = (cumulative / total) * 360
    cumulative += d.value
    const end = (cumulative / total) * 360
    return `${d.color} ${start}deg ${end}deg`
  })

  return (
    <div className="flex items-center gap-6">
      <div
        className="h-28 w-28 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${gradients.join(', ')})`,
        }}
      >
        <div className="m-auto flex h-20 w-20 translate-y-1 items-center justify-center rounded-full bg-[var(--theme-bg-card)] text-center">
          <div>
            <div className="text-lg font-bold text-[var(--theme-text-primary)]">{total}</div>
            <div className="text-[10px] text-[var(--theme-text-muted)]">总计</div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="text-[var(--theme-text-secondary)]">{d.label}</span>
            <span className="ml-auto font-medium text-[var(--theme-text-primary)]">{d.value}</span>
            <span className="text-[10px] text-[var(--theme-text-muted)]">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** SVG line chart for progress over time */
function LineChart({
  data,
  height = 120,
}: {
  data: Array<{ label: string; value: number }>
  height?: number
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const width = 400
  const padding = { top: 10, right: 10, bottom: 30, left: 10 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const points = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.value / max) * chartH,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="编码时间趋势图"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + chartH * (1 - pct)}
          y2={padding.top + chartH * (1 - pct)}
          stroke="var(--theme-border)"
          strokeDasharray="4 4"
          strokeWidth={0.5}
        />
      ))}
      {/* Area fill */}
      <path d={areaD} fill="var(--theme-accent)" opacity={0.1} />
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--theme-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--theme-accent)" />
      ))}
      {/* X-axis labels (show every nth) */}
      {data
        .filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1)
        .map((d) => {
          const idx = data.indexOf(d)
          return (
            <text
              key={idx}
              x={padding.left + (idx / Math.max(data.length - 1, 1)) * chartW}
              y={height - 5}
              textAnchor="middle"
              fontSize={9}
              fill="var(--theme-text-muted)"
            >
              {d.label.slice(5)}
            </text>
          )
        })}
    </svg>
  )
}

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
  const trackingData = loadStatsTrackingData()

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

    // Generate coding time data (from tracking or placeholder)
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
    }, 60000) // every minute

    return () => clearInterval(interval)
  }, [])

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

        {/* Difficulty breakdown */}
        <div className="ui-card p-6">
          <h2 className="mb-4 text-base font-semibold text-[var(--theme-text-primary)]">
            题目完成情况
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {(['easy', 'medium', 'hard'] as const).map((diff) => {
              const count = stats.byDifficulty[diff]
              const total = problems.filter(
                (p) =>
                  p.difficulty?.toLowerCase() === diff ||
                  p.difficulty?.toLowerCase() === DIFFICULTY_LABELS[diff],
              ).length
              const pct = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={diff} className="text-center">
                  <div className="text-2xl font-bold" style={{ color: DIFFICULTY_COLORS[diff] }}>
                    {count}
                  </div>
                  <div className="mt-1 text-xs text-[var(--theme-text-muted)]">
                    {DIFFICULTY_LABELS[diff]}
                  </div>
                  <div className="mx-auto mt-2 h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--theme-bg-hover)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: DIFFICULTY_COLORS[diff] }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--theme-text-muted)]">
                    {pct.toFixed(0)}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Language usage */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Code size={18} />
            语言使用分布
          </h2>
          {languageChartData.length > 0 ? (
            <DonutChart data={languageChartData} />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              解题后将显示语言使用统计
            </div>
          )}
        </div>

        {/* Progress over time */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <TrendingUp size={18} />
            编码时间趋势 (近30天)
          </h2>
          {progressData.some((d) => d.value > 0) ? (
            <LineChart data={progressData} />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              开始编码后将显示时间趋势
            </div>
          )}
        </div>

        {/* Daily streak grid */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Flame size={18} />
            活跃日历 (近30天)
          </h2>
          <div className="flex flex-wrap gap-1.5" role="grid" aria-label="活跃日历">
            {stats.codingTime.map((ct) => {
              const level =
                ct.minutes === 0
                  ? 0
                  : ct.minutes < 15
                    ? 1
                    : ct.minutes < 30
                      ? 2
                      : ct.minutes < 60
                        ? 3
                        : 4
              const colors = [
                'var(--theme-bg-hover)',
                'color-mix(in srgb, var(--theme-accent) 25%, var(--theme-bg-hover))',
                'color-mix(in srgb, var(--theme-accent) 50%, var(--theme-bg-hover))',
                'color-mix(in srgb, var(--theme-accent) 75%, var(--theme-bg-hover))',
                'var(--theme-accent)',
              ]
              return (
                <div
                  key={ct.date}
                  title={`${ct.date}: ${ct.minutes} 分钟`}
                  className="h-5 w-5 rounded-sm transition-transform hover:scale-125"
                  style={{ backgroundColor: colors[level] }}
                />
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--theme-text-muted)]">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((level) => {
              const colors = [
                'var(--theme-bg-hover)',
                'color-mix(in srgb, var(--theme-accent) 25%, var(--theme-bg-hover))',
                'color-mix(in srgb, var(--theme-accent) 50%, var(--theme-bg-hover))',
                'color-mix(in srgb, var(--theme-accent) 75%, var(--theme-bg-hover))',
                'var(--theme-accent)',
              ]
              return (
                <div
                  key={level}
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: colors[level] }}
                />
              )
            })}
            <span>多</span>
          </div>
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
