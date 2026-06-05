import React, { useState } from 'react'
import {
  Search,
  ChevronDown,
  ChevronLeft,
  FileCode2,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  Layers3,
  Target,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkspaceView } from './WorkspaceView' // Reusing partially
import { motion, AnimatePresence } from 'motion/react'
import { usePracticeData } from '@/hooks/usePracticeData'

// ---- Difficulty helpers ----

const difficultyColor: Record<string, string> = {
  简单: '#10B981',
  中等: '#F59E0B',
  困难: '#EF4444',
  基础: '#10B981',
  进阶: '#F59E0B',
  综合: '#8B5CF6',
  easy: '#10B981',
  medium: '#F59E0B',
  hard: '#EF4444',
}

function getDifficultyLabel(d: string): string {
  const lower = d.toLowerCase()
  if (lower === 'easy' || lower === '简单') return '简单'
  if (lower === 'medium' || lower === '中等') return '中等'
  if (lower === 'hard' || lower === '困难') return '困难'
  if (lower === '基础') return '基础'
  if (lower === '进阶') return '进阶'
  if (lower === '综合') return '综合'
  return d
}

// ---- Difficulty filter button ----

function DiffBtn({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
        active
          ? 'border-current bg-current/10'
          : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-border-hover)] bg-transparent',
      )}
      style={active ? { color } : undefined}
    >
      {label}
    </button>
  )
}

// ---- Main component ----

