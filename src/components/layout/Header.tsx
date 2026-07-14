import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Command, ChevronDown, Bell, Sun, Moon, Terminal, Sparkles, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ViewType } from '@/types'
import * as settingsService from '@/services/settingsService'
import type { AIConfig } from '@/services/settingsService'
import * as reviewService from '@/services/reviewService'
import * as learnService from '@/services/learnService'
import * as practiceService from '@/services/practiceService'
import * as knowledgeService from '@/services/knowledgeService'
import { requestDeepLink } from '@/lib/deepLink'
import { getRecentRefs, recordRecent, type RecentRef } from '@/lib/recentItems'
import {
  buildCommandResults,
  type CommandResult,
  type LessonItem,
  type ExerciseItem,
  type KnowledgeItem,
} from '@/lib/commandPalette'

/** Pages reachable from the command palette. */
const COMMAND_ITEMS: { view: ViewType; label: string }[] = [
  { view: 'ai-tutor', label: 'AI 助手' },
  { view: 'home', label: '首页' },
  { view: 'learn', label: '课程' },
  { view: 'practice', label: '练习' },
  { view: 'workspace', label: '工作区' },
  { view: 'review', label: '错题' },
  { view: 'knowledge', label: '知识库' },
  { view: 'settings', label: '设置' },
]

const KIND_LABELS: Record<CommandResult['kind'], string> = {
  page: '页面',
  lesson: '课程',
  exercise: '练习',
  knowledge: '知识',
}

const VIEW_LABELS: Record<ViewType, string> = {
  home: '首页概览',
  learn: '课程学习',
  practice: '题库练习',
  workspace: '编程工作区',
  'ai-tutor': 'AI 助手',
  review: '复习与错题',
  knowledge: '知识库',
  settings: '设置',
  profile: '个人中心',
}

