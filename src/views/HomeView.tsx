import React, { useState, useRef, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts'
import {
  BookOpen,
  BrainCircuit,
  FileCode,
  FolderCode,
  RotateCcw,
  Sparkles,
  Flame,
  CheckCircle2,
  Circle,
  ChevronRight,
  MessageSquare,
  Rocket,
  Loader2,
  Route,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { useHomeData } from '../hooks/useHomeData'
import { useAppStore } from '../store'
import type { WeekStart } from '../store'
import { formatDate } from '../lib/locale'
import type { ViewType } from '../types'

const DAY_MAP = ['日', '一', '二', '三', '四', '五', '六']

/** 按本地时间返回问候语前缀。 */
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

// 学习热力图：约 90 天 ≈ 13 周。
const HEATMAP_WEEKS = 13

function dateKey(d: Date): string {
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${d.getFullYear()}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`
}

type HeatCell = { key: string; date: Date; count: number; future: boolean }

/**
 * 把稀疏的 dailyCounts 零填充并按"周"切成列；每列 7 天按 weekStart 排序，
 * 最右列含今天，今天之后的日期标记 future（渲染为占位空格）。
 * 这样 weekStart（周一/周日）真实决定网格首行与对齐方式。
 */
function buildHeatmapWeeks(
  heatmapData: { date: string; count: number }[],
  weekStart: WeekStart,
): HeatCell[][] {
  const counts = new Map(heatmapData.map((d) => [d.date, d.count]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = today.getDay() // 0=周日..6=周六
  const offsetInWeek = weekStart === 'mon' ? (dow + 6) % 7 : dow
  const start = new Date(today)
  start.setDate(start.getDate() - offsetInWeek - (HEATMAP_WEEKS - 1) * 7)

  const cols: HeatCell[][] = []
  for (let c = 0; c < HEATMAP_WEEKS; c++) {
    const col: HeatCell[] = []
    for (let r = 0; r < 7; r++) {
      const d = new Date(start)
      d.setDate(start.getDate() + c * 7 + r)
      const key = dateKey(d)
      col.push({
        key,
        date: d,
        count: counts.get(key) ?? 0,
        future: d.getTime() > today.getTime(),
      })
    }
    cols.push(col)
  }
  return cols
}

/** 根据当日次数与最大值映射到绿色梯度。 */
function heatColor(count: number, max: number): string {
  if (count <= 0) return 'bg-[#2A2F45]'
  const ratio = max > 0 ? count / max : 0
  if (ratio > 0.66) return 'bg-[#10B981]'
  if (ratio > 0.33) return 'bg-[#10B981]/70'
  return 'bg-[#10B981]/40'
}

/** 行索引 → 星期标签（按 weekStart）。 */
function weekdayLabel(rowIndex: number, weekStart: WeekStart): string {
  const dayIdx = weekStart === 'mon' ? (rowIndex + 1) % 7 : rowIndex
  return DAY_MAP[dayIdx]
}

// 活动映射按真实埋点事件类型键控（problem_solved/lesson_completed/code_run/ai_chat_sent）。
const ACTIVITY_ICON_MAP: Record<string, typeof BookOpen> = {
  problem_solved: FileCode,
  lesson_completed: BookOpen,
  code_run: FolderCode,
  ai_chat_sent: Sparkles,
}

const ACTIVITY_ICON_COLOR: Record<string, string> = {
  problem_solved: 'text-[#10B981]',
  lesson_completed: 'text-[var(--color-accent-purple)]',
  code_run: 'text-[#3B82F6]',
  ai_chat_sent: 'text-[#F59E0B]',
}

const ACTIVITY_ICON_BG: Record<string, string> = {
  problem_solved: 'bg-[#10B981]/10',
  lesson_completed: 'bg-[var(--color-accent-purple)]/10',
  code_run: 'bg-[#3B82F6]/10',
  ai_chat_sent: 'bg-[#F59E0B]/10',
}

const ACTIVITY_STATUS: Record<string, { label: string; bg: string }> = {
  problem_solved: { label: '解答通过', bg: 'bg-[#10B981]/20 text-[#10B981]' },
  lesson_completed: {
    label: '课程',
    bg: 'bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)]',
  },
  code_run: { label: '运行', bg: 'bg-[#3B82F6]/20 text-[#3B82F6]' },
  ai_chat_sent: { label: 'AI', bg: 'bg-[#F59E0B]/20 text-[#F59E0B]' },
}

// 活动项点击跳转的目标视图。
const ACTIVITY_VIEW: Record<string, ViewType> = {
  problem_solved: 'practice',
  lesson_completed: 'learn',
  code_run: 'workspace',
  ai_chat_sent: 'home',
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

const REVIEW_PRIORITY: Record<string, { label: string; bar: string }> = {
  high: { label: '高优先级', bar: 'bg-[#EF4444]' },
  medium: { label: '中优先级', bar: 'bg-[#F59E0B]' },
  low: { label: '低优先级', bar: 'bg-[#10B981]' },
}

/** 把 SM-2 的 next_review 时间转成到期描述（过去=已到期，未来=N 天后）。 */
function formatDue(due: string): string {
  const d = new Date(due)
  if (isNaN(d.getTime())) return '待复习'
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return '已到期'
  const days = Math.ceil(diff / 86400000)
  return days <= 1 ? '今天到期' : `${days} 天后`
}

type LearningPathStep = {
  title: string
  subtitle: string
  view: ViewType
  icon: typeof BookOpen
  done: boolean
  tone: string
}

/** 能力成长面积图：先用 ResizeObserver 测得容器宽度，再以固定像素尺寸渲染。
 *  仅在测得宽度 > 0 时才挂载 AreaChart，从根本上规避 ResponsiveContainer 在
 *  flex 布局下首帧 width(-1) 既刷警告又导致图表整块不渲染的问题。 */
function GrowthChart({ data }: { data: { day: string; score: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const height = 160

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="w-full -ml-4 -mr-4" style={{ height }}>
      {width > 0 && (
        <AreaChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent-primary)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-accent-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            dy={5}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
          />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: 'var(--color-bg-panel)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
            }}
            itemStyle={{ color: 'var(--color-accent-primary)' }}
            cursor={{
              stroke: 'var(--color-border-subtle)',
              strokeWidth: 1,
              strokeDasharray: '4 4',
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="var(--color-accent-primary)"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorScore)"
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </AreaChart>
      )}
    </div>
  )
}

export function HomeView() {
  const {
    weeklyStats,
    streak,
    dailyTasks,
    recentActivity,
    reviewReminders,
    heatmapData,
    overview,
    loading,
    error,
  } = useHomeData()
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const dateRegion = useAppStore((s) => s.dateRegion)
  const weekStart = useAppStore((s) => s.weekStart)
  const [activityFilter, setActivityFilter] = useState<'all' | 'lesson' | 'problem'>('all')
  const maxHeatmapCount = heatmapData.reduce((max, item) => Math.max(max, item.count), 0)
  const heatmapWeeks = buildHeatmapWeeks(heatmapData, weekStart)

  // 能力成长图表数据：无周统计时用最近 7 天 0 分占位，保证坐标轴与基线可见，避免整块空白。
  const chartData =
    weeklyStats.length > 0
      ? weeklyStats.map((s) => ({ day: DAY_MAP[new Date(s.date).getDay()], score: s.score }))
      : Array.from({ length: 7 }).map((_, i) => ({ day: DAY_MAP[i], score: 0 }))

  const filteredActivity = recentActivity.filter((item) => {
    if (activityFilter === 'all') return true
    return item.type.startsWith(activityFilter)
  })

  const todayKey = dateKey(new Date())
  const todayActivities = recentActivity.filter((item) => {
    const d = new Date(item.timestamp)
    return !isNaN(d.getTime()) && dateKey(d) === todayKey
  })
  const hasTodayLesson = todayActivities.some((item) => item.type === 'lesson_completed')
  const hasTodayPractice = todayActivities.some((item) => item.type === 'problem_solved')
  const hasTodayAi = todayActivities.some((item) => item.type === 'ai_chat_sent')
  const unfinishedTasks = dailyTasks.filter((task) => !task.done)
  const remainingProblems = overview
    ? Math.max(0, overview.totalProblems - overview.solvedProblems)
    : 0
  const nextActionView: ViewType =
    reviewReminders.length > 0 ? 'review' : overview?.suggestedLesson ? 'learn' : 'practice'
  const nextActionLabel =
    reviewReminders.length > 0
      ? '开始复习错题'
      : overview?.suggestedLesson
        ? '继续学习'
        : '去做练习'
  const nextActionTitle =
    reviewReminders.length > 0
      ? `先复习 ${reviewReminders.length} 道错题`
      : overview?.suggestedLesson
        ? `继续学习《${overview.suggestedLesson.title}》`
        : '从一道练习开始热身'
  const nextActionSubtitle =
    reviewReminders.length > 0
      ? '先处理到期复习，再进入新课和练习，记忆负担会轻很多。'
      : overview?.suggestedLesson
        ? overview.suggestedLesson.moduleTitle
        : '还没有明确的下一课时，先用题目把状态启动起来。'

  const learningPath: LearningPathStep[] = [
    {
      title: '复习错题',
      subtitle:
        reviewReminders.length > 0
          ? `${reviewReminders.length} 道待复习，优先清掉薄弱点`
          : '暂无到期错题，保持节奏',
      view: 'review',
      icon: RotateCcw,
      done: reviewReminders.length === 0,
      tone: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20',
    },
    {
      title: '学新课',
      subtitle: overview?.suggestedLesson
        ? `继续《${overview.suggestedLesson.title}》`
        : '打开课程目录选择下一课',
      view: 'learn',
      icon: BookOpen,
      done:
        hasTodayLesson ||
        Boolean(
          overview &&
          overview.totalLessons > 0 &&
          overview.completedLessons >= overview.totalLessons,
        ),
      tone: 'text-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 border-[var(--color-accent-purple)]/20',
    },
    {
      title: '做练习',
      subtitle:
        remainingProblems > 0
          ? `还有 ${remainingProblems} 道题可练，今天先做 1 道`
          : '题库已完成，去工作区巩固',
      view: 'practice',
      icon: FileCode,
      done: hasTodayPractice,
      tone: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20',
    },
    {
      title: '总结知识点',
      subtitle: hasTodayAi ? '已经和 AI 互动过，补一条笔记更稳' : '让 AI 总结今天的概念和错误',
      view: 'knowledge',
      icon: BrainCircuit,
      done: hasTodayAi,
      tone: 'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20',
    },
  ]

  const weakSignals = [
    reviewReminders.length > 0
      ? `${reviewReminders.length} 道错题已经进入复习窗口，建议先复盘错误原因。`
      : null,
    reviewReminders.some((item) => item.priority === 'high')
      ? '存在高优先级错题，说明近期记忆稳定性偏弱。'
      : null,
    unfinishedTasks.length > 0 ? `${unfinishedTasks.length} 个今日任务还没完成。` : null,
    overview &&
    overview.totalProblems > 0 &&
    overview.solvedProblems / overview.totalProblems < 0.25
      ? '练习推进偏少，建议用 1 道简单题启动手感。'
      : null,
    todayActivities.length === 0 ? '今天还没有学习记录，可以先从 15 分钟任务开始。' : null,
  ].filter((item): item is string => Boolean(item))

  const aiAdvice =
    weakSignals[0] ??
    (overview?.suggestedLesson
      ? `下一步最适合继续 ${overview.suggestedLesson.moduleTitle}，完成后做一道关联练习。`
      : '今天状态不错，可以把刚学的内容沉淀成一张知识卡片。')

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-y-auto">
        <div className="max-w-[1200px] w-full mx-auto p-6 lg:p-8 space-y-6">
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[var(--color-accent-primary)]" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-y-auto">
        <div className="max-w-[1200px] w-full mx-auto p-6 lg:p-8 space-y-6">
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-full bg-[#EF4444]/10 flex items-center justify-center">
              <span className="text-2xl">!</span>
            </div>
            <p className="text-[var(--color-text-secondary)] text-sm">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-y-auto">
      <div className="max-w-[1200px] w-full mx-auto p-6 lg:p-8 space-y-6">
        {/* Greeting Section */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              {getGreeting()}，{overview?.greetingName || '同学'} 👋
            </h1>
            <p className="text-[var(--color-text-muted)] mt-1.5 flex items-center gap-2 text-sm">
              <span>保持专注，今天又是进步的一天！</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
          {/* Main Hero Card (Large) */}
          <div className="lg:col-span-2 xl:col-span-2 min-h-[320px] bg-gradient-to-br from-[#141A2D] via-[#151923] to-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-primary)]/40 p-6 relative overflow-hidden shadow-sm hover:shadow-[0_8px_30px_rgba(99,102,241,0.15)] transition-all group">
            <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(135deg,transparent_0,transparent_24px,rgba(255,255,255,0.8)_25px,transparent_26px)] bg-[length:36px_36px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] text-xs font-medium mb-3 border border-[#F59E0B]/20">
                    <Target size={12} />
                    <span>今日优先行动</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
                    {nextActionTitle}
                  </h2>
                  <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed max-w-xl">
                    {nextActionSubtitle}
                  </p>
                </div>
                <div className="hidden sm:flex w-16 h-16 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]/70 items-center justify-center shrink-0">
                  <Route
                    size={34}
                    className="text-[var(--color-accent-purple)] drop-shadow-[0_0_14px_rgba(139,92,246,0.35)]"
                    strokeWidth={1.5}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                {learningPath.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <button
                      key={step.title}
                      onClick={() => setCurrentView(step.view)}
                      className="flex items-center gap-3 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]/70 p-3 text-left hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] transition-colors group/step"
                    >
                      <div
                        className={cn(
                          'w-9 h-9 rounded-lg border flex items-center justify-center shrink-0',
                          step.tone,
                        )}
                      >
                        <Icon size={17} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
                            {index + 1}
                          </span>
                          <span className="text-sm font-semibold text-white truncate">
                            {step.title}
                          </span>
                          {step.done && <CheckCircle2 size={13} className="text-[#10B981]" />}
                        </div>
                        <p className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
                          {step.subtitle}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-between mt-auto pt-6">
                <button
                  onClick={() => setCurrentView(nextActionView)}
                  className="relative overflow-hidden bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] hover:from-[#4F46E5] hover:to-[#7C3AED] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md flex items-center gap-2 hover:gap-3 group/btn hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:scale-105 active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer z-0 pointer-events-none"></div>
                  <span className="relative z-10">{nextActionLabel}</span>
                  <ChevronRight
                    size={16}
                    className="relative z-10 text-white/70 group-hover/btn:text-white transition-colors"
                  />
                </button>

                <span className="text-xs text-[var(--color-text-muted)]">
                  {todayActivities.length > 0
                    ? `今天已有 ${todayActivities.length} 条学习记录`
                    : '建议先完成一个 15 分钟学习单元'}
                </span>
              </div>
            </div>
          </div>

          {/* Progress Card */}
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border-subtle)] p-6 flex flex-col min-h-[320px] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-[15px] flex items-center gap-2">
                能力成长轨迹
                {overview && (
                  <span className="text-[10px] font-semibold text-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 px-1.5 py-0.5 rounded-md border border-[var(--color-accent-purple)]/20">
                    Lv.{overview.level}
                  </span>
                )}
              </h3>
              <span className="text-xs font-semibold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Flame size={12} />
                {Math.max(0, streak)} 天连续学习
              </span>
            </div>

            <div className="flex-1 flex items-center">
              <GrowthChart data={chartData} />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <BookOpen size={12} className="text-[var(--color-accent-primary)]" />
                  <span className="text-xs text-[var(--color-text-secondary)]">已完成课程</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {overview ? `${overview.completedLessons} / ${overview.totalLessons}` : '-- / --'}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 size={12} className="text-[#10B981]" />
                  <span className="text-xs text-[var(--color-text-secondary)]">已解决题目</span>
                </div>
                <span className="text-sm font-semibold text-white">
                  {overview ? `${overview.solvedProblems} / ${overview.totalProblems}` : '-- / --'}
                </span>
              </div>
            </div>
          </div>

          {/* AI Suggestion / Goals */}
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border-subtle)] p-6 min-h-[320px] shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-[15px] flex items-center gap-2">
                <Sparkles size={15} className="text-[var(--color-accent-purple)]" />
                AI 今日建议
              </h3>
              <span className="text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] rounded-md px-1.5 py-0.5">
                进度驱动
              </span>
            </div>

            <div className="rounded-xl border border-[var(--color-accent-purple)]/20 bg-[var(--color-accent-purple)]/10 p-3 mb-4">
              <p className="text-sm text-white leading-relaxed">{aiAdvice}</p>
            </div>

            <div className="mb-4">
              <div className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2 flex items-center gap-1.5">
                <BrainCircuit size={13} className="text-[#3B82F6]" />
                学习状态判断
              </div>
              <div className="space-y-2">
                {weakSignals.length === 0 ? (
                  <div className="flex items-start gap-2 text-xs text-[var(--color-text-muted)] leading-relaxed">
                    <CheckCircle2 size={14} className="text-[#10B981] mt-0.5 shrink-0" />
                    当前没有明显阻塞点，可以继续推进新课并做一次总结。
                  </div>
                ) : (
                  weakSignals.slice(0, 3).map((signal) => (
                    <div
                      key={signal}
                      className="flex items-start gap-2 text-xs text-[var(--color-text-muted)] leading-relaxed"
                    >
                      <Circle size={12} className="text-[#F59E0B] mt-0.5 shrink-0" />
                      <span>{signal}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-auto border-t border-[var(--color-border-subtle)] pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  今日任务
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {Math.max(0, dailyTasks.length - unfinishedTasks.length)}/{dailyTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {dailyTasks.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">暂无任务</p>
                ) : (
                  dailyTasks.slice(0, 3).map((task) => (
                    <div key={task.id} className="flex items-center gap-2">
                      <div
                        className={task.done ? 'text-[#10B981]' : 'text-[var(--color-text-muted)]'}
                      >
                        {task.done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                      </div>
                      <span
                        className={cn(
                          'flex-1 truncate text-xs',
                          task.done ? 'text-white' : 'text-[var(--color-text-secondary)]',
                        )}
                      >
                        {task.title}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => setCurrentView(nextActionView)}
                className="w-full mt-4 text-xs text-[var(--color-accent-primary)] hover:text-[#4F46E5] font-medium transition-colors text-left flex items-center gap-1"
              >
                执行建议动作 <ChevronRight size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(
            [
              {
                title: '继续课程',
                subtitle: '从上次位置继续',
                icon: BookOpen,
                color: 'from-[var(--color-accent-primary)] to-[var(--color-accent-purple)]',
                textColor: 'text-white',
                bg: 'bg-gradient-to-br',
                view: 'learn',
              },
              {
                title: '继续刷题',
                subtitle: '从未完成题目',
                icon: FileCode,
                color: 'from-[#10B981] to-[#059669]',
                textColor: 'text-white',
                bg: 'bg-gradient-to-br',
                view: 'practice',
              },
              {
                title: '打开工作区',
                subtitle: '编写代码',
                icon: FolderCode,
                color: 'from-[#3B82F6] to-[#2563EB]',
                textColor: 'text-white',
                bg: 'bg-gradient-to-br',
                view: 'workspace',
              },
              {
                title: '错题本',
                subtitle: '复习薄弱点',
                icon: RotateCcw,
                color: 'from-[#F59E0B] to-[#D97706]',
                textColor: 'text-white',
                bg: 'bg-gradient-to-br',
                view: 'review',
              },
            ] as const
          ).map((item, i) => (
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              key={i}
              onClick={() => setCurrentView(item.view)}
              className={cn(
                'relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] p-5 text-left group shadow-sm hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-shadow',
                item.bg,
                item.color,
              )}
            >
              <div className="absolute right-0 bottom-0 opacity-10 group-hover:opacity-20 transition-opacity transform translate-x-1/4 translate-y-1/4">
                <item.icon size={80} />
              </div>
              <div
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-white/20 backdrop-blur-md border border-white/10 group-hover:bg-white/30 transition-colors',
                  item.textColor,
                )}
              >
                <item.icon size={20} />
              </div>
              <h3 className={cn('font-bold text-base mb-1', item.textColor)}>{item.title}</h3>
              <p className={cn('text-xs opacity-80', item.textColor)}>{item.subtitle}</p>
            </motion.button>
          ))}
        </div>

        {/* Lower Section: Recent & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-white text-[15px]">最近活动</h3>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <button
                    onClick={() => setActivityFilter('all')}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors',
                      activityFilter === 'all'
                        ? 'bg-[var(--color-bg-hover)] text-white'
                        : 'text-[var(--color-text-secondary)] hover:text-white',
                    )}
                  >
                    全部
                  </button>
                  <button
                    onClick={() => setActivityFilter('lesson')}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors',
                      activityFilter === 'lesson'
                        ? 'bg-[var(--color-bg-hover)] text-white'
                        : 'text-[var(--color-text-secondary)] hover:text-white',
                    )}
                  >
                    课程
                  </button>
                  <button
                    onClick={() => setActivityFilter('problem')}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors',
                      activityFilter === 'problem'
                        ? 'bg-[var(--color-bg-hover)] text-white'
                        : 'text-[var(--color-text-secondary)] hover:text-white',
                    )}
                  >
                    题目
                  </button>
                </div>
              </div>
            </div>

            {recentActivity.length === 0 ? (
              <div className="space-y-4 relative w-full flex flex-col items-center justify-center py-10 min-h-[300px]">
                <div className="relative w-40 h-40 mb-2 opacity-80">
                  <div className="absolute inset-0 bg-[var(--color-accent-primary)]/10 rounded-full blur-3xl animate-pulse"></div>
                  <div className="relative w-full h-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-full flex flex-col items-center justify-center shadow-inner overflow-hidden top-0 hover:-translate-y-2 transition-transform duration-500">
                    <Rocket
                      size={48}
                      className="text-[var(--color-accent-primary)] opacity-70 mb-2 transition-transform duration-700 ease-in-out hover:-translate-y-4 hover:translate-x-4"
                    />
                  </div>
                </div>
                <h4 className="text-base font-semibold text-white">今天还没有学习记录</h4>
                <p className="text-[13px] text-[var(--color-text-muted)] max-w-xs text-center leading-relaxed mt-1 mb-2">
                  休整之后，开启新的编程探索之旅吧！你的每一次提交都值得记录。
                </p>
                <button
                  onClick={() => setCurrentView('learn')}
                  className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-white to-gray-200 text-black font-semibold hover:opacity-90 active:scale-95 transition-all text-sm flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.15)] group focus-visible:ring-offset-2 focus-visible:ring-white"
                >
                  <Sparkles size={16} className="text-[var(--color-accent-purple)]" />
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-black to-gray-800">
                    开启新的一天
                  </span>
                </button>
              </div>
            ) : filteredActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 min-h-[200px]">
                <p className="text-sm text-[var(--color-text-muted)]">该分类下暂无记录</p>
              </div>
            ) : (
              <div className="space-y-4 relative">
                <div className="absolute left-[2.25rem] top-6 bottom-6 w-px bg-gradient-to-b from-transparent via-[var(--color-border-subtle)] to-transparent hidden md:block z-0 pointer-events-none"></div>

                {filteredActivity.map((item) => {
                  const Icon = ACTIVITY_ICON_MAP[item.type] || MessageSquare
                  const iconColor =
                    ACTIVITY_ICON_COLOR[item.type] || 'text-[var(--color-text-secondary)]'
                  const iconBg = ACTIVITY_ICON_BG[item.type] || 'bg-[var(--color-bg-hover)]'
                  const status = ACTIVITY_STATUS[item.type] || {
                    label: item.type,
                    bg: 'bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]',
                  }
                  const timeAgo = getTimeAgo(item.timestamp)
                  const activityView: ViewType = ACTIVITY_VIEW[item.type] ?? 'home'
                  return (
                    <div
                      key={item.id}
                      onClick={() => setCurrentView(activityView)}
                      className="flex items-center gap-4 p-3 rounded-2xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)] transition-all cursor-pointer group relative z-10"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"></div>
                      <div
                        className={cn(
                          'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 shadow-sm',
                          iconBg,
                        )}
                      >
                        <Icon size={20} className={iconColor} />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-[14px] font-semibold text-white truncate group-hover:text-[var(--color-accent-primary)] transition-colors">
                            {item.description.split(':')[0] || item.description}
                          </h4>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                              status.bg,
                            )}
                          >
                            {status.label}
                          </span>
                        </div>
                        {item.description.includes(':') && (
                          <p className="text-[12px] text-[var(--color-text-muted)] truncate">
                            {item.description.split(':').slice(1).join(':').trim()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[11px] font-medium text-[var(--color-text-secondary)] whitespace-nowrap group-hover:text-white transition-colors">
                          {timeAgo}
                        </span>
                        <button
                          onClick={() => setCurrentView(activityView)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-purple)] font-medium flex items-center gap-1"
                        >
                          查看 <ChevronRight size={10} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Heatmap & Review Reminders */}
          <div className="space-y-6">
            {/* Review Reminders */}
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold text-white text-[15px] mb-4 flex items-center justify-between">
                错题复习提醒{' '}
                <span className="text-xs font-normal text-[var(--color-text-muted)]">
                  {reviewReminders.length} 道待复习
                </span>
              </h3>
              {reviewReminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <div className="w-24 h-24 mb-4 relative opacity-80">
                    <div className="absolute inset-0 bg-[var(--color-accent-primary)]/20 rounded-full blur-xl animate-pulse"></div>
                    <div className="relative w-full h-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-full flex items-center justify-center shadow-inner">
                      <Sparkles
                        size={32}
                        className="text-[var(--color-accent-primary)] opacity-80"
                      />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-white mb-1">暂无待复习错题</p>
                  <p className="text-[12px] text-[var(--color-text-muted)] text-center max-w-[200px]">
                    继续保持良好的学习状态，遇到难题随时记录。
                  </p>
                  <button
                    onClick={() => setCurrentView('practice')}
                    className="mt-4 px-4 py-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] hover:bg-[var(--color-bg-hover)] text-xs text-[var(--color-text-primary)] font-medium transition-colors cursor-pointer group"
                  >
                    <span className="group-hover:text-[var(--color-accent-primary)] transition-colors">
                      去刷几道新题
                    </span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {reviewReminders.slice(0, 5).map((item) => {
                    const pr = REVIEW_PRIORITY[item.priority] || REVIEW_PRIORITY.low
                    return (
                      <button
                        key={item.id}
                        onClick={() => setCurrentView('review')}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] transition-all text-left group"
                      >
                        <span className={cn('w-1.5 h-8 rounded-full shrink-0', pr.bar)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate group-hover:text-[var(--color-accent-primary)] transition-colors">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {pr.label}
                            {item.dueDate ? ` · ${formatDue(item.dueDate)}` : ''}
                          </p>
                        </div>
                        <ChevronRight
                          size={14}
                          className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent-primary)] transition-colors shrink-0"
                        />
                      </button>
                    )
                  })}
                  {reviewReminders.length > 5 && (
                    <button
                      onClick={() => setCurrentView('review')}
                      className="w-full text-xs text-[var(--color-accent-primary)] hover:text-[#4F46E5] font-medium transition-colors py-1 flex items-center justify-center gap-1"
                    >
                      查看全部 {reviewReminders.length} 道 <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 学习热力图：真实日期零填充 + 按星期对齐（首行由"每周起始日"决定） */}
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-[15px]">学习热力图</h3>
                <span className="text-xs text-[var(--color-text-muted)]">
                  最近 {HEATMAP_WEEKS} 周
                </span>
              </div>
              <div className="flex gap-1 overflow-x-auto hide-scrollbar">
                {/* 星期标签列 */}
                <div className="flex flex-col gap-1 pr-1 shrink-0">
                  {Array.from({ length: 7 }).map((_, r) => (
                    <div
                      key={r}
                      className="h-2.5 text-[9px] leading-[10px] text-[var(--color-text-muted)] flex items-center"
                    >
                      {weekdayLabel(r, weekStart)}
                    </div>
                  ))}
                </div>
                {/* 周列 */}
                {heatmapWeeks.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-1 shrink-0">
                    {col.map((cell) =>
                      cell.future ? (
                        <div key={cell.key} className="w-2.5 h-2.5 rounded-[2px] bg-transparent" />
                      ) : (
                        <div
                          key={cell.key}
                          className={cn(
                            'w-2.5 h-2.5 rounded-[2px] relative group cursor-pointer hover:ring-2 hover:ring-white/50 transition-all',
                            heatColor(cell.count, maxHeatmapCount),
                          )}
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-[var(--color-bg-panel)] text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 flex flex-col items-center border border-[var(--color-border-subtle)]">
                            <span className="font-semibold text-white/90">
                              {cell.count === 0 ? '未学习' : `学习了 ${cell.count} 次`}
                            </span>
                            <span className="text-[var(--color-text-muted)] mt-0.5">
                              {formatDate(cell.date, dateRegion, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 text-xs">
                <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                  <Flame size={14} className="text-[#F59E0B]" /> 持续学习很棒！
                </span>
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                  少
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#2A2F45]" />
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]/40" />
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]/70" />
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]" />多
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
