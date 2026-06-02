import { useState, useEffect } from 'react'
import { Sparkles, X, ChevronRight, Tag } from 'lucide-react'

// ---------------------------------------------------------------------------
// Version & storage
// ---------------------------------------------------------------------------

const WHATS_NEW_VERSION_KEY = 'codehelper-whats-new-seen'
const CURRENT_VERSION = '1.1.0'

export function shouldShowWhatsNew(): boolean {
  try {
    const seen = localStorage.getItem(WHATS_NEW_VERSION_KEY)
    return seen !== CURRENT_VERSION
  } catch {
    return true
  }
}

function markWhatsNewSeen(): void {
  try {
    localStorage.setItem(WHATS_NEW_VERSION_KEY, CURRENT_VERSION)
  } catch {
    // Silently ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Changelog data
// ---------------------------------------------------------------------------

interface ChangelogEntry {
  version: string
  date: string
  highlights: ChangeItem[]
  improvements: ChangeItem[]
  bugFixes: ChangeItem[]
}

interface ChangeItem {
  text: string
  tag?: 'new' | 'improved' | 'fixed' | 'breaking'
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-05-15',
    highlights: [
      { text: '全局搜索 — 跨模块搜索题目、知识库和编辑器内容', tag: 'new' },
      { text: '命令面板 — Ctrl+Shift+P 快速访问所有功能', tag: 'new' },
      { text: '统计面板 — 学习进度可视化和目标设定', tag: 'new' },
      { text: '代码片段管理 — 自定义和插入代码模板', tag: 'new' },
      { text: '分屏编辑 — 并排查看和编辑代码', tag: 'new' },
      { text: '终端集成 — 内置终端面板', tag: 'new' },
    ],
    improvements: [
      { text: '编辑器性能优化 — Monaco Editor 懒加载和 Worker 优化', tag: 'improved' },
      { text: 'React 渲染优化 — 全面使用 memo/useMemo/useCallback', tag: 'improved' },
      { text: '状态管理优化 — 细粒度 selector 和浅比较', tag: 'improved' },
      { text: 'IPC 通信优化 — 请求去重和缓存机制', tag: 'improved' },
      { text: '数据库优化 — 索引、批量插入和统计缓存', tag: 'improved' },
      { text: '错误处理增强 — ErrorBoundary 和结构化错误处理', tag: 'improved' },
    ],
    bugFixes: [
      { text: '修复 SQL 引号解析问题', tag: 'fixed' },
      { text: '修复跨平台路径处理问题', tag: 'fixed' },
      { text: '修复代码执行安全沙箱问题', tag: 'fixed' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-01',
    highlights: [
      { text: 'CodeHelper 首次发布', tag: 'new' },
      { text: 'AI 对话 — 支持多种 AI 模型的编程助手', tag: 'new' },
      { text: '刷题系统 — 内置题库和代码执行环境', tag: 'new' },
      { text: '错题本 — 自动记录和复习做错的题目', tag: 'new' },
      { text: '知识库 — 文档管理和 RAG 增强问答', tag: 'new' },
    ],
    improvements: [],
    bugFixes: [],
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WhatsNew() {
  return (
    <div className="space-y-6">
      {CHANGELOG.map((entry) => (
        <ChangelogSection key={entry.version} entry={entry} />
      ))}
    </div>
  )
}

function ChangelogSection({ entry }: { entry: ChangelogEntry }) {
  const [expanded, setExpanded] = useState(entry === CHANGELOG[0])

  return (
    <div className="rounded-lg border border-[var(--theme-border)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--theme-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <Tag size={14} className="text-[var(--theme-accent)]" aria-hidden="true" />
          <span className="text-sm font-semibold text-[var(--theme-text-primary)]">
            v{entry.version}
          </span>
          <span className="text-xs text-[var(--theme-text-muted)]">{entry.date}</span>
          {entry === CHANGELOG[0] && (
            <span className="text-[10px] rounded bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] px-1.5 py-0.5 font-medium">
              最新
            </span>
          )}
        </div>
        <ChevronRight
          size={14}
          className={`text-[var(--theme-text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Highlights */}
          {entry.highlights.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-accent)] mb-1.5">
                新功能亮点
              </h4>
              <ul className="space-y-1">
                {entry.highlights.map((item, idx) => (
                  <ChangeItemRow key={idx} item={item} />
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {entry.improvements.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-1.5">
                改进优化
              </h4>
              <ul className="space-y-1">
                {entry.improvements.map((item, idx) => (
                  <ChangeItemRow key={idx} item={item} />
                ))}
              </ul>
            </div>
          )}

          {/* Bug fixes */}
          {entry.bugFixes.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-1.5">
                问题修复
              </h4>
              <ul className="space-y-1">
                {entry.bugFixes.map((item, idx) => (
                  <ChangeItemRow key={idx} item={item} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChangeItemRow({ item }: { item: ChangeItem }) {
  const tagColors: Record<string, string> = {
    new: 'bg-emerald-500/10 text-emerald-400',
    improved: 'bg-blue-500/10 text-blue-400',
    fixed: 'bg-amber-500/10 text-amber-400',
    breaking: 'bg-red-500/10 text-red-400',
  }

  const tagLabels: Record<string, string> = {
    new: '新',
    improved: '改进',
    fixed: '修复',
    breaking: '破坏性',
  }

  return (
    <li className="flex items-start gap-2 text-sm text-[var(--theme-text-secondary)]">
      <span
        className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--theme-accent)]/50"
        aria-hidden="true"
      />
      <span>{item.text}</span>
      {item.tag && (
        <span
          className={`shrink-0 text-[10px] rounded px-1.5 py-0.5 font-medium ${tagColors[item.tag] ?? ''}`}
        >
          {tagLabels[item.tag] ?? item.tag}
        </span>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Overlay (auto-show on version update)
// ---------------------------------------------------------------------------

interface WhatsNewOverlayProps {
  onClose: () => void
}

export function WhatsNewOverlay({ onClose }: WhatsNewOverlayProps) {
  // Mark as seen on mount
  useEffect(() => {
    markWhatsNewSeen()
  }, [])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[9996] flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="版本更新"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="ui-card relative z-10 w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--theme-accent)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--theme-text-primary)]">
              v{CURRENT_VERSION} 更新内容
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            aria-label="关闭"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <WhatsNew />
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--theme-border)] px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="ui-btn-accent px-4 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-2"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