export function Header() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const currentView = useAppStore((s) => s.currentView)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)

  // --- AI model switcher (real configs/default) ---
  const [modelConfigs, setModelConfigs] = useState<AIConfig[]>([])
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [switchingModelId, setSwitchingModelId] = useState<number | null>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  // --- Pending review count (real due reviews) ---
  const [dueCount, setDueCount] = useState(0)

  // --- Command palette state (component-local) ---
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // 课程/练习/知识库作为可搜索内容，首次打开面板时懒加载一次。
  const [lessons, setLessons] = useState<LessonItem[]>([])
  const [exercises, setExercises] = useState<ExerciseItem[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([])
  const [recentRefs, setRecentRefs] = useState<RecentRef[]>([])
  const contentLoadedRef = useRef(false)

  const currentModelConfig = useMemo(
    () => modelConfigs.find((config) => config.is_default) ?? modelConfigs[0] ?? null,
    [modelConfigs],
  )

  const loadModelConfigs = useCallback(async () => {
    try {
      const configs = await settingsService.getAIConfigs()
      setModelConfigs(Array.isArray(configs) ? configs : [])
    } catch {
      setModelConfigs([])
    }
  }, [])

  useEffect(() => {
    void loadModelConfigs()
  }, [loadModelConfigs])

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // Fetch the number of exercises due for review.
  useEffect(() => {
    let cancelled = false
    reviewService
      .getDueReviews()
      .then((items) => {
        if (!cancelled) setDueCount(Array.isArray(items) ? items.length : 0)
      })
      .catch(() => {
        if (!cancelled) setDueCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems = useMemo(
    () =>
      buildCommandResults(query, {
        pages: COMMAND_ITEMS,
        lessons,
        exercises,
        knowledge,
        recentRefs,
      }),
    [query, lessons, exercises, knowledge, recentRefs],
  )

  // 首次打开面板时拉取课程/练习/知识库供搜索；失败静默（仍可搜索页面）。
  const loadSearchableContent = useCallback(async () => {
    if (contentLoadedRef.current) return
    contentLoadedRef.current = true
    try {
      const [tracks, exerciseList, docs] = await Promise.all([
        learnService.getTracks().catch(() => []),
        practiceService.getExercises().catch(() => []),
        knowledgeService.getDocuments().catch(() => []),
      ])
      const flatLessons: LessonItem[] = tracks.flatMap((track) =>
        track.modules.flatMap((module) =>
          module.lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            trackTitle: track.title,
            moduleTitle: module.title,
          })),
        ),
      )
      setLessons(flatLessons)
      setExercises(
        exerciseList.map((ex) => ({
          id: ex.id,
          title: ex.title,
          difficulty: ex.difficulty,
          trackId: ex.track_id,
        })),
      )
      setKnowledge(
        docs.map((doc) => ({
          id: String(doc.id),
          title: doc.display_title?.trim() || doc.filename,
          sublabel: doc.source_repo || doc.category || undefined,
        })),
      )
    } catch {
      // 内容搜索是增量能力，加载失败不影响页面跳转。
      contentLoadedRef.current = false
    }
  }, [])

  const openPalette = useCallback(() => {
    setQuery('')
    setActiveIndex(0)
    setRecentRefs(getRecentRefs())
    setPaletteOpen(true)
    void loadSearchableContent()
  }, [loadSearchableContent])

  const toggleModelMenu = useCallback(() => {
    setModelMenuOpen((open) => {
      if (!open) void loadModelConfigs()
      return !open
    })
  }, [loadModelConfigs])

  const chooseModel = useCallback(
    async (config: AIConfig) => {
      if (config.id == null) return
      setSwitchingModelId(config.id)
      try {
        await settingsService.saveAIConfig({
          ...config,
          api_key: config.api_key ?? '',
          is_default: true,
        })
        await loadModelConfigs()
        setModelMenuOpen(false)
      } finally {
        setSwitchingModelId(null)
      }
    },
    [loadModelConfigs],
  )

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
  }, [])

  const runCommand = useCallback(
    (result: CommandResult) => {
      setCurrentView(result.view)
      if (result.target) {
        requestDeepLink(result.target)
        recordRecent({ kind: result.target.kind, id: result.target.id })
      }
      setPaletteOpen(false)
    },
    [setCurrentView],
  )

  // Global Ctrl/Cmd+K to toggle the palette.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => {
          if (prev) return false
          setQuery('')
          setActiveIndex(0)
          setRecentRefs(getRecentRefs())
          void loadSearchableContent()
          return true
        })
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loadSearchableContent])

  // Focus the palette input when it opens; keep the highlight in range.
  useEffect(() => {
    if (paletteOpen) inputRef.current?.focus()
  }, [paletteOpen])

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filteredItems.length - 1)))
  }, [filteredItems.length])

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = filteredItems[activeIndex]
      if (target) runCommand(target)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePalette()
    }
  }

  return (
    <header className="app-header h-16 flex-shrink-0 flex items-center gap-3 px-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]/80 backdrop-blur-md z-30 relative text-[var(--color-text-primary)] lg:px-6">
      <div className="hidden w-[170px] min-w-0 items-center gap-2 text-sm text-[var(--color-text-secondary)] xl:flex">
        <Sparkles size={15} className="text-[var(--color-accent-primary)]" />
        <span className="truncate font-medium">{VIEW_LABELS[currentView]}</span>
      </div>

      {/* Center / Quick switcher */}
      <div className="flex min-w-0 flex-1 items-center justify-start">
        <div className="relative group w-full max-w-[460px]">
          <Command
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-accent-primary)] group-hover:text-[var(--color-text-secondary)] transition-colors"
          />
          <input
            type="text"
            readOnly
            value=""
            onFocus={openPalette}
            onMouseDown={(e) => {
              // Open the palette instead of placing a caret in this proxy input.
              e.preventDefault()
              openPalette()
            }}
            placeholder="快速跳转..."
            className="h-9 w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg pl-9 pr-12 py-1.5 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-4 focus:ring-[var(--color-accent-primary)]/10 transition-all hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] focus:bg-[var(--color-bg-panel)] shadow-sm cursor-pointer"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="hidden sm:inline-flex items-center gap-1 bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
              Ctrl K
            </kbd>
          </div>
        </div>
      </div>

      {/* Desktop Right */}
      <div className="flex min-w-0 items-center justify-end gap-2.5">
        {/* Workspace terminal shortcut */}
        <button
          onClick={() => setCurrentView('workspace')}
          aria-label="打开工作区终端"
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] active:scale-95 md:flex"
          title="打开工作区终端"
        >
          <Terminal size={16} />
        </button>

        {/* AI Model Switcher */}
        <div ref={modelMenuRef} className="relative hidden min-[721px]:block">
          <button
            onClick={toggleModelMenu}
            title={currentModelConfig ? '切换当前 AI 模型' : '前往设置配置 AI 模型'}
            aria-expanded={modelMenuOpen}
            className={cn(
              'flex h-9 max-w-[220px] items-center gap-2 rounded-lg border px-3 text-sm transition-all hover:bg-[var(--color-bg-hover)] active:scale-95',
              modelMenuOpen
                ? 'border-[var(--color-border-default)] bg-[var(--color-bg-hover)]'
                : 'border-[var(--color-border-subtle)]',
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <div
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  currentModelConfig ? 'bg-[#10B981]' : 'bg-[var(--color-text-muted)]',
                )}
              ></div>
              <span
                className={cn(
                  'truncate',
                  currentModelConfig ? 'text-white' : 'text-[var(--color-text-muted)]',
                )}
              >
                {currentModelConfig?.model ?? '未配置模型'}
              </span>
            </div>
            <ChevronDown
              size={14}
              className={cn(
                'shrink-0 text-[var(--color-text-muted)] transition-transform',
                modelMenuOpen && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence>
            {modelMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-2 w-[340px] overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] shadow-2xl shadow-black/40 ring-1 ring-white/5 z-50"
              >
                <div className="max-h-80 overflow-y-auto p-2">
                  {modelConfigs.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-[var(--color-text-muted)]">
                      尚未配置模型
                    </div>
                  ) : (
                    modelConfigs.map((config) => {
                      const active = config.id === currentModelConfig?.id
                      const switching = config.id != null && switchingModelId === config.id
                      return (
                        <button
                          key={config.id ?? `${config.base_url}-${config.model}`}
                          type="button"
                          onClick={() => void chooseModel(config)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                            active
                              ? 'bg-[var(--color-accent-purple)]/14 text-white'
                              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                              active
                                ? 'border-[#10B981]/50 bg-[#10B981]/10 text-[#10B981]'
                                : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)]',
                            )}
                          >
                            <Cpu size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {config.model}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                              {config.name} · {config.base_url}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              active
                                ? 'border-[#10B981]/35 bg-[#10B981]/10 text-[#10B981]'
                                : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)]',
                              switching && 'animate-pulse',
                            )}
                          >
                            {active ? '当前' : '切换'}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
                <div className="border-t border-[var(--color-border-subtle)] p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('settings')
                      setModelMenuOpen(false)
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--color-accent-purple)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    打开模型设置
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="hidden h-6 w-px bg-[var(--color-border-subtle)] mx-0.5 min-[721px]:block" />

        {/* Icons */}
        <button
          onClick={() => setCurrentView('review')}
          aria-label={dueCount > 0 ? `${dueCount} 个待复习` : '打开复习'}
          className="relative p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-hover)] active:scale-95 rounded-md transition-all"
          title={dueCount > 0 ? `${dueCount} 个待复习` : '复习'}
        >
          <Bell size={18} />
          {dueCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-semibold leading-none text-white bg-[#EF4444] rounded-full border border-[var(--color-bg-base)]">
              {dueCount > 99 ? '99+' : dueCount}
            </span>
          )}
        </button>
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-hover)] active:scale-95 rounded-md transition-all"
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Command Palette Overlay */}
      <AnimatePresence>
        {paletteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/24 backdrop-blur-[2px]"
            onMouseDown={closePalette}
          >
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.985 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="w-full max-w-xl mx-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] shadow-2xl shadow-black/40 ring-1 ring-white/5 overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-4 border-b border-[var(--color-border-subtle)]">
                <Command size={16} className="text-[var(--color-text-muted)]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={onInputKeyDown}
                  placeholder="搜索页面、课程、练习或知识库..."
                  className="flex-1 bg-transparent py-3 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
                  Esc
                </kbd>
              </div>
              <ul className="max-h-72 overflow-y-auto py-2">
                {filteredItems.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-[var(--color-text-muted)]">无匹配结果</li>
                ) : (
                  filteredItems.map((item, index) => {
                    const group = item.badge ?? KIND_LABELS[item.kind]
                    const prevGroup =
                      index > 0
                        ? (filteredItems[index - 1].badge ??
                          KIND_LABELS[filteredItems[index - 1].kind])
                        : null
                    return (
                      <React.Fragment key={item.key}>
                        {group !== prevGroup && (
                          <li className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            {group}
                          </li>
                        )}
                        <li>
                          <button
                            onClick={() => runCommand(item)}
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                              'w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                              index === activeIndex
                                ? 'bg-[var(--color-bg-hover)] text-white'
                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{item.label}</span>
                              {item.sublabel && (
                                <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                                  {item.sublabel}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                              {KIND_LABELS[item.kind]}
                            </span>
                          </button>
                        </li>
                      </React.Fragment>
                    )
                  })
                )}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
