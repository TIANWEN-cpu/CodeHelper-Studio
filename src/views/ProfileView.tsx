import React, { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
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
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui'
import { useAppStore } from '../store'
import { toast } from '@/stores/toastStore'
import { WeeklyReportCard } from '@/components/WeeklyReportCard'
import * as homeService from '@/services/homeService'
import type { HomeOverview, AnalyticsSummary } from '@/services/homeService'
import {
  getUserProfile,
  getSetting,
  setSetting,
  type UserProfileSettings,
} from '@/services/settingsService'

const PENDING_SETTINGS_TAB_KEY = 'codehelper.pendingSettingsTab'

/** 与 HomeView 一致：带入场动效的卡片。 */
const MotionCard = motion.create(Card)

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

/** 成就定义 + 解锁判定，全部由真实指标推导。render 与解锁提示共用此口径。 */
function buildAchievements(overview: HomeOverview) {
  return [
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
}

const CELEBRATED_ACHIEVEMENTS_KEY = 'achievements_celebrated'

function StatTile({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  sub,
  index = 0,
}: {
  icon: typeof BookOpen
  iconColor: string
  iconBg: string
  label: string
  value: string
  sub?: string
  index?: number
}) {
  return (
    <MotionCard
      padding="none"
      className="p-5 shadow-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: 'easeOut' }}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', iconBg)}>
        <Icon size={20} className={iconColor} />
      </div>
      <div className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
        {value}
      </div>
      <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-[var(--color-text-secondary)] mt-1">{sub}</div>}
    </MotionCard>
  )
}

function ProfileAvatarFallback({
  value,
  name,
  sizeClass,
}: {
  value: string
  name: string
  sizeClass: string
}) {
  const label = name.trim().slice(0, 1).toUpperCase() || '同'

  if (value) {
    return (
      <span className={cn(sizeClass, 'flex items-center justify-center rounded-full text-4xl')}>
        {value.slice(0, 2)}
      </span>
    )
  }

  return (
    <span
      className={cn(
        sizeClass,
        'flex items-center justify-center rounded-full bg-[var(--color-accent-purple)]/15 text-3xl font-bold text-[var(--color-accent-purple)]',
      )}
    >
      {label}
    </span>
  )
}

function ProfileAvatar({
  avatar,
  name,
  sizeClass = 'w-24 h-24',
}: {
  avatar: string
  name: string
  sizeClass?: string
}) {
  const trimmedAvatar = avatar.trim()
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [trimmedAvatar])

  if (/^(data:image\/|https?:\/\/|blob:)/i.test(trimmedAvatar) && !imageFailed) {
    return (
      <img
        src={trimmedAvatar}
        alt={`${name || '同学'}的头像`}
        className={cn(sizeClass, 'rounded-full object-cover')}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <ProfileAvatarFallback
      value={imageFailed ? '' : trimmedAvatar}
      name={name}
      sizeClass={sizeClass}
    />
  )
}

function renderProfileAvatar(avatar: string, name: string, sizeClass = 'w-24 h-24') {
  return <ProfileAvatar avatar={avatar} name={name} sizeClass={sizeClass} />
}

export function ProfileView() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [overview, setOverview] = useState<HomeOverview | null>(null)
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [profile, setProfile] = useState<UserProfileSettings>({ name: '', avatar: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([
      homeService.getOverview(),
      homeService.getAnalyticsSummary(30).catch(() => null),
      getUserProfile().catch(() => ({ name: '', avatar: '' })),
    ])
      .then(([ov, sm, userProfile]) => {
        if (!mounted) return
        setOverview(ov)
        setSummary(sm)
        setProfile(userProfile)
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

  // 成就解锁提示：与已庆祝集合对比，仅对「新解锁」弹一次。
  // 首次（无持久化记录）只静默落库做基线，避免老用户一次性刷屏。
  useEffect(() => {
    if (!overview) return
    let cancelled = false
    const unlockedIds = buildAchievements(overview)
      .filter((a) => a.unlocked)
      .map((a) => ({ id: a.id, label: a.label }))

    void (async () => {
      const raw = await getSetting(CELEBRATED_ACHIEVEMENTS_KEY).catch(() => null)
      if (cancelled) return
      const seeded = raw != null
      let celebrated: string[] = []
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed))
            celebrated = parsed.filter((x): x is string => typeof x === 'string')
        } catch {
          /* 损坏的记录按空集处理，下面会重新落库 */
        }
      }
      const celebratedSet = new Set(celebrated)
      const fresh = unlockedIds.filter((a) => !celebratedSet.has(a.id))
      if (fresh.length === 0) return
      if (seeded) {
        fresh.forEach((a) => toast.success(`解锁新成就：${a.label}`))
      }
      const next = Array.from(new Set([...celebrated, ...unlockedIds.map((a) => a.id)]))
      await setSetting(CELEBRATED_ACHIEVEMENTS_KEY, JSON.stringify(next)).catch(() => {})
    })()

    return () => {
      cancelled = true
    }
  }, [overview])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" label="加载个人数据" className="text-[var(--color-accent-primary)]" />
      </div>
    )
  }

  if (error || !overview) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={AlertTriangle}
          title={error ? '加载个人数据失败' : '暂无个人数据'}
          description={error ?? undefined}
        />
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
  const achievements = buildAchievements(overview)
  const unlockedCount = achievements.filter((a) => a.unlocked).length
  const displayName = profile.name || overview.greetingName || '同学'

  const openAccountSettings = () => {
    try {
      window.sessionStorage.setItem(PENDING_SETTINGS_TAB_KEY, 'account')
    } catch {
      /* SettingsView also listens for the event below. */
    }
    setCurrentView('settings')
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('codehelper:settings-tab', { detail: 'account' }))
    }, 0)
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="max-w-[1000px] w-full mx-auto p-6 lg:p-8 space-y-6">
        {/* Hero（渐变背景由 .profile-hero 提供，随主题变量自适应） */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="profile-hero relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] p-6 lg:p-8 shadow-sm"
        >
          <div className="absolute top-0 right-0 w-72 h-72 bg-[var(--color-accent-primary)] rounded-full blur-[120px] opacity-20 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative shrink-0">
              <div className="profile-hero-avatar w-24 h-24 rounded-full flex items-center justify-center overflow-hidden ring-4 ring-[var(--color-accent-primary)]/20">
                {renderProfileAvatar(profile.avatar, displayName)}
              </div>
              <div className="profile-hero-status absolute -bottom-1 -right-1 bg-[var(--color-accent-success)] w-6 h-6 rounded-full border-4" />
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left w-full">
              <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
                  {displayName}
                </h1>
                <Badge
                  variant="purple"
                  className="text-[11px] font-bold border border-[var(--color-accent-purple)]/30"
                >
                  {levelTitle(overview.level)}
                </Badge>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1 flex items-center justify-center sm:justify-start gap-2">
                <Sparkles size={14} className="text-[var(--color-accent-warning)]" />
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

            <Button
              variant="secondary"
              onClick={openAccountSettings}
              className="shrink-0"
              data-open-account-settings
            >
              <Settings size={15} />
              账户设置
            </Button>
          </div>
        </motion.div>

        {/* 统计磁贴 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            index={0}
            icon={BookOpen}
            iconColor="text-[var(--color-accent-primary)]"
            iconBg="bg-[var(--color-accent-primary)]/10"
            label="已完成课程"
            value={`${overview.completedLessons}/${overview.totalLessons}`}
          />
          <StatTile
            index={1}
            icon={CheckCircle2}
            iconColor="text-[var(--color-accent-success)]"
            iconBg="bg-[var(--color-accent-success)]/10"
            label="已解决题目"
            value={`${overview.solvedProblems}/${overview.totalProblems}`}
          />
          <StatTile
            index={2}
            icon={Flame}
            iconColor="text-[var(--color-accent-warning)]"
            iconBg="bg-[var(--color-accent-warning)]/10"
            label="连续学习"
            value={`${Math.max(0, overview.streak)} 天`}
          />
          <StatTile
            index={3}
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
          <Card padding="lg" className="lg:col-span-2 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-[var(--color-text-primary)] text-[15px]">
                最近 30 天活跃度
              </h3>
              <Badge variant="neutral">共 {summary?.totalEvents ?? 0} 次活动</Badge>
            </div>
            {days.length === 0 || maxCount === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="暂无活动数据"
                description="去学习/刷题积累记录吧"
              />
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
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] text-[10px] text-[var(--color-text-primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {d.date}：{d.count} 次
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* 活动构成 */}
          <Card padding="lg" className="shadow-sm">
            <h3 className="font-semibold text-[var(--color-text-primary)] text-[15px] mb-5">
              活动构成
            </h3>
            {typeEntries.length === 0 ? (
              <EmptyState icon={Target} title="暂无活动记录" />
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
          </Card>
        </div>

        {/* 学习周报 */}
        <WeeklyReportCard />

        {/* 成就 */}
        <Card padding="lg" className="shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-[var(--color-text-primary)] text-[15px] flex items-center gap-2">
              <Trophy size={16} className="text-[var(--color-accent-warning)]" />
              成就徽章
            </h3>
            <Badge variant="neutral">
              已解锁 {unlockedCount}/{achievements.length}
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {achievements.map((a) => {
              const Icon = a.icon
              return (
                <div
                  key={a.id}
                  className={cn(
                    'relative rounded-xl border p-4 flex flex-col items-center text-center transition-all duration-[var(--motion-duration-fast)]',
                    a.unlocked
                      ? 'border-[var(--color-accent-purple)]/30 bg-[var(--color-accent-purple)]/5 hover:-translate-y-0.5 hover:border-[var(--color-accent-purple)]/50 hover:shadow-[var(--shadow-card)]'
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
                      a.unlocked
                        ? 'text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)]',
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
        </Card>

        {/* 快捷入口 */}
        <div className="flex items-center justify-center">
          <Button
            size="lg"
            onClick={() => setCurrentView('learn')}
            className="shadow-md hover:shadow-[0_10px_24px_color-mix(in_srgb,var(--color-accent-primary)_24%,transparent)]"
          >
            继续学习
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
