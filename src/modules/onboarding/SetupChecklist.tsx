/**
 * SetupChecklist - Checklist widget showing setup progress.
 *
 * Items:
 *  - API configured
 *  - First problem solved
 *  - First AI chat
 *  - Knowledge imported
 *
 * Auto-dismisses when all items are complete.
 * Shows as a floating card in the bottom-right corner.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Check,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Key,
  BookOpen,
  Bot,
  Library,
  Loader2,
} from 'lucide-react'
import { useOnboardingStore, type ChecklistKey } from './onboardingStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChecklistItemDef {
  key: ChecklistKey
  label: string
  description: string
  icon: typeof Key
}

// ---------------------------------------------------------------------------
// Item definitions
// ---------------------------------------------------------------------------

const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    key: 'api-configured',
    label: '配置 AI 服务',
    description: '在设置中配置 API 密钥以启用 AI 功能',
    icon: Key,
  },
  {
    key: 'first-problem-solved',
    label: '完成第一道题目',
    description: '在刷题模块中选择并完成一道编程题',
    icon: BookOpen,
  },
  {
    key: 'first-ai-chat',
    label: '发起一次 AI 对话',
    description: '在 AI 助手模块中与 AI 进行一次对话',
    icon: Bot,
  },
  {
    key: 'knowledge-imported',
    label: '导入知识资料',
    description: '在知识库中上传一份学习笔记或资料',
    icon: Library,
  },
]

// ---------------------------------------------------------------------------
// Single checklist item
// ---------------------------------------------------------------------------

function ChecklistItemRow({
  item,
  completed,
  animating,
}: {
  item: ChecklistItemDef
  completed: boolean
  animating: boolean
}) {
  const Icon = item.icon

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 ${
        completed ? 'bg-emerald-500/5 opacity-70' : 'bg-[var(--theme-bg-secondary)]'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {completed ? (
          <div
            className={`w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center ${
              animating ? 'animate-bounce' : ''
            }`}
          >
            <Check size={12} className="text-emerald-400" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-[var(--theme-border)] flex items-center justify-center">
            <Circle size={8} className="text-[var(--theme-text-muted)]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium ${
            completed
              ? 'text-[var(--theme-text-muted)] line-through'
              : 'text-[var(--theme-text-primary)]'
          }`}
        >
          {item.label}
        </div>
        <div className="text-xs text-[var(--theme-text-muted)] mt-0.5 leading-snug">
          {item.description}
        </div>
      </div>
      <div className="shrink-0 mt-0.5">
        <Icon
          size={16}
          className={completed ? 'text-emerald-400/50' : 'text-[var(--theme-text-muted)]'}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--theme-border)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--theme-accent)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[var(--theme-text-muted)] tabular-nums shrink-0">
        {completed}/{total}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main SetupChecklist component
// ---------------------------------------------------------------------------

export function SetupChecklist() {
  const { checklist, markChecklistItem } = useOnboardingStore()
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [animatingKey, setAnimatingKey] = useState<ChecklistKey | null>(null)

  // Count completed items
  const completedCount = CHECKLIST_ITEMS.filter((item) => checklist[item.key]).length
  const allComplete = completedCount === CHECKLIST_ITEMS.length

  // Auto-dismiss when all complete (with a small delay for the animation)
  useEffect(() => {
    if (!allComplete) return
    const timer = setTimeout(() => setDismissed(true), 2000)
    return () => clearTimeout(timer)
  }, [allComplete])

  // Listen for external events to auto-mark checklist items.
  // This is a lightweight pattern: other stores/components can call
  // markChecklistItem directly, or we can listen to eventBus events.
  useEffect(() => {
    // Check if API is already configured on mount
    const checkApiConfig = async () => {
      try {
        const { typedInvoke } = await import('../../api/ipc')
        const configs = await typedInvoke('db-get-ai-configs')
        if (Array.isArray(configs) && configs.length > 0 && !checklist['api-configured']) {
          await markChecklistItem('api-configured')
        }
      } catch {
        // ignore - config check is best-effort
      }
    }
    void checkApiConfig()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMark = useCallback(
    async (key: ChecklistKey) => {
      if (checklist[key]) return
      setAnimatingKey(key)
      await markChecklistItem(key)
      setTimeout(() => setAnimatingKey(null), 600)
    },
    [checklist, markChecklistItem],
  )

  // Don't render if dismissed
  if (dismissed) return null

  return (
    <div
      className={`fixed bottom-16 right-4 z-[8000] w-72 bg-[var(--theme-bg-primary)] rounded-xl shadow-xl border border-[var(--theme-border)] overflow-hidden transition-all duration-300 ${
        collapsed ? 'h-auto' : ''
      }`}
      role="complementary"
      aria-label="设置清单"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border)]">
        <div className="flex items-center gap-2">
          {allComplete ? (
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check size={12} className="text-emerald-400" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-[var(--theme-accent)]/10 flex items-center justify-center">
              <Loader2 size={12} className="text-[var(--theme-accent)] animate-spin" />
            </div>
          )}
          <span className="text-sm font-semibold text-[var(--theme-text-primary)]">
            {allComplete ? '设置完成!' : '初始设置'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] transition-colors cursor-pointer"
            aria-label={collapsed ? '展开清单' : '折叠清单'}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] transition-colors cursor-pointer"
            aria-label="关闭清单"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar (always visible) */}
      <div className="px-4 py-2">
        <ProgressBar completed={completedCount} total={CHECKLIST_ITEMS.length} />
      </div>

      {/* Items (collapsible) */}
      {!collapsed && (
        <div className="px-3 pb-3 flex flex-col gap-1.5">
          {CHECKLIST_ITEMS.map((item) => (
            <ChecklistItemRow
              key={item.key}
              item={item}
              completed={checklist[item.key]}
              animating={animatingKey === item.key}
            />
          ))}
        </div>
      )}

      {/* All complete message */}
      {allComplete && !collapsed && (
        <div className="px-4 pb-3">
          <div className="text-xs text-emerald-400 text-center py-1.5 bg-emerald-500/5 rounded-lg">
            恭喜! 你已完成所有初始设置，开始你的编程学习之旅吧!
          </div>
        </div>
      )}
    </div>
  )
}
