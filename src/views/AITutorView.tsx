import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileCode,
  GraduationCap,
  History,
  Loader2,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { useAIChat } from '@/hooks/useAIChat'
import { useAppStore, type AIContextSnapshot } from '@/store'
import { renderMarkdown } from '@/utils/markdown'
import {
  AGENT_WORKFLOW_STEPS,
  AGENT_WORKFLOW_STORAGE_KEY,
  AGENT_TOOL_REGISTRY,
  MAX_AGENT_WORKFLOW_RUNS,
  approveAgentWorkflowRun,
  buildAgentWorkflowPrompt,
  completeAgentWorkflowRun,
  createAgentWorkflowRun,
  failAgentWorkflowRun,
  hasPendingAgentApprovals,
  markAgentWorkflowDispatched,
  rejectAgentWorkflowRun,
  restoreAgentWorkflowRuns,
  serializeAgentWorkflowRuns,
  type AgentWorkflowRun,
  type AgentWorkflowStepStatus,
  type AgentToolApprovalStatus,
  type AgentToolAvailability,
} from '@/utils/agentWorkflow'
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

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
  )
}

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
      <p className="mt-2 text-sm font-medium text-white">
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
    <label className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-3 py-2.5">
      <span className="text-sm text-[var(--color-text-secondary)]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-[var(--color-accent-purple)]"
      />
    </label>
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
          ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/15 text-white'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:text-white',
      )}
    >
      {label}
    </button>
  )
}

function AgentStepStatusIcon({ status }: { status: AgentWorkflowStepStatus }) {
  if (status === 'needsApproval') {
    return <ShieldCheck size={16} className="text-[#F59E0B]" />
  }
  if (status === 'running') {
    return <Loader2 size={16} className="animate-spin text-[var(--color-accent-purple)]" />
  }
  if (status === 'completed') {
    return <CheckCircle2 size={16} className="text-[var(--color-accent-success)]" />
  }
  if (status === 'failed') {
    return <ShieldCheck size={16} className="text-[#EF4444]" />
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

function getAgentApprovalStatusLabel(status: AgentToolApprovalStatus) {
  if (status === 'approved') return '已批准'
  if (status === 'rejected') return '已拒绝'
  return '待确认'
}

function getAgentApprovalStatusClass(status: AgentToolApprovalStatus) {
  if (status === 'approved')
    return 'border-[var(--color-accent-success)]/40 text-[var(--color-accent-success)]'
  if (status === 'rejected') return 'border-[#EF4444]/50 text-[#EF4444]'
  return 'border-[#F59E0B]/50 text-[#F59E0B]'
}

function getAgentToolAvailabilityLabel(availability: AgentToolAvailability) {
  if (availability === 'available') return '可用'
  if (availability === 'requiresApproval') return '需确认'
  return '规划中'
}

function getAgentToolAvailabilityClass(availability: AgentToolAvailability) {
  if (availability === 'available')
    return 'border-[var(--color-accent-success)]/40 text-[var(--color-accent-success)]'
  if (availability === 'requiresApproval') return 'border-[#F59E0B]/40 text-[#F59E0B]'
  return 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)]'
}

