import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  Layers3,
  MessageSquare,
  PackageOpen,
  PanelLeft,
  PanelLeftClose,
  Search,
  Sparkles,
  ScrollText,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useKnowledgeData } from '@/hooks/useKnowledgeData'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { renderMarkdown } from '@/utils/markdown'
import { consumePendingDeepLink, subscribeDeepLink } from '@/lib/deepLink'
import type { KnowledgeDoc } from '@/services/knowledgeService'

type SortMode = 'recent' | 'name' | 'chunks'
type FilterKind = 'all' | 'topic' | 'repo' | 'type'

interface ActiveFilter {
  kind: FilterKind
  value: string
}

interface KnowledgeDisplayItem {
  id: number
  title: string
  filename: string
  desc: string
  fileType: string
  topic: string
  repo: string
  sourcePath?: string
  sourceUrl?: string
  tags: string[]
  time: string
  chunkCount: number
  score?: number
  chunkIndex?: number
  source: 'document' | 'search'
}

const PAGE_SIZE = 72
const AI_CONTEXT_LIMIT = 6000
const AI_PROMPT_LIMIT = 12000

const CATEGORY_LABELS: Record<string, string> = {
  '01-cs-foundation': '计算机基础',
  '02-programming-books': '编程书籍',
  '03-ai-deep-learning': 'AI 与深度学习',
  '04-interview-career': '求职面试',
  '05-cs408-courses': 'CS408 / 课程',
  '99-special-recovered': '特殊恢复资料',
  '01-core-cs-foundation': '计算机基础',
  '02-ai-deep-learning': 'AI 与深度学习',
  '03-interview-career': '求职面试',
  '04-cs408-and-courses': 'CS408 / 课程',
  '05-roadmap-and-bug-manual': '学习路线 / Bug 手册',
  '06-book-resource-indexes': '书籍索引',
  '07-language-specific': '语言专题',
}

function normalizeFileType(fileType?: string | null): string {
  const value = (fileType || 'md').replace(/^\./, '').trim().toLowerCase()
  return value || 'md'
}

function getTopic(doc: Pick<KnowledgeDoc, 'category' | 'category_dir'>): string {
  if (doc.category?.trim()) return doc.category.trim()
  const dir = doc.category_dir?.trim()
  if (dir && CATEGORY_LABELS[dir]) return CATEGORY_LABELS[dir]
  if (dir) return dir
  return '未分类资料'
}

function getRepo(doc: Pick<KnowledgeDoc, 'source_repo' | 'filename'>): string {
  if (doc.source_repo?.trim()) return doc.source_repo.trim()
  const prefix = doc.filename.split('__')[0]?.trim()
  if (prefix && !/^\d+$/.test(prefix)) return prefix
  return '未知来源'
}

function stripFrontMatter(content: string): string {
  return content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, '').trim()
}

function cleanTitle(doc: KnowledgeDoc): string {
  const title = doc.display_title?.trim()
  if (title) return title
  return doc.filename
    .replace(/\.md$/i, '')
    .replace(/\.md$/i, '')
    .split('__')
    .slice(-1)[0]
    .replace(/[-_]+/g, ' ')
    .trim()
}

