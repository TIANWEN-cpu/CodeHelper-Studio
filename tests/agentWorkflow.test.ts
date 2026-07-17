import { describe, expect, it } from 'vitest'
import type { AgentRunRecord, AgentToolDefinition } from '../src/shared/agentContract'
import {
  buildAgentToolManifest,
  buildAgentWorkflowPrompt,
  hydrateAgentWorkflowRun,
  hydrateAgentWorkflowRuns,
  MAX_AGENT_WORKFLOW_RUNS,
} from '../src/utils/agentWorkflow'

const tools: AgentToolDefinition[] = [
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

function run(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    id: 'agent-run-1',
    goal: 'review current code',
    status: 'dispatching',
    contextSummary: { view: 'workspace', codeSha256: 'abc' },
    toolCalls: [],
    approvals: [],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('audited agent workflow presentation', () => {
  it('derives deterministic step states from durable run status', () => {
    const waiting = hydrateAgentWorkflowRun(run({ status: 'needsApproval' }))
    const completed = hydrateAgentWorkflowRun(run({ status: 'completed' }))
    const cancelled = hydrateAgentWorkflowRun(run({ status: 'cancelled' }))

    expect(waiting.steps.find((step) => step.id === 'execute')?.status).toBe('needsApproval')
    expect(completed.steps.map((step) => step.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ])
    expect(cancelled.steps.find((step) => step.id === 'execute')?.status).toBe('failed')
    expect(cancelled.steps.find((step) => step.id === 'review')?.status).toBe('pending')
  })

  it('caps hydrated SQLite history to the UI retention limit', () => {
    const runs = Array.from({ length: MAX_AGENT_WORKFLOW_RUNS + 3 }, (_, index) =>
      run({ id: `run-${index}` }),
    )
    expect(hydrateAgentWorkflowRuns(runs)).toHaveLength(MAX_AGENT_WORKFLOW_RUNS)
  })

  it('formats the main-process whitelist with approval and boundary details', () => {
    const manifest = buildAgentToolManifest(tools)
    expect(manifest).toContain('knowledge-search')
    expect(manifest).toContain('可直接调用')
    expect(manifest).toContain('strong-code-run')
    expect(manifest).toContain('逐次审批')
    expect(manifest).toContain('禁止本地回退')
  })

  it('injects only recorded tool evidence into the model prompt', () => {
    const prompt = buildAgentWorkflowPrompt(
      run({
        toolCalls: [
          {
            id: 'call-1',
            runId: 'agent-run-1',
            toolId: 'knowledge-search',
            status: 'completed',
            approvalRequired: false,
            inputSummary: { query: 'binary search' },
            result: { results: [{ source: 'algorithms.md#片段1', excerpt: 'binary search' }] },
            createdAt: '2026-07-16T00:00:00.000Z',
            completedAt: '2026-07-16T00:00:01.000Z',
          },
        ],
      }),
      tools,
    )

    expect(prompt).toContain('algorithms.md#片段1')
    expect(prompt).toContain('只能把状态为 completed 的工具调用描述为已执行')
    expect(prompt).toContain('不得声称调用了白名单之外')
  })

  it('keeps failed and cancelled calls explicit instead of fabricating output', () => {
    const prompt = buildAgentWorkflowPrompt(
      run({
        toolCalls: [
          {
            id: 'call-2',
            runId: 'agent-run-1',
            toolId: 'strong-code-run',
            status: 'cancelled',
            approvalRequired: true,
            inputSummary: { codeSha256: 'def' },
            error: 'User cancelled the Agent run.',
            createdAt: '2026-07-16T00:00:00.000Z',
            completedAt: '2026-07-16T00:00:01.000Z',
          },
        ],
      }),
      tools,
    )
    expect(prompt).toContain('strong-code-run')
    expect(prompt).toContain('cancelled')
    expect(prompt).toContain('User cancelled')
  })
})
