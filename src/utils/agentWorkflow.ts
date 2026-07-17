import type {
  AgentRunRecord,
  AgentRunStatus,
  AgentToolCallRecord,
  AgentToolDefinition,
} from '../shared/agentContract'

export type AgentWorkflowStepId = 'understand' | 'plan' | 'execute' | 'review'
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

export interface AgentWorkflowRun extends AgentRunRecord {
  steps: AgentWorkflowStep[]
}

export const MAX_AGENT_WORKFLOW_RUNS = 20

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
      description: '确定白名单工具、审批边界和验证方式',
    },
    {
      id: 'execute',
      label: '执行',
      description: '执行已批准的真实工具并调用模型整理结果',
    },
    {
      id: 'review',
      label: '复盘',
      description: '记录完成状态、失败原因和审计结果',
    },
  ]

function executeStatus(status: AgentRunStatus): AgentWorkflowStepStatus {
  if (status === 'needsApproval') return 'needsApproval'
  if (status === 'dispatching' || status === 'running') return 'running'
  if (status === 'completed') return 'completed'
  return 'failed'
}

export function buildAgentWorkflowSteps(run: AgentRunRecord): AgentWorkflowStep[] {
  const execution = executeStatus(run.status)
  return AGENT_WORKFLOW_STEPS.map((step) => {
    let status: AgentWorkflowStepStatus = 'pending'
    if (step.id === 'understand' || step.id === 'plan') status = 'completed'
    if (step.id === 'execute') status = execution
    if (step.id === 'review') status = run.status === 'completed' ? 'completed' : 'pending'
    return { ...step, status, detail: step.description }
  })
}

export function hydrateAgentWorkflowRun(run: AgentRunRecord): AgentWorkflowRun {
  return { ...run, steps: buildAgentWorkflowSteps(run) }
}

export function hydrateAgentWorkflowRuns(runs: AgentRunRecord[]): AgentWorkflowRun[] {
  return runs.slice(0, MAX_AGENT_WORKFLOW_RUNS).map(hydrateAgentWorkflowRun)
}

function availabilityLabel(tool: AgentToolDefinition): string {
  if (tool.availability === 'available') return '可直接调用'
  if (tool.availability === 'requiresApproval') return '逐次审批'
  return '不可用'
}

export function buildAgentToolManifest(tools: AgentToolDefinition[]): string {
  if (tools.length === 0) return '- 本轮没有可调用工具。'
  return tools
    .map(
      (tool) =>
        `- ${tool.label} [${tool.id}] (${availabilityLabel(tool)}): ${tool.description} 边界：${tool.boundary} 状态：${tool.reason}`,
    )
    .join('\n')
}

function toolCallEvidence(call: AgentToolCallRecord, tool?: AgentToolDefinition): string {
  const label = tool?.label ?? call.toolId
  const header = `### ${label} (${call.status})`
  if (call.status === 'completed') {
    return `${header}\n${JSON.stringify(call.result ?? {}, null, 2)}`
  }
  return `${header}\n${call.error || '没有可用结果。'}`
}

export function buildAgentWorkflowPrompt(
  run: AgentRunRecord,
  tools: AgentToolDefinition[],
): string {
  const evidence = run.toolCalls.map((call) =>
    toolCallEvidence(
      call,
      tools.find((tool) => tool.id === call.toolId),
    ),
  )
  return [
    '请基于下面已经审计的 Agent 运行记录完成任务报告。',
    '',
    `任务目标：${run.goal}`,
    '',
    '主进程白名单工具：',
    buildAgentToolManifest(tools),
    '',
    '真实工具调用证据：',
    evidence.length > 0 ? evidence.join('\n\n') : '本轮没有请求工具。',
    '',
    '执行协议：',
    '1. 只能把状态为 completed 的工具调用描述为已执行。',
    '2. failed、rejected、cancelled 或 needsApproval 必须如实标注，禁止补写不存在的输出。',
    '3. 知识库证据引用时保留 filename#片段序号。',
    '4. 强隔离运行只根据真实 exitCode、stdout 和 stderr 下结论。',
    '5. 不得声称调用了白名单之外的文件、终端、浏览器或网络工具。',
    '',
    '输出格式：',
    '## 任务理解',
    '## 工具执行证据',
    '## 结论与建议',
    '## 风险与未完成项',
  ].join('\n')
}