function shortText(text: string | undefined, limit = 160): string {
  const value = stripFrontMatter(text || '')
    .replace(/[#>*_`~[\]()<>{}|\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!value) return '已导入本地知识库，可点击查看正文与来源信息。'
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

/** 把知识文档映射为列表展示项（文档分支与命令面板深链共用同一口径）。 */
function toDocumentDisplayItem(doc: KnowledgeDoc): KnowledgeDisplayItem {
  const fileType = normalizeFileType(doc.file_type)
  const tags = Array.from(
    new Set([fileType, getTopic(doc), ...(doc.tags ?? []).filter((tag) => tag !== 'knowledge')]),
  ).slice(0, 4)
  return {
    id: doc.id,
    title: cleanTitle(doc),
    filename: doc.filename,
    desc: shortText(doc.content_preview),
    fileType,
    topic: getTopic(doc),
    repo: getRepo(doc),
    sourcePath: doc.source_path,
    sourceUrl: doc.source_url,
    tags,
    time: doc.created_at,
    chunkCount: doc.chunk_count,
    source: 'document',
  }
}

function formatScore(score?: number): string | null {
  if (typeof score !== 'number' || Number.isNaN(score)) return null
  return `${Math.round(score * 100)}% 匹配`
}

function filterLabel(filter: ActiveFilter): string {
  if (filter.kind === 'all') return '全部知识'
  if (filter.kind === 'topic') return filter.value
  if (filter.kind === 'repo') return filter.value
  return filter.value
}

function makeFilter(kind: FilterKind, value = 'all'): ActiveFilter {
  return { kind, value }
}

function truncateForAI(content: string, limit: number): string {
  const value = content.replace(/\s+$/g, '')
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n\n[正文较长，已截取前 ${limit} 字用于 AI 上下文。]`
}

function buildKnowledgeAIDetail(item: KnowledgeDisplayItem, content: string): string {
  const meta = [
    `来源仓库：${item.repo}`,
    `主题：${item.topic}`,
    `片段数：${item.chunkCount}`,
    item.sourcePath ? `源文件：${item.sourcePath}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const excerpt = truncateForAI(content || item.desc, AI_CONTEXT_LIMIT)
  return `${meta}\n\n【正文摘录】\n${excerpt}`
}

function buildKnowledgePrompt(
  action: 'summary' | 'cards' | 'questions',
  item: KnowledgeDisplayItem,
  title: string,
  content: string,
): { display: string; send: string } {
  const excerpt = truncateForAI(content || item.desc, AI_PROMPT_LIMIT)
  const source = [
    `标题：${title}`,
    `来源仓库：${item.repo}`,
    `主题：${item.topic}`,
    item.sourcePath ? `源文件：${item.sourcePath}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const body = `${source}\n\n【正文】\n${excerpt}`

  if (action === 'cards') {
    return {
      display: `把「${title}」整理成复习卡`,
      send: `请基于下面这篇知识文档生成适合复习的卡片：包含核心概念、关键结论、例子、易错点和 3 个自测问题。\n\n${body}`,
    }
  }
  if (action === 'questions') {
    return {
      display: `基于「${title}」提问`,
      send: `请作为学习助教，先阅读下面这篇知识文档，然后给我 5 个适合继续追问的方向，并提示我可以直接围绕本文问你问题。\n\n${body}`,
    }
  }
  return {
    display: `总结「${title}」`,
    send: `请阅读下面这篇知识文档，给出结构化总结：先讲它解决什么问题，再列核心知识点、适合谁读、学习顺序和后续练习建议。\n\n${body}`,
  }
}

function KnowledgeMarkdown({ markdown }: { markdown: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown])
  if (!markdown.trim()) {
    return (
      <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
        这篇文档暂时没有可渲染的正文。
      </div>
    )
  }
  return <div className="knowledge-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

export function KnowledgeView() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(() => makeFilter('all'))
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [selectedItem, setSelectedItem] = useState<KnowledgeDisplayItem | null>(null)
  const [page, setPage] = useState(1)
  const [pendingDocId, setPendingDocId] = useState<number | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    documents,
    selectedDocument,
    loadingDocument,
    searchResults,
    loading,
    uploading,
    importingResourcePack,
    error,
    lastResourcePackImport,
    search,
    upload,
    importPack,
    deleteDocument,
    loadDocument,
  } = useKnowledgeData()

  const setAIContext = useAppStore((state) => state.setAIContext)
  const requestAIChat = useAppStore((state) => state.requestAIChat)

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      if (searchTimer.current) clearTimeout(searchTimer.current)
      searchTimer.current = setTimeout(() => {
        void search(value)
      }, 250)
    },
    [search],
  )

  useEffect(() => {
    setPage(1)
  }, [activeFilter.kind, activeFilter.value, query, sortMode])

  const docsById = useMemo(() => {
    const map = new Map<number, KnowledgeDoc>()
    for (const doc of documents) map.set(doc.id, doc)
    return map
  }, [documents])

  // 命令面板深链：挂载时领取待打开的文档，并订阅后续实时事件。
  useEffect(() => {
    const pending = consumePendingDeepLink('knowledge')
    if (pending) setPendingDocId(Number(pending))
    return subscribeDeepLink('knowledge', (id) => setPendingDocId(Number(id)))
  }, [])
  // 文档列表异步加载，待目标文档就绪后再打开其详情。
  useEffect(() => {
    if (pendingDocId == null) return
    const doc = docsById.get(pendingDocId)
    if (!doc) return
    setSelectedItem(toDocumentDisplayItem(doc))
    void loadDocument(doc.id)
    setPendingDocId(null)
  }, [pendingDocId, docsById, loadDocument])

  const topicGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const doc of documents) {
      const topic = getTopic(doc)
      map.set(topic, (map.get(topic) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [documents])

  const repoGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const doc of documents) {
      const repo = getRepo(doc)
      map.set(repo, (map.get(repo) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [documents])

  const typeGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const doc of documents) {
      const type = normalizeFileType(doc.file_type)
      map.set(type, (map.get(type) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [documents])

  const displayItems = useMemo<KnowledgeDisplayItem[]>(() => {
    const items = query.trim()
      ? searchResults.map((result) => {
          const doc = docsById.get(result.doc_id)
          const fileType = normalizeFileType(doc?.file_type)
          return {
            id: result.doc_id,
            title: doc ? cleanTitle(doc) : result.filename,
            filename: result.filename,
            desc: result.content,
            fileType,
            topic: doc ? getTopic(doc) : '检索结果',
            repo: doc ? getRepo(doc) : '未知来源',
            sourcePath: doc?.source_path,
            sourceUrl: doc?.source_url,
            tags: [fileType, `片段 #${result.chunk_index + 1}`],
            time: doc?.created_at ?? '',
            chunkCount: doc?.chunk_count ?? 0,
            score: result.score,
            chunkIndex: result.chunk_index,
            source: 'search' as const,
          }
        })
      : documents.map(toDocumentDisplayItem)

    const filtered = items.filter((item) => {
      if (activeFilter.kind === 'all') return true
      if (activeFilter.kind === 'topic') return item.topic === activeFilter.value
      if (activeFilter.kind === 'repo') return item.repo === activeFilter.value
      return item.fileType === activeFilter.value
    })

    return filtered.slice().sort((a, b) => {
      if (sortMode === 'name') return a.title.localeCompare(b.title)
      if (sortMode === 'chunks') return b.chunkCount - a.chunkCount
      return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()
    })
  }, [activeFilter, docsById, documents, query, searchResults, sortMode])

  const totalPages = Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visibleItems = displayItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const totalChunks = documents.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0)
  const activeDocument = selectedDocument?.id === selectedItem?.id ? selectedDocument : null
  const activeTitle = activeDocument?.display_title?.trim() || selectedItem?.title || ''
  const detailContent = activeDocument?.content ? stripFrontMatter(activeDocument.content) : ''
  const documentReady = Boolean(activeDocument) && !loadingDocument

  const handleSelectItem = async (item: KnowledgeDisplayItem) => {
    setSelectedItem(item)
    await loadDocument(item.id)
  }

  const handleFilterChange = (filter: ActiveFilter) => {
    setActiveFilter(filter)
    if (selectedItem) {
      setSelectedItem(null)
      setAIContext(null)
    }
  }

  const handleBackToList = () => {
    setSelectedItem(null)
    setAIContext(null)
  }

  const handleDelete = async (item: KnowledgeDisplayItem) => {
    if (!confirm(`确定要删除知识文档「${item.title}」吗？`)) return
    await deleteDocument(item.id)
    if (selectedItem?.id === item.id) setSelectedItem(null)
  }

  const handleKnowledgeAI = useCallback(
    (action: 'summary' | 'cards' | 'questions') => {
      if (!selectedItem) return
      if (!documentReady) return
      const title = activeTitle || selectedItem.title
      const content = detailContent || selectedItem.desc
      setAIContext({
        kind: 'knowledge',
        title,
        detail: buildKnowledgeAIDetail(selectedItem, content),
      })
      const prompt = buildKnowledgePrompt(action, selectedItem, title, content)
      requestAIChat(prompt.display, prompt.send)
    },
    [activeTitle, detailContent, documentReady, requestAIChat, selectedItem, setAIContext],
  )

  useEffect(() => {
    if (!selectedItem) return
    const title = activeTitle || selectedItem.title
    const content = detailContent || selectedItem.desc
    setAIContext({
      kind: 'knowledge',
      title,
      detail: buildKnowledgeAIDetail(selectedItem, content),
    })
    return () => setAIContext(null)
  }, [activeTitle, detailContent, selectedItem, setAIContext])

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-hidden">
      <div className="w-full max-w-[1480px] mx-auto p-5 flex flex-col h-full gap-4">
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">知识库</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {selectedItem
              ? '正在阅读本地 Markdown 文档，可随时让 AI 总结、出复习卡或围绕本文继续提问。'
              : '按主题、来源仓库和类型整理本地资料；点击文档可进入完整阅读页并渲染 Markdown。'}
          </p>
        </div>

        {!selectedItem && (
          <div className="grid grid-cols-4 gap-3 flex-shrink-0">
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <FileText size={14} className="text-[#60A5FA]" />
                文档
              </div>
              <div className="mt-1 text-2xl font-bold text-white font-mono">{documents.length}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <Layers3 size={14} className="text-[#10B981]" />
                片段
              </div>
              <div className="mt-1 text-2xl font-bold text-white font-mono">{totalChunks}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <BookOpen size={14} className="text-[#A78BFA]" />
                主题
              </div>
              <div className="mt-1 text-2xl font-bold text-white font-mono">
                {topicGroups.length}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <Database size={14} className="text-[#F59E0B]" />
                来源
              </div>
              <div className="mt-1 text-2xl font-bold text-white font-mono">
                {repoGroups.length}
              </div>
            </div>
          </div>
        )}

        {!selectedItem && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="relative flex-1 max-w-xl">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <input
                type="text"
                placeholder="搜索标题、正文片段、来源仓库..."
                value={query}
                onChange={handleSearchChange}
                className="w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-purple)]"
              />
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-3 py-2 text-sm text-[var(--color-text-secondary)] bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg outline-none focus:border-[var(--color-accent-primary)]"
            >
              <option value="recent">最近导入</option>
              <option value="name">标题排序</option>
              <option value="chunks">片段数量</option>
            </select>
            <button
              onClick={() => void importPack()}
              disabled={importingResourcePack}
              className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50"
              title="选择 import-ready 或 import-batches 批次目录导入"
            >
              <PackageOpen size={14} /> {importingResourcePack ? '导入中...' : '导入资源包'}
            </button>
            <button
              onClick={() => void upload()}
              disabled={uploading}
              className="bg-[var(--color-accent-purple)] hover:bg-[#7C3AED] text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <Upload size={14} /> {uploading ? '上传中...' : '上传文档'}
            </button>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}
        {lastResourcePackImport && (
          <div className="px-3 py-2 bg-[#10B981]/10 border border-[#10B981]/30 rounded-lg text-xs text-[#10B981]">
            资源包导入完成：知识文档 {lastResourcePackImport.knowledge.imported} 新增 /{' '}
            {lastResourcePackImport.knowledge.skipped} 跳过，知识片段{' '}
            {lastResourcePackImport.knowledge.chunks}；题目{' '}
            {lastResourcePackImport.problems.imported} 新增 /{' '}
            {lastResourcePackImport.problems.updated} 更新 /{' '}
            {lastResourcePackImport.problems.skipped} 跳过。
          </div>
        )}

        <div className="flex-1 flex gap-4 min-h-0 relative">
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 300, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="flex-shrink-0 flex flex-col min-h-0 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden"
              >
                <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">分类导航</span>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="text-[var(--color-text-muted)] hover:text-white transition-colors"
                    title="收起分类栏"
                  >
                    <PanelLeftClose size={16} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                  <button
                    onClick={() => handleFilterChange(makeFilter('all'))}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors',
                      activeFilter.kind === 'all'
                        ? 'bg-[var(--color-accent-purple)]/14 text-[var(--color-accent-purple)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Folder size={16} />
                      全部知识
                    </span>
                    <span className="text-xs font-mono">{documents.length}</span>
                  </button>

                  <div>
                    <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
                      <BookOpen size={13} />
                      主题分类
                    </div>
                    <div className="space-y-1">
                      {topicGroups.map(([name, count]) => (
                        <button
                          key={name}
                          onClick={() => handleFilterChange(makeFilter('topic', name))}
                          className={cn(
                            'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left',
                            activeFilter.kind === 'topic' && activeFilter.value === name
                              ? 'bg-[var(--color-accent-purple)]/14 text-[var(--color-accent-purple)]'
                              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                          )}
                        >
                          <span className="truncate">{name}</span>
                          <span className="text-xs font-mono text-[var(--color-text-muted)]">
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
                      <Database size={13} />
                      来源仓库
                    </div>
                    <div className="space-y-1">
                      {repoGroups.slice(0, 18).map(([name, count]) => (
                        <button
                          key={name}
                          onClick={() => handleFilterChange(makeFilter('repo', name))}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                            activeFilter.kind === 'repo' && activeFilter.value === name
                              ? 'bg-[var(--color-accent-purple)]/14 text-[var(--color-accent-purple)]'
                              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                          )}
                        >
                          <span className="truncate">{name}</span>
                          <span className="text-xs font-mono text-[var(--color-text-muted)]">
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
                      <Tags size={13} />
                      文件类型
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {typeGroups.map(([name, count]) => (
                        <button
                          key={name}
                          onClick={() => handleFilterChange(makeFilter('type', name))}
                          className={cn(
                            'rounded-md border px-2 py-1 text-xs transition-colors',
                            activeFilter.kind === 'type' && activeFilter.value === name
                              ? 'border-[var(--color-accent-purple)] text-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10'
                              : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-white',
                          )}
                        >
                          {name} {count}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {sidebarCollapsed && (
            <div className="w-12 flex-shrink-0 flex flex-col items-center pt-4 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl">
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
            <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-medium text-white text-sm">
                  {query.trim() ? '搜索结果' : filterLabel(activeFilter)} ({displayItems.length})
                </span>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1 truncate">
                  当前只渲染第 {safePage} 页的 {visibleItems.length} 条，避免大批量资料滚动卡顿。
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="rounded-md border border-[var(--color-border-subtle)] p-1.5 disabled:opacity-40 hover:text-white"
                  title="上一页"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="font-mono">
                  {safePage}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded-md border border-[var(--color-border-subtle)] p-1.5 disabled:opacity-40 hover:text-white"
                  title="下一页"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
              {loading && displayItems.length === 0 && (
                <div className="flex items-center justify-center h-32 text-sm text-[var(--color-text-muted)]">
                  加载中...
                </div>
              )}
              {!loading && displayItems.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 text-sm text-[var(--color-text-muted)]">
                  <FileText size={34} className="mb-2 opacity-40" />
                  {query.trim() ? '没有找到匹配资料' : '暂无资料'}
                </div>
              )}

              <div className="space-y-2">
                {visibleItems.map((item) => (
                  <button
                    key={`${item.source}-${item.id}-${item.chunkIndex ?? 'doc'}`}
                    onClick={() => void handleSelectItem(item)}
                    className="group w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-3 text-left transition-colors hover:border-[var(--color-accent-purple)]/45 hover:bg-[var(--color-bg-hover)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-purple)] text-white">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-white group-hover:text-[var(--color-accent-purple)]">
                            {item.title}
                          </h3>
                          <span className="shrink-0 rounded border border-[#10B981]/25 bg-[#10B981]/10 px-1.5 py-0.5 text-[10px] text-[#10B981]">
                            {item.fileType}
                          </span>
                          {formatScore(item.score) && (
                            <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                              {formatScore(item.score)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                          {item.desc}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded bg-[var(--color-bg-panel)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                            {item.topic}
                          </span>
                          <span className="rounded bg-[var(--color-bg-panel)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
                            {item.repo}
                          </span>
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {item.chunkCount} 片段
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Eye size={15} className="text-[var(--color-text-muted)]" />
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
                          className="ml-1 cursor-pointer p-1 text-[var(--color-text-muted)] hover:text-red-400"
                          title="删除文档"
                        >
                          <Trash2 size={14} />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {selectedItem &&
        createPortal(
          <motion.div
            className="knowledge-reader-overlay fixed inset-0 z-[120] flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="knowledge-reader-toolbar flex h-14 shrink-0 items-center justify-between px-5 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={handleBackToList}
                  className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
                >
                  <ArrowLeft size={16} />
                  返回知识库
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {activeTitle}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {selectedItem.sourcePath || selectedItem.filename}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedItem.sourceUrl && (
                  <button
                    onClick={() => void window.api.invoke('open-external', selectedItem.sourceUrl)}
                    className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium"
                  >
                    <ExternalLink size={14} />
                    上游
                  </button>
                )}
                <button
                  onClick={() => handleKnowledgeAI('summary')}
                  disabled={!documentReady}
                  className="knowledge-reader-primary-button inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  title={documentReady ? '让 AI 总结当前全文' : '正文加载完成后可用'}
                >
                  <Sparkles size={14} />
                  AI 总结
                </button>
                <button
                  onClick={() => handleKnowledgeAI('cards')}
                  disabled={!documentReady}
                  className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  title={documentReady ? '根据当前全文生成复习卡' : '正文加载完成后可用'}
                >
                  <ScrollText size={14} />
                  复习卡
                </button>
                <button
                  onClick={() => handleKnowledgeAI('questions')}
                  disabled={!documentReady}
                  className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  title={documentReady ? '围绕当前全文生成提问方向' : '正文加载完成后可用'}
                >
                  <MessageSquare size={14} />
                  提问
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1">
              <aside className="knowledge-reader-sidebar hidden w-72 shrink-0 overflow-y-auto px-4 py-5 xl:block">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      文档信息
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="knowledge-reader-info-card rounded-md p-3">
                        <div className="text-xs text-[var(--color-text-muted)]">主题</div>
                        <div className="mt-1 font-medium text-[var(--color-text-primary)]">
                          {selectedItem.topic}
                        </div>
                      </div>
                      <div className="knowledge-reader-info-card rounded-md p-3">
                        <div className="text-xs text-[var(--color-text-muted)]">来源仓库</div>
                        <div className="mt-1 break-words font-medium text-[var(--color-text-primary)]">
                          {selectedItem.repo}
                        </div>
                      </div>
                      <div className="knowledge-reader-info-card rounded-md p-3">
                        <div className="text-xs text-[var(--color-text-muted)]">片段</div>
                        <div className="mt-1 font-mono font-semibold text-[var(--color-text-primary)]">
                          {selectedItem.chunkCount}
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedItem.tags.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                        标签
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedItem.tags.map((tag) => (
                          <span
                            key={tag}
                            className="knowledge-reader-chip rounded-md px-2 py-1 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedItem.time && (
                    <div className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                      导入时间：{selectedItem.time}
                    </div>
                  )}
                </div>
              </aside>

              <div className="min-w-0 flex-1 overflow-y-auto">
                <article className="knowledge-reader-paper mx-auto my-8 min-h-[calc(100vh-7rem)] w-[min(980px,calc(100vw-2rem))] px-8 py-10 sm:px-14 sm:py-12 lg:px-20">
                  <header className="knowledge-reader-document-header mb-8 pb-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      <span className="knowledge-reader-chip rounded px-2 py-1">
                        {selectedItem.topic}
                      </span>
                      <span className="knowledge-reader-chip rounded px-2 py-1">
                        {selectedItem.repo}
                      </span>
                      <span className="knowledge-reader-chip rounded px-2 py-1">
                        {selectedItem.fileType}
                      </span>
                      {selectedItem.source === 'search' && (
                        <span className="knowledge-reader-chip-warning rounded px-2 py-1">
                          搜索命中片段 #{(selectedItem.chunkIndex ?? 0) + 1}
                        </span>
                      )}
                    </div>
                    <h1 className="break-words text-3xl font-bold leading-tight text-[var(--color-text-primary)]">
                      {activeTitle}
                    </h1>
                    <p className="mt-3 break-words text-sm text-[var(--color-text-muted)]">
                      {selectedItem.sourcePath || selectedItem.filename}
                    </p>
                  </header>

                  {selectedItem.source === 'search' && (
                    <div className="knowledge-reader-hit mb-8 rounded-lg p-4">
                      <div className="knowledge-reader-hit-title mb-2 flex items-center gap-2 text-xs font-semibold">
                        <BrainCircuit size={14} />
                        搜索命中片段
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                        {selectedItem.desc}
                      </p>
                    </div>
                  )}

                  {loadingDocument && !detailContent ? (
                    <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">
                      正在读取文档正文...
                    </div>
                  ) : (
                    <KnowledgeMarkdown markdown={detailContent || selectedItem.desc} />
                  )}
                </article>
              </div>
            </div>
          </motion.div>,
          document.body,
        )}
    </div>
  )
}
