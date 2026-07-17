import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentToolDefinition } from '../src/shared/agentContract'
import type { KnowledgeRetrievalStatus } from '../src/shared/knowledgeRetrievalContract'
import type { ToolchainReport } from '../electron/utils/toolchainDetect'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => '2.3.0-test'),
    getPath: vi.fn(() => 'D:\\test-user-data'),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => 'dpapi'),
  },
}))

const { getRuntimeCapabilities } = await import('../electron/utils/runtimeCapabilities')

const runtimeInfo = {
  isPackaged: true,
  appVersion: '2.4.0',
  platform: 'win32',
  arch: 'x64',
  osVersion: '10.0.26100',
  electronVersion: '41.7.1',
  chromeVersion: '142.0.0',
  nodeVersion: '24.0.0',
}

const knowledgeReady: KnowledgeRetrievalStatus = {
  available: true,
  degraded: false,
  mode: 'hybrid',
  lexicalBackend: 'fts5-bm25',
  semanticBackend: 'fts5-trigram-local-ngram',
  reason: 'FTS5 ready',
  documentCount: 4,
  chunkCount: 12,
  indexedAt: 123,
}

const agentTools: AgentToolDefinition[] = [
  {
    id: 'knowledge-search',
    label: '知识库检索',
    description: 'read only',
    availability: 'available',
    risk: 'read-only',
    approvalRequired: false,
    boundary: 'local database only',
    reason: 'ready',
    timeoutMs: 5_000,
  },
  {
    id: 'strong-code-run',
    label: '强隔离代码运行',
    description: 'isolated execution',
    availability: 'requiresApproval',
    risk: 'isolated-execution',
    approvalRequired: true,
    boundary: 'per-run approval',
    reason: 'Docker ready',
    timeoutMs: 15_000,
  },
]

const toolchainReport: ToolchainReport = {
  detectedAt: 456,
  platform: 'win32',
  isolation: {
    mode: 'local-controlled',
    label: 'local controlled',
    description: 'not a sandbox',
    strongIsolationAvailable: true,
    strongIsolationReason: 'Docker ready',
  },
  tools: [
    {
      id: 'python',
      languageIds: ['python'],
      status: 'ready',
      command: 'C:\\Users\\private\\python.exe',
      version: 'Python 3.12.0',
      message: 'Python ready',
    },
    {
      id: 'gcc',
      languageIds: ['c'],
      status: 'missing',
      message: 'gcc missing',
    },
  ],
}

function databaseFixture(options?: { quickCheck?: string; aiCount?: number }) {
  const pragma = vi.fn(() => [{ quick_check: options?.quickCheck ?? 'ok' }])
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('schema_migrations')) {
      return {
        all: vi.fn(() => [
          { component: 'application', version: 1, updated_at: '2026-07-16T00:00:00Z' },
          { component: 'editor-workspace', version: 3, updated_at: '2026-07-15T00:00:00Z' },
        ]),
      }
    }
    if (sql.includes('FROM ai_configs')) {
      return { get: vi.fn(() => ({ count: options?.aiCount ?? 2 })) }
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  })
  return {
    database: { pragma, prepare } as unknown as Database.Database,
    pragma,
    prepare,
  }
}

