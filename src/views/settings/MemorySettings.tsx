import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, Star, Loader2, Sparkles, Plus, Pin, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui'
import {
  listMemories,
  saveMemory,
  deleteMemory,
  batchMemories,
  getSendCategories,
  setSendCategories,
  getLlmExtractEnabled,
  setLlmExtractEnabled,
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  type Memory,
  type MemoryCategory,
  type BatchAction,
} from '../../services/memoryService'

const CATEGORY_STYLES: Record<MemoryCategory, string> = {
  fact: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  preference: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  identity: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  tech: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  constraint: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  goal: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
}

const CARD_CLS =
  'bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm'
const INPUT_CLS =
  'w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-purple)] transition-colors'

function categoryLabel(category: string): string {
  return MEMORY_CATEGORY_LABELS[category as MemoryCategory] ?? category
}

/**
 * 记忆管理：浏览/筛选/批量操作长期记忆，配置“按类别发送给 AI”的隐私开关，
 * 以及是否启用 mem0 式 LLM 抽取。全部接入 chat-memories-* / chat-memory-extract IPC。
 */
export function MemorySettings() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<MemoryCategory | 'all'>('all')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sendCategories, setSendCats] = useState<MemoryCategory[]>([...MEMORY_CATEGORIES])
  const [llmExtract, setLlmExtract] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[] | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setMemories(await listMemories())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    getSendCategories()
      .then(setSendCats)
      .catch(() => {})
    getLlmExtractEnabled()
      .then(setLlmExtract)
      .catch(() => {})
  }, [reload])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return memories.filter(
      (m) =>
        (filter === 'all' || m.category === filter) && (!q || m.content.toLowerCase().includes(q)),
    )
  }, [memories, filter, search])

  const toggleSendCategory = async (category: MemoryCategory) => {
    const next = sendCategories.includes(category)
      ? sendCategories.filter((c) => c !== category)
      : [...sendCategories, category]
    setSendCats(next)
    await setSendCategories(next).catch(() => {})
  }

  const toggleLlm = async () => {
    const next = !llmExtract
    setLlmExtract(next)
    await setLlmExtractEnabled(next).catch(() => {})
  }

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const executeBatch = async (action: BatchAction, ids: number[]) => {
    setBusy(true)
    try {
      await batchMemories(ids, action)
      setSelected(new Set())
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runBatch = async (action: BatchAction) => {
    if (selected.size === 0) return
    const ids = [...selected]
    if (action === 'delete') {
      setPendingDeleteIds(ids)
      return
    }
    await executeBatch(action, ids)
  }

  const addMemory = async () => {
    const content = newContent.trim()
    if (!content) return
    setBusy(true)
    try {
      await saveMemory({ content, category: newCategory, source: 'manual' })
      setNewContent('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const removeOne = async (id: number) => {
    setBusy(true)
    try {
      await deleteMemory(id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* 隐私：按类别发送开关 */}
      <div className={CARD_CLS}>
        <h3 className="font-semibold text-white text-[15px] mb-1">发送给 AI 的记忆类别</h3>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          仅勾选的类别会随对话发送给 AI Provider。取消勾选可避免把对应记忆发送到第三方。
        </p>
        <div className="flex flex-wrap gap-2">
          {MEMORY_CATEGORIES.map((category) => {
            const active = sendCategories.includes(category)
            return (
              <button
                key={category}
                onClick={() => toggleSendCategory(category)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  active
                    ? CATEGORY_STYLES[category]
                    : 'bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-subtle)]',
                )}
              >
                {categoryLabel(category)}
                {active ? ' ✓' : ''}
              </button>
            )
          })}
        </div>
      </div>

      {/* LLM 抽取开关 */}
      <div className={cn(CARD_CLS, 'flex items-start justify-between gap-4')}>
        <div>
          <h3 className="font-semibold text-white text-[15px] mb-1 flex items-center gap-2">
            <Sparkles size={15} className="text-[var(--color-accent-purple)]" /> 智能记忆抽取 (LLM)
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] max-w-xl">
            开启后，每轮对话会额外调用一次 AI 智能抽取长期记忆（比关键词规则更准，但每条消息会多一次
            API 调用，产生少量额外费用）。关闭则使用本地规则抽取，零成本。
          </p>
        </div>
        <button
          onClick={toggleLlm}
          className={cn(
            'shrink-0 relative w-11 h-6 rounded-full transition-colors',
            llmExtract
              ? 'bg-[var(--color-accent-secondary-solid)]'
              : 'bg-[var(--color-border-subtle)]',
          )}
          aria-pressed={llmExtract}
          aria-label="智能记忆抽取开关"
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
              llmExtract && 'translate-x-5',
            )}
          />
        </button>
      </div>

      {/* 手动添加 */}
      <div className={CARD_CLS}>
        <h3 className="font-semibold text-white text-[15px] mb-3">添加记忆</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addMemory()
            }}
            placeholder="例如：我偏好用 TypeScript / 我的项目用 React"
            className={INPUT_CLS}
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
            className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-2 py-2 text-sm text-white"
          >
            {MEMORY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </select>
          <button
            onClick={addMemory}
            disabled={busy || !newContent.trim()}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent-secondary-solid)] px-3 py-2 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-50"
          >
            <Plus size={15} /> 添加
          </button>
        </div>
      </div>

      {/* 列表 + 筛选 + 批量 */}
      <div className={CARD_CLS}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-semibold text-white text-[15px]">
            记忆库{' '}
            <span className="text-[var(--color-text-muted)] font-normal">({memories.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索…"
              className="w-40 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-2 py-1.5 text-xs text-white placeholder-[var(--color-text-muted)]"
            />
            <button
              onClick={reload}
              className="text-[var(--color-text-muted)] hover:text-white transition-colors"
              aria-label="刷新"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* 类别筛选 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['all', ...MEMORY_CATEGORIES] as const).map((category) => (
            <button
              key={category}
              onClick={() => setFilter(category)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs border transition-colors',
                filter === category
                  ? 'bg-[var(--color-accent-purple)]/20 text-white border-[var(--color-accent-purple)]/40'
                  : 'text-[var(--color-text-muted)] border-[var(--color-border-subtle)]',
              )}
            >
              {category === 'all' ? '全部' : categoryLabel(category)}
            </button>
          ))}
        </div>

        {/* 批量操作条 */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 mb-3 rounded-lg bg-[var(--color-bg-panel)] px-3 py-2 text-xs flex-wrap">
            <span className="text-[var(--color-text-secondary)]">已选 {selected.size} 条</span>
            <button
              onClick={() => runBatch('pin')}
              disabled={busy}
              className="text-amber-300 hover:underline"
            >
              置顶
            </button>
            <button
              onClick={() => runBatch('unpin')}
              disabled={busy}
              className="text-[var(--color-text-secondary)] hover:underline"
            >
              取消置顶
            </button>
            <button
              onClick={() => runBatch('enable')}
              disabled={busy}
              className="text-emerald-300 hover:underline"
            >
              启用
            </button>
            <button
              onClick={() => runBatch('disable')}
              disabled={busy}
              className="text-[var(--color-text-secondary)] hover:underline"
            >
              停用
            </button>
            <button
              onClick={() => runBatch('delete')}
              disabled={busy}
              className="text-rose-300 hover:underline"
            >
              删除
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-[var(--color-text-muted)] hover:underline"
            >
              清除选择
            </button>
          </div>
        )}

        {/* 列表 */}
        {visible.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">
            {loading
              ? '加载中…'
              : memories.length === 0
                ? '还没有记忆。对话中说“记住…”或在上面手动添加。'
                : '没有匹配的记忆。'}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((m) => {
              const isSelected = selected.has(m.id)
              const disabled = m.enabled === 0
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    isSelected
                      ? 'border-[var(--color-accent-purple)]/50 bg-[var(--color-accent-purple)]/5'
                      : 'border-[var(--color-border-subtle)]',
                    disabled && 'opacity-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(m.id)}
                    className="mt-1 accent-[var(--color-accent-purple)]"
                    aria-label="选择此记忆"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          CATEGORY_STYLES[m.category as MemoryCategory] ??
                            'bg-white/5 text-[var(--color-text-muted)] border-[var(--color-border-subtle)]',
                        )}
                      >
                        {categoryLabel(m.category)}
                      </span>
                      {m.pinned === 1 && <Pin size={11} className="text-amber-300" />}
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        置信度 {Math.round((m.confidence ?? 1) * 100)}%
                      </span>
                      {m.source === 'chat-llm' && (
                        <span className="text-[10px] text-[var(--color-accent-purple)]">
                          AI 抽取
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-text-primary)] break-words">
                      {m.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => batchMemories([m.id], m.pinned ? 'unpin' : 'pin').then(reload)}
                      className="text-[var(--color-text-muted)] hover:text-amber-300 transition-colors"
                      aria-label={m.pinned ? '取消置顶' : '置顶'}
                    >
                      <Star size={14} className={m.pinned ? 'fill-amber-300 text-amber-300' : ''} />
                    </button>
                    <button
                      onClick={() => removeOne(m.id)}
                      disabled={busy}
                      className="text-[var(--color-text-muted)] hover:text-rose-300 transition-colors"
                      aria-label="删除"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={pendingDeleteIds !== null}
        title="删除记忆"
        description={
          pendingDeleteIds ? `确定删除选中的 ${pendingDeleteIds.length} 条记忆？` : undefined
        }
        confirmText="删除"
        danger
        onConfirm={async () => {
          const ids = pendingDeleteIds
          setPendingDeleteIds(null)
          if (ids) await executeBatch('delete', ids)
        }}
        onCancel={() => setPendingDeleteIds(null)}
      />
    </div>
  )
}
