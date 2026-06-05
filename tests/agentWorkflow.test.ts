import { describe, expect, it } from 'vitest'
import {
  AGENT_TOOL_REGISTRY,
  MAX_AGENT_WORKFLOW_RUNS,
  approveAgentWorkflowRun,
  buildAgentToolManifest,
  buildAgentWorkflowPrompt,
  completeAgentWorkflowRun,
  createAgentWorkflowRun,
  failAgentWorkflowRun,
  hasPendingAgentApprovals,
  markAgentWorkflowDispatched,
  rejectAgentWorkflowRun,
  restoreAgentWorkflowRuns,
  selectAgentApprovalRequests,
  serializeAgentWorkflowRuns,
} from '../src/utils/agentWorkflow'

describe('agent workflow orchestration', () => {
  it('creates a dispatching workflow run with deterministic step states', () => {
    const run = createAgentWorkflowRun('debug failed solution')

    expect(run.id).toMatch(/^agent-run-/)
    expect(run.goal).toBe('debug failed solution')
    expect(run.status).toBe('dispatching')
    expect(run.approvals).toEqual([])
    expect(run.steps.map((step) => [step.id, step.status])).toEqual([
      ['understand', 'completed'],
      ['plan', 'completed'],
      ['execute', 'running'],
      ['review', 'pending'],
    ])
  })

  it('moves a dispatched run through running and completed states', () => {
    const run = createAgentWorkflowRun('generate debug plan')
    const running = markAgentWorkflowDispatched(run)
    const completed = completeAgentWorkflowRun(running)

    expect(running.status).toBe('running')
    expect(completed.status).toBe('completed')
    expect(completed.steps.every((step) => step.status === 'completed')).toBe(true)
  })

  it('marks execute as failed without pretending review completed', () => {
    const failed = failAgentWorkflowRun(createAgentWorkflowRun('execute task'), 'model unavailable')

    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('model unavailable')
    expect(failed.steps.map((step) => [step.id, step.status])).toEqual([
      ['understand', 'completed'],
      ['plan', 'completed'],
      ['execute', 'failed'],
      ['review', 'pending'],
    ])
  })

  it('keeps tool ids unique and marks external effects as gated', () => {
    const ids = AGENT_TOOL_REGISTRY.map((tool) => tool.id)
    const externalTools = AGENT_TOOL_REGISTRY.filter((tool) =>
      ['file-edit', 'terminal-run', 'browser-operator'].includes(tool.id),
    )

    expect(new Set(ids).size).toBe(ids.length)
    expect(externalTools.every((tool) => tool.availability !== 'available')).toBe(true)
  })

  it('selects browser approval requests only when the goal asks for gated browser work', () => {
    expect(selectAgentApprovalRequests('generate a learning plan')).toEqual([])

    const approvals = selectAgentApprovalRequests('打开 localhost 页面并截图验证 Agent workflow')

    expect(approvals).toHaveLength(1)
    expect(approvals[0]).toMatchObject({
      toolId: 'browser-operator',
      status: 'pending',
    })
  })

  it('holds browser-oriented runs for approval before dispatching', () => {
    const run = createAgentWorkflowRun('用浏览器打开 localhost 并验证导出流程')

    expect(run.status).toBe('needsApproval')
    expect(hasPendingAgentApprovals(run)).toBe(true)
    expect(run.steps.find((step) => step.id === 'execute')?.status).toBe('needsApproval')
  })

  it('approves or rejects gated Agent workflow runs explicitly', () => {
    const run = createAgentWorkflowRun('浏览器验证 markdown 渲染')
    const approved = approveAgentWorkflowRun(run)
    const rejected = rejectAgentWorkflowRun(run, 'not now')

    expect(approved.status).toBe('dispatching')
    expect(approved.approvals[0].status).toBe('approved')
    expect(hasPendingAgentApprovals(approved)).toBe(false)
    expect(approved.steps.find((step) => step.id === 'execute')?.status).toBe('running')

    expect(rejected.status).toBe('failed')
    expect(rejected.error).toBe('not now')
    expect(rejected.approvals[0].status).toBe('rejected')
  })

  it('formats a tool manifest with availability and boundaries', () => {
    const manifest = buildAgentToolManifest()

    expect(manifest).toContain('上下文摘要 (可用)')
    expect(manifest).toContain('浏览器操作 (需确认)')
    expect(manifest).toContain('文件修改 (规划中)')
    expect(manifest).toContain('边界：')
  })

  it('builds an honest agent prompt with execution boundaries and tool manifest', () => {
    const prompt = buildAgentWorkflowPrompt('fix failed tests')

    expect(prompt).toContain('任务目标：fix failed tests')
    expect(prompt).toContain('当前工具与能力边界')
    expect(prompt).toContain('只有标记为“可用”的工具可以作为本轮已执行能力')
    expect(prompt).toContain('如果无法真实调用工具或访问外部状态')
    expect(prompt).toContain('不要假装已经执行')
    expect(prompt).toContain('## 执行计划')
    expect(prompt).toContain('## 风险与阻塞')
  })

  it('injects approved gated tools into the Agent prompt approval manifest', () => {
    const approved = approveAgentWorkflowRun(createAgentWorkflowRun('浏览器验证 AI 助手入口'))
    const prompt = buildAgentWorkflowPrompt(approved.goal, approved.approvals)

    expect(prompt).toContain('User approval state:')
    expect(prompt).toContain('approved')
    expect(prompt).toContain('Boundary:')
  })

  it('serializes and restores completed run history', () => {
    const completed = completeAgentWorkflowRun(createAgentWorkflowRun('persist me'))
    const restored = restoreAgentWorkflowRuns(serializeAgentWorkflowRuns([completed]))

    expect(restored).toHaveLength(1)
    expect(restored[0].goal).toBe('persist me')
    expect(restored[0].status).toBe('completed')
  })

  it('caps serialized run history to the configured maximum', () => {
    const runs = Array.from({ length: MAX_AGENT_WORKFLOW_RUNS + 2 }, (_, index) =>
      completeAgentWorkflowRun(createAgentWorkflowRun(`run-${index}`)),
    )

    const restored = restoreAgentWorkflowRuns(serializeAgentWorkflowRuns(runs))

    expect(restored).toHaveLength(MAX_AGENT_WORKFLOW_RUNS)
  })

  it('returns empty history for malformed persisted data', () => {
    expect(restoreAgentWorkflowRuns('not json')).toEqual([])
    expect(restoreAgentWorkflowRuns(JSON.stringify({ run: 'bad' }))).toEqual([])
  })

  it('marks interrupted active runs as failed on restore', () => {
    const active = markAgentWorkflowDispatched(createAgentWorkflowRun('interrupted run'))
    const restored = restoreAgentWorkflowRuns(JSON.stringify([active]))

    expect(restored[0].status).toBe('failed')
    expect(restored[0].error).toContain('中断')
    expect(restored[0].steps.find((step) => step.id === 'execute')?.status).toBe('failed')
  })

  it('restores runs waiting on user approval without marking them interrupted', () => {
    const waiting = createAgentWorkflowRun('打开浏览器验证配置页')
    const restored = restoreAgentWorkflowRuns(JSON.stringify([waiting]))

    expect(restored[0].status).toBe('needsApproval')
    expect(restored[0].approvals[0].status).toBe('pending')
    expect(restored[0].error).toBeUndefined()
  })
})
