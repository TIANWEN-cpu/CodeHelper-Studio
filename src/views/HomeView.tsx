import React, { useState, useRef, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts'
import {
  BookOpen,
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { useHomeData } from '../hooks/useHomeData'
import { useAppStore } from '../store'
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

function getHeatmapCell(
  index: number,
  heatmapData: { date: string; count: number }[],
  maxCount: number,
) {
  if (index < heatmapData.length) {
    const item = heatmapData[index]
    const ratio = maxCount > 0 ? item.count / maxCount : 0
    let bgClass = 'bg-[#2A2F45]'
    if (item.count > 0) {
      if (ratio > 0.66) bgClass = 'bg-[#10B981]'
      else if (ratio > 0.33) bgClass = 'bg-[#10B981]/70'
      else bgClass = 'bg-[#10B981]/40'
    }
    const date = new Date(item.date)
    const dateString = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    return {
      bgClass,
      label: item.count === 0 ? '未学习' : `学习了 ${item.count} 次`,
      dateString,
      hasTooltip: true,
    }
  }
  return { bgClass: 'bg-[var(--color-bg-base)]', label: '', dateString: '', hasTooltip: false }
}

const ACTIVITY_ICON_MAP: Record<string, typeof BookOpen> = {
  lesson: BookOpen,
  problem: FileCode,
  review: RotateCcw,
  workspace: FolderCode,
}

const ACTIVITY_ICON_COLOR: Record<string, string> = {
  lesson: 'text-[var(--color-accent-purple)]',
  problem: 'text-[#10B981]',
  review: 'text-[#F59E0B]',
  workspace: 'text-[#3B82F6]',
}

const ACTIVITY_ICON_BG: Record<string, string> = {
  lesson: 'bg-[var(--color-accent-purple)]/10',
  problem: 'bg-[#10B981]/10',
  review: 'bg-[#F59E0B]/10',
  workspace: 'bg-[#3B82F6]/10',
}

const ACTIVITY_STATUS: Record<string, { label: string; bg: string }> = {
  lesson: {
    label: '课程',
    bg: 'bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)]',
  },
  problem_success: { label: '解答成功', bg: 'bg-[#10B981]/20 text-[#10B981]' },
  problem_fail: { label: '解答失败', bg: 'bg-[#EF4444]/20 text-[#EF4444]' },
  review: { label: '复习', bg: 'bg-[#F59E0B]/20 text-[#F59E0B]' },
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
  const [activityFilter, setActivityFilter] = useState<'all' | 'lesson' | 'problem'>('all')
  const maxHeatmapCount = heatmapData.reduce((max, item) => Math.max(max, item.count), 0)

  // 能力成长图表数据：无周统计时用最近 7 天 0 分占位，保证坐标轴与基线可见，避免整块空白。
  const chartData =
    weeklyStats.length > 0
      ? weeklyStats.map((s) => ({ day: DAY_MAP[new Date(s.date).getDay()], score: s.score }))
      : Array.from({ length: 7 }).map((_, i) => ({ day: DAY_MAP[i], score: 0 }))

  const filteredActivity = recentActivity.filter((item) => {
    if (activityFilter === 'all') return true
    return item.type.startsWith(activityFilter)
  })

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
          <div className="lg:col-span-2 xl:col-span-2 min-h-[320px] bg-gradient-to-br from-[#1E243A] to-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-primary)]/40 p-6 relative overflow-hidden shadow-sm hover:shadow-[0_8px_30px_rgba(99,102,241,0.15)] transition-all group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-accent-primary)] rounded-full blur-[100px] opacity-20 group-hover:opacity-30 transition-opacity duration-700 -translate-y-1/2 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-[var(--color-accent-purple)] rounded-full blur-[80px] opacity-10 group-hover:opacity-20 transition-opacity duration-700 translate-y-1/3 -translate-x-1/4"></div>

            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] text-xs font-medium mb-3 border border-[#F59E0B]/20">
                  <Sparkles size={12} />
                  <span>今日建议</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2 tracking-tight group-hover:translate-x-1 transition-transform duration-300">
                  {overview?.suggestedLesson
                    ? `继续学习《${overview.suggestedLesson.title}》`
                    : '开始你的第一课'}
                </h2>
                <p className="text-[var(--color-text-secondary)] text-sm mb-6 flex items-center gap-2 group-hover:translate-x-1 transition-transform duration-300 delay-75">
                  <span>
                    {overview?.suggestedLesson
                      ? overview.suggestedLesson.moduleTitle
                      : '选择一门课程，踏上你的编程之旅'}
                  </span>
                </p>
              </div>

              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setCurrentView('learn')}
                  className="relative overflow-hidden bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] hover:from-[#4F46E5] hover:to-[#7C3AED] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md flex items-center gap-2 hover:gap-3 group/btn hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:scale-105 active:scale-95"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-shimmer z-0 pointer-events-none"></div>
                  <span className="relative z-10">继续学习</span>
                  <ChevronRight
                    size={16}
                    className="relative z-10 text-white/70 group-hover/btn:text-white transition-colors"
                  />
                </button>

                <div className="hidden sm:block transform group-hover:scale-110 group-hover:-translate-y-2 group-hover:rotate-12 transition-all duration-700 ease-out">
                  <Rocket
                    size={64}
                    className="text-[var(--color-accent-purple)]/50 drop-shadow-[0_0_15px_rgba(139,92,246,0.3)] animate-pulse"
                    strokeWidth={1}
                  />
                </div>
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
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border-subtle)] p-6 min-h-[320px] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-[15px]">今日任务</h3>
            </div>

            <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2 -mr-2">
              {dailyTasks.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)] py-2">暂无任务</p>
              )}
              {dailyTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3">
                  <div className={task.done ? 'text-[#10B981]' : 'text-[var(--color-text-muted)]'}>
                    {task.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </div>
                  <div
                    className={cn(
                      'flex-1 text-sm',
                      task.done ? 'text-white' : 'text-[var(--color-text-secondary)]',
                    )}
                  >
                    {task.title}
                  </div>
                  <div className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-base)] px-2 py-0.5 rounded border border-[var(--color-border-subtle)]">
                    {task.done ? '1/1' : '0/1'}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setCurrentView('learn')}
              className="w-full mt-5 text-xs text-[var(--color-accent-primary)] hover:text-[#4F46E5] font-medium transition-colors text-left flex items-center gap-1"
            >
              查看全部任务 <ChevronRight size={12} />
            </button>
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
                  const activityView: ViewType = item.type.startsWith('problem')
                    ? 'practice'
                    : item.type.startsWith('review')
                      ? 'review'
                      : item.type.startsWith('workspace')
                        ? 'workspace'
                        : 'learn'
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
                        <p className="text-[12px] text-[var(--color-text-muted)] truncate">
                          {item.description.includes(':')
                            ? item.description.split(':').slice(1).join(':').trim()
                            : item.description}
                        </p>
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
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-24 h-24 mb-4 relative opacity-80">
                  <div className="absolute inset-0 bg-[var(--color-accent-primary)]/20 rounded-full blur-xl animate-pulse"></div>
                  <div className="relative w-full h-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-full flex items-center justify-center shadow-inner">
                    <Sparkles size={32} className="text-[var(--color-accent-primary)] opacity-80" />
                  </div>
                </div>
                <p className="text-sm font-medium text-white mb-1">今天还没有错题</p>
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
            </div>

            {/* Heatmap (Simplified visualization) */}
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold text-white text-[15px] mb-4">学习热力图</h3>
              <div className="grid grid-cols-12 gap-1.5 opacity-80 pl-2">
                {Array.from({ length: 48 }).map((_, i) => {
                  const cell = getHeatmapCell(i, heatmapData, maxHeatmapCount)
                  return (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3, delay: i * 0.015 }}
                      key={i}
                      className={cn(
                        'w-full pt-[100%] rounded-[3px] relative group cursor-pointer hover:ring-2 hover:ring-white/50 transition-all',
                        cell.bgClass,
                      )}
                    >
                      {cell.hasTooltip && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-[var(--color-bg-panel)] text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 flex flex-col items-center border border-[var(--color-border-subtle)]">
                          <span className="font-semibold text-white/90">{cell.label}</span>
                          <span className="text-[var(--color-text-muted)] mt-0.5">
                            {cell.dateString}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-4 text-xs">
                <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                  <Flame size={14} className="text-[#F59E0B]" /> 持续学习很棒！
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
