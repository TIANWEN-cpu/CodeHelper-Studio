/**
 * GlobalSearch — Ctrl+Shift+F global search panel.
 *
 * Search across:
 * - Problems by title/tag/difficulty
 * - Knowledge base documents
 * - Current editor content
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, X, BookOpen, Library, Code, Loader2 } from 'lucide-react'
import { useProblemStore } from '../../stores/problemStore'
import { useEditorStore } from '../../stores/editorStore'
import { useAppStore } from '../../stores/appStore'
import { typedInvoke } from '../../api/ipc'
import type { SearchResult } from '../../types/knowledge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResultSource = 'problem' | 'knowledge' | 'editor'

interface UnifiedResult {
  id: string
  source: ResultSource
  title: string
  preview: string
  meta?: string
}

const SOURCE_META: Record<ResultSource, { label: string; color: string }> = {
  problem: { label: '题目', color: 'var(--theme-accent)' },
  knowledge: { label: '知识库', color: 'var(--theme-info)' },
  editor: { label: '编辑器', color: 'var(--theme-warning)' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ResultSource | 'all'>('all')
  const [knowledgeResults, setKnowledgeResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const problems = useProblemStore((s) => s.problems)
  const tabs = useEditorStore((s) => s.tabs)
  const setActiveModule = useAppStore((s) => s.setActiveModule)
  const setActiveProblem = useProblemStore((s) => s.setActiveProblem)

  // Listen for open events
  useEffect(() => {
    const openHandler = () => {
      setOpen(true)
      setQuery('')
      setActiveFilter('all')
      setKnowledgeResults([])
    }
    window.addEventListener('codehelper:global-search', openHandler)
    return () => window.removeEventListener('codehelper:global-search', openHandler)
  }, [])

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Search problems (local filter)
  const problemResults = useMemo<UnifiedResult[]>(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return problems
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.tags.toLowerCase().includes(q) ||
          p.difficulty.toLowerCase().includes(q),
      )
      .slice(0, 10)
      .map((p) => ({
        id: `problem-${p.id}`,
        source: 'problem' as const,
        title: p.title,
        preview: `${p.difficulty} · ${p.tags || '无标签'}`,
        meta: p.source ?? undefined,
      }))
  }, [query, problems])

  // Search editor content
  const editorResults = useMemo<UnifiedResult[]>(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return tabs
      .filter(
        (tab) => tab.content.toLowerCase().includes(q) || tab.filename.toLowerCase().includes(q),
      )
      .map((tab) => {
        const lines = tab.content.split('\n')
        const matchLine = lines.findIndex((l) => l.toLowerCase().includes(q))
        const preview = matchLine >= 0 ? lines[matchLine].trim().slice(0, 80) : ''
        return {
          id: `editor-${tab.id}`,
          source: 'editor' as const,
          title: tab.filename,
          preview: preview || '(文件名匹配)',
          meta: `第 ${matchLine + 1} 行`,
        }
      })
  }, [query, tabs])

  // Search knowledge base (async)
  useEffect(() => {
    if (!query.trim() || activeFilter === 'problem' || activeFilter === 'editor') {
      setKnowledgeResults([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await typedInvoke('knowledge-search', query)
        if (!cancelled) {
          setKnowledgeResults(results)
        }
      } catch (err) {
        // Knowledge search is non-critical; log but don't show to user
        console.debug('[GlobalSearch] Knowledge search failed:', err)
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, activeFilter])

  const knowledgeUnified = useMemo<UnifiedResult[]>(
    () =>
      knowledgeResults.map((r, i) => ({
        id: `knowledge-${i}`,
        source: 'knowledge' as const,
        title: r.filename,
        preview: r.content.slice(0, 120),
        meta: `相关度 ${(r.score * 100).toFixed(0)}%`,
      })),
    [knowledgeResults],
  )

  // Merge all results
  const allResults = useMemo(() => {
    const merged: UnifiedResult[] = []
    if (activeFilter === 'all' || activeFilter === 'problem') merged.push(...problemResults)
    if (activeFilter === 'all' || activeFilter === 'knowledge') merged.push(...knowledgeUnified)
    if (activeFilter === 'all' || activeFilter === 'editor') merged.push(...editorResults)
    return merged
  }, [activeFilter, problemResults, knowledgeUnified, editorResults])

  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [allResults.length])

  const handleResultClick = useCallback(
    (result: UnifiedResult) => {
      setOpen(false)
      if (result.source === 'problem') {
        const pid = parseInt(result.id.replace('problem-', ''), 10)
        if (!isNaN(pid)) {
          setActiveModule('problems')
          void setActiveProblem(pid)
        }
      } else if (result.source === 'editor') {
        setActiveModule('editor')
        const tabId = result.id.replace('editor-', '')
        useEditorStore.getState().setActiveTab(tabId)
      } else {
        setActiveModule('knowledge')
      }
    },
    [setActiveModule, setActiveProblem],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, allResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && allResults[selectedIndex]) {
        handleResultClick(allResults[selectedIndex])
      }
    },
    [allResults, selectedIndex, handleResultClick],
  )

  if (!open) return null

  const filters: Array<{ key: ResultSource | 'all'; label: string }> = [
    { key: 'all', label: '全部' },
    { key: 'problem', label: '题目' },
    { key: 'knowledge', label: '知识库' },
    { key: 'editor', label: '编辑器' },
  ]

  return (
    <div
      className="fixed inset-0 z-[9980] flex items-start justify-center pt-[10vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="全局搜索"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="ui-card relative z-10 w-full max-w-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b border-[var(--theme-border)] px-4 py-3">
          <Search
            size={16}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索题目、知识库、编辑器内容..."
            aria-label="搜索"
            className="flex-1 bg-transparent text-sm text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-muted)]"
          />
          {searching && (
            <Loader2 size={14} className="animate-spin text-[var(--theme-text-muted)]" />
          )}
          <button
            onClick={() => setOpen(false)}
            className="shrink-0 rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            aria-label="关闭搜索"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-[var(--theme-border)] px-4 py-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              aria-pressed={activeFilter === f.key}
              className={`rounded-md px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] ${
                activeFilter === f.key
                  ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto py-2">
          {!query.trim() ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--theme-text-muted)]">
              输入关键词开始搜索
            </div>
          ) : allResults.length === 0 && !searching ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--theme-text-muted)]">
              没有找到匹配结果
            </div>
          ) : (
            <>
              {/* Group by source */}
              {(['problem', 'knowledge', 'editor'] as ResultSource[]).map((source) => {
                const items = allResults.filter((r) => r.source === source)
                if (items.length === 0) return null
                const meta = SOURCE_META[source]
                const Icon =
                  source === 'problem' ? BookOpen : source === 'knowledge' ? Library : Code
                return (
                  <div key={source} className="mb-2">
                    <div className="flex items-center gap-2 px-4 py-1.5">
                      <Icon size={12} style={{ color: meta.color }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-muted)]">
                        {meta.label} ({items.length})
                      </span>
                    </div>
                    {items.map((item) => {
                      const idx = allResults.indexOf(item)
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleResultClick(item)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors ${
                            idx === selectedIndex
                              ? 'bg-[var(--theme-accent-soft)]'
                              : 'hover:bg-[var(--theme-bg-hover)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-[var(--theme-text-primary)]">
                              {item.title}
                            </span>
                            {item.meta && (
                              <span className="text-[10px] text-[var(--theme-text-muted)]">
                                {item.meta}
                              </span>
                            )}
                          </div>
                          {item.preview && (
                            <span className="truncate text-xs text-[var(--theme-text-muted)]">
                              {item.preview}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-[var(--theme-border)] px-4 py-2 text-[10px] text-[var(--theme-text-muted)]">
          <span>
            <kbd className="font-mono">↑↓</kbd> 导航
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> 打开
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  )
}
