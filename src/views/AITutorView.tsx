import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileCode,
  GraduationCap,
  History,
  MessageSquare,
  Plus,
  RotateCcw,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Markdown,
  Spinner,
  Switch,
  Textarea,
} from '@/components/ui'
import { useChatStore, initChatStreaming } from '@/stores/chatStore'
import { getSendCategories, getLlmExtractEnabled } from '@/services/memoryService'
import { SendPreview } from '@/components/SendPreview'
import { useAppStore, type AIContextSnapshot } from '@/store'
import {
  AGENT_WORKFLOW_STEPS,
  buildAgentWorkflowPrompt,
  hydrateAgentWorkflowRun,
  hydrateAgentWorkflowRuns,
  type AgentWorkflowRun,
  type AgentWorkflowStepStatus,
} from '@/utils/agentWorkflow'
import {
  approveAgentTool,
  cancelAgentRun,
  completeAgentRun,
  createAgentRun,
  failAgentRun,
  getAgentAudit,
  getAgentRuns,
  getAgentTools,
  markAgentModelStarted,
  rejectAgentTool,
} from '@/services/agentService'
import type {
  AgentApprovalStatus,
  AgentAuditEvent,
  AgentToolDefinition,
  AgentToolRequest,
} from '@/shared/agentContract'
import type { ViewType } from '@/types'

type AssistantView = 'chat' | 'tutor' | 'agent' | 'history' | 'settings'
type TutorMode = 'socratic' | 'explain' | 'interview' | 'review' | 'codeReview'

const VIEW_LABELS: Record<ViewType, string> = {
  home: '首页',
  learn: '课程学习',
  practice: '题库练习',
  workspace: '编程工作区',
  'ai-tutor': 'AI 助手',
  review: '复习与错题',
  knowledge: '知识库',
  settings: '设置',
  profile: '个人主页',
}

const KIND_LABELS: Record<AIContextSnapshot['kind'], string> = {
  problem: '题目',
  exercise: '练习',
  mistake: '错题',
  lesson: '课程',
  knowledge: '知识文档',
}

const ASSISTANT_VIEWS: Array<{
  id: AssistantView
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}> = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'tutor', label: 'Tutor', icon: GraduationCap },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'history', label: '历史', icon: History },
  { id: 'settings', label: '配置', icon: Settings },
]

const TUTOR_MODES: Record<
  TutorMode,
  { label: string; description: string; instruction: string; icon: typeof Sparkles }
> = {
  socratic: {
    label: '渐进提示',
    description: '先问关键问题，再逐步提示。',
    icon: Sparkles,
    instruction:
      '请使用苏格拉底式教学，先给 1-3 个渐进提示和追问，不要直接给完整答案，除非用户明确要求。',
  },
  explain: {
    label: '讲解推导',
    description: '拆开概念、例子和边界。',
    icon: GraduationCap,
    instruction: '请用清晰、循序渐进的方式讲解，必要时给出小例子、关键概念对照和易错点。',
  },
  interview: {
    label: '面试追问',
    description: '模拟技术面试官的追问。',
    icon: BrainCircuit,
    instruction:
      '请像技术面试官一样回应，追问复杂度、边界条件、权衡和可证明性，不要只停留在答案本身。',
  },
  review: {
    label: '错题复盘',
    description: '归因、补洞和安排复习。',
    icon: RotateCcw,
    instruction: '请聚焦学习复盘：指出错误根因、知识漏洞、下次复习动作和同类题训练建议。',
  },
  codeReview: {
    label: '代码审查',
    description: '优先找 bug、边界和测试缺口。',
    icon: ShieldCheck,
    instruction:
      '请做代码审查：优先指出 bug、边界条件、可读性、复杂度和测试缺口，给出可执行修改建议。',
  },
}

const QUICK_PROMPTS = [
  {
    label: '解释当前内容',
    prompt: '请结合当前上下文解释核心概念，并列出最容易误解的地方。',
    icon: FileCode,
  },
  {
    label: '生成练习',
    prompt: '请基于当前学习内容生成 3 道递进练习，不要直接给答案。',
    icon: Target,
  },
  {
    label: '诊断错误',
    prompt: '请检查当前代码或题目思路的潜在错误，给出最小反例和修复建议。',
    icon: ShieldCheck,
  },
  {
    label: '复盘计划',
    prompt: '请把当前错题或薄弱点整理成 7 天复习计划。',
    icon: RotateCcw,
  },
]

// 助手消息 Markdown 统一走 ui Markdown（variant="ai" 自动挂 ai-markdown 钩子类）。
function AssistantMarkdown({ content }: { content: string }) {
  return <Markdown content={content} variant="ai" />
}

interface MessageBubbleProps {
  message: { id: string; role: 'user' | 'assistant' | 'system'; content: string }
}

