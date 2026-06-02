import { useEffect, useState } from 'react'
import { Upload, Trash2, Search, FileText } from 'lucide-react'

interface Doc {
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
}

interface SearchResult {
  content: string
  filename: string
  score: number
}

export function KnowledgeView() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [uploading, setUploading] = useState(false)

  const loadDocs = async () => {
    const data = (await window.api.invoke('knowledge-list')) as Doc[]
    setDocs(data)
  }

  useEffect(() => {
    void loadDocs()
  }, [])

  const handleUpload = async () => {
    setUploading(true)
    try {
      const result = await window.api.invoke('knowledge-upload')
      if (result) {
        await loadDocs()
      }
    } finally {
      setUploading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return
    }
    const results = (await window.api.invoke('knowledge-search', searchQuery)) as SearchResult[]
    setSearchResults(results)
  }

  const handleDelete = async (id: number) => {
    await window.api.invoke('knowledge-delete', id)
    await loadDocs()
  }

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

      <div className="max-w-5xl space-y-6">
        <div className="ui-card p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]"
              />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void handleSearch()}
                placeholder="搜索知识库内容..."
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

        {searchResults.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--theme-text-muted)]">
              搜索结果 ({searchResults.length})
            </h3>
            <div className="space-y-3">
              {searchResults.map((result, index) => (
                <div key={index} className="ui-card p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-accent)]">
                    {result.filename}
                  </div>
                  <div className="text-sm leading-7 text-[var(--theme-text-secondary)]">
                    {result.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--theme-text-muted)]">
            已上传文档 ({docs.length})
          </h3>
          {docs.length === 0 ? (
            <div className="ui-card py-14 text-center text-[var(--theme-text-muted)]">
              <FileText size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-base font-medium text-[var(--theme-text-primary)]">暂无文档</p>
              <p className="mt-2 text-sm">上传后会自动切分片段，供后续检索和问答使用。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => (
                <div key={doc.id} className="ui-card flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-info-soft)] text-[var(--theme-info)]">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[var(--theme-text-primary)]">
                        {doc.filename}
                      </div>
                      <div className="mt-1 text-xs text-[var(--theme-text-muted)]">
                        {doc.chunk_count} 个片段 · {doc.created_at?.slice(0, 10)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(`确定要删除文档「${doc.filename}」？`)) {
                        void handleDelete(doc.id)
                      }
                    }}
                    className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-danger)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
