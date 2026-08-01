import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AgentAuditEvent,
  AgentRunRecord,
  AgentToolCallRecord,
  AgentToolDefinition,
} from '../src/shared/agentContract'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}))

const TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    id: 'knowledge-search',
    label: '知识库检索',
    description: '查询本地知识库。',
    availability: 'available',
    risk: 'read-only',
    approvalRequired: false,
    boundary: '只读。',
    reason: 'FTS5 ready',
    timeoutMs: 5_000,
  },
  {
    id: 'strong-code-run',
    label: '强隔离代码运行',
    description: '在 Docker 中运行代码。',
    availability: 'requiresApproval',
    risk: 'isolated-execution',
    approvalRequired: true,
    boundary: '逐次审批，禁止本地回退。',
    reason: 'Docker ready',
    timeoutMs: 15_000,
  },
]

const repoMocks = vi.hoisted(() => ({
  getAgentRun: vi.fn(),
  listAgentRuns: vi.fn(),
  createAgentRunRecord: vi.fn(),
  updateAgentRunStatus: vi.fn(),
  updateAgentToolCall: vi.fn(),
  getAgentToolPayload: vi.fn(),
  decideAgentApproval: vi.fn(),
  appendAgentAuditEvent: vi.fn(),
  listAgentAuditEvents: vi.fn(),
}))

const toolMocks = vi.hoisted(() => ({
  getAgentToolDefinitions: vi.fn(),
  executeAgentTool: vi.fn(),
  resolveAgentToolRequests: vi.fn(),
}))

vi.mock('../electron/db/index', () => ({ getDB: () => ({}) }))
vi.mock('../electron/db/agentRepository', () => repoMocks)
vi.mock('../electron/utils/agentTools', () => toolMocks)

interface TestState {
  run: AgentRunRecord | null
  audit: AgentAuditEvent[]
}

let state: TestState

