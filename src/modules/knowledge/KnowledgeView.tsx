import { memo, useCallback, useEffect, useState } from 'react'
import type { SearchResult, SemanticSearchResult, Document } from '../../types/knowledge'
import {
  Upload,
  Trash2,
  Search,
  FileText,
  AlertCircle,
  RefreshCw,
  Brain,
  Network,
  Tag,
  Lightbulb,
  Loader2,
} from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import { toErrorMessage } from '../../utils/errors'
import { Skeleton } from '../../components/LoadingSpinner'
import { useToast } from '../../components/Toast'
import { useKnowledgeStore } from '../../stores/knowledgeStore'
import { KnowledgeGraph } from './KnowledgeGraph'
import { AutoTagger } from './AutoTagger'

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'search' | 'graph' | 'tags'

interface TabDef {
  id: TabId
  label: string
  icon: typeof Search
}

const TABS: TabDef[] = [
  { id: 'search', label: '智能搜索', icon: Search },
  { id: 'graph', label: '概念图谱', icon: Network },
  { id: 'tags', label: '自动标签', icon: Tag },
]

// ---------------------------------------------------------------------------
// Memoized sub-components
// ---------------------------------------------------------------------------

const DocumentItem = memo(function DocumentItem({
  doc,
  onDelete,
}: {
  doc: Document
  onDelete: (id: number) => void
}) {
  return (
    <div className="ui-card flex items-center justify-between gap-4 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-info-soft)] text-[var(--theme-info)]">
          <FileText size={18} />
        </div>
        <div>
          <div className="text-sm font-medium text-[var(--theme-text-primary)]">{doc.filename}</div>
          <div className="mt-1 text-xs text-[var(--theme-text-muted)]">
            {doc.chunk_count} 个片段 · {doc.created_at?.slice(0, 10)}
            {doc.tags && (
              <span className="ml-2 rounded-full bg-[var(--theme-accent-soft)] px-1.5 py-0.5 text-[var(--theme-accent)]">
                {doc.tags}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={() => {
          if (window.confirm(`确定要删除文档「${doc.filename}」？`)) {
            onDelete(doc.id)
          }
        }}
        aria-label={`删除文档：${doc.filename}`}
        className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  )
})

const SearchResultItem = memo(function SearchResultItem({ result }: { result: SearchResult }) {
  return (
    <div className="ui-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-accent)]">
          {result.filename}
        </span>
        <span className="rounded-full bg-[var(--theme-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--theme-text-muted)]">
          匹配度 {Math.round(result.score * 100)}%
        </span>
      </div>
      <div className="text-sm leading-7 text-[var(--theme-text-secondary)]">{result.content}</div>
      {result.explanation && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-[var(--theme-text-muted)]">
          <Lightbulb
            size={12}
            className="shrink-0 mt-0.5 text-[var(--theme-warning)]"
            aria-hidden="true"
          />
          {result.explanation}
        </div>
      )}
    </div>
  )
})

const SemanticResultItem = memo(function SemanticResultItem({
  result,
}: {
  result: SemanticSearchResult
}) {
  return (
    <div className="ui-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Brain size={12} className="text-[var(--theme-accent)]" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-accent)]">
          {result.filename}
        </span>
        <span className="rounded-full bg-[var(--theme-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--theme-accent)]">
          语义匹配 {Math.round(result.score * 100)}%
        </span>
      </div>
      <div className="text-sm leading-7 text-[var(--theme-text-secondary)]">{result.content}</div>
      {result.explanation && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-[var(--theme-text-muted)]">
          <Lightbulb
            size={12}
            className="shrink-0 mt-0.5 text-[var(--theme-warning)]"
            aria-hidden="true"
          />
          {result.explanation}
        </div>
      )}
    </div>
  )
})

