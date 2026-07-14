import { useState } from 'react'
import { Eye, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  previewContext,
  getSendCategories,
  MEMORY_CATEGORY_LABELS,
  type Memory,
  type MemoryCategory,
} from '../services/memoryService'

function categoryLabel(category: string): string {
  return MEMORY_CATEGORY_LABELS[category as MemoryCategory] ?? category
}

/**
 * 发送前预览：展开后调用 chat-context-preview，显示本轮“会随消息发送给 AI”的记忆。
 * 完全只读、无副作用，帮助用户在发送前确认隐私边界（旧审计 P1#3）。
 */
export function SendPreview({ query, includeMemory }: { query: string; includeMemory: boolean }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [memories, setMemories] = useState<Memory[]>([])
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const categories = await getSendCategories()
      const res = await previewContext(query.trim(), includeMemory, categories)
      setMemories(res.memories)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
      >
        <Eye size={12} /> 预览将发送的记忆
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-2.5 text-xs">
          {loading ? (
            <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <Loader2 size={12} className="animate-spin" /> 加载中…
            </span>
          ) : error ? (
            <span className="text-rose-300">{error}</span>
          ) : !includeMemory ? (
            <span className="text-[var(--color-text-muted)]">
              本轮已关闭记忆，不会发送任何记忆。
            </span>
          ) : memories.length === 0 ? (
            <span className="text-[var(--color-text-muted)]">
              本轮不会附带记忆（无匹配或相关类别已在设置中关闭）。
            </span>
          ) : (
            <ul className="space-y-1.5">
              {memories.map((m) => (
                <li key={m.id} className="flex items-start gap-1.5">
                  <span className="mt-px shrink-0 rounded bg-white/5 px-1 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                    {categoryLabel(m.category)}
                  </span>
                  <span className="text-[var(--color-text-primary)] break-words">{m.content}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
