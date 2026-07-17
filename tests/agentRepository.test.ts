import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendAgentAuditEvent,
  createAgentRunRecord,
  ensureAgentSchema,
  getAgentRun,
  getAgentToolPayload,
  listAgentAuditEvents,
  updateAgentRunStatus,
  updateAgentToolCall,
} from '../electron/db/agentRepository'

type BetterSqlite3 = typeof import('better-sqlite3')
type BetterSqlite3Database = import('better-sqlite3').Database

function loadNativeDatabase(): BetterSqlite3 | null {
  try {
    const require = createRequire(import.meta.url)
    const Database = require('better-sqlite3') as BetterSqlite3
    const probe = new Database(':memory:')
    probe.close()
    return Database
  } catch {
    return null
  }
}

const Database = loadNativeDatabase()

describe.runIf(Database !== null)('agent repository', () => {
  let database: BetterSqlite3Database

  beforeEach(() => {
    database = new Database!(':memory:')
    database.pragma('foreign_keys = ON')
    database.exec(`
      CREATE TABLE schema_migrations (
        component TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    ensureAgentSchema(database)
  })

  afterEach(() => database.close())

  it('persists a run, tool-specific approval, and queryable audit trail', () => {
    const run = createAgentRunRecord(database, {
      goal: 'run current code',
      status: 'needsApproval',
      contextSummary: { view: 'workspace', codeSha256: 'abc' },
      tools: [
        {
          toolId: 'strong-code-run',
          approvalRequired: true,
          boundary: 'Docker only',
          inputSummary: { language: 'python', codeSha256: 'abc' },
          inputPayload: { language: 'python', code: 'print(1)' },
        },
      ],
    })

    expect(run.status).toBe('needsApproval')
    expect(run.approvals[0]).toMatchObject({ status: 'pending', toolId: 'strong-code-run' })
    expect(getAgentToolPayload(database, run.toolCalls[0].id)).toEqual({
      language: 'python',
      code: 'print(1)',
    })
    expect(listAgentAuditEvents(database, run.id).map((event) => event.eventType)).toContain(
      'run.created',
    )
  })

  it('clears sensitive tool payload after terminal execution while retaining summaries', () => {
    const run = createAgentRunRecord(database, {
      goal: 'search docs',
      status: 'dispatching',
      contextSummary: {},
      tools: [
        {
          toolId: 'knowledge-search',
          approvalRequired: false,
          boundary: 'read only',
          inputSummary: { query: 'graphs' },
          inputPayload: { query: 'graphs', limit: 5 },
        },
      ],
    })
    const callId = run.toolCalls[0].id
    updateAgentToolCall(database, callId, 'running')
    updateAgentToolCall(database, callId, 'completed', { result: { results: [] } })

    expect(getAgentToolPayload(database, callId)).toBeNull()
    expect(getAgentRun(database, run.id)?.toolCalls[0]).toMatchObject({
      status: 'completed',
      inputSummary: { query: 'graphs' },
      result: { results: [] },
    })
  })

  it('terminalizes pending tools and approvals while clearing every payload', () => {
    const run = createAgentRunRecord(database, {
      goal: 'search then run code',
      status: 'needsApproval',
      contextSummary: {},
      tools: [
        {
          toolId: 'knowledge-search',
          approvalRequired: false,
          boundary: 'read only',
          inputSummary: { query: 'graphs' },
          inputPayload: { query: 'graphs', limit: 5 },
        },
        {
          toolId: 'strong-code-run',
          approvalRequired: true,
          boundary: 'Docker only',
          inputSummary: { language: 'python', codeSha256: 'abc' },
          inputPayload: { language: 'python', code: 'print(1)' },
        },
      ],
    })

    updateAgentRunStatus(database, run.id, 'failed', 'knowledge search failed')
    const failed = getAgentRun(database, run.id)!

    expect(failed.status).toBe('failed')
    expect(failed.toolCalls.map((call) => call.status)).toEqual(['failed', 'failed'])
    expect(failed.approvals[0].status).toBe('rejected')
    expect(failed.toolCalls.every((call) => getAgentToolPayload(database, call.id) === null)).toBe(
      true,
    )
  })

  it('does not allow late tool results or run transitions to overwrite terminal state', () => {
    const run = createAgentRunRecord(database, {
      goal: 'cancel running code',
      status: 'dispatching',
      contextSummary: {},
      tools: [
        {
          toolId: 'knowledge-search',
          approvalRequired: false,
          boundary: 'read only',
          inputSummary: { query: 'graphs' },
          inputPayload: { query: 'graphs', limit: 5 },
        },
      ],
    })
    const callId = run.toolCalls[0].id
    updateAgentToolCall(database, callId, 'running')
    updateAgentRunStatus(database, run.id, 'cancelled', 'cancelled in UI')

    updateAgentToolCall(database, callId, 'completed', { result: { stale: true } })
    updateAgentRunStatus(database, run.id, 'dispatching')

    expect(getAgentRun(database, run.id)).toMatchObject({
      status: 'cancelled',
      toolCalls: [{ status: 'cancelled', result: undefined }],
    })
  })

  it('records approval decisions and safely fails interrupted work on reopen', () => {
    const run = createAgentRunRecord(database, {
      goal: 'run code',
      status: 'needsApproval',
      contextSummary: {},
      tools: [
        {
          toolId: 'knowledge-search',
          approvalRequired: false,
          boundary: 'read only',
          inputSummary: { query: 'graphs' },
          inputPayload: { query: 'graphs', limit: 5 },
        },
        {
          toolId: 'strong-code-run',
          approvalRequired: true,
          boundary: 'Docker only',
          inputSummary: { codeSha256: 'abc' },
          inputPayload: { code: 'print(1)', language: 'python' },
        },
      ],
    })
    const runningCallId = run.toolCalls[0].id
    const approvalCallId = run.toolCalls[1].id
    updateAgentToolCall(database, runningCallId, 'running')
    updateAgentRunStatus(database, run.id, 'running')
    appendAgentAuditEvent(database, run.id, runningCallId, 'tool.started', {})

    ensureAgentSchema(database)

    expect(getAgentRun(database, run.id)).toMatchObject({ status: 'failed' })
    expect(getAgentRun(database, run.id)?.toolCalls.map((call) => call.status)).toEqual([
      'failed',
      'failed',
    ])
    expect(getAgentRun(database, run.id)?.approvals[0]).toMatchObject({ status: 'rejected' })
    expect(getAgentToolPayload(database, runningCallId)).toBeNull()
    expect(getAgentToolPayload(database, approvalCallId)).toBeNull()
  })
})
