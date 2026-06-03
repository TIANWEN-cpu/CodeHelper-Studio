import React, { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  CircleUser,
  Flame,
  BookOpen,
  CheckCircle2,
  Zap,
  Trophy,
  Target,
  Award,
  TrendingUp,
  Star,
  Sparkles,
  Lock,
  Settings,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '../store'
import * as homeService from '@/services/homeService'
import type { HomeOverview, AnalyticsSummary } from '@/services/homeService'

/** 事件类型 → 中文标签（未知类型回退原始 key）。 */
const EVENT_LABELS: Record<string, string> = {
  lesson_completed: '完成课程',
  lesson_opened: '打开课程',
  lesson_viewed: '浏览课程',
  problem_solved: '解决题目',
  problem_attempted: '尝试题目',
  problem_submitted: '提交代码',
  code_run: '运行代码',
  review_completed: '完成复习',
  review_due: '待复习',
  note_saved: '保存笔记',
  ai_chat: 'AI 对话',
  knowledge_search: '知识检索',
}

function levelTitle(level: number): string {
  if (level >= 20) return 'Master'
  if (level >= 10) return 'Pro'
  if (level >= 5) return 'Adept'
  return 'Novice'
}

function StatTile({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: typeof BookOpen
  iconColor: string
  iconBg: string
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-5 shadow-sm">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', iconBg)}>
        <Icon size={20} className={iconColor} />
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">{sub}</div>}
    </div>
  )
}

export function ProfileView() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [overview, setOverview] = useState<HomeOverview | null>(null)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([homeService.getOverview(), homeService.getAnalyticsSummary(30).catch(() => null)])
      .then(([ov, sm]) => {
        if (!mounted) return
        setOverview(ov)
        setSummary(sm)
        setError(null)
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : '加载个人数据失败')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-bg-base)]">
        <Loader2 size={32} className="animate-spin text-[var(--color-accent-primary)]" />
      </div>
    )
  }

  if (error || !overview) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-[var(--color-bg-base)]">
        <div className="w-14 h-14 rounded-full bg-[#EF4444]/10 flex items-center justify-center text-2xl">
          !
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">{error || '暂无个人数据'}</p>
      </div>
    )
  }

  const xpPercent =
    overview.xpForNextLevel > 0
      ? Math.min(100, Math.max(0, Math.round((overview.xpInLevel / overview.xpForNextLevel) * 100)))
      : 0

  // 活动构成（按类型计数，降序）
  const typeEntries = Object.entries(summary?.byType ?? {}).sort((a, b) => b[1] - a[1])
  const typeTotal = typeEntries.reduce((s, [, c]) => s + c, 0)

  // 最近 30 天每日活动（用于柱状图）
  const days = summary?.dailyCounts ?? []
  const maxCount = days.reduce((m, d) => Math.max(m, d.count), 0)

  // 成就：全部由真实指标推导（解锁/未解锁）
  const achievements = [
    {
      id: 'first-lesson',
      icon: BookOpen,
      label: '初出茅庐',
      desc: '完成第一节课程',
      unlocked: overview.completedLessons >= 1,
    },
    {
      id: 'first-problem',
      icon: Target,
      label: '小试牛刀',
      desc: '解决第一道题目',
      unlocked: overview.solvedProblems >= 1,
    },
    {
      id: 'streak-3',
      icon: Flame,
      label: '渐入佳境',
      desc: '连续学习 3 天',
      unlocked: overview.streak >= 3,
    },
    {
      id: 'streak-7',
      icon: Flame,
      label: '坚持一周',
      desc: '连续学习 7 天',
      unlocked: overview.streak >= 7,
    },
    {
      id: 'solve-10',
      icon: Trophy,
      label: '解题能手',
      desc: '累计解决 10 道题',
      unlocked: overview.solvedProblems >= 10,
    },
    {
      id: 'solve-50',
      icon: Award,
      label: '百炼成钢',
      desc: '累计解决 50 道题',
      unlocked: overview.solvedProblems >= 50,
    },
    {
      id: 'half-course',
      icon: TrendingUp,
      label: '课程过半',
      desc: '完成半数课程',
      unlocked: overview.totalLessons > 0 && overview.completedLessons >= overview.totalLessons / 2,
    },
    {
      id: 'level-5',
      icon: Star,
      label: '进阶学者',
      desc: '达到 Lv.5',
      unlocked: overview.level >= 5,
    },
  ]
  const unlockedCount = achievements.filter((a) => a.unlocked).length

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-y-auto">
      <div className="max-w-[1000px] w-full mx-auto p-6 lg:p-8 space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-gradient-to-br from-[#1E243A] to-[var(--color-bg-card)] p-6 lg:p-8 shadow-sm">
          <div className="absolute top-0 right-0 w-72 h-72 bg-[var(--color-accent-primary)] rounded-full blur-[120px] opacity-20 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-full bg-[#2A2F45] flex items-center justify-center ring-4 ring-[var(--color-accent-primary)]/20">
                <CircleUser size={56} className="text-[#9CA3AF]" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-[#10B981] w-6 h-6 rounded-full border-4 border-[#1E243A]" />
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left w-full">
              <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {overview.greetingName || '同学'}
                </h1>
                <span className="text-[11px] font-bold bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)] px-2 py-0.5 rounded-md border border-[var(--color-accent-purple)]/30">
                  {levelTitle(overview.level)}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1 flex items-center justify-center sm:justify-start gap-2">
                <Sparkles size={14} className="text-[#F59E0B]" />
                Lv.{overview.level} · 累计 {overview.xp} XP
              </p>

              {/* XP 进度 */}
              <div className="mt-4 max-w-md mx-auto sm:mx-0">
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] mb-1.5">
                  <span>距离 Lv.{overview.level + 1}</span>
                  <span>
                    {overview.xpInLevel} / {overview.xpForNextLevel} XP
                  </span>
                </div>
                <div className="w-full h-2 bg-[var(--color-bg-base)] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${xpPercent}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)]"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setCurrentView('settings')}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-base)]/40 text-sm text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-accent-primary)] transition-colors"
            >
              <Settings size={15} />
              账户设置
            </button>
          </div>
        </div>

        {/* 统计磁贴 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon={BookOpen}
            iconColor="text-[var(--color-accent-primary)]"
            iconBg="bg-[var(--color-accent-primary)]/10"
            label="已完成课程"
            value={`${overview.completedLessons}/${overview.totalLessons}`}
          />
          <StatTile
            icon={CheckCircle2}
            iconColor="text-[#10B981]"
            iconBg="bg-[#10B981]/10"
            label="已解决题目"
            value={`${overview.solvedProblems}/${overview.totalProblems}`}
          />
          <StatTile
            icon={Flame}
            iconColor="text-[#F59E0B]"
            iconBg="bg-[#F59E0B]/10"
            label="连续学习"
            value={`${Math.max(0, overview.streak)} 天`}
          />
          <StatTile
            icon={Zap}
            iconColor="text-[var(--color-accent-purple)]"
            iconBg="bg-[var(--color-accent-purple)]/10"
            label="累计经验"
            value={`${overview.xp} XP`}
          />
        </div>

        {/* 活跃度 + 活动构成 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 30 天活跃度 */}
          <div className="lg:col-span-2 bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-white text-[15px]">最近 30 天活跃度</h3>
              <span className="text-xs text-[var(--color-text-muted)]">
                共 {summary?.totalEvents ?? 0} 次活动
              </span>
            </div>
            {days.length === 0 || maxCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp size={32} className="text-[var(--color-text-muted)] opacity-50 mb-2" />
                <p className="text-sm text-[var(--color-text-muted)]">
                  暂无活动数据，去学习/刷题积累记录吧
                </p>
              </div>
            ) : (
              <div className="flex items-end gap-1 h-36">
                {days.map((d, i) => {
                  const h = maxCount > 0 ? Math.max(4, Math.round((d.count / maxCount) * 100)) : 4
                  return (
                    <div key={d.date || i} className="flex-1 h-full flex items-end group relative">
                      <div
                        className="w-full rounded-sm bg-gradient-to-t from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] opacity-80 group-hover:opacity-100 transition-all"
                        style={{ height: `${h}%` }}
                      />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {d.date}：{d.count} 次
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 活动构成 */}
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold text-white text-[15px] mb-5">活动构成</h3>
            {typeEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Target size={28} className="text-[var(--color-text-muted)] opacity-50 mb-2" />
                <p className="text-sm text-[var(--color-text-muted)]">暂无活动记录</p>
              </div>
            ) : (
              <div className="space-y-3">
                {typeEntries.slice(0, 6).map(([type, count]) => {
                  const pct = typeTotal > 0 ? Math.round((count / typeTotal) * 100) : 0
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[var(--color-text-secondary)] truncate">
                          {EVENT_LABELS[type] || type}
                        </span>
                        <span className="text-[var(--color-text-muted)] shrink-0 ml-2">
                          {count}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--color-bg-base)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] rounded-full"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 成就 */}
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-white text-[15px] flex items-center gap-2">
              <Trophy size={16} className="text-[#F59E0B]" />
              成就徽章
            </h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              已解锁 {unlockedCount}/{achievements.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {achievements.map((a) => {
              const Icon = a.icon
              return (
                <div
                  key={a.id}
                  className={cn(
                    'relative rounded-xl border p-4 flex flex-col items-center text-center transition-all',
                    a.unlocked
                      ? 'border-[var(--color-accent-purple)]/30 bg-[var(--color-accent-purple)]/5'
                      : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] opacity-60',
                  )}
                >
                  <div
                    className={cn(
                      'w-11 h-11 rounded-xl flex items-center justify-center mb-2',
                      a.unlocked
                        ? 'bg-[var(--color-accent-purple)]/15'
                        : 'bg-[var(--color-bg-hover)]',
                    )}
                  >
                    {a.unlocked ? (
                      <Icon size={22} className="text-[var(--color-accent-purple)]" />
                    ) : (
                      <Lock size={18} className="text-[var(--color-text-muted)]" />
                    )}
                  </div>
                  <p
                    className={cn(
                      'text-xs font-semibold mb-0.5',
                      a.unlocked ? 'text-white' : 'text-[var(--color-text-secondary)]',
                    )}
                  >
                    {a.label}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">
                    {a.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* 快捷入口 */}
        <div className="flex items-center justify-center">
          <button
            onClick={() => setCurrentView('learn')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] hover:from-[#4F46E5] hover:to-[#7C3AED] text-white text-sm font-medium transition-all shadow-md hover:shadow-[0_0_15px_rgba(139,92,246,0.4)]"
          >
            继续学习
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
