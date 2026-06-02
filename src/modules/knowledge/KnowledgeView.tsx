import { memo, useCallback, useEffect, useState } from 'react'
import type { SearchResult, Document } from '../../types/knowledge'
import { Upload, Trash2, Search, FileText, AlertCircle, RefreshCw } from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import { toErrorMessage } from '../../utils/errors'
import { Skeleton } from '../../components/LoadingSpinner'
import { useToast } from '../../components/Toast'

// Memoized document list item
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

// Memoized search result item
const SearchResultItem = memo(function SearchResultItem({ result }: { result: SearchResult }) {
  return (
    <div className="ui-card p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-accent)]">
        {result.filename}
      </div>
      <div className="text-sm leading-7 text-[var(--theme-text-secondary)]">{result.content}</div>
    </div>
  )
})

export function KnowledgeView() {
  const [docs, setDocs] = useState<Document[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const loadDocs = async () => {
    setLoadingDocs(true)
    try {
      const data = await typedInvoke('knowledge-list')
      setDocs(data)
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setLoadingDocs(false)
    }
  }

  useEffect(() => {
    void loadDocs()
  }, [])

  const handleUpload = useCallback(async () => {
    setUploading(true)
    setError(null)
    try {
      const result = await typedInvoke('knowledge-upload')
      if (result) {
        await loadDocs()
        toast('success', '文件上传成功')
      }
    } catch (err) {
      const msg = toErrorMessage(err)
      setError(msg)
      toast('error', `上传失败：${msg}`)
    } finally {
      setUploading(false)
    }
  }, [toast])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      return
    }
    setError(null)
    setSearching(true)
    try {
      const results = await typedInvoke('knowledge-search', searchQuery)
      setSearchResults(results)
    } catch (err) {
      const msg = toErrorMessage(err)
      setError(msg)
      toast('error', `搜索失败：${msg}`)
    } finally {
      setSearching(false)
    }
  }, [searchQuery, toast])

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await typedInvoke('knowledge-delete', id)
        await loadDocs()
        toast('success', '文档已删除')
      } catch (err) {
        const msg = toErrorMessage(err)
        setError(msg)
        toast('error', `删除失败：${msg}`)
      }
    },
    [toast],
  )

  const handleSearchInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value),
    [],
  )

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') void handleSearch()
    },
    [handleSearch],
  )

  const handleDismissError = useCallback(() => {
    setError(null)
    void loadDocs()
  }, [])

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ui-section-title text-2xl">知识库</h1>
          <p className="mt-2 text-sm text-[var(--theme-text-muted)]">
            上传 PDF、Markdown 或 TXT 文档，让 AI 在问答时引用你的资料。
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

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--theme-danger-soft)] px-4 py-3 text-sm text-[var(--theme-danger)]">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={handleDismissError}
            className="flex items-center gap-1 text-xs underline hover:no-underline"
          >
            <RefreshCw size={12} />
            重试
          </button>
        </div>
      )}

      <div className="max-w-5xl space-y-6">
        <div className="ui-card p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]"
                aria-hidden="true"
              />
              <input
                value={searchQuery}
                onChange={handleSearchInputChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索知识库内容..."
                aria-label="搜索知识库"
                className="ui-input pl-10 pr-3 py-3 text-sm"
              />
            </div>
            <button
              onClick={() => void handleSearch()}
              className="ui-btn-secondary px-4 py-3 text-sm"
            >
              搜索
            </button>
          </div>
        </div>

        {searching && (
          <div className="ui-card p-4">
            <div className="space-y-3">
              <Skeleton width="w-1/3" height="h-3" />
              <Skeleton width="w-full" height="h-4" />
              <Skeleton width="w-2/3" height="h-4" />
            </div>
          </div>
        )}

        {!searching && searchResults.length > 0 && (
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

        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--theme-text-muted)]">
            已上传文档 ({docs.length})
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
          ) : docs.length === 0 ? (
            <div className="ui-card py-14 text-center text-[var(--theme-text-muted)]">
              <FileText size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-base font-medium text-[var(--theme-text-primary)]">暂无文档</p>
              <p className="mt-2 text-sm">上传后会自动切分片段，供后续检索和问答使用。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => (
                <DocumentItem key={doc.id} doc={doc} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
