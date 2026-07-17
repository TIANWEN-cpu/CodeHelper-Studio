import type Database from 'better-sqlite3'
import { createHash } from 'crypto'
import {
  EDITOR_WORKSPACE_STORAGE_VERSION,
  isDraftBackedPracticeTab,
  legacyExerciseRecoveryFilename,
  legacyExerciseRecoveryTabId,
} from '../../src/shared/editorWorkspaceContract'

export { EDITOR_WORKSPACE_STORAGE_VERSION }

export const DEFAULT_EDITOR_WORKSPACE_ID = 'default'
export const EDITOR_WORKSPACE_SCHEMA_VERSION = 3
const EDITOR_WORKSPACE_SCHEMA_COMPONENT = 'editor-workspace'

export type EditorTabKind = 'file' | 'problem' | 'exercise'
export type EditorTabStatus = 'open' | 'closed' | 'deleted'
export type EditorTabMutationKind = 'save' | 'close' | 'reopen' | 'delete'

export interface EditorTabRecord {
  workspaceId: string
  id: string
  filename: string
  language: string
  content: string
  kind: EditorTabKind
  problemId: string | null
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
  position: number
  status: EditorTabStatus
  revision: number
  updatedAt: string
  viewUpdatedAt: string
  closedAt: string | null
  deletedAt: string | null
}

export interface EditorWorkspaceRecord {
  workspaceId: string
  tabs: EditorTabRecord[]
  activeTabId: string | null
  recentlyClosedTabs: EditorTabRecord[]
  generation: number
  legacyStorageVersion: number
}

interface EditorTabMutationIdentity {
  workspaceId: string
  mutationId: string
  clientId: string
}

export interface SaveEditorTabInput extends EditorTabMutationIdentity {
  id: string
  filename: string
  language: string
  content: string
  kind?: EditorTabKind
  problemId?: string | null
  position: number
  baseRevision: number
}

export interface UpdateEditorTabViewStateInput extends EditorTabMutationIdentity {
  id: string
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
}

export interface EditorTabViewStateRecord {
  workspaceId: string
  id: string
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
  status: EditorTabStatus
  revision: number
  viewUpdatedAt: string
}

export interface VersionedEditorTabMutationInput extends EditorTabMutationIdentity {
  id: string
  baseRevision: number
}

export interface LegacyEditorTabInput {
  id: string
  filename: string
  language: string
  content: string
  kind?: EditorTabKind
  problemId?: string | null
  cursorPosition: { lineNumber: number; column: number } | null
  scrollTop: number
  position: number
  status: 'open' | 'closed'
}

export interface MigrateLegacyEditorWorkspaceInput extends EditorTabMutationIdentity {
  storageVersion: number
  activeTabId: string | null
  tabs: LegacyEditorTabInput[]
}

export interface MigrateLegacyEditorWorkspaceResult {
  status: 'migrated' | 'already-migrated'
  workspace: EditorWorkspaceRecord
  recoveredTabIds: string[]
  recoveredTabMappings: Record<string, string>
}

export type EditorTabMutationResult =
  | {
      status: 'saved'
      tab: EditorTabRecord
      generation: number
      applied: boolean
    }
  | {
      status: 'conflict'
      current: EditorTabRecord | null
      generation: number
    }

export type EditorTabViewStateMutationResult =
  | {
      status: 'saved'
      viewState: EditorTabViewStateRecord
      generation: number
      applied: boolean
    }
  | {
      status: 'conflict'
      current: EditorTabViewStateRecord | null
      generation: number
    }

export interface SetActiveEditorTabResult {
  activeTabId: string | null
  generation: number
}

interface EditorTabRow {
  workspace_id: string
  tab_id: string
  filename: string
  language: string
  content: string
  tab_kind: EditorTabKind | null
  problem_id: string | null
  cursor_line: number | null
  cursor_column: number | null
  scroll_top: number | null
  tab_position: number | null
  status: EditorTabStatus
  revision: number | null
  last_mutation_id: string | null
  last_mutation_kind: EditorTabMutationKind | null
  last_mutation_fingerprint: string | null
  client_id: string | null
  last_view_mutation_id: string | null
  last_view_mutation_fingerprint: string | null
  view_client_id: string | null
  created_at: string | null
  updated_at: string | null
  view_updated_at: string | null
  closed_at: string | null
  deleted_at: string | null
}

interface EditorTabViewStateRow {
  workspace_id: string
  tab_id: string
  cursor_line: number | null
  cursor_column: number | null
  scroll_top: number | null
  status: EditorTabStatus
  revision: number | null
  last_view_mutation_id: string | null
  last_view_mutation_fingerprint: string | null
  view_client_id: string | null
  view_updated_at: string | null
}

interface EditorWorkspaceRow {
  last_active_tab_id: string | null
  generation: number | null
  legacy_storage_version: number | null
}

const RECENTLY_CLOSED_LIMIT = 20
const TAB_FIELDS = `workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
  cursor_line, cursor_column, scroll_top, tab_position, status, revision,
  last_mutation_id, last_mutation_kind, last_mutation_fingerprint, client_id,
  last_view_mutation_id, last_view_mutation_fingerprint, view_client_id,
  created_at, updated_at, view_updated_at, closed_at, deleted_at`
const VIEW_STATE_FIELDS = `workspace_id, tab_id, cursor_line, cursor_column, scroll_top,
  status, revision, last_view_mutation_id, last_view_mutation_fingerprint,
  view_client_id, view_updated_at`
