import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  AgentApprovalRecord,
  AgentApprovalStatus,
  AgentAuditEvent,
  AgentRunRecord,
  AgentRunStatus,
  AgentToolCallRecord,
  AgentToolCallStatus,
  AgentToolDefinition,
} from '../../src/shared/agentContract'

const AGENT_SCHEMA_COMPONENT = 'agent-tools'
const AGENT_SCHEMA_VERSION = 1
const AGENT_RESTART_ERROR = 'Agent 运行在上次应用会话中断，已安全终止。'

type RunRow = {
  id: string
  goal: string
  status: AgentRunStatus
  context_summary: string
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

type ToolCallRow = {
  id: string
  run_id: string
  tool_id: AgentToolDefinition['id']
  status: AgentToolCallStatus
  approval_required: number
  input_summary: string
  input_payload: string | null
  result_json: string | null
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

type ApprovalRow = {
  id: string
  run_id: string
  tool_call_id: string
  tool_id: AgentToolDefinition['id']
  status: AgentApprovalStatus
  boundary: string
  requested_at: string
  decided_at: string | null
  note: string | null
}

type AuditRow = {
  id: number
  run_id: string
  tool_call_id: string | null
  event_type: string
  details_json: string
  created_at: string
}

function parseRecord(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function stringifyRecord(value: Record<string, unknown>): string {
  return JSON.stringify(value)
}

export function ensureAgentSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('needsApproval','dispatching','running','completed','failed','cancelled')),
      context_summary TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_tool_calls (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL CHECK(tool_id IN ('knowledge-search','strong-code-run')),
      status TEXT NOT NULL CHECK(status IN ('queued','needsApproval','running','completed','failed','rejected','cancelled')),
      approval_required INTEGER NOT NULL DEFAULT 0 CHECK(approval_required IN (0,1)),
      input_summary TEXT NOT NULL DEFAULT '{}',
      input_payload TEXT,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      tool_call_id TEXT NOT NULL UNIQUE REFERENCES agent_tool_calls(id) ON DELETE CASCADE,
      tool_id TEXT NOT NULL CHECK(tool_id IN ('knowledge-search','strong-code-run')),
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','expired')),
      boundary TEXT NOT NULL,
      requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      decided_at TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      tool_call_id TEXT REFERENCES agent_tool_calls(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
      ON agent_runs(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run
      ON agent_tool_calls(run_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_agent_audit_run
      ON agent_audit_events(run_id, created_at, id);
  `)

  database
    .prepare(
      `INSERT INTO schema_migrations (component, version, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(component) DO UPDATE SET
         version = MAX(schema_migrations.version, excluded.version),
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(AGENT_SCHEMA_COMPONENT, AGENT_SCHEMA_VERSION)

  const interruptedRuns = database
    .prepare("SELECT id FROM agent_runs WHERE status IN ('dispatching', 'running')")
    .all() as Array<{ id: string }>
  for (const { id } of interruptedRuns) {
    updateAgentRunStatus(database, id, 'failed', AGENT_RESTART_ERROR)
  }

  // Repair terminal rows written by older builds so no executable payload or
  // reusable approval survives a completed, failed, or cancelled run.
  const terminalRuns = database
    .prepare(
      "SELECT id, status, error FROM agent_runs WHERE status IN ('completed', 'failed', 'cancelled')",
    )
    .all() as Array<{ id: string; status: AgentRunStatus; error: string | null }>
  for (const run of terminalRuns) {
    finalizeAgentRunDependents(database, run.id, run.status, run.error ?? undefined)
  }
}

function toolCallFromRow(row: ToolCallRow): AgentToolCallRecord {
  return {
    id: row.id,
    runId: row.run_id,
    toolId: row.tool_id,
    status: row.status,
    approvalRequired: row.approval_required === 1,
    inputSummary: parseRecord(row.input_summary),
    result: row.result_json ? parseRecord(row.result_json) : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
  }
}

function approvalFromRow(row: ApprovalRow): AgentApprovalRecord {
  return {
    id: row.id,
    runId: row.run_id,
    toolCallId: row.tool_call_id,
    toolId: row.tool_id,
    status: row.status,
    boundary: row.boundary,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at ?? undefined,
    note: row.note ?? undefined,
  }
}

function readRun(database: Database.Database, row: RunRow): AgentRunRecord {
  const toolCalls = database
    .prepare('SELECT * FROM agent_tool_calls WHERE run_id = ? ORDER BY created_at, id')
    .all(row.id) as ToolCallRow[]
  const approvals = database
    .prepare('SELECT * FROM agent_approvals WHERE run_id = ? ORDER BY requested_at, id')
    .all(row.id) as ApprovalRow[]
  return {
    id: row.id,
    goal: row.goal,
    status: row.status,
    contextSummary: parseRecord(row.context_summary),
    toolCalls: toolCalls.map(toolCallFromRow),
    approvals: approvals.map(approvalFromRow),
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  }
}

export function getAgentRun(database: Database.Database, runId: string): AgentRunRecord | null {
  const row = database.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as
    | RunRow
    | undefined
  return row ? readRun(database, row) : null
}

export function listAgentRuns(database: Database.Database, limit = 20): AgentRunRecord[] {
  const rows = database
    .prepare('SELECT * FROM agent_runs ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(Math.max(1, Math.min(100, limit))) as RunRow[]
  return rows.map((row) => readRun(database, row))
}

export function createAgentRunRecord(
  database: Database.Database,
  input: {
    goal: string
    status: AgentRunStatus
    contextSummary: Record<string, unknown>
    tools: Array<{
      toolId: AgentToolDefinition['id']
      approvalRequired: boolean
      boundary: string
      inputSummary: Record<string, unknown>
      inputPayload: Record<string, unknown>
    }>
  },
): AgentRunRecord {
  const runId = `agent-run-${randomUUID()}`
  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO agent_runs (id, goal, status, context_summary)
         VALUES (?, ?, ?, ?)`,
      )
      .run(runId, input.goal, input.status, stringifyRecord(input.contextSummary))
    for (const tool of input.tools) {
      const toolCallId = `agent-call-${randomUUID()}`
      database
        .prepare(
          `INSERT INTO agent_tool_calls
             (id, run_id, tool_id, status, approval_required, input_summary, input_payload)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          toolCallId,
          runId,
          tool.toolId,
          tool.approvalRequired ? 'needsApproval' : 'queued',
          tool.approvalRequired ? 1 : 0,
          stringifyRecord(tool.inputSummary),
          stringifyRecord(tool.inputPayload),
        )
      if (tool.approvalRequired) {
        database
          .prepare(
            `INSERT INTO agent_approvals
               (id, run_id, tool_call_id, tool_id, status, boundary)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
          )
          .run(`agent-approval-${randomUUID()}`, runId, toolCallId, tool.toolId, tool.boundary)
      }
    }
    appendAgentAuditEvent(database, runId, undefined, 'run.created', {
      status: input.status,
      toolIds: input.tools.map((tool) => tool.toolId),
    })
  })()
  return getAgentRun(database, runId)!
}

export function updateAgentRunStatus(
  database: Database.Database,
  runId: string,
  status: AgentRunStatus,
  error?: string,
): AgentRunRecord | null {
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled'
  database.transaction(() => {
    const result = database
      .prepare(
        `UPDATE agent_runs
         SET status = ?, error = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             completed_at = CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END
         WHERE id = ? AND status NOT IN ('completed', 'failed', 'cancelled')`,
      )
      .run(status, error ?? null, terminal ? 1 : 0, runId)
    if (result.changes === 1 && terminal) {
      finalizeAgentRunDependents(database, runId, status, error)
    }
  })()
  return getAgentRun(database, runId)
}

function finalizeAgentRunDependents(
  database: Database.Database,
  runId: string,
  status: AgentRunStatus,
  error?: string,
): void {
  const terminalToolStatus = status === 'cancelled' ? 'cancelled' : 'failed'
  const note = error || (status === 'cancelled' ? 'Agent run cancelled.' : 'Agent run terminated.')

  if (status !== 'completed') {
    database
      .prepare(
        `UPDATE agent_tool_calls
         SET status = CASE
               WHEN status IN ('queued', 'needsApproval', 'running') THEN ?
               ELSE status
             END,
             error = CASE
               WHEN status IN ('queued', 'needsApproval', 'running') THEN COALESCE(error, ?)
               ELSE error
             END,
             completed_at = CASE
               WHEN status IN ('queued', 'needsApproval', 'running')
                 THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               ELSE completed_at
             END,
             input_payload = NULL
         WHERE run_id = ?`,
      )
      .run(terminalToolStatus, note, runId)
    database
      .prepare(
        `UPDATE agent_approvals
         SET status = 'rejected', note = COALESCE(note, ?),
             decided_at = COALESCE(decided_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE run_id = ? AND status = 'pending'`,
      )
      .run(note, runId)
    return
  }

  database.prepare('UPDATE agent_tool_calls SET input_payload = NULL WHERE run_id = ?').run(runId)
}

export function updateAgentToolCall(
  database: Database.Database,
  toolCallId: string,
  status: AgentToolCallStatus,
  options: { result?: Record<string, unknown>; error?: string } = {},
): AgentToolCallRecord | null {
  const started = status === 'running'
  const terminal = ['completed', 'failed', 'rejected', 'cancelled'].includes(status)
  database
    .prepare(
      `UPDATE agent_tool_calls
       SET status = ?, result_json = ?, error = ?,
           input_payload = CASE WHEN ? = 1 THEN NULL ELSE input_payload END,
           started_at = CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE started_at END,
           completed_at = CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE completed_at END
       WHERE id = ? AND status NOT IN ('completed', 'failed', 'rejected', 'cancelled')`,
    )
    .run(
      status,
      options.result ? stringifyRecord(options.result) : null,
      options.error ?? null,
      terminal ? 1 : 0,
      started ? 1 : 0,
      terminal ? 1 : 0,
      toolCallId,
    )
  const row = database.prepare('SELECT * FROM agent_tool_calls WHERE id = ?').get(toolCallId) as
    | ToolCallRow
    | undefined
  return row ? toolCallFromRow(row) : null
}

export function getAgentToolPayload(
  database: Database.Database,
  toolCallId: string,
): Record<string, unknown> | null {
  const row = database
    .prepare('SELECT input_payload FROM agent_tool_calls WHERE id = ?')
    .get(toolCallId) as { input_payload?: string | null } | undefined
  return row?.input_payload ? parseRecord(row.input_payload) : null
}

export function decideAgentApproval(
  database: Database.Database,
  toolCallId: string,
  status: Extract<AgentApprovalStatus, 'approved' | 'rejected' | 'expired'>,
  note: string,
): AgentApprovalRecord | null {
  const result = database
    .prepare(
      `UPDATE agent_approvals
       SET status = ?, note = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE tool_call_id = ? AND status = 'pending'`,
    )
    .run(status, note, toolCallId)
  if (result.changes !== 1) return null
  const row = database
    .prepare('SELECT * FROM agent_approvals WHERE tool_call_id = ?')
    .get(toolCallId) as ApprovalRow | undefined
  return row ? approvalFromRow(row) : null
}

export function appendAgentAuditEvent(
  database: Database.Database,
  runId: string,
  toolCallId: string | undefined,
  eventType: string,
  details: Record<string, unknown>,
): void {
  database
    .prepare(
      `INSERT INTO agent_audit_events (run_id, tool_call_id, event_type, details_json)
       VALUES (?, ?, ?, ?)`,
    )
    .run(runId, toolCallId ?? null, eventType, stringifyRecord(details))
}

export function listAgentAuditEvents(
  database: Database.Database,
  runId: string,
  limit = 100,
): AgentAuditEvent[] {
  const rows = database
    .prepare(
      `SELECT * FROM agent_audit_events
       WHERE run_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(runId, Math.max(1, Math.min(500, limit))) as AuditRow[]
  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    toolCallId: row.tool_call_id ?? undefined,
    eventType: row.event_type,
    details: parseRecord(row.details_json),
    createdAt: row.created_at,
  }))
}
