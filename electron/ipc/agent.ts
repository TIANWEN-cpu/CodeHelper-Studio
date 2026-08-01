import { BrowserWindow, dialog, ipcMain } from 'electron'
import { getDB } from '../db/index'
import {
  appendAgentAuditEvent,
  createAgentRunRecord,
  decideAgentApproval,
  getAgentRun,
  getAgentToolPayload,
  listAgentAuditEvents,
  listAgentRuns,
  updateAgentRunStatus,
  updateAgentToolCall,
} from '../db/agentRepository'
import {
  executeAgentTool,
  getAgentToolDefinitions,
  resolveAgentToolRequests,
} from '../utils/agentTools'
import type {
  AgentContextSnapshot,
  AgentRunActionInput,
  AgentRunModelInput,
  AgentRunRecord,
  AgentToolCallRecord,
  CreateAgentRunInput,
} from '../../src/shared/agentContract'
import { createHash } from 'crypto'

const MAX_AGENT_GOAL_CHARS = 4_000
const APPROVAL_TTL_MS = 10 * 60_000
const activeExecutions = new Map<string, AbortController>()

interface AgentApprovalDialogOptions {
  toolName: string
  inputSummary: Record<string, unknown>
}

type AgentApprovalDialogFn = (options: AgentApprovalDialogOptions) => Promise<boolean>

function defaultApprovalDialog(options: AgentApprovalDialogOptions): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return dialog
    .showMessageBox(win, {
      type: 'warning',
      buttons: ['批准执行', '拒绝'],
      defaultId: 1,
      cancelId: 1,
      title: 'Agent 工具执行确认',
      message: '是否允许 Agent 执行此工具？',
      detail: `${options.toolName}\n${JSON.stringify(options.inputSummary)}`,
    })
    .then((result) => result.response === 0)
}

let approvalDialog: AgentApprovalDialogFn = defaultApprovalDialog

export function __setApprovalDialogForTest(fn: AgentApprovalDialogFn | null): void {
  approvalDialog = fn ?? defaultApprovalDialog
}

function validateId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`参数无效: ${label}`)
  return value.trim().slice(0, 200)
}

function contextSummary(context: AgentContextSnapshot | undefined): Record<string, unknown> {
  if (!context || typeof context !== 'object') return {}
  const code = typeof context.code === 'string' ? context.code : ''
  return {
    view: typeof context.view === 'string' ? context.view.slice(0, 100) : 'unknown',
    kind: typeof context.kind === 'string' ? context.kind.slice(0, 100) : undefined,
    title: typeof context.title === 'string' ? context.title.slice(0, 500) : undefined,
    detail: typeof context.detail === 'string' ? context.detail.slice(0, 2_000) : undefined,
    language: typeof context.language === 'string' ? context.language.slice(0, 50) : undefined,
    codeChars: code.length,
    codeSha256: code ? createHash('sha256').update(code).digest('hex') : undefined,
  }
}

function isTerminal(run: AgentRunRecord): boolean {
  return run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled'
}

function assertToolsCompleted(run: AgentRunRecord): void {
  const incomplete = run.toolCalls.find((call) => call.status !== 'completed')
  if (incomplete) throw new Error(`Agent 工具尚未完成: ${incomplete.toolId} (${incomplete.status})`)
}

async function executePendingToolCalls(runId: string): Promise<AgentRunRecord> {
  const database = getDB()
  const current = getAgentRun(database, runId)
  if (!current) throw new Error('Agent 运行不存在')
  if (isTerminal(current)) return current
  if (activeExecutions.has(runId)) throw new Error('Agent 运行已有工具正在执行')

  const controller = new AbortController()
  activeExecutions.set(runId, controller)
  updateAgentRunStatus(database, runId, 'running')
  try {
    for (const call of getAgentRun(database, runId)?.toolCalls ?? []) {
      if (call.status !== 'queued') continue
      try {
        const payload = getAgentToolPayload(database, call.id)
        if (!payload) throw new Error(`Agent 工具输入已不可用: ${call.toolId}`)
        const definition = (await getAgentToolDefinitions(database)).find(
          (tool) => tool.id === call.toolId,
        )
        if (!definition || definition.availability === 'unavailable') {
          throw new Error(`${call.toolId} 当前不可用${definition ? `: ${definition.reason}` : ''}`)
        }
        const started = updateAgentToolCall(database, call.id, 'running')
        if (!started || started.status !== 'running') {
          const latestRun = getAgentRun(database, runId)
          if (latestRun && isTerminal(latestRun)) return latestRun
          throw new Error(`Agent 工具状态已变化: ${call.toolId}`)
        }
        appendAgentAuditEvent(database, runId, call.id, 'tool.started', {
          toolId: call.toolId,
          timeoutMs: definition.timeoutMs,
        })
        const result = await executeAgentTool(database, definition, payload, controller.signal)
        const latestRun = getAgentRun(database, runId)
        if (latestRun && isTerminal(latestRun)) return latestRun
        const completed = updateAgentToolCall(database, call.id, 'completed', { result })
        if (!completed || completed.status !== 'completed') {
          const changedRun = getAgentRun(database, runId)
          if (changedRun && isTerminal(changedRun)) return changedRun
          throw new Error(`Agent 工具结果未能提交: ${call.toolId}`)
        }
        appendAgentAuditEvent(database, runId, call.id, 'tool.completed', {
          toolId: call.toolId,
          result,
        })
      } catch (error) {
        const latestRun = getAgentRun(database, runId)
        if (latestRun && isTerminal(latestRun)) return latestRun
        const message = error instanceof Error ? error.message : String(error)
        updateAgentToolCall(database, call.id, 'failed', { error: message })
        appendAgentAuditEvent(database, runId, call.id, 'tool.failed', {
          toolId: call.toolId,
          error: message,
        })
        return updateAgentRunStatus(database, runId, 'failed', message)!
      }
    }

    const refreshed = getAgentRun(database, runId)!
    if (isTerminal(refreshed)) return refreshed
    const hasPendingApproval = refreshed.approvals.some((approval) => approval.status === 'pending')
    const nextStatus = hasPendingApproval ? 'needsApproval' : 'dispatching'
    appendAgentAuditEvent(database, runId, undefined, 'run.tools-ready', { status: nextStatus })
    return updateAgentRunStatus(database, runId, nextStatus)!
  } finally {
    if (activeExecutions.get(runId) === controller) activeExecutions.delete(runId)
  }
}

