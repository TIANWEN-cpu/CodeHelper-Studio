/**
 * WeeklyReport -- Weekly summary card with goals and improvement suggestions.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar,
  Target,
  TrendingUp,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Award,
  Code,
  Bot,
  BookOpen,
} from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import type { WeeklyReportData } from '../../types/analytics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Goal {
  id: string
  label: string
  target: number
  current: number
  unit: string
  icon: typeof Target
}

// ---------------------------------------------------------------------------
// Goal persistence
// ---------------------------------------------------------------------------

const GOALS_KEY = 'codehelper-weekly-goals'

function loadGoals(): Array<{ id: string; label: string; target: number }> {
  try {
    const raw = localStorage.getItem(GOALS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return [
    { id: 'problems', label: '每周解题', target: 10 },
    { id: 'coding_minutes', label: '每周编码时间(分钟)', target: 300 },
    { id: 'ai_chats', label: '每周 AI 对话', target: 5 },
  ]
}

function saveGoals(goals: Array<{ id: string; label: string; target: number }>) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals))
}

// ---------------------------------------------------------------------------
// Suggestions engine
// ---------------------------------------------------------------------------

function generateSuggestions(report: WeeklyReportData): string[] {
  const suggestions: string[] = []

  if (report.problemsSolved === 0) {
    suggestions.push('本周还没有解题记录，试试从简单题开始，每天完成 1-2 道。')
  } else if (report.problemsSolved < 5) {
    suggestions.push('解题数量还可以提升，尝试设置每天固定练习时间。')
  } else {
    suggestions.push('解题节奏很好！可以尝试挑战更高难度的题目。')
  }

  if (report.aiChatsSent === 0) {
    suggestions.push('本周未使用 AI 助手，遇到难题时不妨向 AI 请教。')
  } else if (report.aiChatsSent > 20) {
    suggestions.push('AI 对话很频繁，建议先独立思考再询问，培养自主解题能力。')
  }

  if (report.codeRuns === 0) {
    suggestions.push('本周没有运行代码记录，多动手实践能加深理解。')
  }

  if (report.lessonsCompleted === 0) {
    suggestions.push('可以抽时间完成一些知识库课程，系统化提升。')
  }

  if (report.topLanguages.length > 0) {
    const topLang = report.topLanguages[0].language
    suggestions.push('本周主要使用 ' + topLang + '，可以尝试用其他语言解决同一问题来拓宽视野。')
  }

  if (report.avgSessionDuration > 0 && report.avgSessionDuration < 60000) {
    suggestions.push('编码会话时间较短，建议尝试番茄工作法（25分钟专注编码）。')
  }

  return suggestions.slice(0, 4)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GoalProgress({ goal }: { goal: Goal }) {
  const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0
  const isComplete = goal.current >= goal.target

  return (
    <div className="flex items-center gap-3">
      <div
        className={
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' +
          (isComplete
            ? 'bg-[var(--theme-success)] text-white'
            : 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]')
        }
      >
        <goal.icon size={16} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--theme-text-secondary)]">{goal.label}</span>
          <span className="font-medium text-[var(--theme-text-primary)]">
            {goal.current}/{goal.target} {goal.unit}
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--theme-bg-hover)]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: pct + '%',
              backgroundColor: isComplete ? 'var(--theme-success)' : 'var(--theme-accent)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

function MetricBadge({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Target
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-[var(--theme-bg-hover)] p-3">
      <Icon size={18} style={{ color }} aria-hidden="true" />
      <span className="text-lg font-bold text-[var(--theme-text-primary)]">{value}</span>
      <span className="text-[10px] text-[var(--theme-text-muted)]">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeeklyReport() {
  const [report, setReport] = useState<WeeklyReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [editingGoals, setEditingGoals] = useState(false)
  const [goalDefs, setGoalDefs] = useState(loadGoals)

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const data = await typedInvoke('analytics-get-weekly-report', weekOffset)
      setReport(data)
    } catch (err) {
      console.error('[WeeklyReport] Failed to load report:', err)
    } finally {
      setLoading(false)
    }
  }, [weekOffset])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const goals: Goal[] = useMemo(() => {
    if (!report) return []
    return goalDefs.map((def) => {
      let current = 0
      let unit = ''
      let icon: typeof Target = Target

      switch (def.id) {
        case 'problems':
          current = report.problemsSolved
          unit = '题'
          icon = Target
          break
        case 'coding_minutes': {
          const estMinutes = report.codeRuns * 5
          current = estMinutes
          unit = '分钟'
          icon = Calendar
          break
        }
        case 'ai_chats':
          current = report.aiChatsSent
          unit = '次'
          icon = Bot
          break
        default:
          current = 0
          unit = ''
      }

      return { ...def, current, unit, icon }
    })
  }, [report, goalDefs])

  const suggestions = useMemo(() => {
    if (!report) return []
    return generateSuggestions(report)
  }, [report])

  const handleSaveGoals = useCallback(() => {
    saveGoals(goalDefs)
    setEditingGoals(false)
  }, [goalDefs])

  const weekLabel = useMemo(() => {
    if (!report) return ''
    return report.weekStart + ' ~ ' + report.weekEnd
  }, [report])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <div className="text-sm text-[var(--theme-text-muted)]">加载周报...</div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="py-12 text-center text-sm text-[var(--theme-text-muted)]">
        无法加载周报数据
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--theme-text-primary)]">
          <Calendar size={22} />
          周报
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            title="上一周"
            className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[200px] text-center text-sm text-[var(--theme-text-secondary)]">
            {weekLabel}
          </span>
          <button
            onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
            title="下一周"
            disabled={weekOffset >= 0}
            className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Weekly summary card */}
      <div className="ui-card p-6">
        <h3 className="mb-4 text-base font-semibold text-[var(--theme-text-primary)]">本周概览</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricBadge
            icon={Target}
            label="解题"
            value={report.problemsSolved}
            color="var(--theme-success)"
          />
          <MetricBadge
            icon={Code}
            label="代码运行"
            value={report.codeRuns}
            color="var(--theme-warning)"
          />
          <MetricBadge
            icon={Bot}
            label="AI 对话"
            value={report.aiChatsSent}
            color="var(--theme-accent)"
          />
          <MetricBadge
            icon={BookOpen}
            label="课程完成"
            value={report.lessonsCompleted}
            color="#8b5cf6"
          />
        </div>

        {report.dailyBreakdown.length > 0 && (
          <div className="mt-4">
            <div className="flex items-end gap-1" style={{ height: 60 }}>
              {report.dailyBreakdown.map((d) => {
                const max = Math.max(...report.dailyBreakdown.map((x) => x.count), 1)
                const h = (d.count / max) * 50 + 10
                return (
                  <div
                    key={d.date}
                    title={d.date + ': ' + d.count}
                    className="flex-1 rounded-t transition-all"
                    style={{
                      height: h,
                      backgroundColor: 'var(--theme-accent)',
                      opacity: 0.7,
                    }}
                  />
                )
              })}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-[var(--theme-text-muted)]">
              <span>周一</span>
              <span>周日</span>
            </div>
          </div>
        )}

        {report.topLanguages.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-medium text-[var(--theme-text-muted)]">常用语言</h4>
            <div className="flex flex-wrap gap-2">
              {report.topLanguages.map((lang) => (
                <span
                  key={lang.language}
                  className="rounded-full bg-[var(--theme-accent-soft)] px-2.5 py-0.5 text-xs text-[var(--theme-accent)]"
                >
                  {lang.language} ({lang.count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Goals progress */}
      <div className="ui-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
            <Award size={18} />
            目标进度
          </h3>
          {editingGoals ? (
            <button
              onClick={handleSaveGoals}
              className="rounded-lg bg-[var(--theme-accent)] px-3 py-1 text-xs text-[var(--theme-accent-contrast)] cursor-pointer"
            >
              保存
            </button>
          ) : (
            <button
              onClick={() => setEditingGoals(true)}
              className="text-xs text-[var(--theme-accent)] hover:underline cursor-pointer"
            >
              编辑目标
            </button>
          )}
        </div>

        {editingGoals ? (
          <div className="space-y-3">
            {goalDefs.map((g, i) => (
              <div key={g.id} className="flex items-center gap-3">
                <span className="w-28 text-sm text-[var(--theme-text-secondary)]">{g.label}</span>
                <input
                  type="number"
                  min={1}
                  value={g.target}
                  onChange={(e) => {
                    const newDefs = [...goalDefs]
                    newDefs[i] = { ...g, target: Math.max(1, Number(e.target.value) || 1) }
                    setGoalDefs(newDefs)
                  }}
                  className="w-20 rounded border border-[var(--theme-border)] bg-[var(--theme-bg-card)] px-2 py-1 text-sm text-[var(--theme-text-primary)]"
                />
                <span className="text-xs text-[var(--theme-text-muted)]">
                  {g.id === 'problems' ? '题' : g.id === 'coding_minutes' ? '分钟' : '次'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((goal) => (
              <GoalProgress key={goal.id} goal={goal} />
            ))}
          </div>
        )}
      </div>

      {/* Improvement suggestions */}
      <div className="ui-card p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--theme-text-primary)]">
          <Lightbulb size={18} />
          改进建议
        </h3>
        {suggestions.length > 0 ? (
          <ul className="space-y-3">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--theme-accent-soft)] text-[10px] font-bold text-[var(--theme-accent)]">
                  {i + 1}
                </div>
                <span className="text-sm text-[var(--theme-text-secondary)]">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-4 text-center text-sm text-[var(--theme-text-muted)]">
            暂无建议，继续保持！
          </div>
        )}
      </div>

      {/* Trend indicator */}
      {report.totalEvents > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-[var(--theme-accent-soft)] p-4 text-sm text-[var(--theme-accent)]">
          <TrendingUp size={16} />
          <span>
            本周共记录 <strong>{report.totalEvents}</strong> 次活动
          </span>
        </div>
      )}
    </div>
  )
}
