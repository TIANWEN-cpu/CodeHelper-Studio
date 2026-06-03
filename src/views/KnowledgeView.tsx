import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  Search,
  ChevronDown,
  LayoutGrid,
  List,
  Plus,
  Folder,
  FileText,
  Code2,
  Video,
  Star,
  Trash2,
  PanelLeftClose,
  PanelLeft,
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
  if (ft.includes('note') || ft.includes('笔记')) {
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

export function KnowledgeView() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { documents, searchResults, loading, uploading, error, search, upload, deleteDocument } =
    useKnowledgeData()

  // --- 搜索防抖 ---
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchTimer.current = setTimeout(() => {
        search(value)
      }, 300)
    },
    [search],
  )

  // --- 根据文件类型聚合分类 ---
  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const doc of documents) {
      const ft = doc.file_type || '其他'
      map.set(ft, (map.get(ft) || 0) + 1)
    }
    const cats = [{ name: '全部知识', count: documents.length, active: true }]
    for (const [ft, count] of map) {
      cats.push({ name: ft, count })
    }
    return cats
  }, [documents])

  // --- 搜索结果或全部文档 ---
  const displayItems = useMemo(() => {
    if (query.trim() && searchResults.length > 0) {
      return searchResults.map((r) => {
        const meta = getDocMeta('文档')
        return {
          id: r.doc_id,
          title: r.filename,
          desc: r.content,
          type: meta.type,
          typeColor: meta.typeColor,
          icon: meta.icon,
          iconBg: meta.iconBg,
          tags: [],
          time: '',
          starred: false,
        }
      })
    }
    return documents.map((doc) => {
      const meta = getDocMeta(doc.file_type)
      return {
        id: doc.id,
        title: doc.filename,
        desc: `${doc.chunk_count} 个知识片段`,
        type: meta.type,
        typeColor: meta.typeColor,
        icon: meta.icon,
        iconBg: meta.iconBg,
        tags: [doc.file_type],
        time: doc.created_at,
        starred: false,
      }
    })
  }, [documents, searchResults, query])

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-hidden">
      <div className="max-w-[1400px] w-full mx-auto p-6 flex flex-col h-full space-y-6">
        {/* Header */}
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">知识库</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            管理和浏览你的学习资料、笔记与文档，构建专属知识体系。
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            />
            <input
              type="text"
              placeholder="搜索知识库..."
              value={query}
              onChange={handleSearchChange}
              className="w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-purple)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg hover:text-white transition-colors">
              <span>全部类型</span>
              <ChevronDown size={14} />
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg hover:text-white transition-colors">
              <span>全部标签</span>
              <ChevronDown size={14} />
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg hover:text-white transition-colors">
              <span>最近更新</span>
              <ChevronDown size={14} />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg p-1 ml-auto">
            <button className="p-1.5 text-white bg-[var(--color-border-subtle)] rounded shadow-sm">
              <LayoutGrid size={16} />
            </button>
            <button className="p-1.5 text-[var(--color-text-muted)] hover:text-white transition-colors">
              <List size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-6 min-h-0 relative">
          {/* Left Sidebar (Categories) */}
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
                  <div className="flex gap-2 text-[var(--color-text-muted)]">
                    <button className="hover:text-white transition-colors">
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className="hover:text-white transition-colors"
                      title="收起分类栏"
                    >
                      <PanelLeftClose size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1">
                  {categories.map((cat, i) => (
                    <button
                      key={i}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors',
                        cat.active
                          ? 'bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Folder
                          size={16}
                          className={
                            cat.active
                              ? 'fill-[var(--color-accent-purple)]/20'
                              : 'text-[var(--color-text-muted)]'
                          }
                        />
                        {cat.name}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-mono',
                          cat.active
                            ? 'text-[var(--color-accent-purple)]'
                            : 'text-[var(--color-text-muted)]',
                        )}
                      >
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="p-3 border-t border-[var(--color-border-subtle)]">
                  <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors">
                    <span className="flex items-center gap-2">
                      <Trash2 size={16} /> 回收站
                    </span>
                    <span className="text-xs font-mono">8</span>
                  </button>
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

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
              <span className="font-medium text-white text-sm">
                {query.trim()
                  ? `搜索结果 (${displayItems.length})`
                  : `全部知识 (${documents.length})`}
              </span>
            </div>

            {error && (
              <div className="mx-4 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && displayItems.length === 0 && (
                <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-muted)]">
                  加载中...
                </div>
              )}
              {!loading && displayItems.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-sm text-[var(--color-text-muted)]">
                  <FileText size={32} className="mb-2 opacity-40" />
                  {query.trim() ? '未找到匹配的知识文档' : '暂无文档，点击右上角「新建」上传'}
                </div>
              )}
              {displayItems.map((item) => (
                <div
                  key={item.id}
                  className="group flex flex-col gap-3 p-4 bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl hover:border-[var(--color-accent-purple)]/50 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0',
                          item.iconBg,
                        )}
                      >
                        <item.icon size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-[15px] font-medium text-white group-hover:text-[var(--color-accent-purple)] transition-colors">
                            {item.title}
                          </h3>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                              item.typeColor,
                            )}
                          >
                            {item.type}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] line-clamp-1">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.starred && <Star size={16} className="text-[#F59E0B] fill-[#F59E0B]" />}
                      {!item.starred && (
                        <Star
                          size={16}
                          className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('确定要删除该文档吗？')) {
                            deleteDocument(item.id)
                          }
                        }}
                        className="text-[var(--color-text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1 pl-13">
                    <div className="flex items-center gap-2">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] px-2 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono text-[var(--color-text-muted)]">
                      {item.time && <span className="flex items-center gap-1">⏱ {item.time}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Info Panel */}
          <div className="w-64 flex-shrink-0 flex flex-col min-h-0 gap-6">
            <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-white text-sm">知识库概览</span>
                <button
                  onClick={() => upload()}
                  disabled={uploading}
                  className="bg-[var(--color-accent-purple)] hover:bg-[#7C3AED] text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                >
                  <Plus size={14} /> {uploading ? '上传中...' : '新建'}
                </button>
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

            <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4 flex-1 overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-white text-sm">常用标签</span>
                <button className="text-xs text-[var(--color-accent-primary)] hover:text-[#4F46E5] transition-colors">
                  管理
                </button>
              </div>
              <div className="space-y-2">
                {(() => {
                  const tagMap = new Map<string, number>()
                  for (const doc of documents) {
                    const ft = doc.file_type || '其他'
                    tagMap.set(ft, (tagMap.get(ft) || 0) + 1)
                  }
                  return Array.from(tagMap.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([name, count]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between text-sm hover:bg-[var(--color-bg-card)] px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        <span className="text-[var(--color-text-secondary)]">{name}</span>
                        <span className="text-xs font-mono text-[var(--color-text-muted)]">
                          {count}
                        </span>
                      </div>
                    ))
                })()}
              </div>
            </div>

            <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-white text-sm">最近访问</span>
                <button className="text-xs text-[var(--color-accent-primary)] hover:text-[#4F46E5] transition-colors">
                  清空
                </button>
              </div>
              <div className="space-y-3">
                {documents
                  .slice()
                  .sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                  )
                  .slice(0, 5)
                  .map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between group cursor-pointer"
                    >
                      <span className="text-xs text-[var(--color-text-secondary)] group-hover:text-white truncate max-w-[150px] transition-colors">
                        {doc.filename}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {doc.created_at}
                      </span>
                    </div>
                  ))}
                {documents.length === 0 && (
                  <span className="text-xs text-[var(--color-text-muted)]">暂无记录</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
