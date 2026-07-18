import { createHash } from 'crypto'
import type Database from 'better-sqlite3'

export interface ParsedKnowledgeMetadata {
  display_title?: string
  source_repo?: string
  source_url?: string
  source_path?: string
  source_commit?: string
  category_key?: string
  category_label?: string
  tags?: string[]
  import_target?: string
  generated_at?: string
  document_kind?: string
  visibility?: string
}

export interface KnowledgeDocMetadataValues {
  display_title: string
  source_repo: string | null
  source_url: string | null
  source_path: string | null
  source_commit: string | null
  category_key: string | null
  category_label: string | null
  tags: string[]
  import_target: string | null
  generated_at: string | null
  document_kind: string
  visibility: string
  content_sha256: string
}

export interface BuildKnowledgeDocMetadataInput {
  filename: string
  fileType?: string | null
  content?: string | null
  fallbacks?: Partial<ParsedKnowledgeMetadata>
  overrides?: Partial<ParsedKnowledgeMetadata>
}

export interface KnowledgeLinkAuditRecord {
  id: number
  doc_id: number
  line_number: number
  raw_target: string
  resolved_target: string | null
  link_kind: string
  status: string
  http_status: number | null
  checked_at: string | null
  detail: string | null
}

export interface KnowledgeMaintenanceRunInput {
  runKey: string
  planSha256: string
  operation: string
  backupPath?: string | null
  reportPath?: string | null
  beforeDocCount?: number | null
  beforeChunkCount?: number | null
  notes?: string | null
  summary?: Record<string, unknown>
}

