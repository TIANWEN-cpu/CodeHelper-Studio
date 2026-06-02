/**
 * AnalyticsView -- Analytics & Metrics dashboard module.
 *
 * Displays:
 * - Coding time tracking (daily, weekly, monthly)
 * - Problems solved trend
 * - Language usage breakdown
 * - Difficulty distribution
 * - Streak tracking
 * - Session duration analysis
 *
 * All data is collected locally -- no external analytics service.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart3,
  Clock,
  Flame,
  Target,
  TrendingUp,
  Code,
  Calendar,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import { WeeklyReport } from './WeeklyReport'
import type { AnalyticsSummary } from '../../types/analytics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimePeriod = 'daily' | 'weekly' | 'monthly'

interface DailyCount {
  date: string
  count: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPE_LABELS: Record<string, string> = {
  problem_solved: '解题',
  ai_chat_sent: 'AI 对话',
  code_run: '代码运行',
  lesson_completed: '课程完成',
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  problem_solved: 'var(--theme-success)',
  ai_chat_sent: 'var(--theme-accent)',
  code_run: 'var(--theme-warning)',
  lesson_completed: '#8b5cf6',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const monday = new Date(d)
  const day = monday.getDay()
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(monday.getDate() + diff)
  return monday.toISOString().slice(0, 10)
}

function getMonthLabel(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Aggregate daily counts by week or month. */
function aggregateCounts(daily: DailyCount[], period: TimePeriod): DailyCount[] {
  if (period === 'daily') return daily

  const map = new Map<string, number>()
  for (const d of daily) {
    const key = period === 'weekly' ? getWeekLabel(d.date) : getMonthLabel(d.date)
    map.set(key, (map.get(key) ?? 0) + d.count)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Summary stat card */
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
        style={{ background: `conic-gradient(${gradients.join(', ')})` }}
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

/** SVG bar chart for trend visualization */
function BarChartView({
  data,
  height = 140,
}: {
  data: Array<{ label: string; value: number }>
  height?: number
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const width = 500
  const padding = { top: 10, right: 10, bottom: 30, left: 10 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom
  const barW = Math.max(2, (chartW / data.length) * 0.7)
  const gap = (chartW / data.length) * 0.3

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="事件趋势图">
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
      {/* Bars */}
      {data.map((d, i) => {
        const barH = (d.value / max) * chartH
        const x = padding.left + (i / data.length) * chartW + gap / 2
        const y = padding.top + chartH - barH
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={2}
            fill="var(--theme-accent)"
            opacity={0.8}
          >
            <title>{`${d.label}: ${d.value}`}</title>
          </rect>
        )
      })}
      {/* X-axis labels */}
      {data
        .filter(
          (_, i) => i % Math.max(1, Math.ceil(data.length / 10)) === 0 || i === data.length - 1,
        )
        .map((d) => {
          const idx = data.indexOf(d)
          return (
            <text
              key={idx}
              x={padding.left + (idx / data.length) * chartW + barW / 2 + gap / 2}
              y={height - 5}
              textAnchor="middle"
              fontSize={9}
              fill="var(--theme-text-muted)"
            >
              {d.label.length > 7 ? d.label.slice(5) : d.label}
            </text>
          )
        })}
    </svg>
  )
}

/** Streak calendar grid (GitHub-style) */
function StreakCalendar({ dailyCounts }: { dailyCounts: Array<{ date: string; count: number }> }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="grid" aria-label="活跃日历">
        {dailyCounts.map((dc) => {
          const level =
            dc.count === 0 ? 0 : dc.count < 3 ? 1 : dc.count < 6 ? 2 : dc.count < 10 ? 3 : 4
          const colors = [
            'var(--theme-bg-hover)',
            'color-mix(in srgb, var(--theme-accent) 25%, var(--theme-bg-hover))',
            'color-mix(in srgb, var(--theme-accent) 50%, var(--theme-bg-hover))',
            'color-mix(in srgb, var(--theme-accent) 75%, var(--theme-bg-hover))',
            'var(--theme-accent)',
          ]
          return (
            <div
              key={dc.date}
              title={`${dc.date}: ${dc.count} 次事件`}
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
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsView() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<TimePeriod>('daily')
  const [summaryDays, setSummaryDays] = useState(30)
  const [showReport, setShowReport] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const data = await typedInvoke('analytics-get-summary', summaryDays)
      setSummary(data)
    } catch (err) {
      console.error('[AnalyticsView] Failed to load summary:', err)
    } finally {
      setLoading(false)
    }
  }, [summaryDays])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const handleClear = useCallback(async () => {
    try {
      await typedInvoke('analytics-clear')
      setConfirmClear(false)
      void loadSummary()
    } catch (err) {
      console.error('[AnalyticsView] Failed to clear analytics:', err)
    }
  }, [loadSummary])

  // Aggregated chart data
  const chartData = useMemo(() => {
    if (!summary) return []
    return aggregateCounts(summary.dailyCounts, period)
  }, [summary, period])

  // Event type breakdown for donut chart
  const typeBreakdown = useMemo(() => {
    if (!summary) return []
    return Object.entries(summary.byType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({
        label: EVENT_TYPE_LABELS[type] ?? type,
        value: count,
        color: EVENT_TYPE_COLORS[type] ?? '#6366f1',
      }))
  }, [summary])

  // Streak calculation from daily counts
  const streakInfo = useMemo(() => {
    if (!summary) return { current: 0, longest: 0 }
    const dates = new Set(summary.dailyCounts.map((d) => d.date))
    let current = 0
    let longest = 0
    let tempStreak = 0

    // Walk backwards from today
    for (let i = 0; i < 365; i++) {
      const d = getDateString(i)
      if (dates.has(d)) {
        tempStreak++
        if (i === current) current = tempStreak
      } else {
        longest = Math.max(longest, tempStreak)
        tempStreak = 0
        if (i === 0) current = 0
      }
    }
    longest = Math.max(longest, tempStreak, current)

    return { current, longest }
  }, [summary])

  // Session duration
  const sessionInfo = useMemo(() => {
    if (!summary) return { avgMinutes: 0, totalMinutes: 0 }
    // Estimate from code_run events: each = ~5 min session
    const codeRuns = summary.byType['code_run'] ?? 0
    const totalMinutes = codeRuns * 5
    const days = Math.max(1, summary.dailyCounts.filter((d) => d.count > 0).length)
    return {
      avgMinutes: Math.round(totalMinutes / days),
      totalMinutes,
    }
  }, [summary])

  const handlePrevPeriod = useCallback(() => {
    setSummaryDays((prev) => prev + 30)
  }, [])

  const handleNextPeriod = useCallback(() => {
    setSummaryDays((prev) => Math.max(30, prev - 30))
  }, [])

  if (loading && !summary) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-[var(--theme-text-muted)]">加载分析数据...</div>
      </div>
    )
  }

  if (showReport) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <button
          onClick={() => setShowReport(false)}
          className="mb-4 flex items-center gap-1 text-sm text-[var(--theme-accent)] hover:underline cursor-pointer"
        >
          <ChevronLeft size={16} />
          返回分析面板
        </button>
        <WeeklyReport />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="ui-section-title text-2xl">数据分析</h1>
          <p className="mt-2 text-sm text-[var(--theme-text-muted)]">
            本地采集，隐私优先 -- 所有数据仅存储在你的设备上
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReport(true)}
            className="rounded-lg bg-[var(--theme-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--theme-accent)] hover:opacity-80 cursor-pointer"
          >
            查看周报
          </button>
          {confirmClear ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--theme-danger)]">确认清除?</span>
              <button
                onClick={handleClear}
                className="rounded px-2 py-1 text-xs text-[var(--theme-danger)] hover:bg-[var(--theme-danger)] hover:text-white cursor-pointer"
              >
                确认
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded px-2 py-1 text-xs text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)] cursor-pointer"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              title="清除所有分析数据"
              aria-label="清除所有分析数据"
              onClick={() => setConfirmClear(true)}
              className="rounded-lg p-2 text-[var(--theme-text-muted)] hover:text-[var(--theme-danger)] hover:bg-[var(--theme-bg-hover)] cursor-pointer"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl space-y-6">
        {/* Overview cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            icon={Target}
            label="解题数"
            value={summary?.byType['problem_solved'] ?? 0}
            sub={`近 ${summaryDays} 天`}
          />
          <StatCard
            icon={Flame}
            label="连续天数"
            value={streakInfo.current}
            sub={`最长 ${streakInfo.longest} 天`}
          />
          <StatCard
            icon={Clock}
            label="估计编码时间"
            value={`${sessionInfo.totalMinutes} 分钟`}
            sub={`日均 ${sessionInfo.avgMinutes} 分钟`}
          />
          <StatCard
            icon={TrendingUp}
            label="总事件数"
            value={summary?.totalEvents ?? 0}
            sub={`近 ${summaryDays} 天`}
          />
        </div>

        {/* Event type breakdown */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Code size={18} />
            事件类型分布
          </h2>
          {typeBreakdown.length > 0 ? (
            <DonutChart data={typeBreakdown} />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              开始使用后将显示事件分布统计
            </div>
          )}
        </div>

        {/* Trend chart with period selector */}
        <div className="ui-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
              <TrendingUp size={18} />
              事件趋势
            </h2>
            <div className="flex items-center gap-3">
              {/* Time range navigation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevPeriod}
                  title="扩大时间范围"
                  className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="min-w-[60px] text-center text-xs text-[var(--theme-text-muted)]">
                  {summaryDays} 天
                </span>
                <button
                  onClick={handleNextPeriod}
                  title="缩小时间范围"
                  disabled={summaryDays <= 30}
                  className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              {/* Period toggle */}
              <div className="flex rounded-lg border border-[var(--theme-border)] overflow-hidden">
                {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2 py-1 text-xs transition-colors cursor-pointer ${
                      period === p
                        ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]'
                        : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)]'
                    }`}
                  >
                    {p === 'daily' ? '日' : p === 'weekly' ? '周' : '月'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {chartData.some((d) => d.count > 0) ? (
            <BarChartView data={chartData} />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              暂无趋势数据，开始使用后自动记录
            </div>
          )}
        </div>

        {/* Activity calendar */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Flame size={18} />
            活跃日历 (近 {summaryDays} 天)
          </h2>
          {summary && summary.dailyCounts.length > 0 ? (
            <StreakCalendar dailyCounts={summary.dailyCounts} />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--theme-text-muted)]">
              暂无活跃数据
            </div>
          )}
        </div>

        {/* Session duration analysis */}
        <div className="ui-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Calendar size={18} />
            编码习惯分析
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--theme-accent)]">
                {summary?.byType['code_run'] ?? 0}
              </div>
              <div className="text-xs text-[var(--theme-text-muted)]">代码运行次数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--theme-success)]">
                {summary?.byType['ai_chat_sent'] ?? 0}
              </div>
              <div className="text-xs text-[var(--theme-text-muted)]">AI 对话次数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#8b5cf6]">
                {summary?.byType['lesson_completed'] ?? 0}
              </div>
              <div className="text-xs text-[var(--theme-text-muted)]">完成课程数</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--theme-warning)]">
                {sessionInfo.avgMinutes}
              </div>
              <div className="text-xs text-[var(--theme-text-muted)]">日均编码 (分钟)</div>
            </div>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-card)] p-4 text-xs text-[var(--theme-text-muted)]">
          <strong className="text-[var(--theme-text-secondary)]">隐私声明:</strong>{' '}
          所有分析数据均存储在本地设备中，不会上传到任何外部服务器。你可以随时通过上方的清除按钮删除所有数据。
        </div>
      </div>
    </div>
  )
}
