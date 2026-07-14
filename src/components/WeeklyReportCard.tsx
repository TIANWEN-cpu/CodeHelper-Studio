import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Loader2,
  Target,
  Play,
  Bot,
  BookOpen,
} from 'lucide-react'
import { getWeeklyReport, type WeeklyReport } from '@/services/analyticsService'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 把 YYYY-MM-DD 解析为 UTC 起点并加 n 天（与后端周报口径一致）。 */
function addUTCDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatRange(start: string, endWithTime: string): string {
  const end = endWithTime.slice(0, 10)
  return `${start.slice(5)} ~ ${end.slice(5)}`
}

const STAT_TILES: Array<{
  key: keyof Pick<WeeklyReport, 'problemsSolved' | 'codeRuns' | 'aiChatsSent' | 'lessonsCompleted'>
  label: string
  icon: typeof Target
  color: string
}> = [
  { key: 'problemsSolved', label: '解题', icon: Target, color: '#10B981' },
  { key: 'codeRuns', label: '运行代码', icon: Play, color: '#6366F1' },
  { key: 'aiChatsSent', label: 'AI 提问', icon: Bot, color: '#8B5CF6' },
  { key: 'lessonsCompleted', label: '完成课程', icon: BookOpen, color: '#F59E0B' },
]

/**
 * 学习周报卡片：接通后端 analytics-get-weekly-report（此前已实现但无 UI）。
 * 展示本周/历史周的解题、运行、AI 提问、课程统计 + 每日活跃柱状 + 常用语言。
 * 支持按周翻看；读失败或空数据时优雅降级。
 */
export function WeeklyReportCard() {
  const [offset, setOffset] = useState(0)
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (weekOffset: number) => {
    setLoading(true)
    const data = await getWeeklyReport(weekOffset)
    setReport(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load(offset)
  }, [offset, load])

  // 7 天活跃度：按 weekStart 推出周一~周日，再用 dailyBreakdown 填充计数。
  const days = (() => {
    if (!report) return []
    const counts = new Map(report.dailyBreakdown.map((d) => [d.date, d.count]))
    return Array.from({ length: 7 }, (_, i) => {
      const date = addUTCDays(report.weekStart, i)
      return { label: WEEKDAY_LABELS[i], date, count: counts.get(date) ?? 0 }
    })
  })()
  const maxDay = days.reduce((m, d) => Math.max(m, d.count), 0)
  const avgMinutes =
    report && report.avgSessionDuration > 0 ? Math.round(report.avgSessionDuration / 60000) : 0

  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-white text-[15px] flex items-center gap-2">
          <CalendarRange size={16} className="text-[var(--color-accent-purple)]" />
          学习周报
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
            {report ? formatRange(report.weekStart, report.weekEnd) : '—'}
          </span>
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-white transition-colors"
            aria-label="上一周"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="下一周"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[var(--color-accent-purple)]" />
        </div>
      ) : !report || report.totalEvents === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">
          这一周还没有学习记录。
        </p>
      ) : (
        <>
          {/* 统计磁贴 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STAT_TILES.map((tile) => {
              const Icon = tile.icon
              return (
                <div
                  key={tile.key}
                  className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-3"
                >
                  <Icon size={15} style={{ color: tile.color }} />
                  <p className="mt-2 text-xl font-semibold text-white tabular-nums">
                    {report[tile.key]}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{tile.label}</p>
                </div>
              )
            })}
          </div>

          {/* 每日活跃柱状 */}
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">每日活跃</p>
            <div className="flex items-end justify-between gap-1.5 h-24">
              {days.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{
                        height: maxDay > 0 ? `${Math.max(6, (d.count / maxDay) * 100)}%` : '6%',
                      }}
                      transition={{ duration: 0.3 }}
                      className="w-full rounded-t bg-[var(--color-accent-purple)]/70"
                      title={`${d.label}：${d.count}`}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 常用语言 + 平均时长 */}
          {(report.topLanguages.length > 0 || avgMinutes > 0) && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {report.topLanguages.slice(0, 5).map((l) => (
                <span
                  key={l.language}
                  className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]"
                >
                  {l.language} · {l.count}
                </span>
              ))}
              {avgMinutes > 0 && (
                <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
                  平均时长 {avgMinutes} 分钟
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
