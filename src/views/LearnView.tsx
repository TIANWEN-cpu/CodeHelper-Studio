import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Search,
  ChevronLeft,
  ChevronDown,
  Check,
  Edit3,
  Zap,
  PanelLeftClose,
  PanelLeft,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { useLearnData } from '@/hooks/useLearnData'
import { getLessonProgress } from '@/services/learnService'

// @ts-expect-error - marked v14 types may not be installed in all packaging environments
import { marked } from 'marked'

/** Render a track icon: URL -> <img>, otherwise -> gradient placeholder with first char */
function TrackIcon({ icon, size = 'large' }: { icon?: string; size?: 'large' | 'small' }) {
  const dim = size === 'large' ? 'w-12 h-12' : 'w-8 h-8'
  const innerDim = size === 'large' ? 'w-8 h-8' : 'w-5 h-5'
  const textSize = size === 'large' ? 'text-lg' : 'text-sm'
  const isUrl = icon && (icon.startsWith('http') || icon.startsWith('/'))

  return (
    <div
      className={`${dim} rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#2563EB] flex items-center justify-center shrink-0`}
    >
      {isUrl ? (
        <img src={icon} alt="Track" className={`${innerDim} drop-shadow-md opacity-90`} />
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
        className="text-[#10B981] group-hover:scale-110 transition-transform"
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

/** Simple markdown renderer using marked */
function MarkdownContent({ markdown }: { markdown: string }) {
  if (!markdown) return null
  const html =
    typeof marked.parse === 'function' ? marked.parse(markdown) : String(marked(markdown))

  return <div className="learn-markdown" dangerouslySetInnerHTML={{ __html: html }} />
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
    },
    [selectLesson, markOpened],
  )

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
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-hidden">
      <style>{`
        .learn-markdown h1 { font-size: 1.875rem; font-weight: 700; color: white; margin-bottom: 1rem; }
        .learn-markdown h2 { font-size: 1.25rem; font-weight: 700; color: white; margin-bottom: 1rem; margin-top: 2rem; }
        .learn-markdown h3 { font-size: 1.125rem; font-weight: 600; color: white; margin-bottom: 0.75rem; margin-top: 1.5rem; }
        .learn-markdown p { color: var(--color-text-secondary); line-height: 1.75; font-size: 15px; margin-bottom: 1rem; }
        .learn-markdown ul, .learn-markdown ol { color: var(--color-text-secondary); padding-left: 1.5rem; margin-bottom: 1rem; }
        .learn-markdown li { margin-bottom: 0.5rem; line-height: 1.75; font-size: 15px; }
        .learn-markdown ul { list-style-type: disc; }
        .learn-markdown ol { list-style-type: decimal; }
        .learn-markdown code { color: #8B5CF6; background: rgba(139,92,246,0.1); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; font-family: monospace; }
        .learn-markdown pre { background: #1C2030; border: 1px solid var(--color-border-subtle); border-radius: 0.75rem; overflow: hidden; margin-bottom: 1rem; }
        .learn-markdown pre code { color: #E5E7EB; background: transparent; padding: 1rem; display: block; overflow-x: auto; font-size: 0.875rem; line-height: 1.75; }
        .learn-markdown blockquote { border-left: 3px solid #8B5CF6; padding: 1rem 1.25rem; margin: 1rem 0; background: rgba(139,92,246,0.05); border-radius: 0 0.5rem 0.5rem 0; }
        .learn-markdown blockquote p { margin-bottom: 0; }
        .learn-markdown strong { color: white; font-weight: 600; }
        .learn-markdown a { color: #8B5CF6; text-decoration: underline; }
        .learn-markdown hr { border: none; border-top: 1px solid var(--color-border-subtle); margin: 2rem 0; }
        .learn-markdown table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        .learn-markdown th, .learn-markdown td { border: 1px solid var(--color-border-subtle); padding: 0.5rem 0.75rem; text-align: left; font-size: 14px; }
        .learn-markdown th { background: var(--color-bg-base); color: white; font-weight: 600; }
        .learn-markdown td { color: var(--color-text-secondary); }
        .learn-markdown img { max-width: 100%; border-radius: 0.5rem; margin: 1rem 0; }
      `}</style>

      <div className="max-w-[1400px] w-full mx-auto p-6 flex h-full gap-6 transition-all duration-300">
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
              <div className="flex flex-col min-h-0 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden h-full w-[320px]">
                {/* Header */}
                <div className="p-4 border-b border-[var(--color-border-subtle)] relative">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-1 text-[var(--color-text-secondary)] text-sm">
                      <BookOpen size={16} /> 课程目录
                    </div>
                    <button
                      onClick={() => setNavCollapsed(true)}
                      className="p-1 hover:bg-[var(--color-bg-hover)] rounded text-[var(--color-text-muted)] hover:text-white"
                      title="收起目录"
                    >
                      <PanelLeftClose size={16} />
                    </button>
                  </div>

                  <div className="flex items-start gap-4 mb-4">
                    <TrackIcon icon={activeTrack?.icon} size="large" />
                    <div>
                      <h2 className="font-bold text-white text-[15px]">
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

                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
                    />
                    <input
                      type="text"
                      value={lessonQuery}
                      onChange={(e) => handleLessonSearchChange(e.target.value)}
                      placeholder="搜索课程、章节、知识点..."
                      className="w-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg pl-8 p-1.5 text-xs text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-purple)]"
                    />
                    <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)] font-mono">
                      Ctrl K
                    </kbd>
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
                      <div className="flex items-center justify-center py-8">
                        <div className="text-sm text-[var(--color-text-muted)]">加载中...</div>
                      </div>
                    )}

                    {error && <div className="px-4 py-4 text-sm text-red-400">{error}</div>}

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
                            <span className="text-sm font-semibold text-white flex items-center gap-2">
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

                          {isExpanded && (
                            <div className="bg-[var(--color-bg-base)] py-1">
                              {mod.lessons.map((lesson) => {
                                const isActive = lesson.id === selectedLessonId
                                const isCompleted = trackProgress.get(lesson.id)

                                return (
                                  <button
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
                                          ? 'text-white font-medium'
                                          : 'text-[var(--color-text-secondary)] group-hover:text-white',
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
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {navCollapsed && (
          <div className="flex flex-col shrink-0 gap-2 w-12 items-center z-10 pt-4 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl relative overflow-hidden">
            <button
              onClick={() => setNavCollapsed(false)}
              className="p-2.5 bg-[var(--color-bg-hover)] rounded-lg text-white hover:bg-white/10 transition-colors"
              title="展开目录"
            >
              <PanelLeft size={16} />
            </button>
            <div className="h-px bg-[var(--color-border-subtle)] w-8 my-1" />
            <TrackIcon icon={activeTrack?.icon} size="small" />
          </div>
        )}

        {/* Main Content (Reading Area) */}
        <div className="flex-1 min-w-0 flex flex-col bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden shadow-sm relative">
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
              <button
                onClick={handleCompleteLesson}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] rounded-lg hover:bg-[#10B981]/20 transition-colors"
              >
                <CheckCircle2 size={14} /> 标记完成
              </button>
            )}
            {currentLesson?.progress?.completed && (
              <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-[#10B981]">
                <CheckCircle2 size={14} /> 已完成
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scroll-smooth p-8">
            <div className="max-w-3xl mx-auto space-y-8">
              {loadingLesson && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-sm text-[var(--color-text-muted)]">加载课程内容中...</div>
                </div>
              )}

              {!loadingLesson && !currentLesson && !error && (
                <div className="flex flex-col items-center justify-center py-16 gap-4 text-[var(--color-text-muted)]">
                  <BookOpen size={48} className="opacity-30" />
                  <p className="text-sm">请从左侧目录选择一个课时开始学习</p>
                </div>
              )}

              {error && !loadingLesson && (
                <div className="flex items-center justify-center py-16">
                  <div className="text-sm text-red-400">{error}</div>
                </div>
              )}

              {currentLesson && !loadingLesson && (
                <>
                  {/* Title */}
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-4">{currentLesson.title}</h1>
                  </div>

                  {/* Lesson content (Markdown rendered) */}
                  <MarkdownContent markdown={currentLesson.markdown} />

                  {/* Add-note callout */}
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3 text-sm text-[var(--color-text-primary)] relative mt-4">
                    <div className="text-blue-400 mt-0.5">
                      <Zap size={16} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-blue-400 mb-1">学习提示</p>
                      <p className="text-[var(--color-text-secondary)] leading-relaxed">
                        你可以在底部面板的「笔记」标签页中记录学习笔记，支持随时保存和编辑。
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setConsoleCollapsed(false)
                        setActiveConsoleTab('notes')
                      }}
                      className="flex items-center gap-1 text-xs px-2 py-1 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-white rounded transition-colors"
                    >
                      <Edit3 size={12} /> 添加笔记
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Bottom Drawer (Console) */}
            <AnimatePresence initial={false}>
              {consoleCollapsed ? (
                <div className="h-10 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] flex items-center px-4 justify-between shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                  <button
                    onClick={() => setConsoleCollapsed(false)}
                    className="text-xs text-[var(--color-text-muted)] hover:text-white transition-colors flex items-center gap-2"
                  >
                    <ChevronDown className="rotate-180" size={14} /> 展开控制台
                  </button>
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
                      <button
                        onClick={() => setConsoleCollapsed(true)}
                        className="text-[var(--color-text-muted)] hover:text-white mb-2"
                        title="收起面板"
                      >
                        <X size={14} />
                      </button>
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
                              <button
                                onClick={handleSaveNote}
                                disabled={!currentLesson || savingNote}
                                className="flex items-center gap-1 text-xs px-2 py-1 bg-[var(--color-accent-purple)]/10 border border-[var(--color-accent-purple)]/30 text-[var(--color-accent-purple)] rounded hover:bg-[var(--color-accent-purple)]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Check size={12} /> 保存笔记
                              </button>
                            </div>
                          </div>
                          <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="在此输入你的学习笔记..."
                            className="flex-1 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg p-3 text-sm text-white placeholder-[var(--color-text-muted)] resize-none focus:outline-none focus:border-[var(--color-accent-purple)] font-mono leading-relaxed"
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
        </div>
      </div>
    </div>
  )
}
