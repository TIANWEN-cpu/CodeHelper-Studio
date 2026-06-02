import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Search,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Keyboard,
  HelpCircle,
  Zap,
  Bug,
  X,
  Lightbulb,
} from 'lucide-react'
import { ShortcutReference } from './ShortcutReference'
import { WhatsNew } from './WhatsNew'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HelpTopic {
  id: string
  title: string
  category: string
  keywords: string[]
  content: string
}

interface FaqItem {
  id: string
  question: string
  answer: string
  keywords: string[]
}

interface HelpSection {
  id: string
  title: string
  icon: typeof BookOpen
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const HELP_SECTIONS: HelpSection[] = [
  { id: 'getting-started', title: '快速开始', icon: Zap },
  { id: 'faq', title: '常见问题', icon: HelpCircle },
  { id: 'shortcuts', title: '快捷键', icon: Keyboard },
  { id: 'troubleshooting', title: '故障排除', icon: Bug },
  { id: 'whats-new', title: '最新动态', icon: Lightbulb },
]

const GETTING_STARTED_TOPICS: HelpTopic[] = [
  {
    id: 'gs-overview',
    title: 'CodeHelper 概述',
    category: 'getting-started',
    keywords: ['概述', '简介', 'overview', '介绍'],
    content:
      'CodeHelper 是一款 AI 驱动的桌面编程助手，集成了代码编辑器、AI 对话、题库系统、知识库检索与错题追踪功能。支持 Python、C/C++、Java、Go、Rust 等多种编程语言。',
  },
  {
    id: 'gs-problems',
    title: '刷题系统',
    category: 'getting-started',
    keywords: ['刷题', '题目', 'problems', '练习'],
    content:
      '点击侧栏的「刷题」图标进入题库。你可以按难度、标签筛选题目，打开题目后在右侧编辑器中编写代码，点击运行按钮或按 Ctrl+Enter 执行代码。提交后系统会自动判题并记录结果。',
  },
  {
    id: 'gs-editor',
    title: '代码编辑器',
    category: 'getting-started',
    keywords: ['编辑器', 'editor', '代码', 'monaco'],
    content:
      '编辑器基于 Monaco Editor，支持语法高亮、自动补全、代码片段、分屏编辑、终端面板等。按 Ctrl+S 保存文件，Ctrl+Enter 运行代码。可通过设置面板调整字体大小、主题和 Tab 宽度。',
  },
  {
    id: 'gs-ai-chat',
    title: 'AI 助手',
    category: 'getting-started',
    keywords: ['AI', '助手', 'chat', '对话'],
    content:
      '点击侧栏的「AI助手」图标打开对话界面。你可以询问编程问题、请求代码解释、查找 Bug 或优化代码。按 Ctrl+N 新建对话。支持代码高亮和 Markdown 渲染。',
  },
  {
    id: 'gs-mistakes',
    title: '错题本',
    category: 'getting-started',
    keywords: ['错题', 'mistakes', '复习'],
    content:
      '错题本自动记录你做错的题目，支持添加分析笔记和标记复习状态。定期复习错题有助于巩固薄弱知识点。',
  },
  {
    id: 'gs-knowledge',
    title: '知识库',
    category: 'getting-started',
    keywords: ['知识库', 'knowledge', '文档', 'RAG'],
    content:
      '知识库支持上传文档并建立搜索索引。AI 可以基于知识库内容回答问题（RAG 模式）。支持语义搜索、自动标签和概念图谱。',
  },
  {
    id: 'gs-stats',
    title: '统计与分析',
    category: 'getting-started',
    keywords: ['统计', 'stats', '分析', 'analytics', '数据'],
    content:
      '统计面板展示你的学习进度、刷题数量、正确率等数据。分析面板提供更深入的学习趋势和薄弱知识点分析。',
  },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-ai-config',
    question: '如何配置 AI 模型？',
    answer: '进入「设置」页面，在 AI 配置区域添加 API 密钥和选择模型。支持多种 AI 服务商的模型。',
    keywords: ['AI', '配置', '模型', 'API', '设置'],
  },
  {
    id: 'faq-theme',
    question: '如何切换主题？',
    answer: '进入「设置」页面，在主题选项中选择 Mocha（深色）、Fjord（冷色）或 Ember（暖色）主题。',
    keywords: ['主题', 'theme', '深色', '暗色'],
  },
  {
    id: 'faq-language',
    question: '支持哪些编程语言？',
    answer:
      '目前支持 Python、C、C++、C#、Java、Go、Rust、JavaScript、TypeScript 等语言。代码编辑器为所有语言提供语法高亮和自动补全。',
    keywords: ['语言', 'language', 'python', 'java', 'cpp'],
  },
  {
    id: 'faq-shortcuts',
    question: '有哪些快捷键？',
    answer:
      '按 F1 打开帮助中心查看完整快捷键列表。常用快捷键包括：Ctrl+Shift+P 命令面板、Ctrl+Shift+F 全局搜索、Ctrl+N 新建对话、Ctrl+Enter 运行代码。',
    keywords: ['快捷键', 'shortcut', '键盘'],
  },
  {
    id: 'faq-save',
    question: '代码会自动保存吗？',
    answer: '是的，编辑器中的代码变更会自动保存到本地数据库。你也可以按 Ctrl+S 手动触发保存确认。',
    keywords: ['保存', 'save', '自动'],
  },
  {
    id: 'faq-knowledge',
    question: '如何使用知识库？',
    answer:
      '进入「知识库」页面，点击上传按钮添加文档。文档会自动建立索引。在 AI 对话中，AI 可以基于知识库内容提供更有针对性的回答。',
    keywords: ['知识库', 'knowledge', '上传', 'RAG'],
  },
  {
    id: 'faq-export',
    question: '可以导出学习数据吗？',
    answer: '在「统计」面板中，点击导出按钮可以将学习数据导出为 JSON 格式文件。',
    keywords: ['导出', 'export', '数据'],
  },
]