// 气泡级 memo：流式 chunk 只更新最后一条消息，未变化的历史气泡整体跳过重渲染
// （Markdown 内部还带 60ms 防抖，进一步收敛昂贵的 markdown 重算）。
const MessageBubble = React.memo(function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
          message.role === 'user'
            ? 'rounded-tr-sm bg-[var(--color-accent-solid)] text-[var(--color-on-accent)]'
            : 'rounded-tl-sm border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)]',
        )}
      >
        {message.role === 'user' ? (
          message.content
        ) : message.content ? (
          <AssistantMarkdown content={message.content} />
        ) : (
          <Spinner size="sm" className="text-[var(--color-accent-purple)]" />
        )}
      </div>
    </motion.div>
  )
})

function buildContextPrefix(
  ctx: AIContextSnapshot | null,
  currentView: ViewType,
  tutorMode: TutorMode,
  includeContext: boolean,
  includeCode: boolean,
  includeMemory: boolean,
) {
  const mode = TUTOR_MODES[tutorMode]
  const lines = [`【模式】${mode.label}`, `【要求】${mode.instruction}`]
  lines.push(`【当前页面】${VIEW_LABELS[currentView] ?? 'CodeHelper'}`)
  lines.push(
    `【长期记忆】${includeMemory ? '允许结合长期记忆' : '本轮请忽略长期记忆，只基于当前消息与上下文'}`,
  )
  if (includeContext && ctx) {
    lines.push(`【当前${KIND_LABELS[ctx.kind]}】${ctx.title}`)
    if (ctx.detail) lines.push(`【说明】${ctx.detail}`)
    if (includeCode && ctx.code?.trim()) {
      lines.push(`【相关代码${ctx.language ? ` (${ctx.language})` : ''}】\n${ctx.code.trim()}`)
    }
  }
  return `${lines.join('\n')}\n\n---\n请结合以上上下文回答：\n`
}

function ContextSummary({
  aiContext,
  currentView,
}: {
  aiContext: AIContextSnapshot | null
  currentView: ViewType
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <FileCode size={14} />
        <span>{VIEW_LABELS[currentView] ?? 'CodeHelper'}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
        {aiContext ? `${KIND_LABELS[aiContext.kind]}：${aiContext.title}` : '当前没有绑定学习对象'}
      </p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        {aiContext?.code?.trim()
          ? `包含 ${aiContext.code.trim().split('\n').length} 行${aiContext.language ? ` ${aiContext.language}` : ''} 代码`
          : aiContext?.detail || '从课程、题目、错题或知识库进入时会自动带入上下文。'}
      </p>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-2.5">
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

function SendOptionChip({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'min-h-9 rounded-lg border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/15 text-[var(--color-text-primary)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
      )}
    >
      {label}
    </button>
  )
}

function AgentStepStatusIcon({ status }: { status: AgentWorkflowStepStatus }) {
  if (status === 'needsApproval') {
    return <ShieldCheck size={16} className="text-[var(--color-accent-warning)]" />
  }
  if (status === 'running') {
    return <Spinner size="sm" className="text-[var(--color-accent-purple)]" />
  }
  if (status === 'completed') {
    return <CheckCircle2 size={16} className="text-[var(--color-accent-success)]" />
  }
  if (status === 'failed') {
    return <ShieldCheck size={16} className="text-[var(--color-accent-danger)]" />
  }
  return <Clock3 size={16} className="text-[var(--color-text-muted)]" />
}

function getAgentStepStatusLabel(status: AgentWorkflowStepStatus) {
  if (status === 'needsApproval') return '待确认'
  if (status === 'running') return '进行中'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  return '等待'
}

function getAgentApprovalStatusLabel(status: AgentApprovalStatus) {
  if (status === 'approved') return '已批准'
  if (status === 'rejected') return '已拒绝'
  if (status === 'expired') return '已过期'
  return '待确认'
}

function getAgentApprovalStatusVariant(status: AgentApprovalStatus) {
  if (status === 'approved') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  return 'warning' as const
}

function getAgentToolAvailabilityLabel(availability: AgentToolDefinition['availability']) {
  if (availability === 'available') return '可用'
  if (availability === 'requiresApproval') return '需确认'
  return '不可用'
}

function getAgentToolAvailabilityVariant(availability: AgentToolDefinition['availability']) {
  if (availability === 'available') return 'success' as const
  if (availability === 'requiresApproval') return 'warning' as const
  return 'neutral' as const
}