const REQUIRED_TAB_COLUMNS = new Set([
  'workspace_id',
  'tab_id',
  'filename',
  'language',
  'content',
  'tab_kind',
  'problem_id',
  'cursor_line',
  'cursor_column',
  'scroll_top',
  'tab_position',
  'status',
  'revision',
  'last_mutation_id',
  'last_mutation_kind',
  'last_mutation_fingerprint',
  'client_id',
  'last_view_mutation_id',
  'last_view_mutation_fingerprint',
  'view_client_id',
  'created_at',
  'updated_at',
  'view_updated_at',
  'closed_at',
  'deleted_at',
])
const BASE_VERSIONED_TAB_COLUMNS = new Set(
  [...REQUIRED_TAB_COLUMNS].filter(
    (column) =>
      column !== 'tab_kind' &&
      column !== 'last_mutation_fingerprint' &&
      column !== 'last_view_mutation_fingerprint',
  ),
)
const LEGACY_DRAFT_COLUMNS = new Set([
  'tab_id',
  'filename',
  'language',
  'content',
  'problem_id',
  'cursor_line',
  'cursor_column',
  'scroll_top',
  'tab_position',
  'revision',
  'updated_at',
  'deleted',
  'closed_at',
])
const initializedDatabases = new WeakSet<Database.Database>()

function createEditorWorkspaceTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS editor_workspaces (
      workspace_id TEXT PRIMARY KEY,
      last_active_tab_id TEXT,
      generation INTEGER NOT NULL DEFAULT 0 CHECK(generation >= 0),
      legacy_storage_version INTEGER NOT NULL DEFAULT 0 CHECK(legacy_storage_version >= 0),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS editor_tabs (
      workspace_id TEXT NOT NULL REFERENCES editor_workspaces(workspace_id) ON DELETE CASCADE,
      tab_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      language TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tab_kind TEXT NOT NULL DEFAULT 'file' CHECK(tab_kind IN ('file', 'problem', 'exercise')),
      problem_id TEXT,
      cursor_line INTEGER,
      cursor_column INTEGER,
      scroll_top REAL NOT NULL DEFAULT 0 CHECK(scroll_top >= 0),
      tab_position INTEGER NOT NULL DEFAULT 0 CHECK(tab_position >= 0),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'deleted')),
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
      last_mutation_id TEXT,
      last_mutation_kind TEXT CHECK(last_mutation_kind IN ('save', 'close', 'reopen', 'delete')),
      last_mutation_fingerprint TEXT,
      client_id TEXT,
      last_view_mutation_id TEXT,
      last_view_mutation_fingerprint TEXT,
      view_client_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      view_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      closed_at TEXT,
      deleted_at TEXT,
      PRIMARY KEY (workspace_id, tab_id)
    );

    CREATE INDEX IF NOT EXISTS idx_editor_tabs_open_position
      ON editor_tabs(workspace_id, status, tab_position, updated_at, tab_id);
    CREATE INDEX IF NOT EXISTS idx_editor_tabs_closed_at
      ON editor_tabs(workspace_id, status, closed_at DESC, updated_at DESC, tab_id);
  `)
}

function createSchemaMigrationsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      component TEXT PRIMARY KEY,
      version INTEGER NOT NULL CHECK(version >= 0),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)
}

function readRecordedSchemaVersion(database: Database.Database): number | null {
  const row = database
    .prepare('SELECT version FROM schema_migrations WHERE component = ?')
    .get(EDITOR_WORKSPACE_SCHEMA_COMPONENT) as { version: number } | undefined
  return row ? Number(row.version) : null
}

function recordSchemaVersion(database: Database.Database, version: number): void {
  database
    .prepare(
      `INSERT INTO schema_migrations (component, version, updated_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(component) DO UPDATE SET
         version = excluded.version,
         updated_at = excluded.updated_at`,
    )
    .run(EDITOR_WORKSPACE_SCHEMA_COMPONENT, version)
}

function tableExists(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  )
}

function tableColumns(database: Database.Database, tableName: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

function includesAll(columns: Set<string>, required: Set<string>): boolean {
  return [...required].every((column) => columns.has(column))
}

function detectEditorWorkspaceSchemaVersion(database: Database.Database): number {
  if (!tableExists(database, 'editor_tabs')) return 0
  const columns = tableColumns(database, 'editor_tabs')
  if (includesAll(columns, REQUIRED_TAB_COLUMNS)) return 3
  if (includesAll(columns, BASE_VERSIONED_TAB_COLUMNS)) return 2
  if (includesAll(columns, LEGACY_DRAFT_COLUMNS)) return 1
  throw new Error('Unsupported editor_tabs schema; automatic migration cannot preserve its data')
}

function migrateLegacyDraftSchema(database: Database.Database): void {
  const columns = tableColumns(database, 'editor_tabs')
  if (!includesAll(columns, LEGACY_DRAFT_COLUMNS)) {
    throw new Error('Unsupported editor_tabs schema; automatic migration cannot preserve its data')
  }

  const hasLegacyWorkspaceState = tableExists(database, 'editor_workspace_state')
  const ownsTransaction = !database.inTransaction
  try {
    if (ownsTransaction) database.exec('BEGIN IMMEDIATE')
    database.exec(`
      DROP INDEX IF EXISTS idx_editor_tabs_open_position;
      DROP INDEX IF EXISTS idx_editor_tabs_closed_at;
      DROP TABLE IF EXISTS editor_tabs_legacy_draft;
      ALTER TABLE editor_tabs RENAME TO editor_tabs_legacy_draft;
    `)
    createEditorWorkspaceTables(database)

    let activeTabId: string | null = null
    if (hasLegacyWorkspaceState) {
      const state = database
        .prepare(`SELECT active_tab_id FROM editor_workspace_state WHERE workspace_id = ?`)
        .get(DEFAULT_EDITOR_WORKSPACE_ID) as { active_tab_id: string | null } | undefined
      activeTabId = state?.active_tab_id ?? null
    }

    database
      .prepare(
        `INSERT INTO editor_workspaces
           (workspace_id, last_active_tab_id, generation, legacy_storage_version, updated_at)
         VALUES (?, ?, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(workspace_id) DO UPDATE SET
           last_active_tab_id = COALESCE(editor_workspaces.last_active_tab_id, excluded.last_active_tab_id)`,
      )
      .run(DEFAULT_EDITOR_WORKSPACE_ID, activeTabId)

    database.exec(`
      INSERT INTO editor_tabs (
        workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
        cursor_line, cursor_column, scroll_top, tab_position, status, revision,
        created_at, updated_at, view_updated_at, closed_at
      )
      SELECT
        '${DEFAULT_EDITOR_WORKSPACE_ID}', tab_id, filename, language, content,
        CASE WHEN problem_id IS NOT NULL THEN 'problem' ELSE 'file' END, problem_id,
        cursor_line, cursor_column,
        CASE WHEN scroll_top >= 0 THEN scroll_top ELSE 0 END,
        CASE WHEN tab_position >= 0 THEN tab_position ELSE 0 END,
        CASE WHEN deleted = 1 THEN 'closed' ELSE 'open' END,
        CASE WHEN revision >= 1 THEN revision ELSE 1 END,
        COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CASE WHEN deleted = 1
          THEN COALESCE(closed_at, updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          ELSE NULL
        END
      FROM editor_tabs_legacy_draft;

      DROP TABLE editor_tabs_legacy_draft;
    `)
    if (hasLegacyWorkspaceState) database.exec('DROP TABLE editor_workspace_state')
    recordSchemaVersion(database, EDITOR_WORKSPACE_SCHEMA_VERSION)
    if (ownsTransaction) database.exec('COMMIT')
  } catch (error) {
    if (ownsTransaction) {
      try {
        database.exec('ROLLBACK')
      } catch {
        // The failure may have happened before the transaction started.
      }
    }
    throw error
  }
}

export function ensureEditorWorkspaceSchema(database: Database.Database): void {
  if (initializedDatabases.has(database)) return
  createSchemaMigrationsTable(database)
  const detectedVersion = detectEditorWorkspaceSchemaVersion(database)
  const recordedVersion = readRecordedSchemaVersion(database)
  if (recordedVersion !== null && recordedVersion > EDITOR_WORKSPACE_SCHEMA_VERSION) {
    throw new Error(
      `Editor workspace schema version ${recordedVersion} is newer than supported version ${EDITOR_WORKSPACE_SCHEMA_VERSION}`,
    )
  }
  if (recordedVersion !== null && recordedVersion > detectedVersion) {
    throw new Error(
      `Editor workspace schema marker ${recordedVersion} does not match detected version ${detectedVersion}`,
    )
  }

  if (detectedVersion === 1) {
    migrateLegacyDraftSchema(database)
  } else if (detectedVersion === 2) {
    const columns = tableColumns(database, 'editor_tabs')
    const ownsTransaction = !database.inTransaction
    try {
      if (ownsTransaction) database.exec('BEGIN IMMEDIATE')
      if (!columns.has('tab_kind')) {
        database.exec(
          "ALTER TABLE editor_tabs ADD COLUMN tab_kind TEXT NOT NULL DEFAULT 'file' CHECK(tab_kind IN ('file', 'problem', 'exercise'))",
        )
      }
      database.exec(
        "UPDATE editor_tabs SET tab_kind = 'problem' WHERE problem_id IS NOT NULL AND tab_kind = 'file'",
      )
      if (!columns.has('last_mutation_fingerprint')) {
        database.exec('ALTER TABLE editor_tabs ADD COLUMN last_mutation_fingerprint TEXT')
      }
      if (!columns.has('last_view_mutation_fingerprint')) {
        database.exec('ALTER TABLE editor_tabs ADD COLUMN last_view_mutation_fingerprint TEXT')
      }
      createEditorWorkspaceTables(database)
      recordSchemaVersion(database, EDITOR_WORKSPACE_SCHEMA_VERSION)
      if (ownsTransaction) database.exec('COMMIT')
    } catch (error) {
      if (ownsTransaction) {
        try {
          database.exec('ROLLBACK')
        } catch {
          // The migration may have failed before the transaction began.
        }
      }
      throw error
    }
  } else {
    const ownsTransaction = !database.inTransaction
    try {
      if (ownsTransaction) database.exec('BEGIN IMMEDIATE')
      createEditorWorkspaceTables(database)
      recordSchemaVersion(database, EDITOR_WORKSPACE_SCHEMA_VERSION)
      if (ownsTransaction) database.exec('COMMIT')
    } catch (error) {
      if (ownsTransaction) {
        try {
          database.exec('ROLLBACK')
        } catch {
          // The migration may have failed before the transaction began.
        }
      }
      throw error
    }
  }
  initializedDatabases.add(database)
}

function ensureWorkspace(database: Database.Database, workspaceId: string): void {
  database
    .prepare(
      `INSERT OR IGNORE INTO editor_workspaces
         (workspace_id, generation, legacy_storage_version, updated_at)
       VALUES (?, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    )
    .run(workspaceId)
}

function normalizeEditorTabKind(value: unknown, problemId?: unknown): EditorTabKind {
  if (value === 'problem' || value === 'exercise') return value
  return typeof problemId === 'string' && problemId.trim() ? 'problem' : 'file'
}

function mapTab(row: EditorTabRow): EditorTabRecord {
  const lineNumber = Number(row.cursor_line)
  const column = Number(row.cursor_column)
  return {
    workspaceId: row.workspace_id,
    id: row.tab_id,
    filename: row.filename,
    language: row.language,
    content: row.content,
    kind: normalizeEditorTabKind(row.tab_kind, row.problem_id),
    problemId: row.problem_id,
    cursorPosition:
      Number.isSafeInteger(lineNumber) &&
      lineNumber >= 1 &&
      Number.isSafeInteger(column) &&
      column >= 1
        ? { lineNumber, column }
        : null,
    scrollTop: Number.isFinite(row.scroll_top) ? Math.max(0, Number(row.scroll_top)) : 0,
    position:
      Number.isSafeInteger(row.tab_position) && Number(row.tab_position) >= 0
        ? Number(row.tab_position)
        : 0,
    status: row.status,
    revision:
      Number.isSafeInteger(row.revision) && Number(row.revision) >= 1 ? Number(row.revision) : 1,
    updatedAt: row.updated_at ?? '',
    viewUpdatedAt: row.view_updated_at ?? row.updated_at ?? '',
    closedAt: row.closed_at,
    deletedAt: row.deleted_at,
  }
}

function mapViewState(row: EditorTabViewStateRow): EditorTabViewStateRecord {
  const lineNumber = Number(row.cursor_line)
  const column = Number(row.cursor_column)
  return {
    workspaceId: row.workspace_id,
    id: row.tab_id,
    cursorPosition:
      Number.isSafeInteger(lineNumber) &&
      lineNumber >= 1 &&
      Number.isSafeInteger(column) &&
      column >= 1
        ? { lineNumber, column }
        : null,
    scrollTop: Number.isFinite(row.scroll_top) ? Math.max(0, Number(row.scroll_top)) : 0,
    status: row.status,
    revision:
      Number.isSafeInteger(row.revision) && Number(row.revision) >= 1 ? Number(row.revision) : 1,
    viewUpdatedAt: row.view_updated_at ?? '',
  }
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function saveFingerprint(input: SaveEditorTabInput): string {
  return fingerprint([
    input.id,
    input.filename,
    input.language,
    input.content,
    normalizeEditorTabKind(input.kind, input.problemId),
    input.problemId ?? null,
    input.position,
    input.baseRevision,
  ])
}

function canonicalizeSaveInput(
  input: SaveEditorTabInput,
): SaveEditorTabInput & { kind: EditorTabKind; problemId: string | null } {
  const kind = normalizeEditorTabKind(input.kind, input.problemId)
  return {
    ...input,
    content: isDraftBackedPracticeTab({ id: input.id, kind }) ? '' : input.content,
    kind,
    problemId: input.problemId ?? null,
  }
}

function viewStateFingerprint(input: UpdateEditorTabViewStateInput): string {
  return fingerprint([input.id, input.cursorPosition, input.scrollTop])
}

function versionedMutationFingerprint(input: VersionedEditorTabMutationInput): string {
  return fingerprint([input.id, input.baseRevision])
}

function sameLegacyBody(row: EditorTabRow, input: LegacyEditorTabInput): boolean {
  return (
    row.language === input.language &&
    row.content === input.content &&
    normalizeEditorTabKind(row.tab_kind, row.problem_id) ===
      normalizeEditorTabKind(input.kind, input.problemId) &&
    row.problem_id === (input.problemId ?? null)
  )
}

function sameLegacyContent(row: EditorTabRow, input: LegacyEditorTabInput): boolean {
  return (
    row.filename === input.filename && row.status === input.status && sameLegacyBody(row, input)
  )
}

function recoveredTabId(input: LegacyEditorTabInput): string {
  const suffix = fingerprint([
    input.id,
    input.filename,
    input.language,
    input.content,
    normalizeEditorTabKind(input.kind, input.problemId),
    input.problemId ?? null,
    input.status,
  ]).slice(0, 16)
  const source = input.id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 160) || 'tab'
  return `recovered-${source}-${suffix}`.slice(0, 200)
}

function recoveredFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return `${filename}.recovered`.slice(0, 255)
  return `${filename.slice(0, dot)}.recovered${filename.slice(dot)}`.slice(0, 255)
}

function exerciseRecoveryTab(tab: LegacyEditorTabInput): LegacyEditorTabInput {
  return {
    id: legacyExerciseRecoveryTabId({
      id: tab.id,
      filename: tab.filename,
      language: tab.language,
      content: tab.content,
      problemId: tab.problemId,
    }),
    filename: legacyExerciseRecoveryFilename(tab.filename),
    language: tab.language,
    content: tab.content,
    kind: 'file',
    problemId: null,
    cursorPosition: tab.cursorPosition,
    scrollTop: tab.scrollTop,
    position: tab.position,
    status: tab.status,
  }
}

function expandLegacyTabs(tabs: LegacyEditorTabInput[]): {
  tabs: LegacyEditorTabInput[]
  exerciseRecoveryIds: Set<string>
} {
  const expanded: LegacyEditorTabInput[] = []
  const exerciseRecoveryIds = new Set<string>()
  for (const tab of tabs) {
    const kind = normalizeEditorTabKind(tab.kind, tab.problemId)
    const draftBacked = isDraftBackedPracticeTab({ id: tab.id, kind })
    if (draftBacked && tab.content) {
      const recovery = exerciseRecoveryTab(tab)
      expanded.push({ ...tab, kind, content: '' }, recovery)
      exerciseRecoveryIds.add(recovery.id)
    } else {
      expanded.push({ ...tab, kind, content: draftBacked ? '' : tab.content })
    }
  }
  return { tabs: expanded, exerciseRecoveryIds }
}

function insertLegacyTab(
  database: Database.Database,
  input: MigrateLegacyEditorWorkspaceInput,
  tab: LegacyEditorTabInput,
  id: string,
  filename: string,
  position: number,
): void {
  const requestFingerprint = fingerprint([
    'legacy-migration',
    input.storageVersion,
    tab,
    id,
    filename,
    position,
  ])
  const result = database
    .prepare(
      `INSERT INTO editor_tabs (
         workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
         cursor_line, cursor_column, scroll_top, tab_position, status, revision,
         last_mutation_id, last_mutation_kind, last_mutation_fingerprint, client_id,
         closed_at
       ) VALUES (
         @workspaceId, @id, @filename, @language, @content, @kind, @problemId,
         @cursorLine, @cursorColumn, @scrollTop, @position, @status, 1,
         @mutationId, 'save', @requestFingerprint, @clientId,
         CASE WHEN @status = 'closed' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END
       )`,
    )
    .run({
      workspaceId: input.workspaceId,
      id,
      filename,
      language: tab.language,
      content: tab.content,
      kind: normalizeEditorTabKind(tab.kind, tab.problemId),
      problemId: tab.problemId ?? null,
      cursorLine: tab.cursorPosition?.lineNumber ?? null,
      cursorColumn: tab.cursorPosition?.column ?? null,
      scrollTop: tab.scrollTop,
      position,
      status: tab.status,
      mutationId: input.mutationId,
      clientId: input.clientId,
      requestFingerprint,
    })
  if (result.changes !== 1) throw new Error(`旧工作区标签迁移失败: ${id}`)
}

function readTabRow(
  database: Database.Database,
  workspaceId: string,
  id: string,
): EditorTabRow | null {
  return (
    (database
      .prepare(`SELECT ${TAB_FIELDS} FROM editor_tabs WHERE workspace_id = ? AND tab_id = ?`)
      .get(workspaceId, id) as EditorTabRow | undefined) ?? null
  )
}

function legacyExerciseRowToInput(row: EditorTabRow): LegacyEditorTabInput {
  const lineNumber = Number(row.cursor_line)
  const column = Number(row.cursor_column)
  return {
    id: row.tab_id,
    filename: row.filename,
    language: row.language,
    content: row.content,
    kind: 'exercise',
    problemId: row.problem_id,
    cursorPosition:
      Number.isSafeInteger(lineNumber) &&
      lineNumber >= 1 &&
      Number.isSafeInteger(column) &&
      column >= 1
        ? { lineNumber, column }
        : null,
    scrollTop: Number.isFinite(row.scroll_top) ? Math.max(0, Number(row.scroll_top)) : 0,
    position:
      Number.isSafeInteger(row.tab_position) && Number(row.tab_position) >= 0
        ? Number(row.tab_position)
        : 0,
    status: row.status === 'open' ? 'open' : 'closed',
  }
}

function upgradeLegacyExerciseContent(
  database: Database.Database,
  input: MigrateLegacyEditorWorkspaceInput,
  nextOpenPosition: number,
  onRecovered: (id: string) => void,
): number {
  const rows = database
    .prepare(
      `SELECT ${TAB_FIELDS} FROM editor_tabs
       WHERE workspace_id = ? AND content <> ''
       ORDER BY tab_position ASC, updated_at ASC, tab_id ASC`,
    )
    .all(input.workspaceId) as EditorTabRow[]

  for (const row of rows) {
    if (!isDraftBackedPracticeTab({ id: row.tab_id, kind: row.tab_kind ?? 'file' })) continue
    const source = legacyExerciseRowToInput(row)
    const recovery = exerciseRecoveryTab(source)
    const existingRecovery = readTabRow(database, input.workspaceId, recovery.id)
    if (!existingRecovery) {
      const recoveryPosition = recovery.status === 'open' ? nextOpenPosition++ : recovery.position
      insertLegacyTab(database, input, recovery, recovery.id, recovery.filename, recoveryPosition)
    } else if (!sameLegacyContent(existingRecovery, recovery)) {
      throw new Error(`练习代码恢复副本 ID 冲突: ${recovery.id}`)
    }

    const verifiedRecovery = readTabRow(database, input.workspaceId, recovery.id)
    if (!verifiedRecovery || !sameLegacyContent(verifiedRecovery, recovery)) {
      throw new Error(`练习代码恢复副本校验失败: ${recovery.id}`)
    }
    onRecovered(recovery.id)

    const requestFingerprint = fingerprint([
      'exercise-content-v3',
      input.storageVersion,
      row.workspace_id,
      row.tab_id,
      row.revision,
      row.content,
      recovery.id,
    ])
    const cleared = database
      .prepare(
        `UPDATE editor_tabs SET
           content = '',
           revision = revision + 1,
           last_mutation_id = @mutationId,
           last_mutation_kind = 'save',
           last_mutation_fingerprint = @requestFingerprint,
           client_id = @clientId,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE workspace_id = @workspaceId
           AND tab_id = @id
           AND content = @content
           AND revision = @revision`,
      )
      .run({
        workspaceId: input.workspaceId,
        id: row.tab_id,
        content: row.content,
        revision: row.revision,
        mutationId: input.mutationId,
        clientId: input.clientId,
        requestFingerprint,
      })
    if (cleared.changes !== 1) throw new Error(`练习标签内容升级冲突: ${row.tab_id}`)
  }

  return nextOpenPosition
}

function readViewStateRow(
  database: Database.Database,
  workspaceId: string,
  id: string,
): EditorTabViewStateRow | null {
  return (
    (database
      .prepare(
        `SELECT ${VIEW_STATE_FIELDS}
         FROM editor_tabs WHERE workspace_id = ? AND tab_id = ?`,
      )
      .get(workspaceId, id) as EditorTabViewStateRow | undefined) ?? null
  )
}

function getGeneration(database: Database.Database, workspaceId: string): number {
  const row = database
    .prepare('SELECT generation FROM editor_workspaces WHERE workspace_id = ?')
    .get(workspaceId) as { generation: number } | undefined
  return Number.isSafeInteger(row?.generation) && Number(row?.generation) >= 0
    ? Number(row?.generation)
    : 0
}

function incrementGeneration(database: Database.Database, workspaceId: string): number {
  const row = database
    .prepare(
      `UPDATE editor_workspaces SET
         generation = generation + 1,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE workspace_id = ?
       RETURNING generation`,
    )
    .get(workspaceId) as { generation: number }
  return row.generation
}

function mutationFailure(
  database: Database.Database,
  input: EditorTabMutationIdentity & { id: string },
  kind: EditorTabMutationKind,
  expectedStatus: EditorTabStatus,
  requestFingerprint: string,
): EditorTabMutationResult {
  const current = readTabRow(database, input.workspaceId, input.id)
  const generation = getGeneration(database, input.workspaceId)
  const isRetry =
    current &&
    current.status === expectedStatus &&
    current.last_mutation_id === input.mutationId &&
    current.last_mutation_kind === kind &&
    current.last_mutation_fingerprint === requestFingerprint &&
    current.client_id === input.clientId
  if (current && isRetry) {
    return { status: 'saved', tab: mapTab(current), generation, applied: false }
  }
  return { status: 'conflict', current: current ? mapTab(current) : null, generation }
}

export function loadEditorWorkspace(
  database: Database.Database,
  workspaceId: string = DEFAULT_EDITOR_WORKSPACE_ID,
): EditorWorkspaceRecord {
  ensureEditorWorkspaceSchema(database)
  ensureWorkspace(database, workspaceId)
  const tabs = (
    database
      .prepare(
        `SELECT ${TAB_FIELDS} FROM editor_tabs
         WHERE workspace_id = ? AND status = 'open'
         ORDER BY tab_position ASC, updated_at ASC, tab_id ASC`,
      )
      .all(workspaceId) as EditorTabRow[]
  ).map(mapTab)
  const recentlyClosedTabs = (
    database
      .prepare(
        `SELECT ${TAB_FIELDS} FROM editor_tabs
         WHERE workspace_id = ? AND status = 'closed'
         ORDER BY COALESCE(closed_at, updated_at) DESC, tab_id ASC
         LIMIT ?`,
      )
      .all(workspaceId, RECENTLY_CLOSED_LIMIT) as EditorTabRow[]
  ).map(mapTab)
  const workspace = database
    .prepare(
      `SELECT last_active_tab_id, generation, legacy_storage_version
       FROM editor_workspaces WHERE workspace_id = ?`,
    )
    .get(workspaceId) as EditorWorkspaceRow
  const activeTabId =
    workspace.last_active_tab_id && tabs.some((tab) => tab.id === workspace.last_active_tab_id)
      ? workspace.last_active_tab_id
      : (tabs[0]?.id ?? null)

  return {
    workspaceId,
    tabs,
    activeTabId,
    recentlyClosedTabs,
    generation: Number(workspace.generation) || 0,
    legacyStorageVersion: Number(workspace.legacy_storage_version) || 0,
  }
}

export function migrateLegacyEditorWorkspace(
  database: Database.Database,
  input: MigrateLegacyEditorWorkspaceInput,
): MigrateLegacyEditorWorkspaceResult {
  if (input.storageVersion !== EDITOR_WORKSPACE_STORAGE_VERSION) {
    throw new Error(`Unsupported editor workspace storage version: ${input.storageVersion}`)
  }
  ensureEditorWorkspaceSchema(database)
  return database.transaction((): MigrateLegacyEditorWorkspaceResult => {
    ensureWorkspace(database, input.workspaceId)
    const currentVersionRow = database
      .prepare('SELECT legacy_storage_version FROM editor_workspaces WHERE workspace_id = ?')
      .get(input.workspaceId) as { legacy_storage_version: number }
    if (Number(currentVersionRow.legacy_storage_version) >= input.storageVersion) {
      return {
        status: 'already-migrated',
        workspace: loadEditorWorkspace(database, input.workspaceId),
        recoveredTabIds: [],
        recoveredTabMappings: {},
      }
    }

    const recoveredTabIds: string[] = []
    const recoveredTabIdSet = new Set<string>()
    const recoveredTabMappings: Record<string, string> = {}
    const migratedIds = new Map<string, string>()
    const recordRecovered = (id: string): void => {
      if (recoveredTabIdSet.has(id)) return
      recoveredTabIdSet.add(id)
      recoveredTabIds.push(id)
    }
    const expanded = expandLegacyTabs(input.tabs)
    let nextOpenPosition = (
      database
        .prepare(
          `SELECT COALESCE(MAX(tab_position), -1) + 1 AS position
           FROM editor_tabs WHERE workspace_id = ? AND status = 'open'`,
        )
        .get(input.workspaceId) as { position: number }
    ).position
    nextOpenPosition = upgradeLegacyExerciseContent(
      database,
      input,
      nextOpenPosition,
      recordRecovered,
    )

    for (const tab of expanded.tabs) {
      const current = readTabRow(database, input.workspaceId, tab.id)
      if (!current) {
        const position = tab.status === 'open' ? nextOpenPosition++ : tab.position
        insertLegacyTab(database, input, tab, tab.id, tab.filename, position)
        migratedIds.set(tab.id, tab.id)
        if (expanded.exerciseRecoveryIds.has(tab.id)) recordRecovered(tab.id)
        continue
      }
      if (sameLegacyContent(current, tab)) {
        migratedIds.set(tab.id, tab.id)
        if (expanded.exerciseRecoveryIds.has(tab.id)) recordRecovered(tab.id)
        continue
      }

      const recoveryId = recoveredTabId(tab)
      const recoveryPosition = tab.status === 'open' ? nextOpenPosition++ : tab.position
      insertLegacyTab(
        database,
        input,
        tab,
        recoveryId,
        recoveredFilename(tab.filename),
        recoveryPosition,
      )
      const recovered = readTabRow(database, input.workspaceId, recoveryId)
      if (recovered && recovered.status === tab.status && sameLegacyBody(recovered, tab)) {
        recordRecovered(recoveryId)
        recoveredTabMappings[tab.id] = recoveryId
        migratedIds.set(tab.id, recoveryId)
      }
    }

    const preferredActiveId = input.activeTabId
      ? (migratedIds.get(input.activeTabId) ?? input.activeTabId)
      : null
    const validActive = preferredActiveId
      ? (database
          .prepare(
            `SELECT tab_id FROM editor_tabs
             WHERE workspace_id = ? AND tab_id = ? AND status = 'open'`,
          )
          .get(input.workspaceId, preferredActiveId) as { tab_id: string } | undefined)
      : undefined
    database
      .prepare(
        `UPDATE editor_workspaces SET
           last_active_tab_id = COALESCE(last_active_tab_id, @activeTabId),
           legacy_storage_version = @storageVersion,
           generation = generation + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE workspace_id = @workspaceId`,
      )
      .run({
        workspaceId: input.workspaceId,
        activeTabId: validActive?.tab_id ?? null,
        storageVersion: input.storageVersion,
      })

    return {
      status: 'migrated',
      workspace: loadEditorWorkspace(database, input.workspaceId),
      recoveredTabIds,
      recoveredTabMappings,
    }
  })()
}

export function saveEditorTab(
  database: Database.Database,
  input: SaveEditorTabInput,
): EditorTabMutationResult {
  ensureEditorWorkspaceSchema(database)
  return database.transaction((): EditorTabMutationResult => {
    const canonicalInput = canonicalizeSaveInput(input)
    ensureWorkspace(database, canonicalInput.workspaceId)
    const requestFingerprint = saveFingerprint(canonicalInput)
    let savedRow: EditorTabRow | undefined
    if (canonicalInput.baseRevision === 0) {
      savedRow = database
        .prepare(
          `INSERT INTO editor_tabs (
             workspace_id, tab_id, filename, language, content, tab_kind, problem_id,
             tab_position, status, revision, last_mutation_id, last_mutation_kind,
             last_mutation_fingerprint, client_id
           )
           VALUES (
             @workspaceId, @id, @filename, @language, @content, @kind, @problemId,
             @position, 'open', 1, @mutationId, 'save', @requestFingerprint, @clientId
           )
           ON CONFLICT(workspace_id, tab_id) DO NOTHING
           RETURNING ${TAB_FIELDS}`,
        )
        .get({
          ...canonicalInput,
          requestFingerprint,
        }) as EditorTabRow | undefined
    } else {
      savedRow = database
        .prepare(
          `UPDATE editor_tabs SET
             filename = @filename,
             language = @language,
             content = @content,
             tab_kind = @kind,
             problem_id = @problemId,
             tab_position = @position,
             revision = revision + 1,
             last_mutation_id = @mutationId,
             last_mutation_kind = 'save',
             last_mutation_fingerprint = @requestFingerprint,
             client_id = @clientId,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE workspace_id = @workspaceId
             AND tab_id = @id
             AND status = 'open'
             AND revision = @baseRevision
           RETURNING ${TAB_FIELDS}`,
        )
        .get({
          ...canonicalInput,
          requestFingerprint,
        }) as EditorTabRow | undefined
    }

    if (!savedRow) {
      return mutationFailure(database, canonicalInput, 'save', 'open', requestFingerprint)
    }
    return {
      status: 'saved',
      tab: mapTab(savedRow),
      generation: incrementGeneration(database, canonicalInput.workspaceId),
      applied: true,
    }
  })()
}

export function updateEditorTabViewState(
  database: Database.Database,
  input: UpdateEditorTabViewStateInput,
): EditorTabViewStateMutationResult {
  ensureEditorWorkspaceSchema(database)
  return database.transaction((): EditorTabViewStateMutationResult => {
    ensureWorkspace(database, input.workspaceId)
    const requestFingerprint = viewStateFingerprint(input)
    const current = readViewStateRow(database, input.workspaceId, input.id)
    const generation = getGeneration(database, input.workspaceId)
    const repeatsLastMutation =
      current?.status === 'open' &&
      current.last_view_mutation_id === input.mutationId &&
      current.view_client_id === input.clientId
    if (current && repeatsLastMutation) {
      if (current.last_view_mutation_fingerprint === requestFingerprint) {
        return {
          status: 'saved',
          viewState: mapViewState(current),
          generation,
          applied: false,
        }
      }
      return { status: 'conflict', current: mapViewState(current), generation }
    }

    const savedRow = database
      .prepare(
        `UPDATE editor_tabs SET
           cursor_line = @cursorLine,
           cursor_column = @cursorColumn,
           scroll_top = @scrollTop,
           last_view_mutation_id = @mutationId,
           last_view_mutation_fingerprint = @requestFingerprint,
           view_client_id = @clientId,
           view_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE workspace_id = @workspaceId AND tab_id = @id AND status = 'open'
         RETURNING ${VIEW_STATE_FIELDS}`,
      )
      .get({
        ...input,
        cursorLine: input.cursorPosition?.lineNumber ?? null,
        cursorColumn: input.cursorPosition?.column ?? null,
        requestFingerprint,
      }) as EditorTabViewStateRow | undefined
    if (!savedRow) {
      return {
        status: 'conflict',
        current: current ? mapViewState(current) : null,
        generation,
      }
    }
    return {
      status: 'saved',
      viewState: mapViewState(savedRow),
      generation: incrementGeneration(database, input.workspaceId),
      applied: true,
    }
  })()
}

function updateTabStatus(
  database: Database.Database,
  input: VersionedEditorTabMutationInput,
  options: {
    from: EditorTabStatus
    to: EditorTabStatus
    kind: Exclude<EditorTabMutationKind, 'save'>
    position?: number
  },
): EditorTabMutationResult {
  const requestFingerprint = versionedMutationFingerprint(input)
  const positionSql = options.position === undefined ? '' : 'tab_position = @position,'
  const closedAtSql =
    options.to === 'closed'
      ? "closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),"
      : options.to === 'open'
        ? 'closed_at = NULL,'
        : ''
  const deletedAtSql =
    options.to === 'deleted' ? "deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')," : ''
  const savedRow = database
    .prepare(
      `UPDATE editor_tabs SET
         ${positionSql}
         status = @to,
         revision = revision + 1,
         last_mutation_id = @mutationId,
         last_mutation_kind = @kind,
         last_mutation_fingerprint = @requestFingerprint,
         client_id = @clientId,
         ${closedAtSql}
         ${deletedAtSql}
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE workspace_id = @workspaceId
         AND tab_id = @id
         AND status = @from
         AND revision = @baseRevision
       RETURNING ${TAB_FIELDS}`,
    )
    .get({ ...input, ...options, requestFingerprint }) as EditorTabRow | undefined
  if (!savedRow) {
    return mutationFailure(database, input, options.kind, options.to, requestFingerprint)
  }
  return {
    status: 'saved',
    tab: mapTab(savedRow),
    generation: incrementGeneration(database, input.workspaceId),
    applied: true,
  }
}

export function closeEditorTab(
  database: Database.Database,
  input: VersionedEditorTabMutationInput,
): EditorTabMutationResult {
  ensureEditorWorkspaceSchema(database)
  return database.transaction(() => {
    ensureWorkspace(database, input.workspaceId)
    return updateTabStatus(database, input, { from: 'open', to: 'closed', kind: 'close' })
  })()
}

export function reopenEditorTab(
  database: Database.Database,
  input: VersionedEditorTabMutationInput,
): EditorTabMutationResult {
  ensureEditorWorkspaceSchema(database)
  return database.transaction(() => {
    ensureWorkspace(database, input.workspaceId)
    const row = database
      .prepare(
        `SELECT COALESCE(MAX(tab_position), -1) + 1 AS position
         FROM editor_tabs
         WHERE workspace_id = ? AND status = 'open'`,
      )
      .get(input.workspaceId) as { position: number }
    return updateTabStatus(database, input, {
      from: 'closed',
      to: 'open',
      kind: 'reopen',
      position: row.position,
    })
  })()
}

export function deleteEditorTab(
  database: Database.Database,
  input: VersionedEditorTabMutationInput,
): EditorTabMutationResult {
  ensureEditorWorkspaceSchema(database)
  return database.transaction(() => {
    ensureWorkspace(database, input.workspaceId)
    return updateTabStatus(database, input, {
      from: 'closed',
      to: 'deleted',
      kind: 'delete',
    })
  })()
}

export function setActiveEditorTab(
  database: Database.Database,
  workspaceId: string,
  activeTabId: string | null,
): SetActiveEditorTabResult {
  ensureEditorWorkspaceSchema(database)
  return database.transaction(() => {
    ensureWorkspace(database, workspaceId)
    const validActiveTabId = activeTabId
      ? ((
          database
            .prepare(
              `SELECT tab_id FROM editor_tabs
             WHERE workspace_id = ? AND tab_id = ? AND status = 'open'`,
            )
            .get(workspaceId, activeTabId) as { tab_id: string } | undefined
        )?.tab_id ?? null)
      : null
    database
      .prepare(
        `UPDATE editor_workspaces SET
           last_active_tab_id = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE workspace_id = ? AND last_active_tab_id IS NOT ?`,
      )
      .run(validActiveTabId, workspaceId, validActiveTabId)
    return { activeTabId: validActiveTabId, generation: getGeneration(database, workspaceId) }
  })()
}
