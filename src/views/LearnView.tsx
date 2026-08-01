import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Search,
  ChevronDown,
  Check,
  Edit3,
  Zap,
  PanelLeftClose,
  PanelLeft,
  X,
  Layers3,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { useLearnData } from '@/hooks/useLearnData'
import { getLessonProgress } from '@/services/learnService'
import { consumePendingDeepLink, subscribeDeepLink } from '@/lib/deepLink'
import { recordRecent } from '@/lib/recentItems'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  Markdown,
  Spinner,
  Textarea,
} from '@/components/ui'
import aiTutorIcon from '@/assets/generated/course-icons/ai-tutor.webp'
import algorithmsIcon from '@/assets/generated/course-icons/algorithms.webp'
import cIcon from '@/assets/generated/course-icons/c.webp'
import cplusplusIcon from '@/assets/generated/course-icons/cplusplus.webp'
import csharpIcon from '@/assets/generated/course-icons/csharp.webp'
import databaseIcon from '@/assets/generated/course-icons/database.webp'
import integrationIcon from '@/assets/generated/course-icons/integration.webp'
import projectsIcon from '@/assets/generated/course-icons/projects.webp'
import pythonIcon from '@/assets/generated/course-icons/python.webp'

const TRACK_ICON_BY_ID: Record<string, string> = {
  'ai-tutor': aiTutorIcon,
  algorithms: algorithmsIcon,
  c: cIcon,
  cplusplus: cplusplusIcon,
  csharp: csharpIcon,
  database: databaseIcon,
  integration: integrationIcon,
  projects: projectsIcon,
  python: pythonIcon,
}

/** Render a generated course icon, falling back to any upstream icon metadata. */
function TrackIcon({
  trackId,
  icon,
  title,
  size = 'large',
}: {
  trackId?: string
  icon?: string
  title?: string
  size?: 'large' | 'small'
}) {
  const dim = size === 'large' ? 'w-12 h-12' : 'w-8 h-8'
  const imageDim = size === 'large' ? 'h-12 w-12' : 'h-8 w-8'
  const textSize = size === 'large' ? 'text-lg' : 'text-sm'
  const generatedIcon = trackId ? TRACK_ICON_BY_ID[trackId] : undefined
  const imageSrc = generatedIcon || (icon?.startsWith('http') || icon?.startsWith('/') ? icon : '')
  const label = title ? `${title}图标` : '课程图标'

  return (
    <div
      className={cn(
        dim,
        'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--color-bg-base)] ring-1 ring-[var(--color-border-default)] shadow-[var(--shadow-card)]',
      )}
    >
      {imageSrc ? (
        <img src={imageSrc} alt={label} className={`${imageDim} object-cover`} />
      ) : (
        <span className={`${textSize} drop-shadow-md opacity-90`}>{icon?.charAt(0) || 'C'}</span>
      )}
    </div>
  )
}

/** Render lesson status icon based on progress */
function LessonStatusIcon({ isActive, isCompleted }: { isActive: boolean; isCompleted: boolean }) {
  if (isCompleted) {
    return (
      <CheckCircle2
        size={14}
        className="text-[var(--color-accent-success)] group-hover:scale-110 transition-transform"
      />
    )
  }
  if (isActive) {
    return (
      <Circle
        size={14}
        className="text-[var(--color-accent-primary)] fill-[var(--color-accent-primary)]"
      />
    )
  }
  return <Circle size={14} className="text-[var(--color-text-muted)]" />
}

