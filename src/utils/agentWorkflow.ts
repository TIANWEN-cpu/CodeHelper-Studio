export type AgentWorkflowStepId = 'understand' | 'plan' | 'execute' | 'review'

export type AgentWorkflowStatus =
  | 'needsApproval'
  | 'dispatching'
  | 'running'
  | 'completed'
  | 'failed'

export type AgentWorkflowStepStatus =
  | 'pending'
  | 'needsApproval'
  | 'running'
  | 'completed'
  | 'failed'

export interface AgentWorkflowStep {
  id: AgentWorkflowStepId
  label: string
  description: string
  status: AgentWorkflowStepStatus
  detail: string
}

export interface AgentWorkflowRun {
  id: string
  goal: string
  status: AgentWorkflowStatus
  createdAt: string
  updatedAt: string
  steps: AgentWorkflowStep[]
  approvals: AgentToolApprovalRequest[]
  error?: string
}

export const AGENT_WORKFLOW_STORAGE_KEY = 'codehelper.agentWorkflowRuns'
export const MAX_AGENT_WORKFLOW_RUNS = 8

export type AgentToolAvailability = 'available' | 'requiresApproval' | 'planned'

export interface AgentToolDefinition {
  id: string
  label: string
  description: string
  availability: AgentToolAvailability
  boundary: string
}

export type AgentToolApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface AgentToolApprovalRequest {
  toolId: string
  label: string
  boundary: string
  status: AgentToolApprovalStatus
  requestedAt: string
  updatedAt: string
  decidedAt?: string
  note?: string
}

export const AGENT_WORKFLOW_STEPS: Array<Pick<AgentWorkflowStep, 'id' | 'label' | 'description'>> =
  [
    {
      id: 'understand',
      label: '理解',
      description: '锁定目标、上下文和成功标准',
    },
    {
      id: 'plan',
      label: '计划',
      description: '拆解可执行步骤、风险和验证点',
    },
    {
      id: 'execute',
      label: '执行',
      description: '调用 AI 生成任务结果和下一步动作',
    },
    {
      id: 'review',
      label: '复盘',
      description: '总结结果、缺口和后续验证',
    },
  ]

export const AGENT_TOOL_REGISTRY: AgentToolDefinition[] = [
  {
    id: 'context-summary',
    label: '上下文摘要',
    description: '读取当前页、题目、代码和学习对象摘要，作为 AI 任务输入。',
    availability: 'available',
    boundary: '只读，不修改本地数据。',
  },
  {
    id: 'learning-plan',
    label: '学习计划',
    description: '把目标拆成学习步骤、复习动作和验证清单。',
    availability: 'available',
    boundary: '生成建议，不自动更改课程进度。',
  },
  {
    id: 'code-review-plan',
    label: '代码审查计划',
    description: '基于当前代码给出 bug、边界、复杂度和测试缺口分析。',
    availability: 'available',
    boundary: '只输出审查结果，不自动编辑文件。',
  },
  {
    id: 'workflow-report',
    label: '执行报告',
    description: '生成任务理解、执行计划、风险、阻塞和下一步复盘。',
    availability: 'available',
    boundary: '报告型输出，不声明已执行外部工具。',
  },
  {
    id: 'file-edit',
    label: '文件修改',
    description: '未来用于读取 diff、生成补丁并等待用户确认后写入。',
    availability: 'planned',
    boundary: '当前 UI 未启用真实文件写入，不能假装已修改文件。',
  },
  {
    id: 'terminal-run',
    label: '终端执行',
    description: '未来用于执行测试、构建或脚本并采集输出。',
    availability: 'planned',
    boundary: '当前 UI 未启用终端执行，不能假装已运行命令。',
  },
  {
    id: 'browser-operator',
    label: '浏览器操作',
    description: '未来用于打开页面、点击、输入和截图验证。',
    availability: 'requiresApproval',
    boundary: '必须获得用户确认和真实工具回传后，才能声称完成浏览器操作。',
  },
]

const nowIso = () => new Date().toISOString()