export interface KnowledgeMaintenanceActionInput {
  runId: number
  actionId: string
  docId?: number | null
  keepDocId?: number | null
  actionType: string
  reasonCode: string
  reasonDetail?: string | null
  filename: string
  metadata?: Partial<KnowledgeDocMetadataValues>
  beforeContentSha256?: string | null
  afterContentSha256?: string | null
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

type KnowledgeDocBackfillRow = {
  id: number
  filename: string
  file_type: string | null
  content: string | null
}

export const KNOWLEDGE_METADATA_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_doc_metadata (
  doc_id INTEGER PRIMARY KEY REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  display_title TEXT NOT NULL CHECK(length(trim(display_title)) > 0),
  source_repo TEXT,
  source_url TEXT,
  source_path TEXT,
  source_commit TEXT,
  category_key TEXT,
  category_label TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(tags_json) AND json_type(tags_json) = 'array'),
  import_target TEXT,
  generated_at TEXT,
  document_kind TEXT NOT NULL DEFAULT 'document'
    CHECK(length(trim(document_kind)) > 0),
  visibility TEXT NOT NULL DEFAULT 'local'
    CHECK(length(trim(visibility)) > 0),
  content_sha256 TEXT NOT NULL
    CHECK(length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS knowledge_link_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK(line_number >= 1),
  raw_target TEXT NOT NULL CHECK(length(trim(raw_target)) > 0),
  resolved_target TEXT,
  link_kind TEXT NOT NULL CHECK(length(trim(link_kind)) > 0),
  status TEXT NOT NULL DEFAULT 'unchecked'
    CHECK(status IN ('reachable','not_found','temporary_error','restricted','malformed','unresolved_relative','unchecked')),
  http_status INTEGER CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
  checked_at TEXT,
  detail TEXT,
  UNIQUE(doc_id, line_number, raw_target)
);

CREATE TABLE IF NOT EXISTS knowledge_maintenance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE CHECK(length(trim(run_key)) > 0),
  plan_sha256 TEXT NOT NULL
    CHECK(length(plan_sha256) = 64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
  operation TEXT NOT NULL CHECK(length(trim(operation)) > 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','committed')),
  backup_path TEXT,
  report_path TEXT,
  before_doc_count INTEGER CHECK(before_doc_count IS NULL OR before_doc_count >= 0),
  after_doc_count INTEGER CHECK(after_doc_count IS NULL OR after_doc_count >= 0),
  before_chunk_count INTEGER CHECK(before_chunk_count IS NULL OR before_chunk_count >= 0),
  after_chunk_count INTEGER CHECK(after_chunk_count IS NULL OR after_chunk_count >= 0),
  summary_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(summary_json) AND json_type(summary_json) = 'object'),
  notes TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_maintenance_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES knowledge_maintenance_runs(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL CHECK(length(trim(action_id)) > 0),
  doc_id INTEGER,
  keep_doc_id INTEGER,
  action_type TEXT NOT NULL CHECK(length(trim(action_type)) > 0),
  reason_code TEXT NOT NULL CHECK(length(trim(reason_code)) > 0),
  reason_detail TEXT,
  filename TEXT NOT NULL CHECK(length(trim(filename)) > 0),
  display_title TEXT,
  source_repo TEXT,
  source_url TEXT,
  source_path TEXT,
  source_commit TEXT,
  category_key TEXT,
  category_label TEXT,
  content_sha256 TEXT
    CHECK(content_sha256 IS NULL OR
      (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  before_content_sha256 TEXT
    CHECK(before_content_sha256 IS NULL OR
      (length(before_content_sha256) = 64 AND before_content_sha256 NOT GLOB '*[^0-9a-f]*')),
  after_content_sha256 TEXT
    CHECK(after_content_sha256 IS NULL OR
      (length(after_content_sha256) = 64 AND after_content_sha256 NOT GLOB '*[^0-9a-f]*')),
  before_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(before_json) AND json_type(before_json) = 'object'),
  after_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(after_json) AND json_type(after_json) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(run_id, action_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_doc_metadata_category
  ON knowledge_doc_metadata(category_key, category_label, doc_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_doc_metadata_source
  ON knowledge_doc_metadata(source_repo, source_path, doc_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_doc_metadata_hash
  ON knowledge_doc_metadata(content_sha256, doc_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_link_audit_doc
  ON knowledge_link_audit(doc_id, line_number, id);
CREATE INDEX IF NOT EXISTS idx_knowledge_link_audit_status
  ON knowledge_link_audit(status, checked_at, doc_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_runs_started
  ON knowledge_maintenance_runs(started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_actions_run
  ON knowledge_maintenance_actions(run_id, id);
CREATE INDEX IF NOT EXISTS idx_knowledge_maintenance_actions_doc
  ON knowledge_maintenance_actions(doc_id, id);
`

const INSERT_METADATA_SQL = `
  INSERT INTO knowledge_doc_metadata (
    doc_id, display_title, source_repo, source_url, source_path, source_commit,
    category_key, category_label, tags_json, import_target, generated_at,
    document_kind, visibility, content_sha256
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(doc_id) DO NOTHING
`

function cleanScalar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function decodeYamlScalar(raw: string): string | undefined {
  const value = raw.trim()
  if (!value || value === '~' || value.toLowerCase() === 'null') return undefined
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown
      return cleanScalar(parsed)
    } catch {
      return cleanScalar(value.slice(1, -1))
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return cleanScalar(value.slice(1, -1).replace(/''/g, "'"))
  }
  return cleanScalar(value)
}

function splitInlineYamlList(raw: string): string[] {
  const value = raw.trim()
  if (!value.startsWith('[') || !value.endsWith(']')) return []
  const parts: string[] = []
  let current = ''
  let quote = ''
  let escaped = false
  for (const char of value.slice(1, -1)) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && quote === '"') {
      current += char
      escaped = true
      continue
    }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? '' : char
      current += char
      continue
    }
    if (char === ',' && !quote) {
      const parsed = decodeYamlScalar(current)
      if (parsed) parts.push(parsed)
      current = ''
      continue
    }
    current += char
  }
  const parsed = decodeYamlScalar(current)
  if (parsed) parts.push(parsed)
  return parts
}

function normalizeTags(tags: string[] | undefined): string[] {
  const unique = new Set<string>()
  for (const tag of tags ?? []) {
    const normalized = cleanScalar(tag)
    if (normalized) unique.add(normalized)
  }
  return [...unique]
}

function readFrontMatterLines(content: string): string[] {
  let cursor = content.charCodeAt(0) === 0xfeff ? 1 : 0
  const readLine = (): string | null => {
    if (cursor > content.length) return null
    const nextLine = content.indexOf('\n', cursor)
    const end = nextLine >= 0 ? nextLine : content.length
    const line = content.slice(cursor, end).replace(/\r$/, '')
    cursor = nextLine >= 0 ? nextLine + 1 : content.length + 1
    return line
  }

  if (readLine()?.trim() !== '---') return []
  const lines: string[] = []
  while (cursor <= content.length) {
    const line = readLine()
    if (line === null) break
    const delimiter = line.trim()
    if (delimiter === '---' || delimiter === '...') return lines
    lines.push(line)
  }
  return []
}

export function parseKnowledgeFrontMatter(
  content: string | null | undefined,
): ParsedKnowledgeMetadata {
  if (!content) return {}
  const lines = readFrontMatterLines(content)
  if (lines.length === 0) return {}

  const scalars = new Map<string, string>()
  let tags: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const raw = match[2] ?? ''
    if (key === 'tags') {
      tags = splitInlineYamlList(raw)
      if (!raw.trim()) {
        for (let next = index + 1; next < lines.length; next++) {
          const tagMatch = lines[next].match(/^\s+-\s+(.+)$/)
          if (!tagMatch) {
            if (!lines[next].trim()) continue
            break
          }
          const tag = decodeYamlScalar(tagMatch[1])
          if (tag) tags.push(tag)
          index = next
        }
      }
      continue
    }
    const scalar = decodeYamlScalar(raw)
    if (scalar !== undefined) scalars.set(key, scalar)
  }

  const scalar = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = scalars.get(key)
      if (value !== undefined) return value
    }
    return undefined
  }

  return {
    display_title: scalar('display_title', 'title'),
    source_repo: scalar('source_repo', 'repository'),
    source_url: scalar('source_url'),
    source_path: scalar('source_path'),
    source_commit: scalar('source_commit'),
    category_key: scalar('category_key', 'category_dir'),
    category_label: scalar('category_label', 'category'),
    tags: normalizeTags(tags),
    import_target: scalar('import_target'),
    generated_at: scalar('generated_at'),
    document_kind: scalar('document_kind'),
    visibility: scalar('visibility'),
  }
}

export function titleFromKnowledgeFilename(filename: string): string {
  return filename
    .replace(/\.(?:md|markdown|txt|pdf)$/i, '')
    .split('__')
    .slice(-1)[0]
    .replace(/^[a-f0-9]{8,}_?/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

function documentKindFromFileType(fileType: string | null | undefined): string {
  switch ((fileType ?? '').replace(/^\./, '').toLowerCase()) {
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'txt':
      return 'text'
    case 'pdf':
      return 'pdf'
    default:
      return 'document'
  }
}

export function buildKnowledgeDocMetadata(
  input: BuildKnowledgeDocMetadataInput,
): KnowledgeDocMetadataValues {
  const parsed = parseKnowledgeFrontMatter(input.content)
  const merged: ParsedKnowledgeMetadata = {
    ...input.fallbacks,
    ...parsed,
    ...input.overrides,
  }
  const content = input.content ?? ''
  return {
    display_title:
      cleanScalar(merged.display_title) ||
      titleFromKnowledgeFilename(input.filename) ||
      input.filename,
    source_repo: cleanScalar(merged.source_repo) ?? null,
    source_url: cleanScalar(merged.source_url) ?? null,
    source_path: cleanScalar(merged.source_path) ?? null,
    source_commit: cleanScalar(merged.source_commit) ?? null,
    category_key: cleanScalar(merged.category_key) ?? null,
    category_label: cleanScalar(merged.category_label) ?? null,
    tags: normalizeTags(merged.tags),
    import_target: cleanScalar(merged.import_target) ?? null,
    generated_at: cleanScalar(merged.generated_at) ?? null,
    document_kind: cleanScalar(merged.document_kind) || documentKindFromFileType(input.fileType),
    visibility: cleanScalar(merged.visibility) || 'local',
    content_sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  }
}

function runMetadataInsert(
  statement: Database.Statement,
  docId: number,
  metadata: KnowledgeDocMetadataValues,
): Database.RunResult {
  return statement.run(
    docId,
    metadata.display_title,
    metadata.source_repo,
    metadata.source_url,
    metadata.source_path,
    metadata.source_commit,
    metadata.category_key,
    metadata.category_label,
    JSON.stringify(metadata.tags),
    metadata.import_target,
    metadata.generated_at,
    metadata.document_kind,
    metadata.visibility,
    metadata.content_sha256,
  )
}

export function insertKnowledgeDocMetadata(
  database: Database.Database,
  docId: number,
  metadata: KnowledgeDocMetadataValues,
): Database.RunResult {
  return runMetadataInsert(database.prepare(INSERT_METADATA_SQL), docId, metadata)
}

export function backfillKnowledgeDocMetadata(database: Database.Database): number {
  const rows = database
    .prepare(
      `SELECT kd.id, kd.filename, kd.file_type, kd.content
       FROM knowledge_docs kd
       ORDER BY kd.id`,
    )
    .all() as KnowledgeDocBackfillRow[]
  const insert = database.prepare(`
    INSERT INTO knowledge_doc_metadata (
      doc_id, display_title, source_repo, source_url, source_path, source_commit,
      category_key, category_label, tags_json, import_target, generated_at,
      document_kind, visibility, content_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(doc_id) DO UPDATE SET
      content_sha256 = excluded.content_sha256,
      updated_at = CASE
        WHEN knowledge_doc_metadata.content_sha256 <> excluded.content_sha256
        THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ELSE knowledge_doc_metadata.updated_at
      END
    WHERE knowledge_doc_metadata.content_sha256 <> excluded.content_sha256
  `)
  let inserted = 0
  for (const row of rows) {
    const metadata = buildKnowledgeDocMetadata({
      filename: row.filename,
      fileType: row.file_type,
      content: row.content,
    })
    inserted += runMetadataInsert(insert, row.id, metadata).changes
  }
  return inserted
}

function assertKnowledgeMetadataSchema(database: Database.Database): void {
  const requiredColumns: Record<string, string[]> = {
    knowledge_doc_metadata: [
      'doc_id',
      'display_title',
      'tags_json',
      'document_kind',
      'visibility',
      'content_sha256',
    ],
    knowledge_link_audit: [
      'id',
      'doc_id',
      'line_number',
      'raw_target',
      'link_kind',
      'status',
      'http_status',
    ],
    knowledge_maintenance_runs: [
      'id',
      'run_key',
      'plan_sha256',
      'operation',
      'status',
      'summary_json',
    ],
    knowledge_maintenance_actions: [
      'id',
      'run_id',
      'action_id',
      'action_type',
      'reason_code',
      'filename',
      'before_json',
      'after_json',
    ],
  }
  for (const [table, required] of Object.entries(requiredColumns)) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    const existing = new Set(columns.map((column) => column.name))
    const missing = required.filter((column) => !existing.has(column))
    if (missing.length > 0)
      throw new Error(`Incompatible ${table} schema; missing: ${missing.join(', ')}`)
  }

  const foreignKeys = (table: string) =>
    database.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{
      from: string
      table: string
      on_delete: string
    }>
  const hasCascade = (table: string, from: string, target: string) =>
    foreignKeys(table).some(
      (key) =>
        key.from === from && key.table === target && key.on_delete.toUpperCase() === 'CASCADE',
    )
  if (!hasCascade('knowledge_doc_metadata', 'doc_id', 'knowledge_docs')) {
    throw new Error('Incompatible knowledge_doc_metadata schema; doc_id cascade is required')
  }
  if (!hasCascade('knowledge_link_audit', 'doc_id', 'knowledge_docs')) {
    throw new Error('Incompatible knowledge_link_audit schema; doc_id cascade is required')
  }
  if (!hasCascade('knowledge_maintenance_actions', 'run_id', 'knowledge_maintenance_runs')) {
    throw new Error('Incompatible knowledge_maintenance_actions schema; run_id cascade is required')
  }

  const tableSql = (table: string) =>
    String(
      (
        database
          .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
          .get(table) as { sql?: string } | undefined
      )?.sql ?? '',
    )
      .replace(/\s+/g, ' ')
      .toLowerCase()
  const linkSql = tableSql('knowledge_link_audit')
  const canonicalStatusConstraint =
    "check(statusin('reachable','not_found','temporary_error','restricted','malformed','unresolved_relative','unchecked'))"
  if (!linkSql.replace(/\s+/g, '').includes(canonicalStatusConstraint)) {
    throw new Error(
      'Incompatible knowledge_link_audit schema; canonical status constraint is required',
    )
  }
  const maintenanceRunSql = tableSql('knowledge_maintenance_runs').replace(/\s+/g, '')
  if (!maintenanceRunSql.includes("check(statusin('running','committed'))")) {
    throw new Error(
      'Incompatible knowledge_maintenance_runs schema; canonical status constraint is required',
    )
  }
  for (const [table, requiredHashChecks] of [
    ['knowledge_doc_metadata', 1],
    ['knowledge_maintenance_runs', 1],
    ['knowledge_maintenance_actions', 3],
  ] as const) {
    const sql = tableSql(table)
    const hashChecks = sql.match(/not glob '\*\[\^0-9a-f\]\*'/g)?.length ?? 0
    if (hashChecks < requiredHashChecks) {
      throw new Error(`Incompatible ${table} schema; lowercase SHA-256 constraint is required`)
    }
  }
  const actionsSql = tableSql('knowledge_maintenance_actions')
  if (!actionsSql.includes('unique(run_id, action_id)')) {
    throw new Error(
      'Incompatible knowledge_maintenance_actions schema; action uniqueness is required',
    )
  }
}

function backfillMissingKnowledgeDocMetadata(database: Database.Database): number {
  const rows = database
    .prepare(
      `SELECT kd.id, kd.filename, kd.file_type, kd.content
     FROM knowledge_docs kd
     LEFT JOIN knowledge_doc_metadata metadata ON metadata.doc_id = kd.id
     WHERE metadata.doc_id IS NULL
     ORDER BY kd.id`,
    )
    .all() as KnowledgeDocBackfillRow[]
  const insert = database.prepare(INSERT_METADATA_SQL)
  let inserted = 0
  for (const row of rows) {
    inserted += runMetadataInsert(
      insert,
      row.id,
      buildKnowledgeDocMetadata({
        filename: row.filename,
        fileType: row.file_type,
        content: row.content,
      }),
    ).changes
  }
  return inserted
}

export function ensureKnowledgeMetadataSchema(
  database: Database.Database,
  options: { fullBackfill?: boolean } = {},
): number {
  database.exec(KNOWLEDGE_METADATA_SCHEMA_SQL)
  assertKnowledgeMetadataSchema(database)
  return options.fullBackfill
    ? backfillKnowledgeDocMetadata(database)
    : backfillMissingKnowledgeDocMetadata(database)
}

export function parseKnowledgeTagsJson(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? normalizeTags(parsed.filter((tag): tag is string => typeof tag === 'string'))
      : []
  } catch {
    return []
  }
}

export function getKnowledgeLinkAuditForDocument(
  database: Database.Database,
  docId: number,
): KnowledgeLinkAuditRecord[] {
  return database
    .prepare(
      `SELECT id, doc_id, line_number, raw_target, resolved_target, link_kind,
              status, http_status, checked_at, detail
       FROM knowledge_link_audit
       WHERE doc_id = ?
       ORDER BY line_number, id`,
    )
    .all(docId) as KnowledgeLinkAuditRecord[]
}

export function startKnowledgeMaintenanceRun(
  database: Database.Database,
  input: KnowledgeMaintenanceRunInput,
): number {
  const result = database
    .prepare(
      `INSERT INTO knowledge_maintenance_runs
         (run_key, plan_sha256, operation, backup_path, report_path,
          before_doc_count, before_chunk_count, summary_json, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.runKey.trim(),
      input.planSha256.trim(),
      input.operation.trim(),
      input.backupPath ?? null,
      input.reportPath ?? null,
      input.beforeDocCount ?? null,
      input.beforeChunkCount ?? null,
      JSON.stringify(input.summary ?? {}),
      input.notes ?? null,
    )
  return Number(result.lastInsertRowid)
}

export function recordKnowledgeMaintenanceAction(
  database: Database.Database,
  input: KnowledgeMaintenanceActionInput,
): number {
  const metadata = input.metadata ?? {}
  const result = database
    .prepare(
      `INSERT INTO knowledge_maintenance_actions (
         run_id, action_id, doc_id, keep_doc_id, action_type, reason_code, reason_detail, filename,
         display_title, source_repo, source_url, source_path, source_commit,
         category_key, category_label, content_sha256, before_content_sha256,
         after_content_sha256, before_json, after_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.runId,
      input.actionId.trim(),
      input.docId ?? null,
      input.keepDocId ?? null,
      input.actionType.trim(),
      input.reasonCode.trim(),
      input.reasonDetail ?? null,
      input.filename,
      metadata.display_title ?? null,
      metadata.source_repo ?? null,
      metadata.source_url ?? null,
      metadata.source_path ?? null,
      metadata.source_commit ?? null,
      metadata.category_key ?? null,
      metadata.category_label ?? null,
      metadata.content_sha256 ?? null,
      input.beforeContentSha256 ?? null,
      input.afterContentSha256 ?? null,
      JSON.stringify(input.before ?? {}),
      JSON.stringify(input.after ?? {}),
    )
  return Number(result.lastInsertRowid)
}

export function completeKnowledgeMaintenanceRun(
  database: Database.Database,
  runId: number,
  afterDocCount: number,
  afterChunkCount: number,
  summary: Record<string, unknown> = {},
): void {
  database
    .prepare(
      `UPDATE knowledge_maintenance_runs
       SET status = 'committed', after_doc_count = ?, after_chunk_count = ?, summary_json = ?,
           completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    )
    .run(afterDocCount, afterChunkCount, JSON.stringify(summary), runId)
}
