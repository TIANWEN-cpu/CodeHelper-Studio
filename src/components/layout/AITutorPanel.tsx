import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles,
  X,
  MessageSquare,
  Zap,
  BookOpen,
  BrainCircuit,
  FileCode,
  Send,
  Loader2,
  Plus,
  Trash2,
  History,
  ChevronDown,
  Bug,
  GraduationCap,
  Lightbulb,
  Mic,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { useAIChat } from '@/hooks/useAIChat'
import {
  AI_PANEL_DEFAULT_WIDTH,
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  useAppStore,
  type AIContextSnapshot,
} from '@/store'
import { renderMarkdown } from '@/utils/markdown'
import type { ViewType } from '@/types'

// 当前页面 -> 中文上下文标签（与 Sidebar 导航保持一致）。
const VIEW_LABELS: Record<ViewType, string> = {
  home: '首页',
  learn: '课程学习',
  practice: '题库练习',
  workspace: '编程工作区',
  'ai-tutor': 'AI 辅导',
  review: '复习与错题',
  knowledge: '知识库',
  settings: '设置',
  profile: '个人主页',
}

type QuickAction = {
  id: string
  label: string
  prompt: string
  icon: typeof Sparkles
  color: string
}

type TutorMode = 'socratic' | 'explain' | 'interview' | 'review' | 'codeReview'

const TUTOR_MODES: Record<
  TutorMode,
  { label: string; shortLabel: string; instruction: string; icon: typeof Sparkles }
> = {
  socratic: {
    label: '苏格拉底模式',
    shortLabel: '提示',
    icon: Lightbulb,
    instruction:
      '请使用苏格拉底式教学：先给 1-3 个逐步提示和追问，尽量不直接给完整答案，除非用户明确要求。',
  },
  explain: {
    label: '讲解模式',
    shortLabel: '讲解',
    icon: GraduationCap,
    instruction: '请用清晰、循序渐进的方式详细讲解，必要时给出小例子和关键概念对照。',
  },
  interview: {
    label: '面试官模式',
    shortLabel: '面试',
    icon: Mic,
    instruction:
      '请像技术面试官一样回应：追问复杂度、边界情况、权衡和可证明性，不要只停留在答案本身。',
  },
  review: {
    label: '复盘模式',
    shortLabel: '复盘',
    icon: RotateCcw,
    instruction: '请聚焦学习复盘：指出错误根因、知识漏洞、下次复习动作和同类题训练建议。',
  },
  codeReview: {
    label: '代码审查模式',
    shortLabel: '审查',
    icon: ShieldCheck,
    instruction:
      '请做代码审查：优先指出 bug、边界条件、可读性、复杂度和测试缺口，给出可执行修改建议。',
  },
}