function pendingRun(): AgentRunRecord {
  const now = new Date().toISOString()
  return {
    id: 'run-1',
    goal: 'run the pending code',
    status: 'needsApproval',
    contextSummary: { view: 'workspace', language: 'python' },
    toolCalls: [
      {
        id: 'call-1',
        runId: 'run-1',
        toolId: 'strong-code-run',
        status: 'needsApproval',
        approvalRequired: true,
        inputSummary: { language: 'python', codeSha256: 'abc123' },
        createdAt: now,
      },
    ],
    approvals: [
      {
        id: 'approval-1',
        runId: 'run-1',
        toolCallId: 'call-1',
        toolId: 'strong-code-run',
        status: 'pending',
        boundary: '逐次审批，禁止本地回退。',
        requestedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  }
}

function installStateMocks(): void {
  repoMocks.getAgentRun.mockImplementation(() => state.run)
  repoMocks.updateAgentRunStatus.mockImplementation(
    (_db: unknown, runId: string, status: AgentRunRecord['status'], error?: string) => {
      if (!state.run || state.run.id !== runId) return null
      state.run = { ...state.run, status, error, updatedAt: new Date().toISOString() }
      return state.run
    },
  )
  repoMocks.updateAgentToolCall.mockImplementation(
    (
      _db: unknown,
      toolCallId: string,
      status: AgentToolCallRecord['status'],
      options?: { result?: Record<string, unknown>; error?: string },
    ) => {
      const run = state.run
      if (!run) return null
      const index = run.toolCalls.findIndex((item) => item.id === toolCallId)
      if (index < 0) return null
      const updated: AgentToolCallRecord = {
        ...run.toolCalls[index],
        status,
        ...(options?.result !== undefined ? { result: options.result } : {}),
        ...(options?.error !== undefined ? { error: options.error } : {}),
        ...(status === 'completed' || status === 'rejected' || status === 'cancelled'
          ? { completedAt: new Date().toISOString() }
          : {}),
      }
      run.toolCalls[index] = updated
      return updated
    },
  )
  repoMocks.decideAgentApproval.mockImplementation(
    (
      _db: unknown,
      toolCallId: string,
      approvalStatus: 'approved' | 'rejected' | 'expired',
      note?: string,
    ) => {
      const run = state.run
      if (!run) return false
      const index = run.approvals.findIndex((item) => item.toolCallId === toolCallId)
      if (index < 0 || run.approvals[index].status !== 'pending') return false
      run.approvals[index] = {
        ...run.approvals[index],
        status: approvalStatus,
        ...(note !== undefined ? { note } : {}),
        decidedAt: new Date().toISOString(),
      }
      return true
    },
  )
  repoMocks.appendAgentAuditEvent.mockImplementation(
    (
      _db: unknown,
      runId: string,
      toolCallId: string | undefined,
      eventType: string,
      details: Record<string, unknown>,
    ) => {
      state.audit.push({
        id: state.audit.length + 1,
        runId,
        toolCallId,
        eventType,
        details,
        createdAt: new Date().toISOString(),
      })
    },
  )
  repoMocks.getAgentToolPayload.mockImplementation((_db: unknown, toolCallId: string) =>
    toolCallId === 'call-1' ? { language: 'python', code: 'print("AGENT_OK")' } : undefined,
  )
  repoMocks.listAgentRuns.mockReturnValue([])
  repoMocks.listAgentAuditEvents.mockReturnValue([])
  repoMocks.createAgentRunRecord.mockReturnValue(null)
  toolMocks.getAgentToolDefinitions.mockResolvedValue(TOOL_DEFINITIONS)
  toolMocks.executeAgentTool.mockResolvedValue({
    executionMode: 'strong-isolation',
    exitCode: 0,
    stdout: 'AGENT_OK\n',
  })
  toolMocks.resolveAgentToolRequests.mockResolvedValue([])
}

async function approveTool(input: {
  runId: string
  toolCallId: string
  note?: string
}): Promise<unknown> {
  return handlers['agent-run-approve']({ sender: { id: 7 } }, input)
}

describe('agent-run-approve native approval dialog', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    state = { run: null, audit: [] }
    installStateMocks()
  })

  it('registers the agent IPC handlers', async () => {
    const { registerAgentIPC } = await import('../electron/ipc/agent')
    registerAgentIPC()
    expect(handlers['agent-run-approve']).toBeDefined()
    expect(handlers['agent-run-reject']).toBeDefined()
  })

  it('approves and dispatches only after the dialog accepts', async () => {
    const { registerAgentIPC, __setApprovalDialogForTest } = await import('../electron/ipc/agent')
    const dialogStub = vi.fn(async () => true)
    __setApprovalDialogForTest(dialogStub)
    registerAgentIPC()
    state.run = pendingRun()

    const result = await approveTool({ runId: 'run-1', toolCallId: 'call-1' })

    expect(dialogStub).toHaveBeenCalledWith({
      toolName: '强隔离代码运行',
      inputSummary: { language: 'python', codeSha256: 'abc123' },
    })
    expect(result).toMatchObject({
      status: 'dispatching',
      toolCalls: [
        {
          status: 'completed',
          result: { executionMode: 'strong-isolation', exitCode: 0, stdout: 'AGENT_OK\n' },
        },
      ],
      approvals: [{ status: 'approved' }],
    })
    expect(state.audit.some((event) => event.eventType === 'approval.approved')).toBe(true)
  })

  it('rejects the run when the dialog returns cancel (拒绝)', async () => {
    const { registerAgentIPC, __setApprovalDialogForTest } = await import('../electron/ipc/agent')
    __setApprovalDialogForTest(async () => false)
    registerAgentIPC()
    state.run = pendingRun()

    const result = await approveTool({ runId: 'run-1', toolCallId: 'call-1' })

    expect(result).toMatchObject({
      status: 'cancelled',
      error: 'User rejected the Agent tool request.',
    })
    expect((result as AgentRunRecord).toolCalls[0]).toMatchObject({
      status: 'rejected',
      error: 'User rejected the Agent tool request.',
    })
    expect((result as AgentRunRecord).approvals[0]).toMatchObject({
      status: 'rejected',
      note: 'User rejected the Agent tool request.',
    })
    expect(state.audit.some((event) => event.eventType === 'approval.rejected')).toBe(true)
  })

  it('uses the real native dialog implementation by default and honors its approval button', async () => {
    const { dialog } = await import('electron')
    ;(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({ response: 0 })
    const { registerAgentIPC, __setApprovalDialogForTest } = await import('../electron/ipc/agent')
    __setApprovalDialogForTest(null)
    registerAgentIPC()
    state.run = pendingRun()

    const result = await approveTool({ runId: 'run-1', toolCallId: 'call-1' })

    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        type: 'warning',
        buttons: ['批准执行', '拒绝'],
        defaultId: 1,
        cancelId: 1,
        title: 'Agent 工具执行确认',
        message: '是否允许 Agent 执行此工具？',
        detail: expect.stringContaining('强隔离代码运行'),
      }),
    )
    expect(result).toMatchObject({ status: 'dispatching' })
  })

  it('refuses expired approvals without consulting the dialog', async () => {
    const { registerAgentIPC, __setApprovalDialogForTest } = await import('../electron/ipc/agent')
    const dialogStub = vi.fn(async () => true)
    __setApprovalDialogForTest(dialogStub)
    registerAgentIPC()
    state.run = pendingRun()
    state.run.approvals[0].requestedAt = new Date(Date.now() - 11 * 60_000).toISOString()

    const result = await approveTool({ runId: 'run-1', toolCallId: 'call-1' })

    expect(result).toMatchObject({ status: 'failed', error: 'Agent 审批已过期' })
    expect(dialogStub).not.toHaveBeenCalled()
    expect(state.audit.some((event) => event.eventType === 'approval.expired')).toBe(true)
  })
})
