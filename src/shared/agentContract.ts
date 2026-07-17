export type AgentRunStatus =
  | 'needsApproval'
  | 'dispatching'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type AgentToolCallStatus =
  | 'queued'
  | 'needsApproval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled'

export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export type AgentToolAvailability = 'available' | 'requiresApproval' | 'unavailable'

export type AgentToolRisk = 'read-only' | 'isolated-execution'

export interface AgentToolDefinition {
  id: 'knowledge-search' | 'strong-code-run'
  label: string
  description: string
  availability: AgentToolAvailability
  risk: AgentToolRisk
  approvalRequired: boolean
  boundary: string
  reason: string
  timeoutMs: number
}

export interface AgentToolRequest {
  toolId: AgentToolDefinition['id']
  input: Record<string, unknown>
}

export interface AgentContextSnapshot {
  view: string
  kind?: string
  title?: string
  detail?: string
  language?: string
  code?: string
}

export interface AgentToolCallRecord {
  id: string
  runId: string
  toolId: AgentToolDefinition['id']
  status: AgentToolCallStatus
  approvalRequired: boolean
  inputSummary: Record<string, unknown>
  result?: Record<string, unknown>
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export interface AgentApprovalRecord {
  id: string
  runId: string
  toolCallId: string
  toolId: AgentToolDefinition['id']
  status: AgentApprovalStatus
  boundary: string
  requestedAt: string
  decidedAt?: string
  note?: string
}

export interface AgentAuditEvent {
  id: number
  runId: string
  toolCallId?: string
  eventType: string
  details: Record<string, unknown>
  createdAt: string
}

export interface AgentRunRecord {
  id: string
  goal: string
  status: AgentRunStatus
  contextSummary: Record<string, unknown>
  toolCalls: AgentToolCallRecord[]
  approvals: AgentApprovalRecord[]
  error?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface CreateAgentRunInput {
  goal: string
  context?: AgentContextSnapshot
  tools: AgentToolRequest[]
}

export interface AgentRunActionInput {
  runId: string
  toolCallId?: string
  note?: string
}

export interface AgentRunModelInput extends AgentRunActionInput {
  requestId?: string
}
