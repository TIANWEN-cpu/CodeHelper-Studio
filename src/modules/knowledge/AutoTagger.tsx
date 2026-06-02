/**
 * AutoTagger — automatic document tagging with AI suggestions.
 *
 * Displays tags from the knowledge base, suggests new tags for documents
 * using AI, and enables tag-based navigation to filter documents.
 */

import { memo, useEffect, useState, useCallback } from 'react'
import { Tag as TagIcon, Sparkles, X, Loader2, FileText, ChevronRight } from 'lucide-react'
import { useKnowledgeStore } from '../../stores/knowledgeStore'
import type { Tag, TagSuggestion, Document } from '../../types/knowledge'
import { Skeleton } from '../../components/LoadingSpinner'
import { useToast } from '../../components/Toast'
import { eventBus } from '../../utils/eventBus'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TAG_COLORS = [
  'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]',
  'bg-[var(--theme-info-soft)] text-[var(--theme-info)]',
  'bg-[var(--theme-success-soft)] text-[var(--theme-success)]',
  'bg-[var(--theme-warning-soft)] text-[var(--theme-warning)]',
]

function _getTagColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length]
}

const TagBadge = memo(function TagBadge({
  tag,
  isActive,
  onClick,
  onRemove,
}: {
  tag: Tag
  isActive: boolean
  onClick: () => void
  onRemove?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
        isActive
          ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-sm'
          : 'bg-[var(--theme-bg-hover)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-accent-soft)] hover:text-[var(--theme-accent)]'
      }`}
      aria-pressed={isActive}
    >
      <TagIcon size={10} aria-hidden="true" />
      {tag.name}
      <span className="opacity-60">({tag.count})</span>
      {onRemove && isActive && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`移除标签 ${tag.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              onRemove?.()
            }
          }}
          className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={10} aria-hidden="true" />
        </span>
      )}
    </button>
  )
})