const SearchSummaryCard = memo(function SearchSummaryCard({
  summary,
  concepts,
}: {
  summary: string
  concepts: string[]
}) {
  return (
    <div className="ui-card border-l-2 border-l-[var(--theme-accent)] p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--theme-accent)]">
        <Brain size={12} aria-hidden="true" />
        AI 摘要
      </div>
      <p className="text-sm leading-7 text-[var(--theme-text-secondary)]">{summary}</p>
      {concepts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {concepts.map((concept) => (
            <span
              key={concept}
              className="rounded-full bg-[var(--theme-bg-hover)] px-2 py-0.5 text-xs text-[var(--theme-text-muted)]"
            >
              {concept}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})

const TabButton = memo(function TabButton({
  tab,
  isActive,
  onClick,
}: {
  tab: TabDef
  isActive: boolean
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <button
      onClick={onClick}
      aria-selected={isActive}
      role="tab"
      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)]'
      }`}
    >
      <Icon size={14} aria-hidden="true" />
      {tab.label}
    </button>
  )
})

// ---------------------------------------------------------------------------
// Search panel (enhanced with semantic search)
// ---------------------------------------------------------------------------

function SearchPanel() {
  const search = useKnowledgeStore((s) => s.search)
  const searchResults = useKnowledgeStore((s) => s.searchResults)
  const searching = useKnowledgeStore((s) => s.searching)
  const semanticSearch = useKnowledgeStore((s) => s.semanticSearch)
  const semanticResults = useKnowledgeStore((s) => s.semanticResults)
  const semanticSearching = useKnowledgeStore((s) => s.semanticSearching)
  const summarizeResults = useKnowledgeStore((s) => s.summarizeResults)
  const searchSummary = useKnowledgeStore((s) => s.searchSummary)
  const summarizing = useKnowledgeStore((s) => s.summarizing)
  const clearSearch = useKnowledgeStore((s) => s.clearSearch)
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'keyword' | 'semantic'>('semantic')

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    clearSearch()
    try {
      if (searchMode === 'semantic') {
        await Promise.all([semanticSearch(query), summarizeResults(query)])
      } else {
        await search(query)
      }
    } catch (err) {
      toast('error', `搜索失败：${toErrorMessage(err)}`)
    }
  }, [query, searchMode, search, semanticSearch, summarizeResults, clearSearch, toast])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') void handleSearch()
    },
    [handleSearch],
  )

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="ui-card p-4">
        <div className="flex flex-col gap-3">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchMode('semantic')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                searchMode === 'semantic'
                  ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
              }`}
              aria-pressed={searchMode === 'semantic'}
            >
              <Brain size={12} aria-hidden="true" />
              语义搜索
            </button>
            <button
              onClick={() => setSearchMode('keyword')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                searchMode === 'keyword'
                  ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                  : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
              }`}
              aria-pressed={searchMode === 'keyword'}
            >
              <Search size={12} aria-hidden="true" />
              关键词搜索
            </button>
          </div>

          {/* Input row */}
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  searchMode === 'semantic'
                    ? '用自然语言描述你想查找的内容...'
                    : '输入关键词搜索知识库...'
                }
                aria-label="搜索知识库"
                className="ui-input pl-10 pr-3 py-3 text-sm"
              />
            </div>
            <button
              onClick={() => void handleSearch()}
              disabled={searching || semanticSearching}
              className="ui-btn-accent flex items-center gap-2 px-4 py-3 text-sm"
            >
              {searching || semanticSearching ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Search size={14} aria-hidden="true" />
              )}
              搜索
            </button>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {summarizing && (
        <div className="ui-card p-4">
          <div className="flex items-center gap-2 text-sm text-[var(--theme-text-muted)]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            AI 正在分析搜索结果...
          </div>
        </div>
      )}
      {searchSummary && !summarizing && (
        <SearchSummaryCard summary={searchSummary.summary} concepts={searchSummary.keyConcepts} />
      )}

      {/* Loading skeleton */}
      {(searching || semanticSearching) && (
        <div className="ui-card p-4">
          <div className="space-y-3">
            <Skeleton width="w-1/3" height="h-3" />
            <Skeleton width="w-full" height="h-4" />
            <Skeleton width="w-2/3" height="h-4" />
          </div>
        </div>
      )}

      {/* Semantic results */}
      {!semanticSearching && semanticResults.length > 0 && searchMode === 'semantic' && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--theme-text-muted)]">
            <Brain size={14} aria-hidden="true" />
            语义搜索结果 ({semanticResults.length})
          </h3>
          <div className="space-y-3">
            {semanticResults.map((result, index) => (
              <SemanticResultItem
                key={`${result.doc_id}-${result.chunk_id}-${index}`}
                result={result}
              />
            ))}
          </div>
        </div>
      )}

      {/* Keyword results */}
      {!searching && searchResults.length > 0 && searchMode === 'keyword' && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--theme-text-muted)]">
            搜索结果 ({searchResults.length})
          </h3>
          <div className="space-y-3">
            {searchResults.map((result, index) => (
              <SearchResultItem key={`${result.filename}-${index}`} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main KnowledgeView
// ---------------------------------------------------------------------------

export function KnowledgeView() {
  const documents = useKnowledgeStore((s) => s.documents)
  const loadingDocs = useKnowledgeStore((s) => s.loadingDocs)
  const loadDocuments = useKnowledgeStore((s) => s.loadDocuments)
  const deleteDocument = useKnowledgeStore((s) => s.deleteDocument)
  const error = useKnowledgeStore((s) => s.error)
  const clearError = useKnowledgeStore((s) => s.clearError)

  const [activeTab, setActiveTab] = useState<TabId>('search')
  const [uploading, setUploading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  const handleUpload = useCallback(async () => {
    setUploading(true)
    clearError()
    try {
      const result = await typedInvoke('knowledge-upload')
      if (result) {
        await loadDocuments()
        toast('success', '文件上传成功')
      }
    } catch (err) {
      const msg = toErrorMessage(err)
      toast('error', `上传失败：${msg}`)
    } finally {
      setUploading(false)
    }
  }, [loadDocuments, clearError, toast])

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteDocument(id)
        toast('success', '文档已删除')
      } catch (err) {
        toast('error', `删除失败：${toErrorMessage(err)}`)
      }
    },
    [deleteDocument, toast],
  )

  const handleDismissError = useCallback(() => {
    clearError()
    void loadDocuments()
  }, [clearError, loadDocuments])

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId)
  }, [])

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ui-section-title text-2xl">AI 知识引擎</h1>
          <p className="mt-2 text-sm text-[var(--theme-text-muted)]">
            语义搜索、概念图谱与自动标签 — 让 AI 深度理解你的知识库。
          </p>
        </div>
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="ui-btn-accent flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Upload size={14} />
          {uploading ? '上传中...' : '上传文件'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--theme-danger-soft)] px-4 py-3 text-sm text-[var(--theme-danger)]">
          <AlertCircle size={16} className="shrink-0" />
          <div className="flex-1">
            <span>{error}</span>
            <span className="block mt-1 text-xs text-[var(--theme-text-muted)]">
              请检查 API 配置或网络连接
            </span>
          </div>
          <button
            onClick={handleDismissError}
            className="flex items-center gap-1 text-xs underline hover:no-underline shrink-0"
          >
            <RefreshCw size={12} />
            重试
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div
        className="mb-4 flex items-center gap-1 rounded-xl bg-[var(--theme-bg-card)] p-1"
        role="tablist"
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div className="max-w-5xl">
        {activeTab === 'search' && <SearchPanel />}
        {activeTab === 'graph' && <KnowledgeGraph />}
        {activeTab === 'tags' && <AutoTagger />}
      </div>

      {/* Document list (always visible below tabs) */}
      <div className="max-w-5xl mt-6">
        <h3 className="mb-3 text-sm font-semibold text-[var(--theme-text-muted)]">
          已上传文档 ({documents.length})
        </h3>
        {loadingDocs ? (
          <div className="ui-card p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton width="w-10" height="h-10" className="shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton width="w-1/2" height="h-4" />
                  <Skeleton width="w-1/3" height="h-3" />
                </div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="ui-card py-14 text-center text-[var(--theme-text-muted)]">
            <FileText size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-base font-medium text-[var(--theme-text-primary)]">暂无文档</p>
            <p className="mt-2 text-sm">上传后会自动切分片段，供后续检索和问答使用。</p>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="ui-btn-accent mt-5 px-5 py-2 text-sm"
            >
              <Upload size={14} className="inline mr-1.5" />
              上传文件
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentItem key={doc.id} doc={doc} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