const TROUBLESHOOTING_ITEMS: FaqItem[] = [
  {
    id: 'ts-ai-timeout',
    question: 'AI 回复超时或无响应',
    answer:
      '1. 检查网络连接是否正常。\n2. 确认 AI 设置中的 API 密钥是否有效。\n3. 检查 API 服务商是否有速率限制。\n4. 尝试切换到其他 AI 模型。',
    keywords: ['AI', '超时', 'timeout', '无响应', '网络'],
  },
  {
    id: 'ts-code-error',
    question: '代码运行报错',
    answer:
      '1. 检查代码语法是否正确。\n2. 确认所选语言与代码匹配。\n3. 查看终端面板中的完整错误信息。\n4. 某些语言（C/C++）需要本地编译环境，请确保已安装。',
    keywords: ['运行', '报错', 'error', '代码', '执行'],
  },
  {
    id: 'ts-editor-slow',
    question: '编辑器响应缓慢',
    answer:
      '1. 大文件可能影响编辑器性能，尝试拆分文件。\n2. 关闭不需要的分屏视图。\n3. 在设置中关闭 Minimap。\n4. 重启应用以清理内存。',
    keywords: ['慢', 'slow', '卡顿', '性能', '编辑器'],
  },
  {
    id: 'ts-data-lost',
    question: '数据丢失了怎么办？',
    answer:
      '数据存储在本地 SQLite 数据库中。如果遇到数据问题，可以尝试：\n1. 检查应用数据目录是否存在。\n2. 使用知识库搜索功能确认索引是否正常。\n3. 如有备份，可以手动恢复数据库文件。',
    keywords: ['数据', '丢失', 'data', 'lost', '恢复'],
  },
  {
    id: 'ts-sidebar',
    question: '侧栏显示异常',
    answer:
      '1. 点击侧栏底部的展开/收起按钮重置状态。\n2. 重启应用。\n3. 如果问题持续，清除应用设置缓存。',
    keywords: ['侧栏', 'sidebar', '显示', '异常'],
  },
]

// ---------------------------------------------------------------------------
// Fuzzy search
// ---------------------------------------------------------------------------

function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  let ti = 0
  let qi = 0
  while (ti < lowerText.length && qi < lowerQuery.length) {
    if (lowerText[ti] === lowerQuery[qi]) qi++
    ti++
  }
  return qi === lowerQuery.length
}

function topicMatches(topic: HelpTopic, query: string): boolean {
  return (
    fuzzyMatch(topic.title, query) ||
    topic.keywords.some((kw) => fuzzyMatch(kw, query)) ||
    fuzzyMatch(topic.content, query)
  )
}