export function PracticeView() {
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string | undefined>(undefined)
  const [trackFilter, setTrackFilter] = useState<string | undefined>(undefined)
  const [detailTab, setDetailTab] = useState<'desc' | 'hints'>('desc')

  const {
    exercises,
    loading,
    error,
    currentExercise,
    loadingExercise,
    selectExercise,
    code,
    setCode,
    language,
    setLanguage,
    submitResult,
    submitting,
    submitCode,
    draftSaving,
  } = usePracticeData()

  // When exercise is selected, switch to detail view
  const handleSelectExercise = async (id: string) => {
    await selectExercise(id)
    setDetailTab('desc')
    setViewMode('detail')
  }

  // Filter exercises by search and difficulty
  const trackOptions = Array.from(
    new Set(exercises.map((ex) => ex.track_id).filter(Boolean)),
  ).sort()
  const difficultyOptions = Array.from(
    new Set(exercises.map((ex) => ex.difficulty).filter(Boolean)),
  ).sort((a, b) => {
    const order = ['基础', '简单', 'easy', '进阶', '中等', 'medium', '综合', '困难', 'hard']
    return order.indexOf(a) - order.indexOf(b)
  })
  const aiTutorExerciseCount = exercises.filter((ex) => ex.track_id === 'ai-tutor').length
  const filteredExercises = exercises.filter((ex) => {
    const query = searchQuery.toLowerCase()
    const matchesSearch =
      ex.title.toLowerCase().includes(query) ||
      ex.prompt?.toLowerCase().includes(query) ||
      ex.track_id.toLowerCase().includes(query)
    const matchesDifficulty =
      !difficultyFilter || ex.difficulty.toLowerCase() === difficultyFilter.toLowerCase()
    const matchesTrack = !trackFilter || ex.track_id === trackFilter
    return matchesSearch && matchesDifficulty && matchesTrack
  })

  return (
    <div className="flex h-full bg-[var(--color-bg-base)] w-full relative">
      {/* Practice Description Panel */}
      <AnimatePresence initial={false}>
        {!panelCollapsed && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 500, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="shrink-0 overflow-hidden z-10 bg-[var(--color-bg-base)] border-r border-[var(--color-border-subtle)]"
          >
            <div className="flex flex-col h-full w-[500px] overflow-y-auto custom-scrollbar">
              {viewMode === 'list' ? (
                /* ---------- Exercise List View ---------- */
                <div className="flex flex-col h-full">
                  {/* Search & Filter Header */}
                  <div className="p-4 border-b border-[var(--color-border-subtle)] space-y-3 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg-card)_92%,transparent),var(--color-bg-base))]">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white tracking-wide">练习题库</h3>
                      {loading && (
                        <Loader2
                          size={14}
                          className="text-[var(--color-text-muted)] animate-spin"
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                          <Target size={11} />
                          总题数
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {exercises.length}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                          <FileCode2 size={11} />
                          当前
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {filteredExercises.length}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
                          <Layers3 size={11} />
                          路线
                        </div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {trackOptions.length}
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
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索题目..."
                        className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-lg text-sm text-white pl-9 pr-3 py-2 outline-none focus:border-[var(--color-accent-primary)] placeholder:text-[var(--color-text-muted)] transition-colors"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DiffBtn
                        label="全部"
                        active={!difficultyFilter}
                        color="#6366F1"
                        onClick={() => setDifficultyFilter(undefined)}
                      />
                      {difficultyOptions.slice(0, 6).map((difficulty) => (
                        <DiffBtn
                          key={difficulty}
                          label={getDifficultyLabel(difficulty)}
                          active={difficultyFilter === difficulty}
                          color={difficultyColor[difficulty] ?? '#6366F1'}
                          onClick={() => setDifficultyFilter(difficulty)}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {trackOptions.includes('ai-tutor') && (
                        <button
                          type="button"
                          data-ai-tutor-practice-filter
                          onClick={() =>
                            setTrackFilter(trackFilter === 'ai-tutor' ? undefined : 'ai-tutor')
                          }
                          className={cn(
                            'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                            trackFilter === 'ai-tutor'
                              ? 'border-[var(--color-accent-purple)] bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] text-white shadow-lg shadow-[var(--color-accent-purple)]/20'
                              : 'border-[var(--color-accent-purple)]/40 bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/16',
                          )}
                          aria-pressed={trackFilter === 'ai-tutor'}
                          title="AI Tutor exercises"
                        >
                          <Sparkles size={13} />
                          AI Tutor
                          <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">
                            {aiTutorExerciseCount}
                          </span>
                        </button>
                      )}
                      <select
                        value={trackFilter ?? ''}
                        onChange={(event) => setTrackFilter(event.target.value || undefined)}
                        className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-[var(--color-accent-primary)]"
                      >
                        <option value="">全部路线</option>
                        {trackOptions.map((track) => (
                          <option key={track} value={track}>
                            {track}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Exercise List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {error && (
                      <div className="mx-2 p-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg text-xs text-[#EF4444]">
                        {error}
                      </div>
                    )}
                    {!loading && filteredExercises.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-48 text-[var(--color-text-muted)] text-xs">
                        <FileCode2 size={32} className="mb-2 opacity-40" />
                        <span>暂无匹配题目</span>
                      </div>
                    )}
                    <AnimatePresence initial={false}>
                      {filteredExercises.map((ex, index) => {
                        const color = difficultyColor[ex.difficulty] ?? '#6366F1'
                        return (
                          <motion.button
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.015 }}
                            key={ex.id}
                            onClick={() => handleSelectExercise(ex.id)}
                            className="w-full text-left p-3 rounded-lg border border-transparent hover:border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white font-medium truncate group-hover:text-[#A5B4FC] transition-colors">
                                  {ex.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span
                                    className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                                    style={{
                                      color,
                                      borderColor: `${color}33`,
                                      backgroundColor: `${color}15`,
                                    }}
                                  >
                                    {getDifficultyLabel(ex.difficulty)}
                                  </span>
                                  {ex.track_id && (
                                    <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-card)] px-1.5 py-0.5 rounded">
                                      {ex.track_id}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                                  {ex.prompt}
                                </p>
                              </div>
                              <ChevronDown
                                size={14}
                                className="text-[var(--color-text-muted)] -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity"
                              />
                            </div>
                          </motion.button>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                /* ---------- Exercise Detail View ---------- */
                <div className="flex flex-col h-full">
                  {/* Detail header with back button */}
                  <motion.div
                    key={currentExercise?.id ?? 'empty-exercise'}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                    className="p-6 relative"
                  >
                    <button
                      onClick={() => setPanelCollapsed(true)}
                      className="absolute right-4 top-4 p-1.5 hover:bg-[var(--color-bg-hover)] rounded-md text-[var(--color-text-muted)] hover:text-white transition-colors"
                      title="收起描述面板"
                    >
                      <PanelLeftClose size={16} />
                    </button>

                    <button
                      onClick={() => setViewMode('list')}
                      className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-white transition-colors mb-3 -ml-1"
                    >
                      <ChevronLeft size={14} />
                      返回题库
                    </button>

                    {loadingExercise ? (
                      <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-sm py-8">
                        <Loader2 size={16} className="animate-spin" />
                        加载中...
                      </div>
                    ) : currentExercise ? (
                      <>
                        <div className="flex flex-col gap-1 mb-4 pr-8">
                          <h2 className="text-xl font-bold text-white tracking-wide">
                            {currentExercise.title}
                          </h2>
                          <div className="flex items-center gap-3 text-xs mt-2">
                            <span
                              className="px-2 py-1 rounded border font-medium"
                              style={{
                                color: difficultyColor[currentExercise.difficulty] ?? '#10B981',
                                borderColor: `${difficultyColor[currentExercise.difficulty] ?? '#10B981'}33`,
                                backgroundColor: `${difficultyColor[currentExercise.difficulty] ?? '#10B981'}15`,
                              }}
                            >
                              {getDifficultyLabel(currentExercise.difficulty)}
                            </span>
                          </div>
                        </div>

                        {/* Tab bar */}
                        <div className="flex items-center gap-4 border-b border-[var(--color-border-subtle)] pb-2 mb-6">
                          <button
                            onClick={() => setDetailTab('desc')}
                            className={cn(
                              'text-sm font-medium pb-2 -mb-[9px] transition-colors',
                              detailTab === 'desc'
                                ? 'text-white border-b-2 border-white'
                                : 'text-[var(--color-text-muted)] hover:text-white',
                            )}
                          >
                            题目描述
                          </button>
                          {currentExercise.hints && currentExercise.hints.length > 0 && (
                            <button
                              onClick={() => setDetailTab('hints')}
                              className={cn(
                                'text-sm font-medium pb-2 -mb-[9px] transition-colors',
                                detailTab === 'hints'
                                  ? 'text-white border-b-2 border-white'
                                  : 'text-[var(--color-text-muted)] hover:text-white',
                              )}
                            >
                              提示 ({currentExercise.hints.length})
                            </button>
                          )}
                        </div>

                        {/* Tab content: real description / hints switch */}
                        {detailTab === 'desc' || !currentExercise.hints?.length ? (
                          <div className="prose prose-invert prose-sm text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed">
                            {currentExercise.prompt}
                          </div>
                        ) : (
                          <ul className="text-sm space-y-2 text-[var(--color-text-secondary)] marker:text-[var(--color-border-subtle)] pl-4 list-disc leading-relaxed">
                            {currentExercise.hints.map((hint, i) => (
                              <li key={i}>{hint}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-[var(--color-text-muted)] py-8">
                        请从题库中选择一道题目
                      </div>
                    )}
                  </motion.div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed panel icon */}
      {panelCollapsed && (
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-[var(--color-bg-panel)] border-r border-[var(--color-border-subtle)] flex flex-col items-center py-4 z-20">
          <button
            onClick={() => setPanelCollapsed(false)}
            className="p-2 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors"
            title="展开题目描述"
          >
            <PanelLeft size={16} />
          </button>
        </div>
      )}

      {/* Editor Area (reuses WorkspaceView) */}
      <div
        className={cn(
          'flex-1 overflow-hidden flex flex-col min-w-0 transition-all duration-300',
          panelCollapsed ? 'ml-12' : '',
        )}
      >
        <WorkspaceView
          hideExplorer={true}
          exerciseContext={
            currentExercise
              ? {
                  id: currentExercise.id,
                  title: currentExercise.title,
                  code,
                  setCode,
                  language,
                  setLanguage,
                  submitResult,
                  isSubmitting: submitting,
                  submitCode,
                  draftSaving,
                }
              : null
          }
        />
      </div>
    </div>
  )
}
