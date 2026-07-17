import { invoke } from './ipc'
import type {
  AgentAuditEvent,
  AgentRunActionInput,
  AgentRunModelInput,
  AgentRunRecord,
  AgentToolDefinition,
  CreateAgentRunInput,
} from '../shared/agentContract'

export function getAgentTools(): Promise<AgentToolDefinition[]> {
  return invoke<AgentToolDefinition[]>('agent-tools-list')
}

export function getAgentRuns(limit = 20): Promise<AgentRunRecord[]> {
  return invoke<AgentRunRecord[]>('agent-runs-list', limit)
}

export function getAgentAudit(runId: string, limit = 100): Promise<AgentAuditEvent[]> {
  return invoke<AgentAuditEvent[]>('agent-audit-list', runId, limit)
}

export function createAgentRun(input: CreateAgentRunInput): Promise<AgentRunRecord> {
  return invoke<AgentRunRecord>('agent-run-create', input)
}

export function approveAgentTool(input: AgentRunActionInput): Promise<AgentRunRecord> {
  return invoke<AgentRunRecord>('agent-run-approve', input)
}

export function rejectAgentTool(input: AgentRunActionInput): Promise<AgentRunRecord> {
  return invoke<AgentRunRecord>('agent-run-reject', input)
}

export function cancelAgentRun(input: AgentRunActionInput): Promise<AgentRunRecord> {
  return invoke<AgentRunRecord>('agent-run-cancel', input)
}

export function markAgentModelStarted(input: AgentRunModelInput): Promise<AgentRunRecord> {
  return invoke<AgentRunRecord>('agent-run-model-started', input)
}

export function completeAgentRun(input: AgentRunActionInput): Promise<AgentRunRecord> {
  return invoke<AgentRunRecord>('agent-run-complete', input)
}

export function failAgentRun(input: AgentRunActionInput): Promise<AgentRunRecord> {
  return invoke<AgentRunRecord>('agent-run-fail', input)
}

export function cancelAIRequest(requestId: string): Promise<{ cancelled: boolean }> {
  return invoke<{ cancelled: boolean }>('ai-chat-cancel', requestId)
}