export function AITutorView() {
  const {
    sessions,
    currentSession,
    messages,
    loading,
    streaming,
    streamingContent,
    error,
    createSession,
    switchSession,
    deleteSession,
    sendMessage,
  } = useAIChat()
  const currentView = useAppStore((s) => s.currentView)
  const aiContext = useAppStore((s) => s.aiContext)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const [assistantView, setAssistantView] = useState<AssistantView>('chat')
  const [tutorMode, setTutorMode] = useState<TutorMode>('explain')
  const [inputValue, setInputValue] = useState('')
  const [agentGoal, setAgentGoal] = useState('')
  const [agentRuns, setAgentRuns] = useState<AgentWorkflowRun[]>(() => {
    try {
      return restoreAgentWorkflowRuns(window.localStorage.getItem(AGENT_WORKFLOW_STORAGE_KEY))
    } catch {
      return []
    }
  })
  const [includeContext, setIncludeContext] = useState(true)
  const [includeCode, setIncludeCode] = useState(true)
  const [includeMemory, setIncludeMemory] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent, assistantView])

  useEffect(() => {
    try {
      window.localStorage.setItem(AGENT_WORKFLOW_STORAGE_KEY, serializeAgentWorkflowRuns(agentRuns))
    } catch (err) {
      console.warn('[AITutorView] Failed to persist Agent workflow runs:', err)
    }
  }, [agentRuns])

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
    if (!activeAgentRun || activeAgentRun.status !== 'running') return
    if (error) {
      setAgentRuns((runs) =>
        runs.map((run) => (run.id === activeAgentRun.id ? failAgentWorkflowRun(run, error) : run)),
      )
      return
    }
    if (!streaming) {
      setAgentRuns((runs) =>
        runs.map((run) => (run.id === activeAgentRun.id ? completeAgentWorkflowRun(run) : run)),
      )
    }
  }, [activeAgentRun, error, streaming])

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

  const handleSend = useCallback(
    async (text?: string) => {
      const content = (text ?? inputValue).trim()
      if (!content || streaming) return
      setInputValue('')
      setAssistantView('chat')
      await sendMessage(content, undefined, withContext(content), includeMemory)
    },
    [includeMemory, inputValue, sendMessage, streaming, withContext],
  )

  const dispatchAgentRun = useCallback(
    async (run: AgentWorkflowRun) => {
      try {
        await sendMessage(
          run.goal,
          undefined,
          withContext(buildAgentWorkflowPrompt(run.goal, run.approvals)),
          includeMemory,
        )
        setAgentRuns((runs) =>
          runs.map((item) => (item.id === run.id ? markAgentWorkflowDispatched(item) : item)),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Agent 任务启动失败'
        setAgentRuns((runs) =>
          runs.map((item) => (item.id === run.id ? failAgentWorkflowRun(item, message) : item)),
        )
      }
    },
    [includeMemory, sendMessage, withContext],
  )

  const handleAgentRun = useCallback(async () => {
    const goal = agentGoal.trim()
    if (!goal || streaming || Boolean(activeAgentRun)) return
    const run = createAgentWorkflowRun(goal)
    setAgentRuns((runs) => [run, ...runs].slice(0, MAX_AGENT_WORKFLOW_RUNS))
    setAgentGoal('')
    if (hasPendingAgentApprovals(run)) return
    await dispatchAgentRun(run)
  }, [activeAgentRun, agentGoal, dispatchAgentRun, streaming])

  const handleApproveAgentRun = useCallback(
    async (runId: string) => {
      if (streaming) return
      const run = agentRuns.find((item) => item.id === runId)
      if (!run || run.status !== 'needsApproval') return
      const approved = approveAgentWorkflowRun(run)
      setAgentRuns((runs) => runs.map((item) => (item.id === runId ? approved : item)))
      await dispatchAgentRun(approved)
    },
    [agentRuns, dispatchAgentRun, streaming],
  )

  const handleRejectAgentRun = useCallback((runId: string) => {
    setAgentRuns((runs) =>
      runs.map((run) =>
        run.id === runId
          ? rejectAgentWorkflowRun(run, 'User rejected the gated Agent tool request.')
          : run,
      ),
    )
  }, [])

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
            <h1 className="mt-1 text-xl font-semibold text-white">AI 助手</h1>
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
                      ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/15 text-white'
                      : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] hover:text-white',
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
                <button
                  type="button"
                  onClick={() => createSession('新对话')}
                  disabled={streaming}
                  className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-white disabled:opacity-50"
                  title="新建会话"
                >
                  <Plus size={15} />
                </button>
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
                    className={cn(
                      'w-full truncate rounded-md px-2 py-2 text-left text-xs transition-colors',
                      session.id === currentSession?.id
                        ? 'bg-[var(--color-accent-purple)]/15 text-white'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
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
                      <Loader2
                        size={22}
                        className="animate-spin text-[var(--color-accent-purple)]"
                      />
                    </div>
                  )}
                  {!loading && messages.length === 0 && !streamingContent && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <Sparkles size={34} className="mb-3 text-[var(--color-accent-purple)]" />
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        输入问题，或从 Tutor / Agent 发起一次任务。
                      </p>
                    </div>
                  )}
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'flex',
                          message.role === 'user' ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                            message.role === 'user'
                              ? 'rounded-tr-sm bg-[var(--color-accent-primary)] text-white'
                              : 'rounded-tl-sm border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] text-[#E5E7EB]',
                          )}
                        >
                          {message.role === 'user' ? (
                            message.content
                          ) : (
                            <AssistantMarkdown content={message.content} />
                          )}
                        </div>
                      </motion.div>
                    ))}
                    {streaming && (
                      <div className="flex justify-start">
                        <div className="max-w-[86%] rounded-2xl rounded-tl-sm border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-4 py-3 text-sm leading-relaxed text-[#E5E7EB] shadow-sm">
                          {streamingContent ? (
                            <AssistantMarkdown content={streamingContent} />
                          ) : (
                            <Loader2
                              size={16}
                              className="animate-spin text-[var(--color-accent-purple)]"
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {error && (
                      <div className="rounded-lg bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
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
                          className="flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-white disabled:opacity-50"
                        >
                          <Icon size={13} />
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-end gap-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-2 focus-within:border-[var(--color-accent-purple)]">
                    <textarea
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
                      className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1 text-sm text-white outline-none placeholder-[var(--color-text-muted)]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={!inputValue.trim() || streaming}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-primary)] text-white transition-colors hover:bg-[#4F46E5] disabled:cursor-not-allowed disabled:bg-[var(--color-bg-card)] disabled:text-[var(--color-text-muted)]"
                      title="发送"
                    >
                      {streaming ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                    </button>
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
                        <div className="flex items-center gap-2 text-white">
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
                  <p className="text-sm font-medium text-white">Tutor prompt</p>
                  <textarea
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    rows={5}
                    placeholder="输入要辅导的问题、代码片段或学习卡点"
                    className="mt-3 w-full resize-none rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3 text-sm text-white outline-none placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent-purple)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim() || streaming}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[var(--color-bg-hover)] disabled:text-[var(--color-text-muted)]"
                  >
                    <GraduationCap size={16} />
                    开始辅导
                  </button>
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
                            ? 'border-[#F59E0B]/60 bg-[#F59E0B]/10'
                            : step.status === 'failed'
                              ? 'border-[#EF4444]/60 bg-[#EF4444]/10'
                              : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]',
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
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
                      <p className="text-sm font-medium text-white">Agent 工具与边界</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        当前只把真实可用能力注入执行协议；外部动作必须等待确认或后续 IPC。
                      </p>
                    </div>
                    <ShieldCheck size={18} className="text-[var(--color-accent-purple)]" />
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {AGENT_TOOL_REGISTRY.map((tool) => (
                      <div
                        key={tool.id}
                        data-agent-tool={tool.id}
                        data-agent-tool-mode={tool.availability}
                        className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-white">{tool.label}</p>
                          <span
                            className={cn(
                              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                              getAgentToolAvailabilityClass(tool.availability),
                            )}
                          >
                            {getAgentToolAvailabilityLabel(tool.availability)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                          {tool.description}
                        </p>
                        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                          {tool.boundary}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {latestAgentRun && (
                  <div
                    className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4"
                    data-agent-workflow-run={latestAgentRun.status}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--color-text-muted)]">当前任务</p>
                        <p className="mt-1 truncate text-sm font-medium text-white">
                          {latestAgentRun.goal}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                          {latestAgentRun.id} · {latestAgentRun.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAssistantView('chat')}
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-white"
                      >
                        <MessageSquare size={14} />
                        查看对话
                      </button>
                      <button
                        type="button"
                        data-agent-clear-runs
                        onClick={() => setAgentRuns([])}
                        disabled={Boolean(activeAgentRun)}
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        清空记录
                      </button>
                    </div>

                    {latestAgentRun.error && (
                      <div className="mt-3 rounded-lg bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
                        {latestAgentRun.error}
                      </div>
                    )}

                    {latestAgentRun.approvals.length > 0 && (
                      <div
                        className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3"
                        data-agent-approval-panel
                        data-agent-approval-state={latestAgentRun.status}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-white">外部工具确认</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                              需要用户确认后，Agent 才会把这些能力写入执行上下文；拒绝后任务会停止。
                            </p>
                          </div>
                          <ShieldCheck size={16} className="shrink-0 text-[#F59E0B]" />
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
                                    <p className="text-sm font-medium text-white">
                                      {approval.label}
                                    </p>
                                    <span
                                      className={cn(
                                        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                        getAgentApprovalStatusClass(approval.status),
                                      )}
                                    >
                                      {getAgentApprovalStatusLabel(approval.status)}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                                    {approval.boundary}
                                  </p>
                                </div>
                                {latestAgentRun.status === 'needsApproval' &&
                                  approval.status === 'pending' && (
                                    <div className="flex shrink-0 gap-2">
                                      <button
                                        type="button"
                                        data-agent-approve-tool={approval.toolId}
                                        onClick={() => handleApproveAgentRun(latestAgentRun.id)}
                                        disabled={streaming}
                                        className="rounded-lg bg-[var(--color-accent-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        批准并继续
                                      </button>
                                      <button
                                        type="button"
                                        data-agent-reject-tool={approval.toolId}
                                        onClick={() => handleRejectAgentRun(latestAgentRun.id)}
                                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-white"
                                      >
                                        拒绝
                                      </button>
                                    </div>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeAgentRun?.id === latestAgentRun.id && streaming && (
                      <div className="mt-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3">
                        <p className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">
                          实时输出
                        </p>
                        {streamingContent ? (
                          <AssistantMarkdown content={streamingContent} />
                        ) : (
                          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                            <Loader2 size={14} className="animate-spin" />
                            正在等待模型响应
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
                  <p className="text-sm font-medium text-white">任务目标</p>
                  <textarea
                    value={agentGoal}
                    onChange={(event) => setAgentGoal(event.target.value)}
                    rows={7}
                    placeholder="例如：分析这道题的失败原因，并给出下一步调试计划"
                    className="mt-3 w-full resize-none rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-3 text-sm text-white outline-none placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent-purple)]"
                  />
                  <button
                    type="button"
                    onClick={handleAgentRun}
                    disabled={!agentGoal.trim() || streaming || Boolean(activeAgentRun)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[var(--color-bg-hover)] disabled:text-[var(--color-text-muted)]"
                  >
                    {activeAgentRun?.status === 'needsApproval' ? (
                      <ShieldCheck size={16} />
                    ) : activeAgentRun ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Bot size={16} />
                    )}
                    {activeAgentRun?.status === 'needsApproval'
                      ? '等待确认'
                      : activeAgentRun
                        ? '任务运行中'
                        : '创建并执行任务'}
                  </button>
                </div>

                {agentRuns.length > 1 && (
                  <div className="mt-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4">
                    <p className="mb-3 text-sm font-medium text-white">最近 Agent 运行</p>
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
                  <p className="text-sm font-medium text-white">历史记录</p>
                  <button
                    type="button"
                    onClick={() => createSession('新对话')}
                    disabled={streaming}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent-primary)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    <Plus size={14} />
                    新建
                  </button>
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
                        className="min-w-0 flex-1 truncate text-left text-sm text-white"
                      >
                        {session.title || '未命名会话'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSession(session.id)}
                        className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                        title="删除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {sessions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--color-border-subtle)] p-8 text-center text-sm text-[var(--color-text-muted)]">
                      暂无历史记录
                    </div>
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
                <button
                  type="button"
                  onClick={() => setCurrentView('settings')}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] px-4 py-2 text-sm text-white hover:border-[var(--color-border-default)]"
                >
                  <Settings size={16} />
                  打开模型设置
                </button>
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
              <p className="mt-2 text-sm font-medium text-white">{TUTOR_MODES[tutorMode].label}</p>
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