const PAGE_QUICK_ACTIONS: Partial<Record<ViewType, QuickAction[]>> = {
  home: [
    {
      id: 'home-plan',
      label: '规划今天',
      prompt: '请根据当前学习状态，帮我制定今天的学习顺序和时间分配。',
      icon: Target,
      color: '#F59E0B',
    },
    {
      id: 'home-review',
      label: '找薄弱点',
      prompt: '请帮我从最近学习记录中归纳可能的薄弱点，并给出下一步行动。',
      icon: BrainCircuit,
      color: '#3B82F6',
    },
    {
      id: 'home-summary',
      label: '总结今日',
      prompt: '请帮我生成一份今日学习总结模板，包含课程、练习、错题和待复习项。',
      icon: ScrollText,
      color: '#10B981',
    },
    {
      id: 'home-motivate',
      label: '降低选择',
      prompt: '请只告诉我接下来 15 分钟最应该做的一件事，并说明原因。',
      icon: Lightbulb,
      color: '#8B5CF6',
    },
  ],
  learn: [
    {
      id: 'learn-explain',
      label: '解释这一节',
      prompt: '请解释当前课程这一节的核心知识点，并指出最容易误解的地方。',
      icon: BookOpen,
      color: '#8B5CF6',
    },
    {
      id: 'learn-practice',
      label: '生成练习题',
      prompt: '请基于当前课程内容生成 3 道递进式小练习，不要直接给答案。',
      icon: FileCode,
      color: '#10B981',
    },
    {
      id: 'learn-summary',
      label: '总结知识点',
      prompt: '请把当前课程内容整理成适合复习的知识点卡片。',
      icon: ScrollText,
      color: '#3B82F6',
    },
    {
      id: 'learn-check',
      label: '检查理解',
      prompt: '请用 5 个问题检查我是否理解当前课程内容，并逐步追问。',
      icon: Lightbulb,
      color: '#F59E0B',
    },
  ],
  practice: [
    {
      id: 'practice-hint',
      label: '给我提示',
      prompt: '请针对当前题目给我一个不剧透完整解法的分阶段提示。',
      icon: Lightbulb,
      color: '#F59E0B',
    },
    {
      id: 'practice-complexity',
      label: '分析复杂度',
      prompt: '请分析当前解法可能的时间复杂度和空间复杂度，并提示如何优化。',
      icon: BrainCircuit,
      color: '#3B82F6',
    },
    {
      id: 'practice-debug',
      label: '找出错误',
      prompt: '请检查当前代码可能失败的边界情况，并给出最小反例。',
      icon: Bug,
      color: '#EF4444',
    },
    {
      id: 'practice-tests',
      label: '生成测试用例',
      prompt: '请为当前题目生成覆盖常规、边界和反例的测试用例。',
      icon: FileCode,
      color: '#10B981',
    },
  ],
  review: [
    {
      id: 'review-cause',
      label: '分析错误原因',
      prompt: '请分析当前错题的错误根因，并指出我应该补的知识点。',
      icon: Bug,
      color: '#EF4444',
    },
    {
      id: 'review-similar',
      label: '生成同类题',
      prompt: '请根据当前错题生成 3 道同类训练题，难度逐步增加。',
      icon: FileCode,
      color: '#10B981',
    },
    {
      id: 'review-plan',
      label: '制定复习计划',
      prompt: '请基于当前错题给我制定 7 天复习计划。',
      icon: RotateCcw,
      color: '#F59E0B',
    },
    {
      id: 'review-compare',
      label: '对比正确解法',
      prompt: '请对比我的错误代码和正确思路，指出关键差异。',
      icon: ScrollText,
      color: '#8B5CF6',
    },
  ],
  workspace: [
    {
      id: 'workspace-file',
      label: '解释当前文件',
      prompt: '请解释当前文件的结构、核心逻辑和关键函数。',
      icon: FileCode,
      color: '#6366F1',
    },
    {
      id: 'workspace-optimize',
      label: '优化当前函数',
      prompt: '请优化当前代码的可读性、性能和边界处理，并说明改动原因。',
      icon: Sparkles,
      color: '#8B5CF6',
    },
    {
      id: 'workspace-bugs',
      label: '查找潜在 bug',
      prompt: '请审查当前代码，优先找出潜在 bug、边界条件和异常路径。',
      icon: Bug,
      color: '#EF4444',
    },
    {
      id: 'workspace-tests',
      label: '生成单元测试',
      prompt: '请为当前代码生成单元测试，覆盖正常输入、边界输入和失败路径。',
      icon: ShieldCheck,
      color: '#10B981',
    },
  ],
  knowledge: [
    {
      id: 'knowledge-card',
      label: '生成知识卡',
      prompt: '请把当前知识内容整理成一张复习卡片，包含概念、例子和易错点。',
      icon: ScrollText,
      color: '#8B5CF6',
    },
    {
      id: 'knowledge-map',
      label: '梳理图谱',
      prompt: '请把当前知识点和相关前置/后续知识整理成文字版知识图谱。',
      icon: BrainCircuit,
      color: '#3B82F6',
    },
    {
      id: 'knowledge-quiz',
      label: '生成自测',
      prompt: '请根据当前知识库内容生成 5 个自测问题。',
      icon: Lightbulb,
      color: '#F59E0B',
    },
    {
      id: 'knowledge-note',
      label: '整理笔记',
      prompt: '请把我接下来提供的材料整理成结构化学习笔记。',
      icon: BookOpen,
      color: '#10B981',
    },
  ],
}

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'fallback-code',
    icon: FileCode,
    color: '#6366F1',
    label: '解释这段代码',
    prompt: '解释这段代码',
  },
  { id: 'fallback-debug', icon: Bug, color: '#EF4444', label: '帮我调试', prompt: '帮我调试' },
  {
    id: 'fallback-practice',
    icon: BookOpen,
    color: '#F59E0B',
    label: '出一道练习题',
    prompt: '出一道练习题',
  },
  {
    id: 'fallback-summary',
    icon: MessageSquare,
    color: '#10B981',
    label: '总结知识点',
    prompt: '总结知识点',
  },
]

