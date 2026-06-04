import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  Search,
  LayoutGrid,
  List,
  Plus,
  Folder,
  FileText,
  Code2,
  Video,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Info,
  Upload,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { useKnowledgeData } from '@/hooks/useKnowledgeData'

/** 根据文件类型返回 UI 展示所需的元信息 */
function getDocMeta(fileType: string) {
  const ft = fileType.toLowerCase()
  if (ft.includes('video') || ft.includes('mp4') || ft.includes('youtube')) {
    return {
      type: '视频',
      typeColor: 'text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/20',
      icon: Video,
      iconBg: 'bg-[var(--color-accent-purple)]',
    }
  }
  if (
    ft.includes('code') ||
    ft.includes('py') ||
    ft.includes('js') ||
    ft.includes('ts') ||
    ft.includes('java') ||
    ft.includes('cpp')
  ) {
    return {
      type: '代码',
      typeColor: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20',
      icon: Code2,
      iconBg: 'bg-[#10B981]',
    }
  }
  if (ft.includes('note') || ft.includes('笔记') || ft.includes('md')) {
    return {
      type: '笔记',
      typeColor: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20',
      icon: FileText,
      iconBg: 'bg-[var(--color-accent-purple)]',
    }
  }
  return {
    type: '文档',
    typeColor:
      'text-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 border-[var(--color-accent-purple)]/20',
    icon: FileText,
    iconBg: 'bg-[#3B82F6]',
  }
}

type SortMode = 'recent' | 'name' | 'chunks'
type ViewMode = 'grid' | 'list'

interface KnowledgeDisplayItem {
  id: number
  title: string
  desc: string
  type: string
  typeColor: string
  fileType: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  iconBg: string
  tags: string[]
  time: string
  chunkCount?: number
  score?: number
  chunkIndex?: number
  source: 'document' | 'search'
}

function formatScore(score?: number): string | null {
  if (typeof score !== 'number' || Number.isNaN(score)) return null
  return `${Math.round(score * 100)}% 匹配`
}