function validateActionInput(value: unknown): AgentRunActionInput {
  if (!value || typeof value !== 'object') throw new Error('参数无效')
  const input = value as AgentRunActionInput
  return {
    runId: validateId(input.runId, 'runId'),
    toolCallId: input.toolCallId ? validateId(input.toolCallId, 'toolCallId') : undefined,
    note: typeof input.note === 'string' ? input.note.trim().slice(0, 1_000) : undefined,
  }
}

function findApprovalCall(run: AgentRunRecord, toolCallId: string): AgentToolCallRecord {
  const call = run.toolCalls.find((item) => item.id === toolCallId)
  if (!call || call.status !== 'needsApproval') throw new Error('Agent 工具调用不在待审批状态')
  const approval = run.approvals.find((item) => item.toolCallId === toolCallId)
  if (!approval || approval.status !== 'pending') throw new Error('Agent 审批请求不在待确认状态')
  return call
}

export function registerAgentIPC(): void {
  ipcMain.handle('agent-tools-list', async () => getAgentToolDefinitions(getDB()))

  ipcMain.handle('agent-runs-list', (_event, limit?: number) =>
    listAgentRuns(getDB(), Number.isSafeInteger(limit) ? Number(limit) : 20),
  )

  ipcMain.handle('agent-audit-list', (_event, runId: string, limit?: number) =>
    listAgentAuditEvents(
      getDB(),
      validateId(runId, 'runId'),
      Number.isSafeInteger(limit) ? Number(limit) : 100,
    ),
  )

  ipcMain.handle('agent-run-create', async (event, value: CreateAgentRunInput) => {
    if (!value || typeof value !== 'object') throw new Error('参数无效')
    const goal =
      typeof value.goal === 'string' ? value.goal.trim().slice(0, MAX_AGENT_GOAL_CHARS) : ''
    if (!goal) throw new Error('参数无效: goal')
    const database = getDB()
    const resolved = await resolveAgentToolRequests(database, value.tools, goal)
    const needsApproval = resolved.some((tool) => tool.definition.approvalRequired)
    const run = createAgentRunRecord(database, {
      goal,
      status: needsApproval ? 'needsApproval' : 'dispatching',
      contextSummary: contextSummary(value.context),
      tools: resolved.map((tool) => ({
        toolId: tool.definition.id,
        approvalRequired: tool.definition.approvalRequired,
        boundary: tool.definition.boundary,
        inputSummary: tool.inputSummary,
        inputPayload: tool.input,
      })),
    })
    appendAgentAuditEvent(database, run.id, undefined, 'ipc.run-created', {
      senderId: event.sender.id,
    })
    return executePendingToolCalls(run.id)
  })

  ipcMain.handle('agent-run-approve', async (event, value: AgentRunActionInput) => {
    const input = validateActionInput(value)
    if (!input.toolCallId) throw new Error('参数无效: toolCallId')
    const database = getDB()
    const run = getAgentRun(database, input.runId)
    if (!run || isTerminal(run)) throw new Error('Agent 运行不可审批')
    const call = findApprovalCall(run, input.toolCallId)
    const approval = run.approvals.find((item) => item.toolCallId === call.id)!
    const requestedAt = Date.parse(approval.requestedAt)
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > APPROVAL_TTL_MS) {
      decideAgentApproval(database, call.id, 'expired', 'Approval expired before execution.')
      updateAgentToolCall(database, call.id, 'rejected', { error: 'Agent 审批已过期' })
      appendAgentAuditEvent(database, run.id, call.id, 'approval.expired', {
        senderId: event.sender.id,
      })
      return updateAgentRunStatus(database, run.id, 'failed', 'Agent 审批已过期')
    }
    if (call.approvalRequired) {
      const definitions = await getAgentToolDefinitions(database)
      const toolName = definitions.find((tool) => tool.id === call.toolId)?.label ?? call.toolId
      const dialogApproved = await approvalDialog({
        toolName,
        inputSummary: call.inputSummary,
      })
      if (!dialogApproved) {
        const note = 'User rejected the Agent tool request.'
        const rejected = decideAgentApproval(database, call.id, 'rejected', note)
        if (!rejected) throw new Error('Agent 审批已被其他请求处理')
        activeExecutions.get(run.id)?.abort()
        updateAgentToolCall(database, call.id, 'rejected', { error: note })
        appendAgentAuditEvent(database, run.id, call.id, 'approval.rejected', {
          senderId: event.sender.id,
          note,
        })
        return updateAgentRunStatus(database, run.id, 'cancelled', note)
      }
    }
    const decided = decideAgentApproval(
      database,
      call.id,
      'approved',
      input.note || 'User approved in Agent UI.',
    )
    if (!decided) throw new Error('Agent 审批已被其他请求处理')
    updateAgentToolCall(database, call.id, 'queued')
    appendAgentAuditEvent(database, run.id, call.id, 'approval.approved', {
      senderId: event.sender.id,
    })
    return executePendingToolCalls(run.id)
  })

  ipcMain.handle('agent-run-reject', (event, value: AgentRunActionInput) => {
    const input = validateActionInput(value)
    if (!input.toolCallId) throw new Error('参数无效: toolCallId')
    const database = getDB()
    const run = getAgentRun(database, input.runId)
    if (!run || isTerminal(run)) throw new Error('Agent 运行不可拒绝')
    findApprovalCall(run, input.toolCallId)
    const note = input.note || 'User rejected the Agent tool request.'
    const decided = decideAgentApproval(database, input.toolCallId, 'rejected', note)
    if (!decided) throw new Error('Agent 审批已被其他请求处理')
    activeExecutions.get(run.id)?.abort()
    updateAgentToolCall(database, input.toolCallId, 'rejected', { error: note })
    appendAgentAuditEvent(database, run.id, input.toolCallId, 'approval.rejected', {
      senderId: event.sender.id,
      note,
    })
    return updateAgentRunStatus(database, run.id, 'cancelled', note)
  })

  ipcMain.handle('agent-run-cancel', (event, value: AgentRunActionInput) => {
    const input = validateActionInput(value)
    const database = getDB()
    const run = getAgentRun(database, input.runId)
    if (!run) throw new Error('Agent 运行不存在')
    if (isTerminal(run)) return run
    activeExecutions.get(run.id)?.abort()
    const note = input.note || 'User cancelled the Agent run.'
    for (const call of run.toolCalls) {
      if (
        call.status === 'queued' ||
        call.status === 'running' ||
        call.status === 'needsApproval'
      ) {
        updateAgentToolCall(database, call.id, 'cancelled', { error: note })
      }
    }
    for (const approval of run.approvals) {
      if (approval.status === 'pending')
        decideAgentApproval(database, approval.toolCallId, 'rejected', note)
    }
    appendAgentAuditEvent(database, run.id, undefined, 'run.cancelled', {
      senderId: event.sender.id,
      note,
    })
    return updateAgentRunStatus(database, run.id, 'cancelled', note)
  })

  ipcMain.handle('agent-run-model-started', (event, value: AgentRunModelInput) => {
    const input = validateActionInput(value)
    const database = getDB()
    const run = getAgentRun(database, input.runId)
    if (!run || run.status !== 'dispatching') throw new Error('Agent 运行尚未准备好调用模型')
    assertToolsCompleted(run)
    const requestId =
      value && typeof value === 'object' && typeof value.requestId === 'string'
        ? value.requestId.slice(0, 200)
        : undefined
    appendAgentAuditEvent(database, run.id, undefined, 'model.started', {
      senderId: event.sender.id,
      requestId,
    })
    return updateAgentRunStatus(database, run.id, 'running')
  })

  ipcMain.handle('agent-run-complete', (event, value: AgentRunActionInput) => {
    const input = validateActionInput(value)
    const database = getDB()
    const run = getAgentRun(database, input.runId)
    if (!run) throw new Error('Agent 运行不存在')
    if (isTerminal(run)) return run
    if (run.status !== 'running') throw new Error('Agent 模型运行尚未开始')
    assertToolsCompleted(run)
    appendAgentAuditEvent(database, run.id, undefined, 'run.completed', {
      senderId: event.sender.id,
    })
    return updateAgentRunStatus(database, run.id, 'completed')
  })

  ipcMain.handle('agent-run-fail', (event, value: AgentRunActionInput) => {
    const input = validateActionInput(value)
    const database = getDB()
    const run = getAgentRun(database, input.runId)
    if (!run) throw new Error('Agent 运行不存在')
    if (isTerminal(run)) return run
    activeExecutions.get(run.id)?.abort()
    const note = input.note || 'Agent model execution failed.'
    appendAgentAuditEvent(database, run.id, undefined, 'run.failed', {
      senderId: event.sender.id,
      note,
    })
    return updateAgentRunStatus(database, run.id, 'failed', note)
  })
}
