import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
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
  Link2,
  ListTree,
  MessageSquare,
  PackageOpen,
  PanelLeft,
  PanelLeftClose,
  RotateCcw,
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
import { renderKnowledgeMarkdown, resolveKnowledgeHeadingId } from '@/utils/markdown'
import {
  applyKnowledgeLinkAuditTooltip,
  defragmentKnowledgeHref,
  resolveKnowledgeLink,
} from '@/utils/knowledgeLinks'
import { consumePendingDeepLink, subscribeDeepLink } from '@/lib/deepLink'
import { recordRecent } from '@/lib/recentItems'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Spinner,
} from '@/components/ui'
import type { KnowledgeDoc, KnowledgeLinkAuditRecord } from '@/services/knowledgeService'
import type {
  KnowledgeRetrievalChannel,
  KnowledgeRetrievalStatus,
} from '@/shared/knowledgeRetrievalContract'

type SortMode = 'relevance' | 'recent' | 'name' | 'chunks'
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
  topicKey: string
  repo: string
  repoKey: string
  sourcePath?: string
  sourceUrl?: string
  sourceCommit?: string
  tags: string[]
  time: string
  chunkCount: number
  score?: number
  keywordScore?: number
  semanticScore?: number
  retrievalChannels?: KnowledgeRetrievalChannel[]
  explanation?: string
  chunkIndex?: number
  source: 'document' | 'search'
}

interface KnowledgeLinkNotice {
  tone: 'info' | 'warning'
  message: string
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
  '06-book-resource-indexes': '书籍与资源索引',
  '07-language-specific': '语言专题',
}

const CATEGORY_ALIASES: Record<string, string> = {
  '01-cs-foundation': '01-core-cs-foundation',
  '02-programming-books': '06-book-resource-indexes',
  '03-ai-deep-learning': '02-ai-deep-learning',
  '04-courses': '04-cs408-and-courses',
  '05-cs408': '04-cs408-and-courses',
  '06-interview': '03-interview-career',
  '07-learning-roadmap': '05-roadmap-and-bug-manual',
  '08-go': '07-language-specific',
  '09-java': '07-language-specific',
  '99-special-recovered': '99-special-recovered',
}

const CATEGORY_VALUE_ALIASES: Record<string, string> = {
  综合计算机基础: '01-core-cs-foundation',
  计算机基础: '01-core-cs-foundation',
  AI与深度学习: '02-ai-deep-learning',
  'AI 与深度学习': '02-ai-deep-learning',
  面试求职: '03-interview-career',
  求职面试: '03-interview-career',
  考研408: '04-cs408-and-courses',
  课程资料: '04-cs408-and-courses',
  'CS408 / 课程': '04-cs408-and-courses',
  编程书籍: '06-book-resource-indexes',
  书籍索引: '06-book-resource-indexes',
  书籍与资源索引: '06-book-resource-indexes',
  Go: '07-language-specific',
  Java: '07-language-specific',
  语言专题: '07-language-specific',
}

function normalizeFileType(fileType?: string | null): string {
  const value = (fileType || 'md').replace(/^\./, '').trim().toLowerCase()
  return value || 'md'
}

function getTopic(
  doc: Pick<KnowledgeDoc, 'category' | 'category_dir' | 'category_key' | 'category_label'>,
): { key: string; label: string } {
  const explicitKey = doc.category_key?.trim()
  const dir = doc.category_dir?.trim()
  const category = doc.category_label?.trim() || doc.category?.trim()
  const key =
    explicitKey ||
    (dir ? CATEGORY_ALIASES[dir] || dir : '') ||
    (category ? CATEGORY_VALUE_ALIASES[category] || category : '') ||
    'uncategorized'
  const label =
    doc.category_label?.trim() ||
    CATEGORY_LABELS[key] ||
    (category ? CATEGORY_LABELS[CATEGORY_VALUE_ALIASES[category]] || category : '') ||
    (dir ? CATEGORY_LABELS[dir] || dir : '') ||
    '未分类资料'
  return { key, label }
}

function normalizeRepoValue(value?: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.hostname.toLowerCase() === 'github.com') {
      const [owner, repo] = url.pathname.split('/').filter(Boolean)
      if (owner && repo) return `${owner}/${repo.replace(/\.git$/i, '')}`
    }
  } catch {
    // Slug-style repository identifiers are handled below.
  }
  return trimmed.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/\.git$/i, '')
}

function getRepo(doc: Pick<KnowledgeDoc, 'source_repo' | 'filename'>): {
  key: string
  label: string
} {
  const sourceRepo = normalizeRepoValue(doc.source_repo)
  if (sourceRepo) return { key: sourceRepo.toLocaleLowerCase('en-US'), label: sourceRepo }
  const prefix = doc.filename.split('__')[0]?.trim()
  if (prefix && !/^\d+$/.test(prefix)) {
    return { key: prefix.toLocaleLowerCase('en-US'), label: prefix }
  }
  return { key: 'unknown', label: '未知来源' }
}