function faqMatches(item: FaqItem, query: string): boolean {
  return (
    fuzzyMatch(item.question, query) ||
    item.keywords.some((kw) => fuzzyMatch(kw, query)) ||
    fuzzyMatch(item.answer, query)
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HelpCenterProps {
  /** If true, render as an overlay dialog. Defaults to true. */
  overlay?: boolean
  /** Called when closing the overlay. */
  onClose?: () => void
}

export function HelpCenter({ overlay = true, onClose }: HelpCenterProps) {
  const [activeSection, setActiveSection] = useState('getting-started')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search on open
  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [])

  // Escape to close
  useEffect(() => {
    if (!overlay) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [overlay, onClose])

  const toggleTopic = useCallback((id: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Filtered results based on search
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const matchedTopics = GETTING_STARTED_TOPICS.filter((t) => topicMatches(t, searchQuery))
    const matchedFaq = FAQ_ITEMS.filter((f) => faqMatches(f, searchQuery))
    const matchedTs = TROUBLESHOOTING_ITEMS.filter((t) => faqMatches(t, searchQuery))
    return { topics: matchedTopics, faq: matchedFaq, troubleshooting: matchedTs }
  }, [searchQuery])

  const renderContent = () => {
    // Search mode
    if (searchResults) {
      const total =
        searchResults.topics.length +
        searchResults.faq.length +
        searchResults.troubleshooting.length
      if (total === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--theme-text-muted)]">
            <Search size={32} className="mb-3 opacity-40" aria-hidden="true" />
            <p className="text-sm">没有找到匹配的内容</p>
            <p className="text-xs mt-1">尝试使用不同的关键词</p>
          </div>
        )
      }
      return (
        <div className="space-y-4">
          {searchResults.topics.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-2">
                快速开始
              </h3>
              {searchResults.topics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  expanded={expandedTopics.has(topic.id)}
                  onToggle={() => toggleTopic(topic.id)}
                />
              ))}
            </div>
          )}
          {searchResults.faq.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-2">
                常见问题
              </h3>
              {searchResults.faq.map((item) => (
                <FaqCard
                  key={item.id}
                  item={item}
                  expanded={expandedTopics.has(item.id)}
                  onToggle={() => toggleTopic(item.id)}
                />
              ))}
            </div>
          )}
          {searchResults.troubleshooting.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-muted)] mb-2">
                故障排除
              </h3>
              {searchResults.troubleshooting.map((item) => (
                <FaqCard
                  key={item.id}
                  item={item}
                  expanded={expandedTopics.has(item.id)}
                  onToggle={() => toggleTopic(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )
    }

    // Section mode
    switch (activeSection) {
      case 'getting-started':
        return (
          <div className="space-y-2">
            <p className="text-xs text-[var(--theme-text-muted)] mb-3">
              欢迎使用 CodeHelper! 以下是各功能模块的使用指南。
            </p>
            {GETTING_STARTED_TOPICS.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                expanded={expandedTopics.has(topic.id)}
                onToggle={() => toggleTopic(topic.id)}
              />
            ))}
          </div>
        )
      case 'faq':
        return (
          <div className="space-y-2">
            {FAQ_ITEMS.map((item) => (
              <FaqCard
                key={item.id}
                item={item}
                expanded={expandedTopics.has(item.id)}
                onToggle={() => toggleTopic(item.id)}
              />
            ))}
          </div>
        )
      case 'shortcuts':
        return <ShortcutReference />
      case 'troubleshooting':
        return (
          <div className="space-y-2">
            {TROUBLESHOOTING_ITEMS.map((item) => (
              <FaqCard
                key={item.id}
                item={item}
                expanded={expandedTopics.has(item.id)}
                onToggle={() => toggleTopic(item.id)}
              />
            ))}
          </div>
        )
      case 'whats-new':
        return <WhatsNew />
      default:
        return null
    }
  }

  const content = (
    <div className="flex h-full min-h-0">
      {/* Sidebar navigation */}
      <nav
        className="w-48 shrink-0 border-r border-[var(--theme-border)] py-3 overflow-y-auto"
        aria-label="帮助主题导航"
      >
        {HELP_SECTIONS.map((section) => {
          const Icon = section.icon
          return (
            <button
              key={section.id}
              onClick={() => {
                setActiveSection(section.id)
                setSearchQuery('')
              }}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] ${
                activeSection === section.id && !searchQuery
                  ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] font-medium'
                  : 'text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-hover)]'
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {section.title}
            </button>
          )
        })}
      </nav>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-[var(--theme-border)] px-4 py-2.5">
          <Search
            size={14}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索帮助主题..."
            aria-label="搜索帮助内容"
            className="flex-1 bg-transparent text-sm text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-muted)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="shrink-0 rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]"
              aria-label="清除搜索"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{renderContent()}</div>
      </div>
    </div>
  )

  if (!overlay) return content

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="帮助中心"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="ui-card relative z-10 flex flex-col w-full max-w-3xl h-[70vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-5 py-3">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-[var(--theme-accent)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--theme-text-primary)]">帮助中心</h2>
            <span className="text-[10px] text-[var(--theme-text-muted)] bg-[var(--theme-bg-hover)] rounded px-1.5 py-0.5">
              F1
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            aria-label="关闭帮助中心"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 min-h-0">{content}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TopicCard({
  topic,
  expanded,
  onToggle,
}: {
  topic: HelpTopic
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-lg border border-[var(--theme-border)] overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--theme-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown
            size={14}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            size={14}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
        )}
        <span className="font-medium text-[var(--theme-text-primary)]">{topic.title}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pl-10">
          <p className="text-sm leading-6 text-[var(--theme-text-secondary)] whitespace-pre-line">
            {topic.content}
          </p>
        </div>
      )}
    </div>
  )
}

function FaqCard({
  item,
  expanded,
  onToggle,
}: {
  item: FaqItem
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="rounded-lg border border-[var(--theme-border)] overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--theme-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown
            size={14}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            size={14}
            className="shrink-0 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
        )}
        <span className="font-medium text-[var(--theme-text-primary)]">{item.question}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pl-10">
          <p className="text-sm leading-6 text-[var(--theme-text-secondary)] whitespace-pre-line">
            {item.answer}
          </p>
        </div>
      )}
    </div>
  )
}