function createId(): string {
  return `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const BROWSER_APPROVAL_KEYWORDS = [
  'browser',
  'playwright',
  'localhost',
  'http://',
  'https://',
  '浏览',
  '页面',
  '打开',
  '点击',
  '输入',
  '截图',
  '验证',
  '导出',
  '搜索',
  'UI',
]

function goalMentionsTool(goal: string, tool: AgentToolDefinition): boolean {
  const normalizedGoal = goal.toLowerCase()
  if (tool.id === 'browser-operator') {
    return BROWSER_APPROVAL_KEYWORDS.some((keyword) =>
      normalizedGoal.includes(keyword.toLowerCase()),
    )
  }
  return false
}

export function selectAgentApprovalRequests(
  goal: string,
  tools = AGENT_TOOL_REGISTRY,
): AgentToolApprovalRequest[] {
  const timestamp = nowIso()
  return tools
    .filter((tool) => tool.availability === 'requiresApproval' && goalMentionsTool(goal, tool))
    .map((tool) => ({
      toolId: tool.id,
      label: tool.label,
      boundary: tool.boundary,
      status: 'pending' as const,
      requestedAt: timestamp,
      updatedAt: timestamp,
    }))
}

function buildSteps(statusById: Partial<Record<AgentWorkflowStepId, AgentWorkflowStepStatus>>) {
  return AGENT_WORKFLOW_STEPS.map((step) => ({
    ...step,
    status: statusById[step.id] ?? 'pending',
    detail: step.description,
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWorkflowStatus(value: unknown): value is AgentWorkflowStatus {
  return (
    value === 'needsApproval' ||
    value === 'dispatching' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed'
  )
}

function isStepId(value: unknown): value is AgentWorkflowStepId {
  return value === 'understand' || value === 'plan' || value === 'execute' || value === 'review'
}

function isStepStatus(value: unknown): value is AgentWorkflowStepStatus {
  return (
    value === 'pending' ||
    value === 'needsApproval' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed'
  )
}

function isApprovalStatus(value: unknown): value is AgentToolApprovalStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

function fallbackStepsForStatus(status: AgentWorkflowStatus): AgentWorkflowStep[] {
  if (status === 'needsApproval') {
    return buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'needsApproval',
      review: 'pending',
    })
  }
  if (status === 'completed') {
    return buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'completed',
      review: 'completed',
    })
  }
  if (status === 'failed') {
    return buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'failed',
      review: 'pending',
    })
  }
  return buildSteps({
    understand: 'completed',
    plan: 'completed',
    execute: 'running',
    review: 'pending',
  })
}

function normalizeSteps(value: unknown, status: AgentWorkflowStatus): AgentWorkflowStep[] {
  if (!Array.isArray(value)) return fallbackStepsForStatus(status)

  const byId = new Map<AgentWorkflowStepId, AgentWorkflowStep>()
  for (const item of value) {
    if (!isRecord(item) || !isStepId(item.id) || !isStepStatus(item.status)) continue
    const template = AGENT_WORKFLOW_STEPS.find((step) => step.id === item.id)
    if (!template) continue
    byId.set(item.id, {
      ...template,
      status: item.status,
      detail: typeof item.detail === 'string' ? item.detail : template.description,
    })
  }

  if (byId.size !== AGENT_WORKFLOW_STEPS.length) return fallbackStepsForStatus(status)
  return AGENT_WORKFLOW_STEPS.map((step) => byId.get(step.id)!)
}

function normalizeApprovals(value: unknown): AgentToolApprovalRequest[] {
  if (!Array.isArray(value)) return []

  const approvals: AgentToolApprovalRequest[] = []
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.toolId !== 'string' ||
      !isApprovalStatus(item.status) ||
      typeof item.requestedAt !== 'string' ||
      typeof item.updatedAt !== 'string'
    ) {
      continue
    }

    const tool = AGENT_TOOL_REGISTRY.find((candidate) => candidate.id === item.toolId)
    approvals.push({
      toolId: item.toolId,
      label: typeof item.label === 'string' ? item.label : (tool?.label ?? item.toolId),
      boundary: typeof item.boundary === 'string' ? item.boundary : (tool?.boundary ?? ''),
      status: item.status,
      requestedAt: item.requestedAt,
      updatedAt: item.updatedAt,
      decidedAt: typeof item.decidedAt === 'string' ? item.decidedAt : undefined,
      note: typeof item.note === 'string' ? item.note : undefined,
    })
  }

  return approvals
}

function normalizeAgentWorkflowRun(value: unknown): AgentWorkflowRun | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.goal !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isWorkflowStatus(value.status)
  ) {
    return null
  }

  const run: AgentWorkflowRun = {
    id: value.id,
    goal: value.goal,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    steps: normalizeSteps(value.steps, value.status),
    approvals: normalizeApprovals(value.approvals),
    error: typeof value.error === 'string' ? value.error : undefined,
  }

  if (run.status === 'dispatching' || run.status === 'running') {
    return failAgentWorkflowRun(run, run.error ?? 'Agent 任务在上次会话中断，已标记为失败。')
  }

  return run
}

export function createAgentWorkflowRun(goal: string): AgentWorkflowRun {
  const timestamp = nowIso()
  const approvals = selectAgentApprovalRequests(goal)
  const needsApproval = approvals.some((approval) => approval.status === 'pending')
  return {
    id: createId(),
    goal: goal.trim(),
    status: needsApproval ? 'needsApproval' : 'dispatching',
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: needsApproval
      ? buildSteps({
          understand: 'completed',
          plan: 'completed',
          execute: 'needsApproval',
          review: 'pending',
        })
      : buildSteps({
          understand: 'completed',
          plan: 'completed',
          execute: 'running',
          review: 'pending',
        }),
    approvals,
  }
}

export function hasPendingAgentApprovals(run: AgentWorkflowRun): boolean {
  return run.approvals.some((approval) => approval.status === 'pending')
}

export function approveAgentWorkflowRun(run: AgentWorkflowRun): AgentWorkflowRun {
  const timestamp = nowIso()
  return {
    ...run,
    status: 'dispatching',
    updatedAt: timestamp,
    approvals: run.approvals.map((approval) =>
      approval.status === 'pending'
        ? {
            ...approval,
            status: 'approved',
            updatedAt: timestamp,
            decidedAt: timestamp,
            note: 'User approved this gated Agent tool from the assistant UI.',
          }
        : approval,
    ),
    steps: buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'running',
      review: 'pending',
    }),
  }
}

export function rejectAgentWorkflowRun(run: AgentWorkflowRun, reason: string): AgentWorkflowRun {
  const timestamp = nowIso()
  return {
    ...run,
    status: 'failed',
    error: reason,
    updatedAt: timestamp,
    approvals: run.approvals.map((approval) =>
      approval.status === 'pending'
        ? {
            ...approval,
            status: 'rejected',
            updatedAt: timestamp,
            decidedAt: timestamp,
            note: reason,
          }
        : approval,
    ),
    steps: buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'failed',
      review: 'pending',
    }),
  }
}

export function markAgentWorkflowDispatched(run: AgentWorkflowRun): AgentWorkflowRun {
  return {
    ...run,
    status: 'running',
    updatedAt: nowIso(),
    steps: buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'running',
      review: 'pending',
    }),
  }
}

export function completeAgentWorkflowRun(run: AgentWorkflowRun): AgentWorkflowRun {
  return {
    ...run,
    status: 'completed',
    updatedAt: nowIso(),
    steps: buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'completed',
      review: 'completed',
    }),
  }
}

export function failAgentWorkflowRun(run: AgentWorkflowRun, error: string): AgentWorkflowRun {
  return {
    ...run,
    status: 'failed',
    error,
    updatedAt: nowIso(),
    steps: buildSteps({
      understand: 'completed',
      plan: 'completed',
      execute: 'failed',
      review: 'pending',
    }),
  }
}

export function restoreAgentWorkflowRuns(
  raw: string | null,
  max = MAX_AGENT_WORKFLOW_RUNS,
): AgentWorkflowRun[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeAgentWorkflowRun(item))
      .filter((item): item is AgentWorkflowRun => item !== null)
      .slice(0, max)
  } catch {
    return []
  }
}

export function serializeAgentWorkflowRuns(
  runs: AgentWorkflowRun[],
  max = MAX_AGENT_WORKFLOW_RUNS,
): string {
  return JSON.stringify(runs.slice(0, max))
}

function getToolAvailabilityLabel(availability: AgentToolAvailability): string {
  if (availability === 'available') return '可用'
  if (availability === 'requiresApproval') return '需确认'
  return '规划中'
}

export function buildAgentToolManifest(tools = AGENT_TOOL_REGISTRY): string {
  return tools
    .map((tool) => {
      return `- ${tool.label} (${getToolAvailabilityLabel(tool.availability)}): ${tool.description} 边界：${tool.boundary}`
    })
    .join('\n')
}

function getApprovalStatusLabel(status: AgentToolApprovalStatus): string {
  if (status === 'approved') return 'approved'
  if (status === 'rejected') return 'rejected'
  return 'pending approval'
}

function buildApprovalManifest(approvals: AgentToolApprovalRequest[]): string[] {
  if (approvals.length === 0) return []
  return [
    'User approval state:',
    ...approvals.map(
      (approval) =>
        `- ${approval.label}: ${getApprovalStatusLabel(approval.status)}. Boundary: ${approval.boundary}`,
    ),
    '',
  ]
}

export function buildAgentWorkflowPrompt(
  goal: string,
  approvals: AgentToolApprovalRequest[] = [],
): string {
  return [
    '请以 Agent 任务执行方式处理下面目标。',
    '',
    `任务目标：${goal.trim()}`,
    '',
    '当前工具与能力边界：',
    buildAgentToolManifest(),
    '',
    ...buildApprovalManifest(approvals),
    '执行协议：',
    '1. 先复述你理解的目标、约束和成功标准。',
    '2. 给出分步骤计划，每一步说明输入、动作、风险和验证方式。',
    '3. 明确哪些步骤可以直接执行，哪些步骤需要用户确认或补充信息。',
    '4. 只有标记为“可用”的工具可以作为本轮已执行能力；“需确认”和“规划中”的能力只能列为建议或待办。',
    '5. 如果无法真实调用工具或访问外部状态，请明确标注“需要用户确认”，不要假装已经执行。',
    '6. 输出最终复盘：已完成、未完成、风险、下一步。',
    '',
    '输出格式：',
    '## 任务理解',
    '## 执行计划',
    '## 执行结果',
    '## 风险与阻塞',
    '## 下一步',
  ].join('\n')
}