const KIND_LABELS: Record<AIContextSnapshot['kind'], string> = {
  problem: '题目',
  exercise: '练习',
  mistake: '错题',
  lesson: '课程',
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
  )
}

// 把教学模式 + 当前 AI 上下文（题目/代码/错题）组装为提问前缀，让对话结合上下文而非孤立聊天。
function buildContextPrefix(
  ctx: AIContextSnapshot | null,
  tutorMode: TutorMode,
  currentView: ViewType,
): string {
  const mode = TUTOR_MODES[tutorMode]
  const lines = [`【教学模式】${mode.label}`, `【模式要求】${mode.instruction}`]
  lines.push(`【当前页面】${VIEW_LABELS[currentView] ?? 'CodeHelper'}`)
  if (!ctx) return lines.join('\n') + '\n\n---\n请结合以上要求回答下面的问题：\n'
  lines.push(`【当前${KIND_LABELS[ctx.kind]}】${ctx.title}`)
  if (ctx.detail) lines.push(`【${ctx.kind === 'mistake' ? '错误类型' : '说明'}】${ctx.detail}`)
  if (ctx.code && ctx.code.trim()) {
    lines.push(`【相关代码${ctx.language ? ` (${ctx.language})` : ''}】\n${ctx.code.trim()}`)
  }
  return lines.join('\n') + '\n\n---\n请结合以上上下文回答下面的问题：\n'
}