function normalizeSourcePath(value?: string): string | null {
  const trimmed = value?.trim().replace(/\\/g, '/')
  if (!trimmed) return null
  try {
    return decodeURIComponent(trimmed).replace(/^\/+/, '').replace(/\/+/g, '/')
  } catch {
    return trimmed.replace(/^\/+/, '').replace(/\/+/g, '/')
  }
}

function sourceDocumentKey(repoKey: string, sourcePath?: string): string | null {
  const normalizedPath = normalizeSourcePath(sourcePath)
  if (!normalizedPath || repoKey === 'unknown') return null
  return `${repoKey}::${normalizedPath}`
}

function githubRawAssetUrl(repo: string, commit: string, sourcePath: string): string | null {
  const normalizedRepo = normalizeRepoValue(repo)
  const normalizedPath = normalizeSourcePath(sourcePath)
  if (!normalizedRepo || !normalizedPath || !commit.trim()) return null
  const [owner, name, ...extra] = normalizedRepo.split('/')
  if (!owner || !name || extra.length > 0) return null
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${encodeURIComponent(commit.trim())}/${normalizedPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
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
  const topic = getTopic(doc)
  const repo = getRepo(doc)
  const tags = Array.from(
    new Set([fileType, topic.label, ...(doc.tags ?? []).filter((tag) => tag !== 'knowledge')]),
  ).slice(0, 4)
  return {
    id: doc.id,
    title: cleanTitle(doc),
    filename: doc.filename,
    desc: shortText(doc.content_preview),
    fileType,
    topic: topic.label,
    topicKey: topic.key,
    repo: repo.label,
    repoKey: repo.key,
    sourcePath: doc.source_path,
    sourceUrl: doc.source_url,
    sourceCommit: doc.source_commit,
    tags,
    time: doc.created_at,
    chunkCount: doc.chunk_count,
    source: 'document',
  }
}

function formatScore(score?: number): string | null {
  if (typeof score !== 'number' || Number.isNaN(score)) return null
  return `${Math.round(score * 100)}% 相关度`
}

function retrievalModeLabel(status: KnowledgeRetrievalStatus | null): string {
  if (!status) return '检索能力探测中'
  if (status.mode === 'hybrid') return '本地混合检索'
  if (status.mode === 'hybrid-degraded') return '混合检索（降级）'
  if (status.mode === 'keyword-fallback') return '关键词降级检索'
  return '检索不可用'
}

function retrievalChannelLabel(channel: KnowledgeRetrievalChannel): string {
  if (channel === 'keyword') return 'BM25'
  if (channel === 'semantic') return '语义近似'
  return '降级召回'
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

function KnowledgeMarkdown({
  markdown,
  html,
  linkAudit,
  source,
  onClick,
}: {
  markdown: string
  html: string
  linkAudit: KnowledgeLinkAuditRecord[]
  source: KnowledgeDisplayItem
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const recordsByTarget = new Map<string, KnowledgeLinkAuditRecord[]>()
    for (const record of linkAudit) {
      const records = recordsByTarget.get(record.raw_target) ?? []
      records.push(record)
      recordsByTarget.set(record.raw_target, records)
      const defragmented = defragmentKnowledgeHref(record.raw_target)
      if (defragmented && defragmented !== record.raw_target) {
        const fragmentAgnosticRecords = recordsByTarget.get(defragmented) ?? []
        fragmentAgnosticRecords.push(record)
        recordsByTarget.set(defragmented, fragmentAgnosticRecords)
      }
    }

    for (const anchor of root.querySelectorAll<HTMLAnchorElement>(
      'a[data-knowledge-link="true"]',
    )) {
      const href = anchor.getAttribute('href') || ''
      const records =
        recordsByTarget.get(href) ?? recordsByTarget.get(defragmentKnowledgeHref(href)) ?? []
      const record = records.find((item) => item.status === 'not_found') ?? records[0]
      const status = record?.status || 'unchecked'
      anchor.dataset.linkStatus = status
      const statusLabel =
        status === 'reachable'
          ? '离线检查：可访问'
          : status === 'not_found'
            ? '离线检查：上游确认不存在'
            : status === 'temporary_error'
              ? '离线检查：临时网络错误，未判定失效'
              : status === 'malformed'
                ? '链接格式异常'
                : status === 'restricted'
                  ? '离线检查：访问受限，未判定失效'
                  : status === 'unresolved_relative'
                    ? '相对链接暂未解析'
                    : '尚未完成离线检查'
      applyKnowledgeLinkAuditTooltip(anchor, statusLabel, record?.checked_at)
    }

    for (const image of root.querySelectorAll<HTMLImageElement>('img')) {
      const rawSource = image.getAttribute('src') || ''
      const resolution = resolveKnowledgeLink(rawSource, {
        source_repo: source.repo,
        source_url: source.sourceUrl,
        source_path: source.sourcePath,
        source_commit: source.sourceCommit,
      })
      if (resolution.kind === 'corpus-document' && source.sourceCommit) {
        const rawUrl = githubRawAssetUrl(source.repo, source.sourceCommit, resolution.corpusPath)
        if (rawUrl) image.src = rawUrl
      }
    }
  }, [html, linkAudit, source])

  if (!markdown.trim()) {
    return (
      <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
        这篇文档暂时没有可渲染的正文。
      </div>
    )
  }
  return (
    <div
      ref={rootRef}
      className="knowledge-markdown"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function KnowledgeView() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(() => makeFilter('all'))
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [selectedItem, setSelectedItem] = useState<KnowledgeDisplayItem | null>(null)
  const [page, setPage] = useState(1)
  const [pendingDocId, setPendingDocId] = useState<number | null>(null)
  const [pendingHeadingId, setPendingHeadingId] = useState<string | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [readingProgress, setReadingProgress] = useState(0)
  const [linkNotice, setLinkNotice] = useState<KnowledgeLinkNotice | null>(null)
  const [mobileTocOpen, setMobileTocOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDisplayItem | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readerRef = useRef<HTMLDivElement | null>(null)
  const readerScrollRef = useRef<HTMLDivElement | null>(null)
  const scrollFrame = useRef<number | null>(null)
  const headingOffsetsRef = useRef<Array<{ id: string; top: number }>>([])

  const {
    documents,
    selectedDocument,
    loadingDocument,
    documentError,
    documentLinkAudit,
    searchResults,
    retrievalStatus,
    loadingRetrievalStatus,
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
    setPendingHeadingId(null)
    setActiveHeadingId(null)
    setReadingProgress(0)
    setLinkNotice(null)
    void loadDocument(doc.id)
    setPendingDocId(null)
  }, [pendingDocId, docsById, loadDocument])

  const topicGroups = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const doc of documents) {
      const topic = getTopic(doc)
      const current = map.get(topic.key)
      map.set(topic.key, { label: topic.label, count: (current?.count ?? 0) + 1 })
    }
    return [...map.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label),
    )
  }, [documents])

  const repoGroups = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const doc of documents) {
      const repo = getRepo(doc)
      const current = map.get(repo.key)
      map.set(repo.key, { label: repo.label, count: (current?.count ?? 0) + 1 })
    }
    return [...map.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label),
    )
  }, [documents])

  const typeGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const doc of documents) {
      const type = normalizeFileType(doc.file_type)
      map.set(type, (map.get(type) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [documents])

  const activeFilterLabel = useMemo(() => {
    if (activeFilter.kind === 'topic') {
      return (
        topicGroups.find(([key]) => key === activeFilter.value)?.[1].label ?? activeFilter.value
      )
    }
    if (activeFilter.kind === 'repo') {
      return repoGroups.find(([key]) => key === activeFilter.value)?.[1].label ?? activeFilter.value
    }
    return filterLabel(activeFilter)
  }, [activeFilter, repoGroups, topicGroups])

  const displayItems = useMemo<KnowledgeDisplayItem[]>(() => {
    const items = query.trim()
      ? searchResults.map((result) => {
          const doc = docsById.get(result.doc_id)
          const fileType = normalizeFileType(doc?.file_type)
          const topic = doc ? getTopic(doc) : { key: 'search-results', label: '检索结果' }
          const repo = doc ? getRepo(doc) : { key: 'unknown', label: '未知来源' }
          return {
            id: result.doc_id,
            title: doc ? cleanTitle(doc) : result.filename,
            filename: result.filename,
            desc: result.content,
            fileType,
            topic: topic.label,
            topicKey: topic.key,
            repo: repo.label,
            repoKey: repo.key,
            sourcePath: doc?.source_path,
            sourceUrl: doc?.source_url,
            sourceCommit: doc?.source_commit,
            tags: [fileType, `片段 #${result.chunk_index + 1}`],
            time: doc?.created_at ?? '',
            chunkCount: doc?.chunk_count ?? 0,
            score: result.score,
            keywordScore: result.keywordScore,
            semanticScore: result.semanticScore,
            retrievalChannels: result.channels,
            explanation: result.explanation,
            chunkIndex: result.chunk_index,
            source: 'search' as const,
          }
        })
      : documents.map(toDocumentDisplayItem)

    const filtered = items.filter((item) => {
      if (activeFilter.kind === 'all') return true
      if (activeFilter.kind === 'topic') return item.topicKey === activeFilter.value
      if (activeFilter.kind === 'repo') return item.repoKey === activeFilter.value
      return item.fileType === activeFilter.value
    })

    return filtered.slice().sort((a, b) => {
      if (query.trim() || sortMode === 'relevance') return (b.score ?? 0) - (a.score ?? 0)
      if (sortMode === 'name') return a.title.localeCompare(b.title)
      if (sortMode === 'chunks') return b.chunkCount - a.chunkCount
      return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()
    })
  }, [activeFilter, docsById, documents, query, searchResults, sortMode])

  const totalPages = Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visibleItems = displayItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const totalChunks = documents.reduce((sum, doc) => sum + (doc.chunk_count || 0), 0)
  const docsBySourcePath = useMemo(() => {
    const map = new Map<string, KnowledgeDoc | null>()
    for (const doc of documents) {
      const repo = getRepo(doc)
      const key = sourceDocumentKey(repo.key, doc.source_path)
      if (!key) continue
      map.set(key, map.has(key) ? null : doc)
    }
    return map
  }, [documents])
  const activeDocument = selectedDocument?.id === selectedItem?.id ? selectedDocument : null
  const activeTitle = activeDocument?.display_title?.trim() || selectedItem?.title || ''
  const detailContent = activeDocument?.content ? stripFrontMatter(activeDocument.content) : ''
  const documentReady = Boolean(activeDocument) && !loadingDocument
  const renderedDocument = useMemo(() => renderKnowledgeMarkdown(detailContent), [detailContent])

  const handleSelectItem = useCallback(
    async (item: KnowledgeDisplayItem, headingId: string | null = null) => {
      setSelectedItem(item)
      setPendingHeadingId(headingId)
      setActiveHeadingId(null)
      setReadingProgress(0)
      setLinkNotice(null)
      setMobileTocOpen(false)
      await loadDocument(item.id)
      recordRecent({ kind: 'knowledge', id: String(item.id) })
    },
    [loadDocument],
  )

  const handleFilterChange = (filter: ActiveFilter) => {
    setActiveFilter(filter)
    if (selectedItem) {
      setSelectedItem(null)
      setAIContext(null)
      setLinkNotice(null)
    }
  }

  const handleBackToList = useCallback(() => {
    setSelectedItem(null)
    setAIContext(null)
    setPendingHeadingId(null)
    setActiveHeadingId(null)
    setReadingProgress(0)
    setLinkNotice(null)
    setMobileTocOpen(false)
  }, [setAIContext])

  // 阅读器打开时：焦点移入覆盖层、Escape 关闭、关闭后还原焦点
  useEffect(() => {
    if (!selectedItem) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const reader = readerRef.current
    const firstFocusable = reader?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    ;(firstFocusable ?? reader)?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      handleBackToList()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus?.()
    }
    // 仅在阅读器开/关时执行，文档切换不重置焦点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(selectedItem), handleBackToList])

  const handleDelete = (item: KnowledgeDisplayItem) => {
    setDeleteTarget(item)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    await deleteDocument(deleteTarget.id)
    if (selectedItem?.id === deleteTarget.id) setSelectedItem(null)
    setDeleteTarget(null)
  }

  const resolveOutlineId = useCallback(
    (fragment?: string) => resolveKnowledgeHeadingId(fragment, renderedDocument.outline),
    [renderedDocument.outline],
  )

  const scrollToHeading = useCallback((headingId: string, behavior: ScrollBehavior = 'smooth') => {
    const container = readerScrollRef.current
    if (!container) return false
    const cached = headingOffsetsRef.current.find((heading) => heading.id === headingId)
    if (!cached) return false
    container.scrollTo({ top: Math.max(0, cached.top - 24), behavior })
    setActiveHeadingId(headingId)
    setMobileTocOpen(false)
    return true
  }, [])

  const cacheHeadingOffsets = useCallback(() => {
    const container = readerScrollRef.current
    if (!container) {
      headingOffsetsRef.current = []
      return
    }
    const containerTop = container.getBoundingClientRect().top
    headingOffsetsRef.current = renderedDocument.outline.flatMap((heading) => {
      const element = document.getElementById(heading.id)
      if (!element || !container.contains(element)) return []
      return [
        {
          id: heading.id,
          top: element.getBoundingClientRect().top - containerTop + container.scrollTop,
        },
      ]
    })
  }, [renderedDocument.outline])

  const handleReaderScroll = useCallback(() => {
    if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = requestAnimationFrame(() => {
      const container = readerScrollRef.current
      if (!container) return
      const available = container.scrollHeight - container.clientHeight
      setReadingProgress(
        available <= 0 ? 100 : Math.min(100, (container.scrollTop / available) * 100),
      )

      const offsets = headingOffsetsRef.current
      const threshold = container.scrollTop + 96
      let low = 0
      let high = offsets.length - 1
      let activeIndex = -1
      while (low <= high) {
        const middle = (low + high) >> 1
        if (offsets[middle].top <= threshold) {
          activeIndex = middle
          low = middle + 1
        } else {
          high = middle - 1
        }
      }
      setActiveHeadingId(offsets[activeIndex]?.id ?? offsets[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    if (!documentReady) {
      headingOffsetsRef.current = []
      return
    }
    const frame = requestAnimationFrame(() => {
      cacheHeadingOffsets()
      handleReaderScroll()
    })
    const container = readerScrollRef.current
    const article = container?.querySelector('article')
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            cacheHeadingOffsets()
            handleReaderScroll()
          })
    if (article) observer?.observe(article)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [cacheHeadingOffsets, documentReady, handleReaderScroll])

  useEffect(() => {
    const container = readerScrollRef.current
    if (!selectedItem || !container) return
    container.scrollTo({ top: 0 })
    setReadingProgress(0)
    handleReaderScroll()
  }, [handleReaderScroll, selectedItem])

  useEffect(() => {
    if (!documentReady || !pendingHeadingId) return
    const frame = requestAnimationFrame(() => {
      const resolvedId = resolveOutlineId(pendingHeadingId)
      if (resolvedId && scrollToHeading(resolvedId, 'auto')) {
        setLinkNotice(null)
      } else {
        setLinkNotice({ tone: 'warning', message: `未找到标题定位：#${pendingHeadingId}` })
      }
      setPendingHeadingId(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [documentReady, pendingHeadingId, resolveOutlineId, scrollToHeading])

  useEffect(
    () => () => {
      if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current)
    },
    [],
  )

  const handleMarkdownClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      const anchor = target.closest<HTMLAnchorElement>('a[data-knowledge-link="true"]')
      if (!anchor || !selectedItem) return
      event.preventDefault()
      const href = anchor.getAttribute('href') || ''
      const resolution = resolveKnowledgeLink(href, {
        source_repo: selectedItem.repo,
        source_url: selectedItem.sourceUrl,
        source_path: selectedItem.sourcePath,
        source_commit: selectedItem.sourceCommit,
      })

      if (resolution.kind === 'same-document') {
        const headingId = resolveOutlineId(resolution.fragment)
        if (headingId && scrollToHeading(headingId)) {
          setLinkNotice(null)
        } else {
          setLinkNotice({ tone: 'warning', message: '这个文内链接没有匹配到可定位的标题。' })
        }
        return
      }

      if (resolution.kind === 'corpus-document') {
        const key = sourceDocumentKey(selectedItem.repoKey, resolution.corpusPath)
        const targetDocument = key ? docsBySourcePath.get(key) : null
        if (targetDocument) {
          void handleSelectItem(toDocumentDisplayItem(targetDocument), resolution.fragment ?? null)
          return
        }
        if (resolution.externalUrl) {
          setLinkNotice({
            tone: 'info',
            message: '本地知识库未收录该目标，已转到可追踪的上游文件地址。',
          })
          void window.api.invoke('open-external', resolution.externalUrl).catch(() => {
            setLinkNotice({ tone: 'warning', message: '无法打开上游文件地址，请稍后重试。' })
          })
          return
        }
        setLinkNotice({ tone: 'warning', message: '无法从当前来源信息解析这个相对链接。' })
        return
      }

      if (resolution.kind === 'external') {
        if (resolution.protocol === 'mailto:') {
          setLinkNotice({ tone: 'warning', message: '当前桌面端只允许打开 http/https 外部链接。' })
          return
        }
        setLinkNotice({
          tone: 'info',
          message: '正在浏览器中打开外部链接；离线审计状态见链接提示。',
        })
        void window.api.invoke('open-external', resolution.resolvedHref).catch(() => {
          setLinkNotice({ tone: 'warning', message: '无法打开外部链接，请检查地址后重试。' })
        })
        return
      }

      setLinkNotice({
        tone: 'warning',
        message:
          resolution.kind === 'blocked'
            ? '这个链接使用了不受支持或不安全的地址格式，已阻止打开。'
            : '缺少足够的来源信息，暂时无法解析这个链接。',
      })
    },
    [docsBySourcePath, handleSelectItem, resolveOutlineId, scrollToHeading, selectedItem],
  )

  const handleOpenSource = useCallback(() => {
    if (!selectedItem?.sourceUrl) return
    const resolution = resolveKnowledgeLink(selectedItem.sourceUrl)
    if (resolution.kind !== 'external' || !['http:', 'https:'].includes(resolution.protocol)) {
      setLinkNotice({ tone: 'warning', message: '来源地址不是可安全打开的 http/https 链接。' })
      return
    }
    void window.api.invoke('open-external', resolution.resolvedHref).catch(() => {
      setLinkNotice({ tone: 'warning', message: '无法打开上游来源，请稍后重试。' })
    })
  }, [selectedItem])

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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="w-full max-w-[1480px] mx-auto p-5 flex flex-col h-full gap-4">
        <div className="flex-shrink-0">
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            知识库
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {selectedItem
              ? '正在阅读本地 Markdown 文档，可随时让 AI 总结、出复习卡或围绕本文继续提问。'
              : '按主题、来源仓库和类型整理本地资料；点击文档可进入完整阅读页并渲染 Markdown。'}
          </p>
        </div>

        {!selectedItem && (
          <div className="grid flex-shrink-0 grid-cols-4 gap-3">
            <Card padding="none" className="px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <FileText size={14} className="text-[var(--color-accent-primary)]" />
                文档
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-[var(--color-text-primary)]">
                {documents.length}
              </div>
            </Card>
            <Card padding="none" className="px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <Layers3 size={14} className="text-[var(--color-accent-success)]" />
                片段
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-[var(--color-text-primary)]">
                {totalChunks}
              </div>
            </Card>
            <Card padding="none" className="px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <BookOpen size={14} className="text-[var(--color-accent-purple)]" />
                主题
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-[var(--color-text-primary)]">
                {topicGroups.length}
              </div>
            </Card>
            <Card padding="none" className="px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <Database size={14} className="text-[var(--color-accent-warning)]" />
                来源
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-[var(--color-text-primary)]">
                {repoGroups.length}
              </div>
            </Card>
          </div>
        )}

        {!selectedItem && (
          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="relative max-w-xl flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <Input
                type="text"
                placeholder="搜索标题、正文片段、来源仓库..."
                value={query}
                onChange={handleSearchChange}
                className="pl-9"
                aria-label="搜索知识库"
              />
            </div>
            <div className="w-36 shrink-0">
              <Select
                value={query.trim() ? 'relevance' : sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                disabled={Boolean(query.trim())}
                aria-label="排序方式"
              >
                <option value="relevance">相关度排序</option>
                <option value="recent">最近导入</option>
                <option value="name">标题排序</option>
                <option value="chunks">片段数量</option>
              </Select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void importPack()}
              disabled={importingResourcePack}
              title="选择 import-ready 或 import-batches 批次目录导入"
            >
              <PackageOpen size={14} /> {importingResourcePack ? '导入中...' : '导入资源包'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => void upload()} disabled={uploading}>
              <Upload size={14} /> {uploading ? '上传中...' : '上传文档'}
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-[var(--color-accent-danger)]/30 bg-[var(--color-accent-danger)]/10 px-3 py-2 text-xs text-[var(--color-accent-danger)]">
            {error}
          </div>
        )}
        {!selectedItem && (
          <div
            data-testid="knowledge-retrieval-status"
            title={retrievalStatus?.reason}
            className={cn(
              'flex items-center gap-2 border-y border-[var(--color-border-subtle)] px-1 py-2 text-xs',
              retrievalStatus && !retrievalStatus.available
                ? 'text-[var(--color-accent-danger)]'
                : retrievalStatus?.degraded
                  ? 'text-[var(--color-accent-warning)]'
                  : 'text-[var(--color-text-secondary)]',
            )}
          >
            <BrainCircuit size={14} />
            <span>
              {loadingRetrievalStatus ? '检索能力探测中' : retrievalModeLabel(retrievalStatus)}
            </span>
            {retrievalStatus && (
              <span className="text-[var(--color-text-muted)]">
                {retrievalStatus.lexicalBackend} + {retrievalStatus.semanticBackend}
              </span>
            )}
            {query.trim() && retrievalStatus && (
              <span className="ml-auto font-mono text-[var(--color-text-muted)]">
                {retrievalStatus.chunkCount} 个可检索片段
              </span>
            )}
          </div>
        )}
        {lastResourcePackImport && (
          <div className="rounded-lg border border-[var(--color-accent-success)]/30 bg-[var(--color-accent-success)]/10 px-3 py-2 text-xs text-[var(--color-accent-success)]">
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
                <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] p-4">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    分类导航
                  </span>
                  <IconButton label="收起分类栏" onClick={() => setSidebarCollapsed(true)}>
                    <PanelLeftClose />
                  </IconButton>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                  <button
                    onClick={() => handleFilterChange(makeFilter('all'))}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors',
                      activeFilter.kind === 'all'
                        ? 'bg-[var(--color-accent-purple)]/14 text-[var(--color-accent-purple)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
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
                      {topicGroups.map(([key, group]) => (
                        <button
                          key={key}
                          onClick={() => handleFilterChange(makeFilter('topic', key))}
                          className={cn(
                            'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors text-left',
                            activeFilter.kind === 'topic' && activeFilter.value === key
                              ? 'bg-[var(--color-accent-purple)]/14 text-[var(--color-accent-purple)]'
                              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
                          )}
                        >
                          <span className="truncate">{group.label}</span>
                          <span className="text-xs font-mono text-[var(--color-text-muted)]">
                            {group.count}
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
                      {repoGroups.map(([key, group]) => (
                        <button
                          key={key}
                          onClick={() => handleFilterChange(makeFilter('repo', key))}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                            activeFilter.kind === 'repo' && activeFilter.value === key
                              ? 'bg-[var(--color-accent-purple)]/14 text-[var(--color-accent-purple)]'
                              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
                          )}
                        >
                          <span className="truncate">{group.label}</span>
                          <span className="text-xs font-mono text-[var(--color-text-muted)]">
                            {group.count}
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
                              : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
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
            <div className="flex w-12 flex-shrink-0 flex-col items-center rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] pt-4">
              <IconButton
                label="展开分类栏"
                variant="outline"
                onClick={() => setSidebarCollapsed(false)}
              >
                <PanelLeft />
              </IconButton>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] p-4">
              <div className="min-w-0">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {query.trim() ? '搜索结果' : activeFilterLabel} ({displayItems.length})
                </span>
                <p className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">
                  当前只渲染第 {safePage} 页的 {visibleItems.length} 条，避免大批量资料滚动卡顿。
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <IconButton
                  label="上一页"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft />
                </IconButton>
                <span className="font-mono">
                  {safePage}/{totalPages}
                </span>
                <IconButton
                  label="下一页"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  <ChevronRight />
                </IconButton>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
              {loading && displayItems.length === 0 && (
                <div className="flex h-32 items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
                  <Spinner size="sm" label="加载知识库" />
                  加载中...
                </div>
              )}
              {!loading && displayItems.length === 0 && (
                <EmptyState
                  icon={FileText}
                  title={query.trim() ? '没有找到匹配资料' : '暂无资料'}
                  className="h-48 py-0"
                />
              )}

              <div className="space-y-2">
                {visibleItems.map((item) => (
                  <button
                    key={`${item.source}-${item.id}-${item.chunkIndex ?? 'doc'}`}
                    onClick={() => void handleSelectItem(item)}
                    className="group w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-3 text-left transition-colors hover:border-[var(--color-accent-purple)]/45 hover:bg-[var(--color-bg-hover)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-secondary-solid)] text-[var(--color-on-accent)]">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent-purple)]">
                            {item.title}
                          </h3>
                          <Badge variant="success" className="shrink-0 px-1.5 py-0.5 text-[10px]">
                            {item.fileType}
                          </Badge>
                          {formatScore(item.score) && (
                            <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                              {formatScore(item.score)}
                            </span>
                          )}
                          {item.retrievalChannels?.map((channel) => (
                            <Badge
                              key={channel}
                              variant="neutral"
                              className="shrink-0 border border-[var(--color-border-subtle)] bg-transparent px-1.5 py-0.5 text-[10px]"
                            >
                              {retrievalChannelLabel(channel)}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                          {item.desc}
                        </p>
                        {item.explanation && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)]">
                            <BrainCircuit size={11} className="shrink-0" />
                            <span className="truncate">{item.explanation}</span>
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="neutral" className="text-[11px] font-normal">
                            {item.topic}
                          </Badge>
                          <Badge variant="neutral" className="text-[11px] font-normal">
                            {item.repo}
                          </Badge>
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            {item.source === 'search'
                              ? `${item.sourcePath || item.filename} · 片段 #${(item.chunkIndex ?? 0) + 1}`
                              : `${item.chunkCount} 片段`}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Eye size={15} className="text-[var(--color-text-muted)]" />
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="删除文档"
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
                          className="ml-1 cursor-pointer p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-danger)]"
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
            ref={readerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`知识文档阅读器：${activeTitle || selectedItem.title}`}
            tabIndex={-1}
            className="knowledge-reader-overlay fixed inset-0 z-[120] flex flex-col outline-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="knowledge-reader-toolbar flex h-14 shrink-0 items-center justify-between gap-3 overflow-x-auto px-3 shadow-sm sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={handleBackToList}
                  className="knowledge-reader-secondary-button inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm font-medium sm:px-3"
                  title="返回知识库"
                >
                  <ArrowLeft size={16} />
                  <span className="hidden sm:inline">返回知识库</span>
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
                {renderedDocument.outline.length > 0 && (
                  <button
                    onClick={() => setMobileTocOpen((open) => !open)}
                    className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium xl:hidden"
                    title="文档目录"
                    aria-expanded={mobileTocOpen}
                  >
                    <ListTree size={14} />
                    <span className="hidden md:inline">目录</span>
                  </button>
                )}
                {selectedItem.sourceUrl && (
                  <button
                    onClick={handleOpenSource}
                    className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium sm:px-3"
                    title="打开上游仓库"
                  >
                    <ExternalLink size={14} />
                    <span className="hidden md:inline">上游</span>
                  </button>
                )}
                <button
                  onClick={() => handleKnowledgeAI('summary')}
                  disabled={!documentReady}
                  className="knowledge-reader-primary-button inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
                  title={documentReady ? '让 AI 总结当前全文' : '正文加载完成后可用'}
                >
                  <Sparkles size={14} />
                  <span className="hidden md:inline">AI 总结</span>
                </button>
                <button
                  onClick={() => handleKnowledgeAI('cards')}
                  disabled={!documentReady}
                  className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
                  title={documentReady ? '根据当前全文生成复习卡' : '正文加载完成后可用'}
                >
                  <ScrollText size={14} />
                  <span className="hidden lg:inline">复习卡</span>
                </button>
                <button
                  onClick={() => handleKnowledgeAI('questions')}
                  disabled={!documentReady}
                  className="knowledge-reader-secondary-button inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
                  title={documentReady ? '围绕当前全文生成提问方向' : '正文加载完成后可用'}
                >
                  <MessageSquare size={14} />
                  <span className="hidden lg:inline">提问</span>
                </button>
              </div>
            </div>
            <div className="knowledge-reader-progress h-0.5 shrink-0" aria-hidden="true">
              <div style={{ width: `${readingProgress}%` }} />
            </div>

            {mobileTocOpen && renderedDocument.outline.length > 0 && (
              <div className="knowledge-reader-mobile-toc absolute left-3 right-3 top-16 z-10 max-h-[55vh] overflow-y-auto rounded-md p-3 shadow-xl xl:hidden">
                <div className="mb-2 text-xs font-semibold text-[var(--color-text-muted)]">
                  文档目录
                </div>
                <div className="space-y-1">
                  {renderedDocument.outline.map((heading) => (
                    <button
                      key={heading.id}
                      onClick={() => scrollToHeading(heading.id)}
                      className={cn(
                        'block w-full rounded px-2 py-1.5 text-left text-xs leading-relaxed',
                        heading.id === activeHeadingId
                          ? 'bg-[var(--color-accent-primary)]/12 text-[var(--color-accent-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                      )}
                      style={{ paddingLeft: `${8 + (heading.depth - 1) * 12}px` }}
                    >
                      {heading.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                      <div className="knowledge-reader-info-card rounded-md p-3">
                        <div className="text-xs text-[var(--color-text-muted)]">源文件路径</div>
                        <div className="mt-1 break-all text-xs leading-relaxed text-[var(--color-text-primary)]">
                          {selectedItem.sourcePath || selectedItem.filename}
                        </div>
                      </div>
                      {selectedItem.sourceCommit && (
                        <div className="knowledge-reader-info-card rounded-md p-3">
                          <div className="text-xs text-[var(--color-text-muted)]">来源版本</div>
                          <div className="mt-1 break-all font-mono text-xs text-[var(--color-text-primary)]">
                            {selectedItem.sourceCommit}
                          </div>
                        </div>
                      )}
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

                  {renderedDocument.outline.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                        <ListTree size={13} />
                        文档目录
                      </div>
                      <nav className="mt-3 space-y-1" aria-label="文档目录">
                        {renderedDocument.outline.map((heading) => (
                          <button
                            key={heading.id}
                            onClick={() => scrollToHeading(heading.id)}
                            className={cn(
                              'block w-full rounded px-2 py-1.5 text-left text-xs leading-relaxed transition-colors',
                              heading.id === activeHeadingId
                                ? 'bg-[var(--color-accent-primary)]/12 text-[var(--color-accent-primary)]'
                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
                            )}
                            style={{ paddingLeft: `${8 + (heading.depth - 1) * 12}px` }}
                          >
                            {heading.text}
                          </button>
                        ))}
                      </nav>
                    </div>
                  )}

                  {selectedItem.time && (
                    <div className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                      导入时间：{selectedItem.time}
                    </div>
                  )}
                </div>
              </aside>

              <div
                ref={readerScrollRef}
                onScroll={handleReaderScroll}
                data-testid="knowledge-reader-scroll"
                className="min-w-0 flex-1 overflow-y-auto"
              >
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

                  {linkNotice && (
                    <div
                      className={cn(
                        'knowledge-reader-link-notice mb-6 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm',
                        linkNotice.tone === 'warning'
                          ? 'knowledge-reader-link-notice-warning'
                          : 'knowledge-reader-link-notice-info',
                      )}
                      role="status"
                    >
                      {linkNotice.tone === 'warning' ? (
                        <AlertTriangle className="mt-0.5 shrink-0" size={15} />
                      ) : (
                        <Link2 className="mt-0.5 shrink-0" size={15} />
                      )}
                      <span>{linkNotice.message}</span>
                    </div>
                  )}

                  {loadingDocument && !detailContent ? (
                    <div className="space-y-4 py-8" aria-busy="true">
                      <Skeleton className="h-6 w-2/5" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <span className="sr-only">正在读取文档正文...</span>
                    </div>
                  ) : documentError ? (
                    <div className="knowledge-reader-error rounded-md p-6 text-center" role="alert">
                      <AlertTriangle
                        className="mx-auto text-[var(--color-accent-warning)]"
                        size={24}
                      />
                      <p className="mt-3 text-sm font-medium text-[var(--color-text-primary)]">
                        正文读取失败
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{documentError}</p>
                      <button
                        onClick={() => void loadDocument(selectedItem.id)}
                        className="knowledge-reader-secondary-button mt-4 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
                      >
                        <RotateCcw size={15} />
                        重试
                      </button>
                    </div>
                  ) : documentReady ? (
                    <KnowledgeMarkdown
                      markdown={detailContent}
                      html={renderedDocument.html}
                      linkAudit={documentLinkAudit}
                      source={selectedItem}
                      onClick={handleMarkdownClick}
                    />
                  ) : (
                    <div className="py-20 text-center text-sm text-[var(--color-text-muted)]">
                      正文尚未就绪。
                    </div>
                  )}
                </article>
              </div>
            </div>
          </motion.div>,
          document.body,
        )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除知识文档"
        description={deleteTarget ? `确定要删除知识文档「${deleteTarget.title}」吗？` : undefined}
        confirmText="删除"
        danger
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
