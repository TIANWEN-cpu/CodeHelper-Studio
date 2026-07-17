import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runCodeSnippet: vi.fn(),
  detectToolchainsAsync: vi.fn(),
  getKnowledgeRetrievalStatus: vi.fn(),
  searchKnowledgeHybrid: vi.fn(),
}))

vi.mock('../electron/utils/codeRunner', () => ({ runCodeSnippet: mocks.runCodeSnippet }))
vi.mock('../electron/utils/toolchainDetect', () => ({
  detectToolchainsAsync: mocks.detectToolchainsAsync,
}))
vi.mock('../electron/db/knowledgeRetrievalRepository', () => ({
  getKnowledgeRetrievalStatus: mocks.getKnowledgeRetrievalStatus,
  searchKnowledgeHybrid: mocks.searchKnowledgeHybrid,
}))

import {
  executeAgentTool,
  getAgentToolDefinitions,
  resolveAgentToolRequests,
} from '../electron/utils/agentTools'

const database = {} as Database.Database

describe('agent tool whitelist', () => {
  beforeEach(() => {
    mocks.runCodeSnippet.mockReset()
    mocks.searchKnowledgeHybrid.mockReset()
    mocks.getKnowledgeRetrievalStatus.mockReturnValue({
      available: true,
      reason: 'FTS5 ready',
    })
    mocks.detectToolchainsAsync.mockResolvedValue({
      isolation: { strongIsolationAvailable: true, strongIsolationReason: 'Docker ready' },
    })
  })

  it('publishes only real main-process tools with explicit approval policy', async () => {
    const tools = await getAgentToolDefinitions(database)
    expect(tools.map((tool) => tool.id)).toEqual(['knowledge-search', 'strong-code-run'])
    expect(tools[0]).toMatchObject({ availability: 'available', approvalRequired: false })
    expect(tools[1]).toMatchObject({ availability: 'requiresApproval', approvalRequired: true })
  })

  it('rejects tools outside the whitelist and unavailable strong isolation', async () => {
    await expect(
      resolveAgentToolRequests(
        database,
        [{ toolId: 'terminal-run' as 'knowledge-search', input: {} }],
        'test',
      ),
    ).rejects.toThrow('不在白名单')

    mocks.detectToolchainsAsync.mockResolvedValueOnce({
      isolation: { strongIsolationAvailable: false, strongIsolationReason: 'Docker stopped' },
    })
    await expect(
      resolveAgentToolRequests(
        database,
        [{ toolId: 'strong-code-run', input: { language: 'python', code: 'print(1)' } }],
        'run code',
      ),
    ).rejects.toThrow('当前不可用')
  })

  it('summarizes code by hash without exposing source in the audit input summary', async () => {
    const [resolved] = await resolveAgentToolRequests(
      database,
      [{ toolId: 'strong-code-run', input: { language: 'python', code: 'print(1)' } }],
      'run code',
    )
    expect(resolved.inputSummary).toMatchObject({
      language: 'python',
      codeChars: 8,
      executionMode: 'strong-isolation',
    })
    expect(resolved.inputSummary.codeSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(resolved.inputSummary).not.toHaveProperty('code')
  })

  it('executes code only through strong isolation and returns real bounded output', async () => {
    const definition = (await getAgentToolDefinitions(database))[1]
    const controller = new AbortController()
    mocks.runCodeSnippet.mockResolvedValue({
      stdout: 'OK',
      stderr: '',
      exitCode: 0,
      stage: 'run',
    })
    const result = await executeAgentTool(
      database,
      definition,
      { language: 'python', code: 'print("OK")' },
      controller.signal,
    )
    expect(mocks.runCodeSnippet).toHaveBeenCalledWith(
      'print("OK")',
      'python',
      undefined,
      'strong-isolation',
      controller.signal,
    )
    expect(result).toMatchObject({ exitCode: 0, stdout: 'OK', executionMode: 'strong-isolation' })
  })

  it('propagates cancellation to the strong-isolation runner', async () => {
    const definition = (await getAgentToolDefinitions(database))[1]
    const controller = new AbortController()
    mocks.runCodeSnippet.mockImplementation(
      (_code, _language, _stdin, _mode, signal: AbortSignal) =>
        new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () =>
              resolve({
                stdout: '',
                stderr: 'Strong isolation cancelled',
                exitCode: 1,
                stage: 'run',
              }),
            { once: true },
          )
        }),
    )

    const pending = executeAgentTool(
      database,
      definition,
      { language: 'python', code: 'while True: pass' },
      controller.signal,
    )
    controller.abort()

    await expect(pending).rejects.toThrow('已取消')
    expect(mocks.runCodeSnippet).toHaveBeenCalledWith(
      'while True: pass',
      'python',
      undefined,
      'strong-isolation',
      controller.signal,
    )
  })

  it('returns auditable knowledge sources and honors cancellation', async () => {
    const definition = (await getAgentToolDefinitions(database))[0]
    mocks.searchKnowledgeHybrid.mockReturnValue({
      query: 'binary search',
      retrieval: { available: true, degraded: false, mode: 'hybrid', candidateCount: 1 },
      results: [
        {
          filename: 'algorithms.md',
          chunk_index: 0,
          score: 0.9,
          content: 'Binary search halves a sorted range.',
        },
      ],
    })
    await expect(
      executeAgentTool(
        database,
        definition,
        { query: 'binary search', limit: 5 },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      results: [{ source: 'algorithms.md#片段1' }],
    })

    const controller = new AbortController()
    controller.abort()
    await expect(
      executeAgentTool(database, definition, { query: 'x', limit: 5 }, controller.signal),
    ).rejects.toThrow('已取消')
  })
})