const SuggestionCard = memo(function SuggestionCard({
  suggestion,
  onApply,
}: {
  suggestion: TagSuggestion
  onApply: () => void
}) {
  const confidencePercent = Math.round(suggestion.confidence * 100)
  return (
    <div className="ui-card flex items-center justify-between gap-3 p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--theme-text-primary)]">
            {suggestion.tag}
          </span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-xs ${
              confidencePercent >= 80
                ? 'bg-[var(--theme-success-soft)] text-[var(--theme-success)]'
                : confidencePercent >= 50
                  ? 'bg-[var(--theme-warning-soft)] text-[var(--theme-warning)]'
                  : 'bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]'
            }`}
          >
            {confidencePercent}%
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-[var(--theme-text-muted)]">{suggestion.reason}</p>
      </div>
      <button
        onClick={onApply}
        aria-label={`应用标签: ${suggestion.tag}`}
        className="ui-btn-ghost shrink-0 flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft)]"
      >
        添加
        <ChevronRight size={12} aria-hidden="true" />
      </button>
    </div>
  )
})

const TagDocumentItem = memo(function TagDocumentItem({ doc }: { doc: Document }) {
  return (
    <div className="ui-card flex items-center gap-3 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-info-soft)] text-[var(--theme-info)]">
        <FileText size={14} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-[var(--theme-text-primary)]">
          {doc.filename}
        </div>
        <div className="mt-0.5 text-xs text-[var(--theme-text-muted)]">
          {doc.chunk_count} 个片段
        </div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Document selector for auto-tagging
// ---------------------------------------------------------------------------

const DocumentSelector = memo(function DocumentSelector({
  documents,
  onSelect,
  loading,
}: {
  documents: Document[]
  onSelect: (id: number) => void
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="w-full" height="h-12" />
        ))}
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--theme-text-muted)]">暂无文档可供标记</p>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <button
          key={doc.id}
          onClick={() => onSelect(doc.id)}
          className="ui-card flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--theme-bg-hover)]"
        >
          <Sparkles size={14} className="shrink-0 text-[var(--theme-accent)]" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-medium text-[var(--theme-text-primary)]">
              {doc.filename}
            </div>
            <div className="mt-0.5 text-xs text-[var(--theme-text-muted)]">
              {doc.tags ? `标签: ${doc.tags}` : '未标记'}
            </div>
          </div>
          <ChevronRight
            size={14}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AutoTagger() {
  const documents = useKnowledgeStore((s) => s.documents)
  const loadingDocs = useKnowledgeStore((s) => s.loadingDocs)
  const loadDocuments = useKnowledgeStore((s) => s.loadDocuments)
  const tags = useKnowledgeStore((s) => s.tags)
  const loadingTags = useKnowledgeStore((s) => s.loadingTags)
  const loadTags = useKnowledgeStore((s) => s.loadTags)
  const autoTagDocument = useKnowledgeStore((s) => s.autoTagDocument)
  const tagSuggestions = useKnowledgeStore((s) => s.tagSuggestions)
  const suggestingTags = useKnowledgeStore((s) => s.suggestingTags)
  const activeTagFilter = useKnowledgeStore((s) => s.activeTagFilter)
  const setActiveTagFilter = useKnowledgeStore((s) => s.setActiveTagFilter)
  const tagDocuments = useKnowledgeStore((s) => s.tagDocuments)
  const loadingTagDocuments = useKnowledgeStore((s) => s.loadingTagDocuments)

  const toast = useToast()
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)
  const [_appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(new Set())

  useEffect(() => {
    void loadTags()
    void loadDocuments()
  }, [loadTags, loadDocuments])

  const handleAutoTag = useCallback(
    async (docId: number) => {
      setSelectedDocId(docId)
      setAppliedSuggestions(new Set())
      await autoTagDocument(docId)
    },
    [autoTagDocument],
  )

  const handleApplySuggestion = useCallback(
    (suggestion: TagSuggestion) => {
      setAppliedSuggestions((prev) => new Set(prev).add(suggestion.tag))
      eventBus.emit('knowledge:tagged', {
        docId: selectedDocId ?? 0,
        tags: [suggestion.tag],
      })
      toast('success', `已添加标签「${suggestion.tag}」`)
    },
    [selectedDocId, toast],
  )

  const handleTagClick = useCallback(
    (tagName: string) => {
      const next = activeTagFilter === tagName ? null : tagName
      void setActiveTagFilter(next)
    },
    [activeTagFilter, setActiveTagFilter],
  )

  const selectedDoc = documents.find((d) => d.id === selectedDocId)

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TagIcon size={16} className="text-[var(--theme-accent)]" aria-hidden="true" />
        <span className="text-sm font-medium text-[var(--theme-text-primary)]">自动标签</span>
      </div>

      {/* Tag cloud */}
      <div>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-[var(--theme-text-muted)]">
          已有标签
        </h4>
        {loadingTags ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} width="w-16" height="h-7" className="rounded-full" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-[var(--theme-text-muted)]">暂无标签</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="标签筛选">
            {tags.map((tag, _i) => (
              <TagBadge
                key={tag.id}
                tag={tag}
                isActive={activeTagFilter === tag.name}
                onClick={() => handleTagClick(tag.name)}
                onRemove={() => void setActiveTagFilter(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tag-filtered documents */}
      {activeTagFilter && (
        <div>
          <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-[var(--theme-text-muted)]">
            包含标签「{activeTagFilter}」的文档
          </h4>
          {loadingTagDocuments ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} width="w-full" height="h-12" />
              ))}
            </div>
          ) : tagDocuments.length === 0 ? (
            <p className="text-sm text-[var(--theme-text-muted)]">无匹配文档</p>
          ) : (
            <div className="space-y-2">
              {tagDocuments.map((doc) => (
                <TagDocumentItem key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <hr className="border-[var(--theme-border)]" />

      {/* Auto-tag section */}
      <div>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-[var(--theme-text-muted)]">
          AI 自动标记
        </h4>
        <p className="mb-3 text-xs text-[var(--theme-text-muted)]">
          选择一个文档，AI 将分析其内容并推荐合适的标签。
        </p>
        <DocumentSelector documents={documents} onSelect={handleAutoTag} loading={loadingDocs} />
      </div>

      {/* Suggestions */}
      {selectedDoc && (
        <div>
          <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-[var(--theme-text-muted)]">
            为「{selectedDoc.filename}」推荐标签
          </h4>
          {suggestingTags ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[var(--theme-text-muted)]">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              AI 分析中...
            </div>
          ) : tagSuggestions.length === 0 ? (
            <p className="py-4 text-sm text-[var(--theme-text-muted)]">暂无推荐</p>
          ) : (
            <div className="space-y-2">
              {tagSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.tag}
                  suggestion={suggestion}
                  onApply={() => handleApplySuggestion(suggestion)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