export function LearnView() {
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)

  // useLearnData hook
  const {
    tracks,
    loading: loadingTracks,
    error,
    loadTracks,
    currentLesson,
    loadingLesson,
    selectLesson,
    markOpened,
    saveNote,
    savingNote,
    markCompleted,
    searchResults,
    search,
  } = useLearnData()

  // Local UI state
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null)
  const [currentModuleId, setCurrentModuleId] = useState<string | null>(null)
  const [trackProgress, setTrackProgress] = useState<Map<string, boolean>>(new Map())
  const [noteText, setNoteText] = useState('')
  const [lessonQuery, setLessonQuery] = useState('')
  const [activeConsoleTab, setActiveConsoleTab] = useState<'notes'>('notes')

  const handleLessonSearchChange = useCallback(
    (value: string) => {
      setLessonQuery(value)
      void search(value)
    },
    [search],
  )

  const visibleTracks = useMemo(() => {
    const q = lessonQuery.trim().toLowerCase()
    const resultIds = new Set(searchResults)
    if (!q) return tracks

    return tracks
      .map((track) => {
        const trackMatches =
          track.title.toLowerCase().includes(q) || track.summary.toLowerCase().includes(q)
        const modules = track.modules
          .map((mod) => {
            const moduleMatches =
              trackMatches ||
              mod.title.toLowerCase().includes(q) ||
              mod.summary.toLowerCase().includes(q)
            const lessons = moduleMatches
              ? mod.lessons
              : mod.lessons.filter((lesson) => {
                  const localMatch =
                    lesson.title.toLowerCase().includes(q) ||
                    lesson.summary.toLowerCase().includes(q) ||
                    lesson.tags?.some((tag) => tag.toLowerCase().includes(q))
                  return localMatch || resultIds.has(lesson.id)
                })
            return moduleMatches || lessons.length > 0 ? { ...mod, lessons } : null
          })
          .filter((mod): mod is (typeof track.modules)[number] => mod !== null)
        return trackMatches || modules.length > 0 ? { ...track, modules } : null
      })
      .filter((track): track is (typeof tracks)[number] => track !== null)
  }, [lessonQuery, searchResults, tracks])

  // ---- Derive the active track from selectedLessonId ----
  const activeTrack = currentTrackId
    ? visibleTracks.find((t) => t.id === currentTrackId) || visibleTracks[0]
    : visibleTracks[0]

  const activeModule = (() => {
    if (!activeTrack) return undefined
    if (currentModuleId) {
      return activeTrack.modules.find((m) => m.id === currentModuleId)
    }
    return activeTrack.modules[0]
  })()

  const activeLesson = activeModule?.lessons.find((l) => l.id === selectedLessonId)

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      const track = tracks.find((item) => item.id === trackId)
      const firstModule = track?.modules[0]
      const firstLesson = firstModule?.lessons[0]
      if (!track || !firstModule || !firstLesson) return

      setCurrentTrackId(track.id)
      setCurrentModuleId(firstModule.id)
      setSelectedLessonId(firstLesson.id)
      setExpandedModules(new Set([firstModule.id]))
      selectLesson(firstLesson.id, track.id)
      markOpened(firstLesson.id, track.id)
    },
    [markOpened, selectLesson, tracks],
  )

  // ---- Load tracks on mount ----
  useEffect(() => {
    loadTracks()
  }, [loadTracks])

  // ---- Auto-expand first module and select first lesson on load ----
  useEffect(() => {
    if (tracks.length > 0 && selectedLessonId === null) {
      const track = tracks[0]
      const firstModule = track.modules[0]
      const firstLesson = firstModule?.lessons[0]

      if (firstModule) {
        setExpandedModules(new Set([firstModule.id]))
        setCurrentTrackId(track.id)
        setCurrentModuleId(firstModule.id)
      }
      if (firstLesson) {
        setSelectedLessonId(firstLesson.id)
        selectLesson(firstLesson.id, track.id)
        markOpened(firstLesson.id, track.id)
      }
    }
  }, [tracks, selectedLessonId, selectLesson, markOpened])

  // ---- Track progress (completed lessons) ----
  useEffect(() => {
    if (!activeTrack) return
    let cancelled = false
    getLessonProgress(activeTrack.id)
      .then((progressList) => {
        if (cancelled) return
        const map = new Map<string, boolean>()
        progressList.forEach((p) => map.set(p.lesson_id, p.completed))
        setTrackProgress(map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeTrack])

  // ---- Sync note text when lesson changes ----
  useEffect(() => {
    if (currentLesson) {
      setNoteText(currentLesson.note || '')
    }
  }, [currentLesson])

  // ---- Course progress ----
  const totalLessons = activeTrack
    ? activeTrack.modules.reduce((sum, m) => sum + m.lessons.length, 0)
    : 0
  const completedLessons = [...trackProgress.values()].filter(Boolean).length
  const courseProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  // ---- Breadcrumb ----
  const breadcrumb = (() => {
    if (!activeTrack || !activeModule || !activeLesson) return null
    return {
      track: activeTrack.title,
      module: activeModule.title,
      lesson: activeLesson.title,
    }
  })()

  // ---- Handle lesson selection ----
  const handleSelectLesson = useCallback(
    (lessonId: string, moduleId: string, trackId: string) => {
      setSelectedLessonId(lessonId)
      setCurrentTrackId(trackId)
      setCurrentModuleId(moduleId)

      // Expand the module
      setExpandedModules((prev) => {
        const next = new Set(prev)
        next.add(moduleId)
        return next
      })

      selectLesson(lessonId, trackId)
      markOpened(lessonId, trackId)
      recordRecent({ kind: 'lesson', id: lessonId })
    },
    [selectLesson, markOpened],
  )

  // ---- Open a lesson by id (命令面板深链) ----
  const openLessonById = useCallback(
    (lessonId: string) => {
      for (const track of tracks) {
        for (const mod of track.modules) {
          if (mod.lessons.some((l) => l.id === lessonId)) {
            setLessonQuery('') // 清掉视图内搜索，确保目标可见
            handleSelectLesson(lessonId, mod.id, track.id)
            return true
          }
        }
      }
      return false
    },
    [tracks, handleSelectLesson],
  )

  // 挂载时领取待处理深链，并订阅后续实时事件。
  const [pendingLessonId, setPendingLessonId] = useState<string | null>(null)
  useEffect(() => {
    const pending = consumePendingDeepLink('lesson')
    if (pending) setPendingLessonId(pending)
    return subscribeDeepLink('lesson', (id) => setPendingLessonId(id))
  }, [])
  // tracks 异步加载，待其就绪后再应用深链。
  useEffect(() => {
    if (!pendingLessonId || tracks.length === 0) return
    if (openLessonById(pendingLessonId)) setPendingLessonId(null)
  }, [pendingLessonId, tracks, openLessonById])

  // ---- Handle module expand/collapse ----
  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) {
        next.delete(moduleId)
      } else {
        next.add(moduleId)
      }
      return next
    })
  }, [])

  // ---- Save note ----
  const handleSaveNote = useCallback(() => {
    if (selectedLessonId && noteText !== (currentLesson?.note || '')) {
      saveNote(selectedLessonId, noteText).catch(() => {})
    }
  }, [selectedLessonId, noteText, currentLesson, saveNote])

  // ---- Complete lesson ----
  const handleCompleteLesson = useCallback(() => {
    if (selectedLessonId && activeTrack) {
      markCompleted(selectedLessonId, activeTrack.id)
      // Update local progress
      setTrackProgress((prev) => {
        const next = new Map(prev)
        next.set(selectedLessonId, true)
        return next
      })
    }
  }, [selectedLessonId, markCompleted, activeTrack])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className="max-w-[1440px] w-full mx-auto p-5 md:p-6 flex h-full gap-6 transition-all duration-300"
      >
        {/* Left Sidebar (Course Navigation) */}
        <AnimatePresence initial={false}>
          {!navCollapsed && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="shrink-0 overflow-hidden"
            >
              <Card
                padding="none"
                className="surface-card flex flex-col min-h-0 bg-[var(--color-bg-panel)] overflow-hidden h-full w-[320px]"
              >
                {/* Header */}
                <div className="p-4 border-b border-[var(--color-border-subtle)] relative">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-1 text-[var(--color-text-secondary)] text-sm">
                      <BookOpen size={16} /> 课程目录
                    </div>
                    <IconButton label="收起目录" size="sm" onClick={() => setNavCollapsed(true)}>
                      <PanelLeftClose size={16} />
                    </IconButton>
                  </div>

                  <div className="flex items-start gap-4 mb-4">
                    <TrackIcon
                      trackId={activeTrack?.id}
                      icon={activeTrack?.icon}
                      title={activeTrack?.title}
                      size="large"
                    />
                    <div>
                      <h2 className="font-bold text-[var(--color-text-primary)] text-[15px]">
                        {activeTrack?.title || '加载中...'}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 w-[160px]">
                        <div className="flex-1 h-1.5 bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] transition-all duration-500"
                            style={{ width: `${courseProgress}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-[var(--color-text-muted)] w-8">
                          {courseProgress}% 完成
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-1.5">
                    {tracks.map((track) => {
                      const active = activeTrack?.id === track.id
                      return (
                        <button
                          key={track.id}
                          type="button"
                          data-course-track-option={track.id}
                          onClick={() => handleSelectTrack(track.id)}
                          className={cn(
                            'flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium leading-snug transition-colors',
                            active
                              ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/15 text-[var(--color-text-primary)]'
                              : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-[var(--color-text-muted)] hover:border-[var(--color-accent-purple)]/60 hover:text-[var(--color-text-primary)]',
                          )}
                          aria-pressed={active}
                        >
                          <TrackIcon
                            trackId={track.id}
                            icon={track.icon}
                            title={track.title}
                            size="small"
                          />
                          <span className="block min-w-0 truncate">{track.title}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                        <Layers3 size={11} />
                        模块
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                        {activeTrack?.modules.length || 0}
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                        <Timer size={11} />
                        课时
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">
                        {totalLessons}
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                    />
                    <Input
                      type="text"
                      value={lessonQuery}
                      onChange={(e) => handleLessonSearchChange(e.target.value)}
                      placeholder="搜索课程、章节、知识点..."
                      className="pl-8 text-xs"
                    />
                  </div>
                </div>

                {/* Chapters */}
                <div className="flex-1 overflow-y-auto">
                  <div className="px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] sticky top-0 z-10 flex justify-between">
                    <span>
                      共 {activeTrack?.modules.length || 0} 章 · {totalLessons} 课时
                    </span>
                  </div>

                  <div className="space-y-[1px]">
                    {loadingTracks && (
                      <div className="flex items-center justify-center gap-2 py-8">
                        <Spinner size="sm" label="加载课程目录" />
                        <span className="text-sm text-[var(--color-text-muted)]">加载中...</span>
                      </div>
                    )}

                    {error && (
                      <div className="px-4 py-4 text-sm text-[var(--color-accent-danger)]">
                        {error}
                      </div>
                    )}

                    {activeTrack?.modules.map((mod) => {
                      const isExpanded = expandedModules.has(mod.id)
                      const moduleCompleted = mod.lessons.filter((l) =>
                        trackProgress.get(l.id),
                      ).length

                      return (
                        <div key={mod.id} className="bg-[var(--color-bg-panel)]">
                          <button
                            onClick={() => toggleModule(mod.id)}
                            className="w-full flex items-center justify-between p-3 hover:bg-[var(--color-bg-hover)] transition-colors"
                          >
                            <span className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                              <ChevronDown
                                size={14}
                                className={cn(
                                  'text-[var(--color-text-muted)] transition-transform duration-200',
                                  !isExpanded && '-rotate-90',
                                )}
                              />{' '}
                              {mod.title}
                            </span>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {moduleCompleted}/{mod.lessons.length}
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: 'easeOut' }}
                                className="overflow-hidden bg-[var(--color-bg-base)]"
                              >
                                <div className="py-1">
                                  {mod.lessons.map((lesson) => {
                                    const isActive = lesson.id === selectedLessonId
                                    const isCompleted = trackProgress.get(lesson.id)

                                    return (
                                      <motion.button
                                        layout
                                        key={lesson.id}
                                        onClick={() =>
                                          handleSelectLesson(lesson.id, mod.id, activeTrack.id)
                                        }
                                        className={cn(
                                          'w-full flex items-center justify-between py-2 pl-8 pr-4 hover:bg-[var(--color-bg-hover)] transition-colors group',
                                          isActive &&
                                            'bg-gradient-to-r from-[var(--color-accent-primary)]/10 to-transparent border-l-2 border-[var(--color-accent-primary)]',
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            'text-sm flex items-center gap-2 transition-colors',
                                            isActive
                                              ? 'text-[var(--color-text-primary)] font-medium'
                                              : 'text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]',
                                          )}
                                        >
                                          <LessonStatusIcon
                                            isActive={isActive}
                                            isCompleted={!!isCompleted}
                                          />
                                          {lesson.title}
                                        </span>
                                        <span
                                          className={cn(
                                            'text-xs font-mono',
                                            isActive
                                              ? 'text-[var(--color-accent-primary)]'
                                              : 'text-[var(--color-text-muted)]',
                                          )}
                                        >
                                          {lesson.estimated_minutes
                                            ? `${lesson.estimated_minutes} min`
                                            : isCompleted
                                              ? '已完成'
                                              : isActive
                                                ? '学习中'
                                                : '未学习'}
                                        </span>
                                      </motion.button>
                                    )
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {navCollapsed && (
          <div className="flex flex-col shrink-0 gap-2 w-12 items-center z-10 pt-4 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl relative overflow-hidden">
            <IconButton label="展开目录" variant="outline" onClick={() => setNavCollapsed(false)}>
              <PanelLeft size={16} />
            </IconButton>
            <div className="h-px bg-[var(--color-border-subtle)] w-8 my-1" />
            <TrackIcon
              trackId={activeTrack?.id}
              icon={activeTrack?.icon}
              title={activeTrack?.title}
              size="small"
            />
          </div>
        )}

        {/* Main Content (Reading Area) */}
        <Card
          padding="none"
          className="surface-card flex-1 min-w-0 flex flex-col bg-[var(--color-bg-panel)] overflow-hidden shadow-sm relative"
        >
          <div className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <span>{breadcrumb?.track || '...'}</span>
              <span>/</span>
              <span>{breadcrumb?.module || '...'}</span>
              <span>/</span>
              <span className="text-[var(--color-accent-purple)]">
                {breadcrumb?.lesson || '...'}
              </span>
            </div>

            {/* Mark complete button */}
            {currentLesson && !currentLesson.progress?.completed && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCompleteLesson}
                className="border-[var(--color-accent-success)]/30 bg-[var(--color-accent-success)]/10 text-[var(--color-accent-success)] hover:bg-[var(--color-accent-success)]/20"
              >
                <CheckCircle2 size={14} /> 标记完成
              </Button>
            )}
            {currentLesson?.progress?.completed && (
              <Badge variant="success" className="px-3 py-1.5">
                <CheckCircle2 size={14} /> 已完成
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scroll-smooth p-8">
            <div className="max-w-3xl mx-auto space-y-8">
              {loadingLesson && (
                <div className="flex items-center justify-center gap-2 py-16">
                  <Spinner size="sm" label="加载课程内容" />
                  <span className="text-sm text-[var(--color-text-muted)]">加载课程内容中...</span>
                </div>
              )}

              {!loadingLesson && !currentLesson && !error && (
                <EmptyState
                  icon={BookOpen}
                  title="请从左侧目录选择一个课时开始学习"
                  className="py-16"
                />
              )}

              {error && !loadingLesson && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-sm text-[var(--color-accent-danger)]">{error}</div>
                </div>
              )}

              {currentLesson && !loadingLesson && (
                <>
                  {/* Title */}
                  <motion.div
                    key={currentLesson.lessonId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                  >
                    <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-4">
                      {currentLesson.title}
                    </h1>
                  </motion.div>

                  {/* Lesson content (Markdown rendered) */}
                  <motion.div
                    key={`${currentLesson.lessonId}-markdown`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34, delay: 0.04, ease: 'easeOut' }}
                  >
                    {currentLesson.markdown && (
                      <Markdown content={currentLesson.markdown} variant="learn" />
                    )}
                  </motion.div>

                  {/* Add-note callout */}
                  <div className="bg-[var(--color-accent-primary)]/10 border border-[var(--color-accent-primary)]/20 rounded-lg p-4 flex gap-3 text-sm text-[var(--color-text-primary)] relative mt-4">
                    <div className="text-[var(--color-accent-primary)] mt-0.5">
                      <Zap size={16} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[var(--color-accent-primary)] mb-1">
                        学习提示
                      </p>
                      <p className="text-[var(--color-text-secondary)] leading-relaxed">
                        你可以在底部面板的「笔记」标签页中记录学习笔记，支持随时保存和编辑。
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setConsoleCollapsed(false)
                        setActiveConsoleTab('notes')
                      }}
                      className="self-start"
                    >
                      <Edit3 size={12} /> 添加笔记
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Bottom Drawer (Console) */}
            <AnimatePresence initial={false}>
              {consoleCollapsed ? (
                <div className="h-10 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] flex items-center px-4 justify-between shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConsoleCollapsed(false)}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronDown className="rotate-180" size={14} /> 展开控制台
                  </Button>
                </div>
              ) : (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 192, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="shrink-0 overflow-hidden"
                >
                  <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] flex flex-col h-48 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-1 border-b border-[var(--color-border-subtle)]">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setActiveConsoleTab('notes')}
                          className={cn(
                            'px-2 py-2 text-xs font-medium border-b-2',
                            activeConsoleTab === 'notes'
                              ? 'text-[var(--color-accent-purple)] border-[var(--color-accent-purple)]'
                              : 'text-[var(--color-text-secondary)] border-transparent',
                          )}
                        >
                          笔记
                        </button>
                      </div>
                      <IconButton
                        label="收起面板"
                        size="sm"
                        onClick={() => setConsoleCollapsed(true)}
                        className="mb-2"
                      >
                        <X size={14} />
                      </IconButton>
                    </div>

                    <div className="p-4 flex-1 overflow-y-auto">
                      {activeConsoleTab === 'notes' && (
                        <div className="flex flex-col h-full gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[var(--color-text-muted)]">
                              {currentLesson
                                ? `${currentLesson.title} - 笔记`
                                : '选择课时后可记录笔记'}
                            </span>
                            <div className="flex items-center gap-2">
                              {savingNote && (
                                <span className="text-xs text-[var(--color-text-muted)]">
                                  保存中...
                                </span>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleSaveNote}
                                disabled={!currentLesson || savingNote}
                                className="h-7 border-[var(--color-accent-purple)]/30 bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/20"
                              >
                                <Check size={12} /> 保存笔记
                              </Button>
                            </div>
                          </div>
                          <Textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="在此输入你的学习笔记..."
                            className="min-h-0 flex-1 resize-none font-mono leading-relaxed"
                            disabled={!currentLesson}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