export function AITutorPanel({ onClose }: { onClose?: () => void }) {
  const {
    sessions,
    currentSession,
    messages,
    loading,
    streaming,
    streamingContent,
    error,
    presets,
    createSession,
    switchSession,
    deleteSession,
    sendMessage,
  } = useAIChat()

  // 真实当前上下文：读取全局 currentView。
  const currentView = useAppStore((s) => s.currentView)
  const contextLabel = VIEW_LABELS[currentView] ?? 'CodeHelper'

  // 学习态上下文（题目/练习/错题代码等），由各视图写入 store。
  const aiContext = useAppStore((s) => s.aiContext)
  const pendingAIPrompt = useAppStore((s) => s.pendingAIPrompt)
  const consumeAIPrompt = useAppStore((s) => s.consumeAIPrompt)
  const aiPanelWidth = useAppStore((s) => s.aiPanelWidth)
  const setAIPanelWidth = useAppStore((s) => s.setAIPanelWidth)

  const [inputValue, setInputValue] = useState('')
  const [activeTab, setActiveTab] = useState<'chat' | 'actions'>('chat')
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [tutorMode, setTutorMode] = useState<TutorMode>('explain')
  const [isResizing, setIsResizing] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionMenuRef = useRef<HTMLDivElement>(null)
  const latestPanelWidthRef = useRef(aiPanelWidth || AI_PANEL_DEFAULT_WIDTH)
  const dragPanelWidthRef = useRef(aiPanelWidth || AI_PANEL_DEFAULT_WIDTH)
  const activeMode = TUTOR_MODES[tutorMode]
  const ActiveModeIcon = activeMode.icon

  useEffect(() => {
    latestPanelWidthRef.current = aiPanelWidth || AI_PANEL_DEFAULT_WIDTH
  }, [aiPanelWidth])

  // Auto-scroll to bottom when messages or streaming content change.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-resize textarea.
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 128) + 'px'
    }
  }, [inputValue])

  // 点击外部关闭会话下拉菜单。
  useEffect(() => {
    if (!sessionMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sessionMenuOpen])

  const getWidthFromClientX = useCallback((clientX: number) => window.innerWidth - clientX - 16, [])

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragPanelWidthRef.current = latestPanelWidthRef.current
    setIsResizing(true)
  }, [])

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 80 : 40
      let nextWidth: number | null = null

      if (event.key === 'ArrowLeft') nextWidth = aiPanelWidth + step
      else if (event.key === 'ArrowRight') nextWidth = aiPanelWidth - step
      else if (event.key === 'Home') nextWidth = AI_PANEL_MIN_WIDTH
      else if (event.key === 'End') nextWidth = AI_PANEL_MAX_WIDTH

      if (nextWidth == null) return
      event.preventDefault()
      setAIPanelWidth(nextWidth)
    },
    [aiPanelWidth, setAIPanelWidth],
  )

  useEffect(() => {
    if (!isResizing) return
    const handleMove = (event: PointerEvent) => {
      const next = getWidthFromClientX(event.clientX)
      dragPanelWidthRef.current = next
      setAIPanelWidth(next, { persist: false })
    }
    const handleEnd = () => {
      setAIPanelWidth(dragPanelWidthRef.current)
      setIsResizing(false)
    }
    const handleCancel = () => {
      setAIPanelWidth(latestPanelWidthRef.current)
      setIsResizing(false)
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    const previousTouchAction = document.body.style.touchAction
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.body.style.touchAction = 'none'
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleEnd)
    window.addEventListener('pointercancel', handleCancel)
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      document.body.style.touchAction = previousTouchAction
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleEnd)
      window.removeEventListener('pointercancel', handleCancel)
    }
  }, [getWidthFromClientX, isResizing, setAIPanelWidth])

  // 把当前学习态上下文组装为发送前缀（显示仍为原始问题）。
  const withContext = useCallback(
    (text: string) => {
      const prefix = buildContextPrefix(aiContext, tutorMode, currentView)
      return prefix + text
    },
    [aiContext, currentView, tutorMode],
  )

  const handleSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!content || streaming) return
    setInputValue('')
    // 会话由 sendMessage 内部按需创建；发送内容带上下文，显示/入库用原文。
    sendMessage(content, undefined, withContext(content))
  }, [inputValue, streaming, sendMessage, withContext])

  const handleQuickAction = useCallback(
    async (prompt: string) => {
      if (streaming) return
      sendMessage(prompt, undefined, withContext(prompt))
      setActiveTab('chat')
    },
    [streaming, sendMessage, withContext],
  )

  // 消费来自其他视图的一次性 AI 请求（如工作区"让 AI 诊断报错"）。
  useEffect(() => {
    if (!pendingAIPrompt) return
    const { display, send } = pendingAIPrompt
    consumeAIPrompt()
    setActiveTab('chat')
    sendMessage(display, undefined, send)
  }, [pendingAIPrompt, consumeAIPrompt, sendMessage])

  // 新建对话：清空当前会话，由下一条消息触发真正创建（与 handleSend 一致）。
  const handleNewSession = useCallback(async () => {
    if (streaming) return
    setSessionMenuOpen(false)
    setActiveTab('chat')
    await createSession('新对话')
  }, [streaming, createSession])

  const handleSwitchSession = useCallback(
    async (id: string) => {
      if (id === currentSession?.id) {
        setSessionMenuOpen(false)
        return
      }
      setSessionMenuOpen(false)
      setActiveTab('chat')
      await switchSession(id)
    },
    [currentSession?.id, switchSession],
  )

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, id: string) => {
      // 阻止冒泡，避免触发切换。
      e.stopPropagation()
      await deleteSession(id)
    },
    [deleteSession],
  )

  // 快捷操作：当前页面动作优先，后端 presets 作为可扩展补充。
  const quickActions = useMemo(() => {
    const pageActions = PAGE_QUICK_ACTIONS[currentView] ?? DEFAULT_QUICK_ACTIONS
    const presetActions = presets.slice(0, 2).map((p) => ({
      id: String(p.id),
      label: p.name,
      prompt: p.prompt,
      icon: Zap,
      color: '#8B5CF6',
    }))
    return [...pageActions, ...presetActions]
  }, [currentView, presets])

  // 输入以 / 开头时，把输入框变成快捷操作选择器（真实复用 quickActions，不臆造命令）。
  const slashActive = inputValue.startsWith('/')
  const slashMatches = useMemo(() => {
    if (!slashActive) return []
    const q = inputValue.slice(1).trim().toLowerCase()
    if (!q) return quickActions
    return quickActions.filter((a) => a.label.toLowerCase().includes(q))
  }, [slashActive, inputValue, quickActions])

  return (
    <motion.div
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="relative z-20 flex h-full flex-shrink-0 overflow-visible"
      style={{
        width: `min(${aiPanelWidth || AI_PANEL_DEFAULT_WIDTH}px, calc(100vw - 4.5rem))`,
        maxWidth: `min(${AI_PANEL_MAX_WIDTH}px, calc(100vw - 4.5rem))`,
        minWidth: `min(${AI_PANEL_MIN_WIDTH}px, calc(100vw - 4.5rem))`,
      }}
    >
      <div
        id="ai-tutor-panel"
        className={cn(
          'relative w-full flex flex-col bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)] h-full overflow-hidden shadow-2xl shadow-black/35',
          isResizing &&
            'border-l-[var(--color-accent-purple)] shadow-[0_0_0_1px_rgba(139,92,246,0.35),-20px_0_60px_rgba(0,0,0,0.45)]',
        )}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-controls="ai-tutor-panel"
          aria-label="调整 AI 面板宽度"
          aria-valuemin={AI_PANEL_MIN_WIDTH}
          aria-valuemax={AI_PANEL_MAX_WIDTH}
          aria-valuenow={Math.round(aiPanelWidth || AI_PANEL_DEFAULT_WIDTH)}
          aria-valuetext={`${Math.round(aiPanelWidth || AI_PANEL_DEFAULT_WIDTH)} px`}
          title="拖动调整 AI 面板宽度"
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          className={cn(
            'hidden sm:flex absolute left-0 top-0 bottom-0 z-20 w-2 -translate-x-1 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-panel)]',
            'after:h-16 after:w-1 after:rounded-full after:bg-[var(--color-border-default)] after:opacity-60 after:transition-all hover:after:bg-[var(--color-accent-purple)] hover:after:opacity-100',
            isResizing && 'after:bg-[var(--color-accent-purple)] after:opacity-100',
          )}
        />
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--color-border-subtle)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--color-accent-purple)]" />
            <h2 className="font-semibold text-white">AI Tutor</h2>
          </div>
          <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
            {/* 会话管理下拉 */}
            <div className="relative" ref={sessionMenuRef}>
              <button
                onClick={() => setSessionMenuOpen((v) => !v)}
                className={cn(
                  'flex items-center gap-0.5 p-1.5 rounded transition-colors hover:bg-[var(--color-bg-hover)] hover:text-white',
                  sessionMenuOpen && 'bg-[var(--color-bg-hover)] text-white',
                )}
                title="会话列表"
                aria-haspopup="menu"
                aria-expanded={sessionMenuOpen}
              >
                <History size={16} />
                <ChevronDown
                  size={12}
                  className={cn('transition-transform', sessionMenuOpen && 'rotate-180')}
                />
              </button>

              <AnimatePresence>
                {sessionMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-64 max-h-[360px] flex flex-col bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl shadow-2xl overflow-hidden z-30"
                    role="menu"
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]/60">
                      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                        会话
                      </span>
                      <button
                        onClick={handleNewSession}
                        disabled={streaming}
                        className="flex items-center gap-1 text-xs text-[var(--color-accent-purple)] hover:text-[#A78BFA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="新建对话"
                      >
                        <Plus size={14} />
                        新建
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
                      {sessions.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
                          暂无会话，点击「新建」开始
                        </p>
                      ) : (
                        sessions.map((session) => {
                          const isActive = session.id === currentSession?.id
                          return (
                            <div
                              key={session.id}
                              onClick={() => handleSwitchSession(session.id)}
                              className={cn(
                                'group flex items-center gap-2 mx-1 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
                                isActive
                                  ? 'bg-[var(--color-accent-purple)]/15 text-white'
                                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                              )}
                              role="menuitem"
                            >
                              <MessageSquare
                                size={14}
                                className={cn(
                                  'shrink-0',
                                  isActive
                                    ? 'text-[var(--color-accent-purple)]'
                                    : 'text-[var(--color-text-muted)]',
                                )}
                              />
                              <span className="flex-1 truncate text-sm">
                                {session.title || '未命名会话'}
                              </span>
                              <button
                                onClick={(e) => handleDeleteSession(e, session.id)}
                                className="shrink-0 p-1 rounded text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all"
                                title="删除会话"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--color-bg-hover)] hover:text-white rounded transition-colors"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Context Area —— 真实当前页面上下文 */}
          <div className="p-4 border-b border-[var(--color-border-subtle)]/50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">当前上下文</p>
              <span className="text-[10px] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] rounded-md px-1.5 py-0.5">
                {contextLabel}
              </span>
            </div>
            <div className="bg-[var(--color-bg-card)] rounded-lg border border-[var(--color-border-subtle)] p-3">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] rounded-md">
                  <FileCode size={16} />
                </div>
                <div className="min-w-0">
                  {aiContext ? (
                    <>
                      <p className="text-sm font-medium text-white truncate">
                        {KIND_LABELS[aiContext.kind]}：{aiContext.title}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">
                        {aiContext.code && aiContext.code.trim()
                          ? `提问将带入代码 ${aiContext.code.trim().split('\n').length} 行${aiContext.language ? ` · ${aiContext.language}` : ''}`
                          : aiContext.detail || '提问时将带入此上下文'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-white truncate">{contextLabel}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        {currentSession
                          ? `会话：${currentSession.title || '未命名会话'}`
                          : '正在浏览此页面'}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">教学模式</p>
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-accent-purple)]">
                  <ActiveModeIcon size={12} />
                  {activeMode.label}
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {(
                  Object.entries(TUTOR_MODES) as Array<[TutorMode, (typeof TUTOR_MODES)[TutorMode]]>
                ).map(([mode, meta]) => {
                  const ModeIcon = meta.icon
                  const active = tutorMode === mode
                  return (
                    <button
                      key={mode}
                      onClick={() => setTutorMode(mode)}
                      className={cn(
                        'h-9 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-colors',
                        active
                          ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/15 text-white'
                          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-border-default)]',
                      )}
                      title={meta.label}
                    >
                      <ModeIcon size={13} />
                      <span className="text-[9px] leading-none">{meta.shortLabel}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border-subtle)] px-2">
            <button
              onClick={() => setActiveTab('chat')}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-colors',
                activeTab === 'chat'
                  ? 'text-[var(--color-accent-purple)] border-b-2 border-[var(--color-accent-purple)]'
                  : 'text-[var(--color-text-muted)] hover:text-white',
              )}
            >
              对话
            </button>
            <button
              onClick={() => setActiveTab('actions')}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-colors',
                activeTab === 'actions'
                  ? 'text-[var(--color-accent-purple)] border-b-2 border-[var(--color-accent-purple)]'
                  : 'text-[var(--color-text-muted)] hover:text-white',
              )}
            >
              快捷操作
            </button>
          </div>

          {/* Chat Area */}
          {activeTab === 'chat' ? (
            <div className="flex-1 p-4 space-y-6 overflow-y-auto">
              {/* Loading state */}
              {loading && messages.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-[var(--color-accent-purple)]" />
                </div>
              )}

              {/* Empty state */}
              {!loading && messages.length === 0 && !streamingContent && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Sparkles size={28} className="text-[var(--color-accent-purple)] mb-3" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    向 AI 导师提问，获取编程帮助
                  </p>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, idx) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * Math.min(idx, 5) }}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role === 'user' ? (
                    <div className="bg-[var(--color-accent-primary)] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[#E5E7EB] px-4 py-3.5 rounded-2xl rounded-tl-sm max-w-[90%] text-sm leading-relaxed shadow-sm">
                      <AssistantMarkdown content={msg.content} />
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Streaming content */}
              {streaming && streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[#E5E7EB] px-4 py-3.5 rounded-2xl rounded-tl-sm max-w-[90%] text-sm leading-relaxed shadow-sm">
                    <AssistantMarkdown content={streamingContent} />
                    <span className="inline-block w-1.5 h-4 bg-[var(--color-accent-purple)] ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                  </div>
                </motion.div>
              )}

              {/* Streaming loading indicator (before first chunk) */}
              {streaming && !streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[#E5E7EB] px-4 py-3.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow-sm">
                    <Loader2 size={16} className="animate-spin text-[var(--color-accent-purple)]" />
                  </div>
                </motion.div>
              )}

              {/* Suggestions (show when last message is from assistant and not streaming) */}
              {!streaming &&
                messages.length > 0 &&
                messages[messages.length - 1].role === 'assistant' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 gap-2 mt-2"
                  >
                    {quickActions.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action.prompt)}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-accent-purple)] hover:text-[var(--color-accent-purple)] active:scale-95 transition-all text-left"
                      >
                        <action.icon
                          size={14}
                          style={{ color: action.color }}
                          className="shrink-0"
                        />
                        <span className="truncate">{action.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}

              {/* Error display */}
              {error && (
                <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          ) : (
            /* Quick Actions Tab */
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-2">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent-purple)] hover:text-[var(--color-accent-purple)] active:scale-[0.98] transition-all text-left"
                  >
                    <action.icon size={14} style={{ color: action.color }} className="shrink-0" />
                    <span className="truncate">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] shrink-0">
          <div className="relative flex items-end gap-2 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl focus-within:border-[var(--color-accent-purple)] focus-within:ring-1 focus-within:ring-[var(--color-accent-purple)] transition-all p-2">
            {slashActive && slashMatches.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 max-h-48 overflow-y-auto bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl shadow-2xl py-1 z-30 custom-scrollbar">
                {slashMatches.map((action, i) => (
                  <button
                    key={action.id}
                    onClick={() => {
                      setInputValue('')
                      handleQuickAction(action.prompt)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      i === 0
                        ? 'bg-[var(--color-bg-hover)] text-white'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                    )}
                  >
                    <action.icon size={14} style={{ color: action.color }} className="shrink-0" />
                    <span className="truncate">{action.label}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="向 AI 提问，或输入 / 选择快捷操作"
              className="flex-1 max-h-32 min-h-[24px] bg-transparent text-sm text-white resize-none outline-none placeholder-[var(--color-text-muted)] py-1 px-1 custom-scrollbar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (slashActive) {
                    const target = slashMatches[0]
                    if (target) {
                      setInputValue('')
                      handleQuickAction(target.prompt)
                    }
                    return
                  }
                  handleSend()
                }
              }}
              disabled={streaming}
            />
            <div className="flex items-center gap-1.5 pb-1 shrink-0">
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || streaming}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-all shadow-sm',
                  inputValue.trim() && !streaming
                    ? 'bg-[var(--color-accent-primary)] hover:bg-[#4F46E5] active:scale-90 text-white'
                    : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] cursor-not-allowed',
                )}
                title="发送 (Enter)"
              >
                {streaming ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} className="ml-0.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