export function KnowledgeView() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedItem, setSelectedItem] = useState<KnowledgeDisplayItem | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { documents, searchResults, loading, uploading, error, search, upload, deleteDocument } =
    useKnowledgeData()

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchTimer.current = setTimeout(() => {
        void search(value)
      }, 300)
    },
    [search],
  )

  const typeOptions = useMemo(() => {
    const values = Array.from(new Set(documents.map((doc) => doc.file_type || '其他')))
    return values.sort((a, b) => a.localeCompare(b))
  }, [documents])

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const doc of documents) {
      const ft = doc.file_type || '其他'
      map.set(ft, (map.get(ft) || 0) + 1)
    }
    return [{ name: '全部知识', value: 'all', count: documents.length }].concat(
      Array.from(map.entries()).map(([name, count]) => ({ name, value: name, count })),
    )
  }, [documents])

  const displayItems = useMemo<KnowledgeDisplayItem[]>(() => {
    const items = query.trim()
      ? searchResults.map((result) => {
          const sourceDoc = documents.find((doc) => doc.id === result.doc_id)
          const fileType = sourceDoc?.file_type || '文档'
          const meta = getDocMeta(fileType)
          return {
            id: result.doc_id,
            title: result.filename,
            desc: result.content,
            type: meta.type,
            typeColor: meta.typeColor,
            fileType,
            icon: meta.icon,
            iconBg: meta.iconBg,
            tags: [fileType, `片段 #${result.chunk_index + 1}`],
            time: sourceDoc?.created_at ?? '',
            chunkCount: sourceDoc?.chunk_count,
            score: result.score,
            chunkIndex: result.chunk_index,
            source: 'search' as const,
          }
        })
      : documents.map((doc) => {
          const meta = getDocMeta(doc.file_type)
          return {
            id: doc.id,
            title: doc.filename,
            desc: `${doc.chunk_count} 个知识片段`,
            type: meta.type,
            typeColor: meta.typeColor,
            fileType: doc.file_type || '其他',
            icon: meta.icon,
            iconBg: meta.iconBg,
            tags: [doc.file_type || '其他'],
            time: doc.created_at,
            chunkCount: doc.chunk_count,
            source: 'document' as const,
          }
        })

    const filtered =
      typeFilter === 'all' ? items : items.filter((item) => item.fileType === typeFilter)

    return filtered.slice().sort((a, b) => {
      if (sortMode === 'name') return a.title.localeCompare(b.title)
      if (sortMode === 'chunks') return (b.chunkCount ?? 0) - (a.chunkCount ?? 0)
      return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()
    })
  }, [documents, query, searchResults, sortMode, typeFilter])

  const handleDelete = async (item: KnowledgeDisplayItem) => {
    if (!confirm(`确定要删除知识文档「${item.title}」吗？`)) return
    await deleteDocument(item.id)
    if (selectedItem?.id === item.id) setSelectedItem(null)
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-hidden">
      <div className="max-w-[1400px] w-full mx-auto p-6 flex flex-col h-full space-y-6">
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">知识库</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            管理、检索和删除已导入的学习资料。当前检索使用真实知识库关键词匹配；向量语义、自动标签和概念图谱未接入前不在页面伪装展示。
          </p>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <input
              type="text"
              placeholder="按关键词搜索知识库..."
              value={query}
              onChange={handleSearchChange}
              className="w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-purple)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg outline-none focus:border-[var(--color-accent-primary)]"
            >
              <option value="all">全部类型</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-3 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg outline-none focus:border-[var(--color-accent-primary)]"
            >
              <option value="recent">最近导入</option>
              <option value="name">文件名</option>
              <option value="chunks">片段数量</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg p-1 ml-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'grid'
                  ? 'text-white bg-[var(--color-border-subtle)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white',
              )}
              title="卡片视图"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'list'
                  ? 'text-white bg-[var(--color-border-subtle)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-white',
              )}
              title="列表视图"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-6 min-h-0 relative">
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 256, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="flex-shrink-0 flex flex-col min-h-0 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden"
              >
                <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">知识库分类</span>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="text-[var(--color-text-muted)] hover:text-white transition-colors"
                    title="收起分类栏"
                  >
                    <PanelLeftClose size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setTypeFilter(cat.value)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors',
                        typeFilter === cat.value
                          ? 'bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Folder
                          size={16}
                          className={
                            typeFilter === cat.value
                              ? 'fill-[var(--color-accent-purple)]/20'
                              : 'text-[var(--color-text-muted)]'
                          }
                        />
                        {cat.name}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-mono',
                          typeFilter === cat.value
                            ? 'text-[var(--color-accent-purple)]'
                            : 'text-[var(--color-text-muted)]',
                        )}
                      >
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="p-3 border-t border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                  文件上传、列表、关键词检索、删除均连接本地知识库 IPC。
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {sidebarCollapsed && (
            <div className="w-12 flex-shrink-0 flex flex-col items-center pt-4 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl relative">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 rounded-lg bg-[var(--color-bg-hover)] text-white hover:bg-white/10 transition-colors"
                title="展开分类栏"
              >
                <PanelLeft size={16} />
              </button>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
              <div>
                <span className="font-medium text-white text-sm">
                  {query.trim()
                    ? `关键词检索结果 (${displayItems.length})`
                    : `全部知识 (${displayItems.length})`}
                </span>
                {query.trim() && (
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                    结果来自 knowledge-search 关键词匹配，不伪装为向量语义结果。
                  </p>
                )}
              </div>
              <button
                onClick={() => void upload()}
                disabled={uploading}
                className="bg-[var(--color-accent-purple)] hover:bg-[#7C3AED] text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50"
              >
                <Upload size={14} /> {uploading ? '上传中...' : '上传文档'}
              </button>
            </div>

            {error && (
              <div className="mx-4 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                {error}
              </div>
            )}

            <div
              className={cn(
                'flex-1 overflow-y-auto p-4 gap-3',
                viewMode === 'grid'
                  ? 'grid grid-cols-1 xl:grid-cols-2 content-start'
                  : 'flex flex-col',
              )}
            >
              {loading && displayItems.length === 0 && (
                <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-muted)]">
                  加载中...
                </div>
              )}
              {!loading && displayItems.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-sm text-[var(--color-text-muted)] col-span-full">
                  <FileText size={32} className="mb-2 opacity-40" />
                  {query.trim() ? '未找到匹配的知识文档' : '暂无文档，点击「上传文档」导入资料'}
                </div>
              )}
              {displayItems.map((item) => (
                <button
                  key={`${item.source}-${item.id}-${item.chunkIndex ?? 'doc'}`}
                  onClick={() => setSelectedItem(item)}
                  className={cn(
                    'group flex flex-col gap-3 p-4 bg-[var(--color-bg-card)] border rounded-xl hover:border-[var(--color-accent-purple)]/50 transition-all text-left',
                    selectedItem?.id === item.id && selectedItem?.chunkIndex === item.chunkIndex
                      ? 'border-[var(--color-accent-purple)]/70'
                      : 'border-[var(--color-border-subtle)]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0',
                          item.iconBg,
                        )}
                      >
                        <item.icon size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[15px] font-medium text-white group-hover:text-[var(--color-accent-purple)] transition-colors truncate">
                            {item.title}
                          </h3>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0',
                              item.typeColor,
                            )}
                          >
                            {item.type}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Eye size={15} className="text-[var(--color-text-muted)]" />
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {item.source === 'search' ? '片段' : '详情'}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(item)
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return
                          e.preventDefault()
                          e.stopPropagation()
                          void handleDelete(item)
                        }}
                        className="text-[var(--color-text-muted)] hover:text-red-400 p-1 ml-1 cursor-pointer"
                        title="删除文档"
                      >
                        <Trash2 size={14} />
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono text-[var(--color-text-muted)]">
                      {formatScore(item.score) && <span>{formatScore(item.score)}</span>}
                      {item.time && <span>⏱ {item.time}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="w-64 flex-shrink-0 flex flex-col min-h-0 gap-6">
            <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-white text-sm">知识库概览</span>
                <Plus size={14} className="text-[var(--color-text-muted)]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-lg p-3">
                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
                    <FileText size={12} className="text-[#3B82F6]" /> 文档
                  </span>
                  <span className="text-xl font-bold text-white font-mono">
                    {
                      documents.filter((d) => {
                        const ft = d.file_type.toLowerCase()
                        return !ft.includes('video') && !ft.includes('code') && !ft.includes('note')
                      }).length
                    }
                  </span>
                </div>
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-lg p-3">
                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
                    <FileText size={12} className="text-[#10B981]" /> 笔记
                  </span>
                  <span className="text-xl font-bold text-white font-mono">
                    {documents.filter((d) => d.file_type.toLowerCase().includes('note')).length}
                  </span>
                </div>
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-lg p-3">
                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
                    <Code2 size={12} className="text-[#10B981]" /> 代码片段
                  </span>
                  <span className="text-xl font-bold text-white font-mono">
                    {
                      documents.filter((d) => {
                        const ft = d.file_type.toLowerCase()
                        return ft.includes('code') || ft.includes('py') || ft.includes('js')
                      }).length
                    }
                  </span>
                </div>
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-lg p-3">
                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1 mb-1">
                    <Video size={12} className="text-[var(--color-accent-purple)]" /> 视频
                  </span>
                  <span className="text-xl font-bold text-white font-mono">
                    {documents.filter((d) => d.file_type.toLowerCase().includes('video')).length}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-white text-sm">类型筛选</span>
                <Info size={14} className="text-[var(--color-text-muted)]" />
              </div>
              <div className="space-y-2">
                {typeOptions.length === 0 && (
                  <span className="text-xs text-[var(--color-text-muted)]">暂无类型</span>
                )}
                {typeOptions.slice(0, 8).map((name) => {
                  const count = documents.filter((doc) => (doc.file_type || '其他') === name).length
                  return (
                    <button
                      key={name}
                      onClick={() => setTypeFilter(name)}
                      className="w-full flex items-center justify-between text-sm hover:bg-[var(--color-bg-card)] px-2 py-1 rounded transition-colors text-left"
                    >
                      <span className="text-[var(--color-text-secondary)]">{name}</span>
                      <span className="text-xs font-mono text-[var(--color-text-muted)]">
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4 flex-1 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-white text-sm">
                  {selectedItem?.source === 'search' ? '检索片段详情' : '文档详情'}
                </span>
              </div>
              {selectedItem ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-white font-medium break-words">
                      {selectedItem.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {selectedItem.fileType} · {selectedItem.chunkCount ?? 0} 个片段
                    </p>
                  </div>
                  <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-lg p-3 text-xs text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap max-h-64 overflow-auto custom-scrollbar">
                    {selectedItem.source === 'search'
                      ? selectedItem.desc
                      : '该文档已导入本地知识库，可通过关键词搜索定位相关片段；文档全文读取接口尚未开放，因此这里只展示已知元数据。'}
                  </div>
                  {selectedItem.time && (
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      导入时间：{selectedItem.time}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  点击任一文档或检索片段可在此查看真实元数据与匹配片段。未提供后端全文接口前，不伪造文档详情内容。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
