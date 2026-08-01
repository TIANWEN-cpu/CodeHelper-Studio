import { expect, test, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type {
  AgentAuditEvent,
  AgentRunRecord,
  AgentToolDefinition,
} from '../../src/shared/agentContract'

const appRoot = resolve(__dirname, '../..')

async function closeApplication(application: ElectronApplication): Promise<void> {
  try {
    await application.close()
  } catch {
    try {
      application.process().kill('SIGKILL')
    } catch {
      // The application may already be closed.
    }
  }
}

test('Agent tools are whitelisted, audited, cancellable, and approval-gated', async () => {
  test.setTimeout(90_000)
  const userDataDir = await mkdtemp(join(tmpdir(), 'codehelper-agent-e2e-'))
  const packRoot = await mkdtemp(join(tmpdir(), 'codehelper-agent-pack-'))
  const knowledgeDir = join(packRoot, 'knowledge-docs', 'agent')
  await mkdir(knowledgeDir, { recursive: true })
  await writeFile(
    join(knowledgeDir, 'audit.md'),
    '# Agent audit\n\nAn Agent tool call must preserve its source, approval, output, and failure state.',
    'utf8',
  )

  const application = await electron.launch({
    args: [appRoot],
    env: {
      ...process.env,
      CODEHELPER_E2E_USER_DATA: userDataDir,
      CODEHELPER_E2E_HEADLESS: '1',
    },
  })

  try {
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('nav-home')).toBeVisible({ timeout: 30_000 })
    await application.evaluate(() => {
      const hook = (globalThis as Record<string, unknown>)['__codehelperAgentApprovalDialogForTest']
      if (typeof hook !== 'function') {
        throw new Error('Agent approval dialog test hook is unavailable')
      }
      ;(hook as (fn: () => Promise<boolean>) => void)(async () => true)
    })
    await page.evaluate(
      async (rootPath) => window.api.invoke('resource-pack-import', { rootPath }),
      packRoot,
    )

    const tools = await page.evaluate(() =>
      window.api.invoke<AgentToolDefinition[]>('agent-tools-list'),
    )
    expect(tools.map((tool) => tool.id)).toEqual(['knowledge-search', 'strong-code-run'])
    expect(tools[0]).toMatchObject({ approvalRequired: false, risk: 'read-only' })
    expect(tools[1].approvalRequired).toBe(true)

    const knowledgeRun = await page.evaluate(() =>
      window.api.invoke<AgentRunRecord>('agent-run-create', {
        goal: '查找 Agent 审计要求',
        context: { view: 'knowledge' },
        tools: [{ toolId: 'knowledge-search', input: { query: 'Agent audit approval output' } }],
      }),
    )
    expect(knowledgeRun).toMatchObject({ status: 'dispatching' })
    expect(knowledgeRun.toolCalls[0]).toMatchObject({
      toolId: 'knowledge-search',
      status: 'completed',
    })
    expect(JSON.stringify(knowledgeRun.toolCalls[0].result)).toContain('agent/audit.md#片段1')

    const running = await page.evaluate(
      (runId) => window.api.invoke<AgentRunRecord>('agent-run-model-started', { runId }),
      knowledgeRun.id,
    )
    expect(running.status).toBe('running')
    const completed = await page.evaluate(
      (runId) => window.api.invoke<AgentRunRecord>('agent-run-complete', { runId }),
      knowledgeRun.id,
    )
    expect(completed.status).toBe('completed')

    const audit = await page.evaluate(
      (runId) => window.api.invoke<AgentAuditEvent[]>('agent-audit-list', runId),
      knowledgeRun.id,
    )
    expect(audit.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['run.created', 'tool.started', 'tool.completed', 'run.completed']),
    )

    const cancellable = await page.evaluate(() =>
      window.api.invoke<AgentRunRecord>('agent-run-create', {
        goal: 'prepare a model-only report',
        context: { view: 'ai-tutor' },
        tools: [],
      }),
    )
    const cancelled = await page.evaluate(
      (runId) => window.api.invoke<AgentRunRecord>('agent-run-cancel', { runId }),
      cancellable.id,
    )
    expect(cancelled.status).toBe('cancelled')

    const strongTool = tools.find((tool) => tool.id === 'strong-code-run')
    if (strongTool?.availability === 'requiresApproval') {
      const codeRun = await page.evaluate(() =>
        window.api.invoke<AgentRunRecord>('agent-run-create', {
          goal: 'run the current Python smoke test',
          context: { view: 'workspace', language: 'python', code: 'print("AGENT_OK")' },
          tools: [
            {
              toolId: 'strong-code-run',
              input: { language: 'python', code: 'print("AGENT_OK")' },
            },
          ],
        }),
      )
      expect(codeRun.status).toBe('needsApproval')
      expect(codeRun.toolCalls[0].inputSummary).not.toHaveProperty('code')
      await expect(
        page.evaluate(
          (runId) => window.api.invoke<AgentRunRecord>('agent-run-complete', { runId }),
          codeRun.id,
        ),
      ).rejects.toThrow(/模型运行尚未开始|工具尚未完成/)

      const approvalInput = { runId: codeRun.id, toolCallId: codeRun.toolCalls[0].id }
      const approvalAttempts = await Promise.allSettled([
        page.evaluate(
          (input) => window.api.invoke<AgentRunRecord>('agent-run-approve', input),
          approvalInput,
        ),
        page.evaluate(
          (input) => window.api.invoke<AgentRunRecord>('agent-run-approve', input),
          approvalInput,
        ),
      ])
      expect(approvalAttempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
      expect(approvalAttempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
      const approved = approvalAttempts.find((attempt) => attempt.status === 'fulfilled')!.value
      expect(approved.status).toBe('dispatching')
      expect(approved.toolCalls[0]).toMatchObject({
        status: 'completed',
        result: { executionMode: 'strong-isolation', exitCode: 0, stdout: 'AGENT_OK\n' },
      })

      const failedBeforeApproval = await page.evaluate(() =>
        window.api.invoke<AgentRunRecord>('agent-run-create', {
          goal: 'fail before approving the pending code',
          context: { view: 'workspace', language: 'python', code: 'print("NEVER_RUN")' },
          tools: [
            {
              toolId: 'strong-code-run',
              input: { language: 'python', code: 'print("NEVER_RUN")' },
            },
          ],
        }),
      )
      const terminalized = await page.evaluate(
        (runId) =>
          window.api.invoke<AgentRunRecord>('agent-run-fail', {
            runId,
            note: 'synthetic pre-dispatch failure',
          }),
        failedBeforeApproval.id,
      )
      expect(terminalized).toMatchObject({
        status: 'failed',
        toolCalls: [{ status: 'failed' }],
        approvals: [{ status: 'rejected' }],
      })
      await expect(
        page.evaluate(
          ({ runId, toolCallId }) =>
            window.api.invoke<AgentRunRecord>('agent-run-approve', { runId, toolCallId }),
          {
            runId: failedBeforeApproval.id,
            toolCallId: failedBeforeApproval.toolCalls[0].id,
          },
        ),
      ).rejects.toThrow(/不可审批/)
    }

    const displayRun = await page.evaluate(() =>
      window.api.invoke<AgentRunRecord>('agent-run-create', {
        goal: 'display the durable Agent audit state',
        context: { view: 'ai-tutor' },
        tools: [],
      }),
    )
    await page.evaluate(
      (runId) => window.api.invoke<AgentRunRecord>('agent-run-model-started', { runId }),
      displayRun.id,
    )
    await page.evaluate(
      (runId) => window.api.invoke<AgentRunRecord>('agent-run-complete', { runId }),
      displayRun.id,
    )

    await page.getByTestId('nav-ai-tutor').click()
    await page.getByRole('tab', { name: 'Agent' }).click()
    await expect(page.locator('[data-agent-tool="knowledge-search"]')).toBeVisible()
    await expect(page.locator(`[data-agent-workflow-run="completed"]`)).toBeVisible()
    await expect(page.locator('[data-agent-audit-count]')).toBeVisible()

    await expect(
      page.evaluate(() => window.api.invoke('ai-chat-cancel', 'unknown-request')),
    ).resolves.toEqual({ cancelled: false })
  } finally {
    await closeApplication(application)
    await rm(userDataDir, { recursive: true, force: true })
    await rm(packRoot, { recursive: true, force: true })
  }
})

test('an interrupted Agent model run is failed closed on restart', async () => {
  test.setTimeout(60_000)
  const userDataDir = await mkdtemp(join(tmpdir(), 'codehelper-agent-restart-e2e-'))
  let application = await electron.launch({
    args: [appRoot],
    env: {
      ...process.env,
      CODEHELPER_E2E_USER_DATA: userDataDir,
      CODEHELPER_E2E_HEADLESS: '1',
    },
  })

  try {
    let page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('nav-home')).toBeVisible({ timeout: 30_000 })
    const run = await page.evaluate(() =>
      window.api.invoke<AgentRunRecord>('agent-run-create', {
        goal: 'interrupted model synthesis',
        context: { view: 'ai-tutor' },
        tools: [],
      }),
    )
    await page.evaluate(
      (runId) => window.api.invoke<AgentRunRecord>('agent-run-model-started', { runId }),
      run.id,
    )

    await closeApplication(application)
    application = await electron.launch({
      args: [appRoot],
      env: {
        ...process.env,
        CODEHELPER_E2E_USER_DATA: userDataDir,
        CODEHELPER_E2E_HEADLESS: '1',
      },
    })
    page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('nav-home')).toBeVisible({ timeout: 30_000 })
    const runs = await page.evaluate(() => window.api.invoke<AgentRunRecord[]>('agent-runs-list'))
    expect(runs.find((item) => item.id === run.id)).toMatchObject({
      status: 'failed',
      error: 'Agent 运行在上次应用会话中断，已安全终止。',
    })
  } finally {
    await closeApplication(application)
    await rm(userDataDir, { recursive: true, force: true })
  }
})