describe('runtime capability aggregation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports healthy capabilities without exposing command paths or querying AI secrets', async () => {
    const { database, prepare } = databaseFixture()
    const detectToolchains = vi.fn(async () => toolchainReport)

    const status = await getRuntimeCapabilities(
      { force: true },
      {
        getDatabase: () => database,
        detectToolchains,
        getKnowledgeStatus: () => knowledgeReady,
        getAgentTools: async () => agentTools,
        getRuntimeInfo: () => runtimeInfo,
        getLocalRunnerHostReadiness: () => ({
          available: true,
          utilityEntryAvailable: true,
          windowsJobHostRequired: true,
          windowsJobHostAvailable: true,
          reason: 'ready',
        }),
        getCredentialStorageStatus: () => ({ available: true, reason: 'ready' }),
        getBackupSummary: () => ({
          directoryAvailable: true,
          backupCount: 3,
          warningCount: 0,
          reason: 'Backup directory ready',
        }),
        now: () => 1_750_000_000_000,
      },
    )

    expect(detectToolchains).toHaveBeenCalledWith(true)
    expect(status.runtime).toMatchObject({ mode: 'packaged', appVersion: '2.4.0' })
    expect(status.database).toMatchObject({
      state: 'ready',
      quickCheck: 'ok',
      applicationSchemaVersion: 1,
      backups: { state: 'ready', backupCount: 3 },
    })
    expect(status.execution).toMatchObject({
      state: 'ready',
      strongIsolationAvailable: true,
      toolchains: [{ id: 'python', status: 'ready', version: 'Python 3.12.0' }, { id: 'gcc' }],
    })
    expect(status.execution.toolchains[0]).not.toHaveProperty('command')
    expect(status.knowledge.state).toBe('ready')
    expect(status.agent).toMatchObject({
      state: 'ready',
      enabledToolCount: 2,
      approvalRequiredToolCount: 1,
    })
    expect(status.ai).toMatchObject({
      state: 'unknown',
      configured: true,
      configurationCount: 2,
      connectivity: 'not-checked',
    })
    const aiQuery = prepare.mock.calls.map(([sql]) => sql).find((sql) => sql.includes('ai_configs'))
    expect(aiQuery).toBeDefined()
    expect(aiQuery).not.toMatch(/api_key/i)
  })

  it('keeps the report available when the database and toolchain probes fail', async () => {
    const getKnowledgeStatus = vi.fn()
    const getAgentTools = vi.fn()

    const status = await getRuntimeCapabilities(
      {},
      {
        getDatabase: () => {
          throw new Error('database locked')
        },
        detectToolchains: async () => {
          throw new Error('probe crashed')
        },
        getKnowledgeStatus,
        getAgentTools,
        getRuntimeInfo: () => runtimeInfo,
        getLocalRunnerHostReadiness: () => ({
          available: true,
          utilityEntryAvailable: true,
          windowsJobHostRequired: true,
          windowsJobHostAvailable: true,
          reason: 'ready',
        }),
        getCredentialStorageStatus: () => ({ available: true, reason: 'ready' }),
        getBackupSummary: undefined,
        now: () => 99,
      },
    )

    expect(status.generatedAt).toBe(99)
    expect(status.runtime.state).toBe('ready')
    expect(status.database).toMatchObject({ state: 'unavailable', quickCheck: 'unavailable' })
    expect(status.execution).toMatchObject({
      state: 'unavailable',
      strongIsolationAvailable: false,
    })
    expect(status.knowledge.state).toBe('unavailable')
    expect(status.agent.state).toBe('unavailable')
    expect(status.ai).toMatchObject({
      state: 'unavailable',
      configured: false,
      connectivity: 'not-checked',
    })
    expect(getKnowledgeStatus).not.toHaveBeenCalled()
    expect(getAgentTools).not.toHaveBeenCalled()
  })

  it('marks database and backup integrity failures and partial Agent availability as degraded', async () => {
    const { database } = databaseFixture({ quickCheck: 'row 17 malformed', aiCount: 0 })
    const partialTools: AgentToolDefinition[] = [
      agentTools[0],
      { ...agentTools[1], availability: 'unavailable', reason: 'Docker stopped' },
    ]

    const status = await getRuntimeCapabilities(
      {},
      {
        getDatabase: () => database,
        detectToolchains: async () => toolchainReport,
        getKnowledgeStatus: () => ({ ...knowledgeReady, degraded: true, mode: 'hybrid-degraded' }),
        getAgentTools: async () => partialTools,
        getRuntimeInfo: () => runtimeInfo,
        getLocalRunnerHostReadiness: () => ({
          available: true,
          utilityEntryAvailable: true,
          windowsJobHostRequired: true,
          windowsJobHostAvailable: true,
          reason: 'ready',
        }),
        getCredentialStorageStatus: () => ({ available: true, reason: 'ready' }),
        getBackupSummary: () => ({
          state: 'ready',
          directoryAvailable: true,
          backupCount: 1,
          warningCount: 2,
          reason: 'One valid backup; two invalid records were excluded',
        }),
        now: () => 100,
      },
    )

    expect(status.database).toMatchObject({ state: 'degraded', quickCheck: 'failed' })
    expect(status.knowledge.state).toBe('degraded')
    expect(status.agent).toMatchObject({ state: 'degraded', enabledToolCount: 1 })
    expect(status.ai).toMatchObject({ state: 'unavailable', configurationCount: 0 })
    expect(status.database.backups).toMatchObject({ state: 'degraded', backupCount: 1 })
  })
})