export function AITutorView() {
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const messages = useChatStore((s) => s.messages)
  const loading = useChatStore((s) => s.loading)
  const streaming = useChatStore((s) => s.streaming)
  const error = useChatStore((s) => s.error)
  const createSession = useChatStore((s) => s.createSession)
  const switchSession = useChatStore((s) => s.switchSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const cancelCurrentRequest = useChatStore((s) => s.cancelCurrentRequest)
  const loadSessions = useChatStore((s) => s.loadSessions)

  const currentSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  )
  // chatStore 把助手消息保存在 messages 里随 chunk 增长；流式内容取最后一条助手消息。
  const lastMessage = messages[messages.length - 1]
  const streamingContent = streaming && lastMessage?.role === 'assistant' ? lastMessage.content : ''

  // 挂载时接通流式事件桥接并加载会话列表（chatStore 不自动加载）。
  useEffect(() => {
    initChatStreaming()
    loadSessions()
  }, [loadSessions])

  const currentView = useAppStore((s) => s.currentView)
  const aiContext = useAppStore((s) => s.aiContext)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [assistantView, setAssistantView] = useState<AssistantView>('chat')
  const [tutorMode, setTutorMode] = useState<TutorMode>('explain')
  const [inputValue, setInputValue] = useState('')
  const [agentGoal, setAgentGoal] = useState('')
  const [agentRuns, setAgentRuns] = useState<AgentWorkflowRun[]>([])
  const [agentTools, setAgentTools] = useState<AgentToolDefinition[]>([])
  const [selectedAgentTools, setSelectedAgentTools] = useState<string[]>([])
  const [agentAudit, setAgentAudit] = useState<AgentAuditEvent[]>([])
  const [agentActionPending, setAgentActionPending] = useState(false)
  const [agentCancelling, setAgentCancelling] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [includeContext, setIncludeContext] = useState(true)
  const [includeCode, setIncludeCode] = useState(true)
  const [includeMemory, setIncludeMemory] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // rAF 节流的自动滚动：chunk 期间每秒 ~60 帧结算一次，避免每次 chunk 都触发
  // 一次 smooth scrollIntoView（流式时会导致滚动动画互相打断、画面抖动）。
  useEffect(() => {
    let raf = 0
    const scrollToEnd = () => {
      raf = 0
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(scrollToEnd)
    }
    schedule()
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [messages, streamingContent, assistantView])

  const replaceAgentRun = useCallback((run: AgentWorkflowRun) => {
    setAgentRuns((runs) => {
      const next = [run, ...runs.filter((item) => item.id !== run.id)]
      return next.slice(0, 20)
    })
  }, [])

  const refreshAgentState = useCallback(async () => {
    try {
      const [tools, runs] = await Promise.all([getAgentTools(), getAgentRuns()])
      setAgentTools(tools)
      setAgentRuns(hydrateAgentWorkflowRuns(runs))
      setSelectedAgentTools((current) => {
        const available = new Set(
          tools.filter((tool) => tool.availability !== 'unavailable').map((tool) => tool.id),
        )
        const retained = current.filter((toolId) =>
          available.has(toolId as AgentToolDefinition['id']),
        )
        if (retained.length > 0) return retained
        return available.has('knowledge-search') ? ['knowledge-search'] : []
      })
      setAgentError(null)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Agent 状态加载失败')
    }
  }, [])

  useEffect(() => {
    void refreshAgentState()
  }, [refreshAgentState])

  const activeAgentRun = useMemo(
    () =>
      agentRuns.find(
        (run) =>
          run.status === 'needsApproval' ||
          run.status === 'dispatching' ||
          run.status === 'running',
      ) ?? null,
    [agentRuns],
  )
  const latestAgentRun = agentRuns[0] ?? null

  useEffect(() => {
    if (!latestAgentRun) {
      setAgentAudit([])
      return
    }
    let cancelled = false
    void getAgentAudit(latestAgentRun.id)
      .then((events) => {
        if (!cancelled) setAgentAudit(events)
      })
      .catch((err) => {
        if (!cancelled) setAgentError(err instanceof Error ? err.message : 'Agent 审计日志加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [latestAgentRun])

  const withContext = useCallback(
    (text: string) =>
      buildContextPrefix(
        aiContext,
        currentView,
        tutorMode,
        includeContext,
        includeCode,
        includeMemory,
      ) + text,
    [aiContext, currentView, includeCode, includeContext, includeMemory, tutorMode],
  )

  // 读取隐私「按类别发送」白名单与 LLM 抽取开关，传给 chatStore.sendMessage。
  const resolveMemoryFlags = useCallback(async () => {
    const [memoryCategories, llmExtract] = await Promise.all([
      getSendCategories(),
      getLlmExtractEnabled(),
    ])
    return { memoryCategories, llmExtract }
  }, [])

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? inputValue).trim()
      if (!content || streaming) return
      setInputValue('')
      setAssistantView('chat')
      const flags = await resolveMemoryFlags()
      await sendMessage(content, {
        sendOverride: withContext(content),
        includeMemories: includeMemory,
        ...flags,
      })
    },
    [includeMemory, inputValue, resolveMemoryFlags, sendMessage, streaming, withContext],
  )

  const dispatchAgentRun = useCallback(
    async (run: AgentWorkflowRun) => {
      setAgentActionPending(true)
      setAgentError(null)
      try {
        if (!useChatStore.getState().activeSessionId) {
          await createSession(undefined, 'Agent 任务')
        }
        const running = hydrateAgentWorkflowRun(await markAgentModelStarted({ runId: run.id }))
        replaceAgentRun(running)
        const agentContext = buildContextPrefix(
          aiContext,
          currentView,
          tutorMode,
          includeContext,
          includeCode,
          false,
        )
        await sendMessage(run.goal, {
          sendOverride: `${agentContext}${buildAgentWorkflowPrompt(running, agentTools)}`,
          includeMemories: false,
          includeKnowledge: false,
          captureMemory: false,
        })
        const chatError = useChatStore.getState().error
        const completed = chatError
          ? await failAgentRun({ runId: run.id, note: chatError })
          : await completeAgentRun({ runId: run.id })
        replaceAgentRun(hydrateAgentWorkflowRun(completed))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Agent 任务启动失败'
        setAgentError(message)
        try {
          replaceAgentRun(
            hydrateAgentWorkflowRun(await failAgentRun({ runId: run.id, note: message })),
          )
        } catch {
          await refreshAgentState()
        }
      } finally {
        setAgentActionPending(false)
      }
    },
    [
      agentTools,
      aiContext,
      createSession,
      currentView,
      includeCode,
      includeContext,
      refreshAgentState,
      replaceAgentRun,
      sendMessage,
      tutorMode,
    ],
  )

  const handleAgentRun = useCallback(async () => {
    const goal = agentGoal.trim()
    if (!goal || streaming || Boolean(activeAgentRun) || agentActionPending) return
    const requests: AgentToolRequest[] = []
    if (selectedAgentTools.includes('knowledge-search')) {
      requests.push({ toolId: 'knowledge-search', input: { query: goal, limit: 5 } })
    }
    if (selectedAgentTools.includes('strong-code-run')) {
      if (!aiContext?.code?.trim()) {
        setAgentError('当前上下文没有可供强隔离运行的代码。')
        return
      }
      requests.push({
        toolId: 'strong-code-run',
        input: {
          code: aiContext.code,
          language: aiContext.language || 'python',
        },
      })
    }
    setAgentActionPending(true)
    setAgentError(null)
    try {
      const created = await createAgentRun({
        goal,
        context: {
          view: currentView,
          kind: aiContext?.kind,
          title: aiContext?.title,
          detail: aiContext?.detail,
          language: aiContext?.language,
          code: aiContext?.code,
        },
        tools: requests,
      })
      const run = hydrateAgentWorkflowRun(created)
      replaceAgentRun(run)
      setAgentGoal('')
      if (run.status === 'dispatching') await dispatchAgentRun(run)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Agent 任务创建失败')
    } finally {
      setAgentActionPending(false)
    }
  }, [
    activeAgentRun,
    agentActionPending,
    agentGoal,
    aiContext,
    currentView,
    dispatchAgentRun,
    replaceAgentRun,
    selectedAgentTools,
    streaming,
  ])

  const handleApproveAgentRun = useCallback(
    async (runId: string, toolCallId: string) => {
      if (streaming || agentActionPending) return
      setAgentActionPending(true)
      setAgentError(null)
      try {
        const approved = hydrateAgentWorkflowRun(
          await approveAgentTool({ runId, toolCallId, note: 'User approved in Agent UI.' }),
        )
        replaceAgentRun(approved)
        if (approved.status === 'dispatching') await dispatchAgentRun(approved)
      } catch (err) {
        setAgentError(err instanceof Error ? err.message : 'Agent 工具审批失败')
      } finally {
        setAgentActionPending(false)
      }
    },
    [agentActionPending, dispatchAgentRun, replaceAgentRun, streaming],
  )

  const handleRejectAgentRun = useCallback(
    async (runId: string, toolCallId: string) => {
      if (agentActionPending) return
      setAgentActionPending(true)
      try {
        replaceAgentRun(
          hydrateAgentWorkflowRun(
            await rejectAgentTool({
              runId,
              toolCallId,
              note: 'User rejected the gated Agent tool request.',
            }),
          ),
        )
      } catch (err) {
        setAgentError(err instanceof Error ? err.message : 'Agent 工具拒绝失败')
      } finally {
        setAgentActionPending(false)
      }
    },
    [agentActionPending, replaceAgentRun],
  )

  const handleCancelAgentRun = useCallback(async () => {
    if (!activeAgentRun || agentCancelling) return
    setAgentCancelling(true)
    try {
      await cancelCurrentRequest()
      replaceAgentRun(
        hydrateAgentWorkflowRun(
          await cancelAgentRun({ runId: activeAgentRun.id, note: 'User cancelled in Agent UI.' }),
        ),
      )
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Agent 取消失败')
    } finally {
      setAgentCancelling(false)
    }
  }, [activeAgentRun, agentCancelling, cancelCurrentRequest, replaceAgentRun])

  const contextLabel = useMemo(() => VIEW_LABELS[currentView] ?? 'CodeHelper', [currentView])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-base)]">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-accent-purple)]">
              <Sparkles size={14} />
              <span>{contextLabel}</span>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">AI 助手</h1>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="AI 助手视图">
            {ASSISTANT_VIEWS.map((item) => {
              const Icon = item.icon
              const active = assistantView === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAssistantView(item.id)}
                  className={cn(
                    'flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
                    active
                      ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/15 text-[var(--color-text-primary)]'
                      : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  )}
                  role="tab"
                  aria-selected={active}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-3 xl:hidden" data-ai-mobile-context>
          <ContextSummary aiContext={aiContext} currentView={currentView} />
          <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">本次发送</p>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {TUTOR_MODES[tutorMode].label}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SendOptionChip
                label="上下文"
                active={includeContext}
                onToggle={() => setIncludeContext((v) => !v)}
              />
              <SendOptionChip
                label="代码"
                active={includeCode}
                onToggle={() => setIncludeCode((v) => !v)}
              />
              <SendOptionChip
                label="记忆"
                active={includeMemory}
                onToggle={() => setIncludeMemory((v) => !v)}
              />
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto xl:flex">
            <ContextSummary aiContext={aiContext} currentView={currentView} />
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">最近会话</p>
                <IconButton
                  label="新建会话"
                  size="sm"
                  onClick={() => createSession(undefined, '新对话')}
                  disabled={streaming}
                >
                  <Plus />
                </IconButton>
              </div>
              <div className="space-y-1">
                {sessions.slice(0, 8).map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      setAssistantView('chat')
                      switchSession(session.id)
                    }}
                    disabled={streaming}
                    className={cn(
                      'w-full truncate rounded-md px-2 py-2 text-left text-xs transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      session.id === currentSession?.id
                        ? 'bg-[var(--color-accent-purple)]/15 text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
                    )}
                  >
                    {session.title || '未命名会话'}
                  </button>
                ))}
                {sessions.length === 0 && (
                  <p className="py-3 text-center text-xs text-[var(--color-text-muted)]">
                    暂无会话
                  </p>
                )}
              </div>
            </div>
          </aside>

          <main className="min-h-0 overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]">
            {assistantView === 'chat' && (
              <section className="flex h-full min-h-0 flex-col" data-ai-view="chat">
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  {loading && messages.length === 0 && (
                    <div className="flex h-full items-center justify-center">
                      <Spinner size="lg" className="text-[var(--color-accent-purple)]" />
                    </div>
                  )}
                  {!loading && messages.length === 0 && !streamingContent && (
                    <EmptyState
                      icon={Sparkles}
                      title="输入问题，或从 Tutor / Agent 发起一次任务。"
                      className="h-full"
                    />
                  )}
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                    {error && (
                      <div className="rounded-lg bg-[var(--color-accent-danger)]/10 px-3 py-2 text-xs text-[var(--color-accent-danger)]">
                        {error}
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>
                <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((item) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => handleSend(item.prompt)}
                          disabled={streaming}
                          className="flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-50"
                        >
                          <Icon size={13} />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                  <SendPreview query={inputValue} includeMemory={includeMemory} />
                  <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-2 focus-within:border-[var(--color-accent-purple)]">
                    <Textarea
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          handleSend()
                        }
                      }}
                      rows={2}
                      disabled={streaming}
                      placeholder="向 AI 助手提问"
                      className="min-h-[48px] flex-1 resize-none border-0 bg-transparent px-2 py-1 focus:border-transparent focus:ring-0"
                    />
                    <Button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={!inputValue.trim() || streaming}
                      loading={streaming}
                      size="sm"
                      className="h-9 w-9 px-0"
                      title="发送"
                    >
                      {!streaming && <Send size={15} />}
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {assistantView === 'tutor' && (
              <section className="h-full overflow-y-auto p-4 custom-scrollbar" data-ai-view="tutor">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    Object.entries(TUTOR_MODES) as Array<
                      [TutorMode, (typeof TUTOR_MODES)[TutorMode]]
                    >
                  ).map(([mode, meta]) => {
                    const Icon = meta.icon
                    const active = tutorMode === mode
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTutorMode(mode)}
                        className={cn(
                          'rounded-lg border p-4 text-left transition-colors',
                          active
                            ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/15'
                            : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] hover:border-[var(--color-border-default)]',
                        )}
                      >
                        <div className="flex items-center gap-2 text-[var(--color-text-primary)]">
                          <Icon size={18} className="text-[var(--color-accent-purple)]" />
                          <span className="font-medium">{meta.label}</span>
                        </div>
                        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                          {meta.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    Tutor prompt
                  </p>
                  <Textarea
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    rows={5}
                    placeholder="输入要辅导的问题、代码片段或学习卡点"
                    className="mt-3 resize-none bg-[var(--color-bg-base)] focus:border-[var(--color-accent-purple)]"
                  />
                  <Button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || streaming}
                    className="mt-3"
                  >
                    <GraduationCap size={16} />
                    开始辅导
                  </Button>
                </div>
              </section>
            )}

            {assistantView === 'agent' && (
              <section
                className="h-full overflow-y-auto p-4 custom-scrollbar"
                data-ai-view="agent"
                data-agent-workflow-history-count={agentRuns.length}
              >
                <div className="grid gap-3 sm:grid-cols-4" data-agent-workflow-steps>
                  {(
                    latestAgentRun?.steps ??
                    AGENT_WORKFLOW_STEPS.map((step) => ({
                      ...step,
                      status: 'pending' as const,
                      detail: step.description,
                    }))
                  ).map((step, index) => (
                    <div
                      key={step.id}
                      data-agent-step={step.id}
                      data-agent-step-status={step.status}
                      className={cn(
                        'rounded-lg border p-3 transition-colors',
                        step.status === 'running'
                          ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10'
                          : step.status === 'needsApproval'
                            ? 'border-[var(--color-accent-warning)]/60 bg-[var(--color-accent-warning)]/10'
                            : step.status === 'failed'
                              ? 'border-[var(--color-accent-danger)]/60 bg-[var(--color-accent-danger)]/10'
                              : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]',
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
                        <AgentStepStatusIcon status={step.status} />
                        {index + 1}. {step.label}
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                        {getAgentStepStatusLabel(step.status)}
                      </p>
                    </div>
                  ))}
                </div>

                <div
                  className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4"
                  data-agent-tool-registry
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        Agent 工具与边界
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        工具白名单来自 Electron 主进程；强隔离运行必须逐次审批并写入审计日志。
                      </p>
                    </div>
                    <ShieldCheck size={18} className="text-[var(--color-accent-purple)]" />
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {agentTools.map((tool) => {
                      const codeUnavailable =
                        tool.id === 'strong-code-run' && !aiContext?.code?.trim()
                      const disabled = tool.availability === 'unavailable' || codeUnavailable
                      const checked = selectedAgentTools.includes(tool.id)
                      return (
                        <label
                          key={tool.id}
                          data-agent-tool={tool.id}
                          data-agent-tool-mode={tool.availability}
                          className={cn(
                            'rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3',
                            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled || Boolean(activeAgentRun)}
                                onChange={() =>
                                  setSelectedAgentTools((current) =>
                                    current.includes(tool.id)
                                      ? current.filter((toolId) => toolId !== tool.id)
                                      : [...current, tool.id],
                                  )
                                }
                                className="h-4 w-4 accent-[var(--color-accent-purple)]"
                              />
                              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                                {tool.label}
                              </p>
                            </div>
                            <Badge
                              variant={getAgentToolAvailabilityVariant(tool.availability)}
                              className="shrink-0"
                            >
                              {getAgentToolAvailabilityLabel(tool.availability)}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                            {tool.description}
                          </p>
                          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                            {tool.boundary}
                          </p>
                          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                            {codeUnavailable ? '当前页面没有代码上下文。' : tool.reason}
                          </p>
                        </label>
                      )
                    })}
                    {agentTools.length === 0 && (
                      <div className="text-xs text-[var(--color-text-muted)]">
                        正在读取主进程工具能力...
                      </div>
                    )}
                  </div>
                </div>

                {agentError && (
                  <div className="mt-4 rounded-lg border border-[var(--color-accent-danger)]/30 bg-[var(--color-accent-danger)]/10 px-3 py-2 text-xs text-[var(--color-accent-danger)]">
                    {agentError}
                  </div>
                )}

                {latestAgentRun && (
                  <div
                    className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4"
                    data-agent-workflow-run={latestAgentRun.status}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--color-text-muted)]">当前任务</p>
                        <p className="mt-1 truncate text-sm font-medium text-[var(--color-text-primary)]">
                          {latestAgentRun.goal}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                          {latestAgentRun.id} · {latestAgentRun.status}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setAssistantView('chat')}
                      >
                        <MessageSquare size={14} />
                        查看对话
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        data-agent-refresh-runs
                        onClick={() => void refreshAgentState()}
                        disabled={agentActionPending}
                      >
                        <RotateCcw size={14} />
                        刷新审计
                      </Button>
                      {activeAgentRun?.id === latestAgentRun.id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-agent-cancel-run
                          onClick={() => void handleCancelAgentRun()}
                          disabled={agentCancelling}
                          className="border border-[var(--color-accent-danger)]/40 text-[var(--color-accent-danger)] hover:bg-[var(--color-accent-danger)]/10 hover:text-[var(--color-accent-danger)]"
                        >
                          <ShieldCheck size={14} />
                          {agentCancelling ? '取消中' : '取消任务'}
                        </Button>
                      )}
                    </div>

                    {latestAgentRun.error && (
                      <div className="mt-3 rounded-lg bg-[var(--color-accent-danger)]/10 px-3 py-2 text-xs text-[var(--color-accent-danger)]">
                        {latestAgentRun.error}
                      </div>
                    )}

                    {latestAgentRun.approvals.length > 0 && (
                      <div
                        className="mt-3 rounded-lg border border-[var(--color-accent-warning)]/30 bg-[var(--color-accent-warning)]/10 p-3"
                        data-agent-approval-panel
                        data-agent-approval-state={latestAgentRun.status}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-[var(--color-text-primary)]">
                              外部工具确认
                            </p>
                            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                              需要用户确认后，Agent 才会把这些能力写入执行上下文；拒绝后任务会停止。
                            </p>
                          </div>
                          <ShieldCheck
                            size={16}
                            className="shrink-0 text-[var(--color-accent-warning)]"
                          />
                        </div>
                        <div className="mt-3 space-y-2">
                          {latestAgentRun.approvals.map((approval) => (
                            <div
                              key={approval.toolId}
                              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3"
                              data-agent-approval={approval.toolId}
                              data-agent-approval-status={approval.status}
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                                      {agentTools.find((tool) => tool.id === approval.toolId)
                                        ?.label ?? approval.toolId}
                                    </p>
                                    <Badge variant={getAgentApprovalStatusVariant(approval.status)}>
                                      {getAgentApprovalStatusLabel(approval.status)}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                                    {approval.boundary}
                                  </p>
                                </div>
                                {latestAgentRun.status === 'needsApproval' &&
                                  approval.status === 'pending' && (
                                    <div className="flex shrink-0 gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        data-agent-approve-tool={approval.toolId}
                                        onClick={() =>
                                          void handleApproveAgentRun(
                                            latestAgentRun.id,
                                            approval.toolCallId,
                                          )
                                        }
                                        disabled={streaming || agentActionPending}
                                      >
                                        批准并继续
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        data-agent-reject-tool={approval.toolId}
                                        onClick={() =>
                                          void handleRejectAgentRun(
                                            latestAgentRun.id,
                                            approval.toolCallId,
                                          )
                                        }
                                        disabled={agentActionPending}
                                      >
                                        拒绝
                                      </Button>
                                    </div>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {latestAgentRun.toolCalls.length > 0 && (
                      <div className="mt-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3">
                        <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                          真实工具调用
                        </p>
                        <div className="mt-2 space-y-2">
                          {latestAgentRun.toolCalls.map((call) => (
                            <div
                              key={call.id}
                              data-agent-tool-call={call.id}
                              data-agent-tool-call-status={call.status}
                              className="rounded-md border border-[var(--color-border-subtle)] px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-[var(--color-text-primary)]">
                                  {agentTools.find((tool) => tool.id === call.toolId)?.label ??
                                    call.toolId}
                                </span>
                                <span className="font-mono text-[var(--color-text-muted)]">
                                  {call.status}
                                </span>
                              </div>
                              {call.error && (
                                <p className="mt-1 text-[11px] text-[var(--color-accent-danger)]">
                                  {call.error}
                                </p>
                              )}
                              {call.result && (
                                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                                  {JSON.stringify(call.result, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className="mt-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3"
                      data-agent-audit-count={agentAudit.length}
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
                        <ScrollText size={14} />
                        SQLite 审计日志
                      </div>
                      <div className="mt-2 space-y-1">
                        {agentAudit.slice(0, 8).map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-muted)]"
                          >
                            <span>{event.eventType}</span>
                            <span className="shrink-0 font-mono">{event.createdAt}</span>
                          </div>
                        ))}
                        {agentAudit.length === 0 && (
                          <p className="text-[11px] text-[var(--color-text-muted)]">暂无审计事件</p>
                        )}
                      </div>
                    </div>

                    {activeAgentRun?.id === latestAgentRun.id && streaming && (
                      <div className="mt-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3">
                        <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                          实时输出
                        </p>
                        {streamingContent ? (
                          <AssistantMarkdown content={streamingContent} />
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                            <Spinner size="sm" />
                            正在等待模型响应
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">任务目标</p>
                  <Textarea
                    value={agentGoal}
                    onChange={(event) => setAgentGoal(event.target.value)}
                    rows={7}
                    placeholder="例如：分析这道题的失败原因，并给出下一步调试计划"
                    className="mt-3 resize-none bg-[var(--color-bg-base)] focus:border-[var(--color-accent-purple)]"
                  />
                  <Button
                    type="button"
                    onClick={handleAgentRun}
                    disabled={
                      !agentGoal.trim() ||
                      streaming ||
                      Boolean(activeAgentRun) ||
                      agentActionPending
                    }
                    loading={
                      agentActionPending ||
                      (Boolean(activeAgentRun) && activeAgentRun?.status !== 'needsApproval')
                    }
                    className="mt-3"
                  >
                    {!agentActionPending &&
                      (activeAgentRun?.status === 'needsApproval' ? (
                        <ShieldCheck size={16} />
                      ) : !activeAgentRun ? (
                        <Bot size={16} />
                      ) : null)}
                    {agentActionPending
                      ? '处理中'
                      : activeAgentRun?.status === 'needsApproval'
                        ? '等待确认'
                        : activeAgentRun
                          ? '任务运行中'
                          : '创建并执行任务'}
                  </Button>
                </div>

                {agentRuns.length > 1 && (
                  <div className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
                    <p className="mb-3 text-sm font-medium text-[var(--color-text-primary)]">
                      最近 Agent 运行
                    </p>
                    <div className="space-y-2">
                      {agentRuns.slice(1).map((run) => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => setAgentGoal(run.goal)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2 text-left"
                        >
                          <span className="min-w-0 truncate text-xs text-[var(--color-text-secondary)]">
                            {run.goal}
                          </span>
                          <span className="shrink-0 text-[10px] uppercase text-[var(--color-text-muted)]">
                            {run.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {assistantView === 'history' && (
              <section
                className="h-full overflow-y-auto p-4 custom-scrollbar"
                data-ai-view="history"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">历史记录</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => createSession(undefined, '新对话')}
                    disabled={streaming}
                  >
                    <Plus size={14} />
                    新建
                  </Button>
                </div>
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-3"
                    >
                      <Clock3 size={15} className="text-[var(--color-text-muted)]" />
                      <button
                        type="button"
                        onClick={() => {
                          setAssistantView('chat')
                          switchSession(session.id)
                        }}
                        className="min-w-0 flex-1 truncate text-left text-sm text-[var(--color-text-primary)]"
                      >
                        {session.title || '未命名会话'}
                      </button>
                      <IconButton
                        label="删除会话"
                        size="sm"
                        onClick={() => deleteSession(session.id)}
                        className="hover:bg-[var(--color-accent-danger)]/10 hover:text-[var(--color-accent-danger)]"
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  ))}
                  {sessions.length === 0 && (
                    <EmptyState icon={History} title="暂无历史记录" className="py-8" />
                  )}
                </div>
              </section>
            )}

            {assistantView === 'settings' && (
              <section
                className="h-full overflow-y-auto p-4 custom-scrollbar"
                data-ai-view="settings"
              >
                <div className="grid gap-3">
                  <ToggleRow
                    label="本轮带入页面上下文"
                    checked={includeContext}
                    onChange={() => setIncludeContext((v) => !v)}
                  />
                  <ToggleRow
                    label="本轮带入相关代码"
                    checked={includeCode}
                    onChange={() => setIncludeCode((v) => !v)}
                  />
                  <ToggleRow
                    label="允许使用长期记忆"
                    checked={includeMemory}
                    onChange={() => setIncludeMemory((v) => !v)}
                  />
                </div>
                <div className="mt-4">
                  <ContextSummary aiContext={aiContext} currentView={currentView} />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCurrentView('settings')}
                  className="mt-4"
                >
                  <Settings size={16} />
                  打开模型设置
                </Button>
              </section>
            )}
          </main>

          <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto xl:flex">
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-3">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">本次发送</p>
              <div className="mt-3 space-y-2">
                <ToggleRow
                  label="上下文"
                  checked={includeContext}
                  onChange={() => setIncludeContext((v) => !v)}
                />
                <ToggleRow
                  label="代码"
                  checked={includeCode}
                  onChange={() => setIncludeCode((v) => !v)}
                />
                <ToggleRow
                  label="记忆"
                  checked={includeMemory}
                  onChange={() => setIncludeMemory((v) => !v)}
                />
              </div>
            </div>
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-3">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">当前 Tutor</p>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
                {TUTOR_MODES[tutorMode].label}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                {TUTOR_MODES[tutorMode].description}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
