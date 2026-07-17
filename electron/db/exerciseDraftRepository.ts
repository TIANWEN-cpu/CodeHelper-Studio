import type Database from 'better-sqlite3'

export interface ExerciseDraftRecord {
  exerciseId: string
  title: string | null
  code: string
  language: string | null
  revision: number
  updatedAt: string
  deleted: boolean
}

export interface SaveExerciseDraftInput {
  exerciseId: string
  title?: string | null
  code: string
  language: string
  baseRevision: number
}

export type ExerciseDraftMutationResult =
  | { status: 'saved'; draft: ExerciseDraftRecord }
  | { status: 'conflict'; current: ExerciseDraftRecord | null }

interface ExerciseDraftRow {
  exercise_id: string
  title: string | null
  code: string | null
  language: string | null
  revision: number | null
  updated_at: string | null
  deleted: number | null
}

const initializedDatabases = new WeakSet<Database.Database>()

export function ensureExerciseDraftSchema(database: Database.Database): void {
  if (initializedDatabases.has(database)) return
  database.exec(`
    CREATE TABLE IF NOT EXISTS exercise_drafts (
      exercise_id TEXT PRIMARY KEY,
      title TEXT,
      code TEXT NOT NULL DEFAULT '',
      language TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0
    )
  `)

  const columns = database.prepare('PRAGMA table_info(exercise_drafts)').all() as Array<{
    name: string
  }>
  const existing = new Set(columns.map((column) => column.name))
  if (!existing.has('language')) {
    database.exec('ALTER TABLE exercise_drafts ADD COLUMN language TEXT')
  }
  if (!existing.has('revision')) {
    database.exec('ALTER TABLE exercise_drafts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1')
  }
  if (!existing.has('deleted')) {
    database.exec('ALTER TABLE exercise_drafts ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0')
  }
  database.exec(`
    UPDATE exercise_drafts SET revision = 1 WHERE revision IS NULL OR revision < 1;
    UPDATE exercise_drafts SET deleted = 0 WHERE deleted IS NULL;
    UPDATE exercise_drafts SET updated_at = datetime('now') WHERE updated_at IS NULL;
  `)
  initializedDatabases.add(database)
}

function mapDraft(row: ExerciseDraftRow): ExerciseDraftRecord {
  return {
    exerciseId: row.exercise_id,
    title: row.title,
    code: row.code ?? '',
    language: row.language || null,
    revision:
      Number.isInteger(row.revision) && Number(row.revision) >= 1 ? Number(row.revision) : 1,
    updatedAt: row.updated_at ?? '',
    deleted: row.deleted === 1,
  }
}

function readDraft(database: Database.Database, exerciseId: string): ExerciseDraftRecord | null {
  const row = database
    .prepare(
      `SELECT exercise_id, title, code, language, revision, updated_at, deleted
       FROM exercise_drafts WHERE exercise_id = ?`,
    )
    .get(exerciseId) as ExerciseDraftRow | undefined
  return row ? mapDraft(row) : null
}

export function getExerciseDraft(
  database: Database.Database,
  exerciseId: string,
): ExerciseDraftRecord | null {
  ensureExerciseDraftSchema(database)
  return readDraft(database, exerciseId)
}

export function saveExerciseDraft(
  database: Database.Database,
  input: SaveExerciseDraftInput,
): ExerciseDraftMutationResult {
  ensureExerciseDraftSchema(database)
  const savedRow = database
    .prepare(
      `INSERT INTO exercise_drafts
         (exercise_id, title, code, language, revision, updated_at, deleted)
       SELECT @exerciseId, @title, @code, @language, 1, datetime('now'), 0
       WHERE @baseRevision = 0
          OR EXISTS (SELECT 1 FROM exercise_drafts WHERE exercise_id = @exerciseId)
       ON CONFLICT(exercise_id) DO UPDATE SET
         title = CASE WHEN @hasTitle = 1 THEN excluded.title ELSE exercise_drafts.title END,
         code = excluded.code,
         language = excluded.language,
         revision = exercise_drafts.revision + 1,
         updated_at = datetime('now'),
         deleted = 0
       WHERE exercise_drafts.revision = @baseRevision
       RETURNING exercise_id, title, code, language, revision, updated_at, deleted`,
    )
    .get({
      exerciseId: input.exerciseId,
      title: input.title ?? null,
      hasTitle: input.title === undefined ? 0 : 1,
      code: input.code,
      language: input.language,
      baseRevision: input.baseRevision,
    }) as ExerciseDraftRow | undefined

  if (savedRow) return { status: 'saved', draft: mapDraft(savedRow) }

  const current = readDraft(database, input.exerciseId)
  const idempotentRetry =
    current?.revision === input.baseRevision + 1 &&
    (input.title === undefined || current.title === input.title) &&
    current.code === input.code &&
    current.language === input.language &&
    !current.deleted
  return idempotentRetry ? { status: 'saved', draft: current } : { status: 'conflict', current }
}

export function clearExerciseDraft(
  database: Database.Database,
  exerciseId: string,
  baseRevision: number,
): ExerciseDraftMutationResult {
  ensureExerciseDraftSchema(database)
  const clearedRow = database
    .prepare(
      `INSERT INTO exercise_drafts
         (exercise_id, title, code, language, revision, updated_at, deleted)
       SELECT @exerciseId, NULL, '', NULL, 1, datetime('now'), 1
       WHERE @baseRevision = 0
          OR EXISTS (SELECT 1 FROM exercise_drafts WHERE exercise_id = @exerciseId)
       ON CONFLICT(exercise_id) DO UPDATE SET
         code = '',
         language = NULL,
         revision = exercise_drafts.revision + 1,
         updated_at = datetime('now'),
         deleted = 1
       WHERE exercise_drafts.revision = @baseRevision
       RETURNING exercise_id, title, code, language, revision, updated_at, deleted`,
    )
    .get({ exerciseId, baseRevision }) as ExerciseDraftRow | undefined

  if (clearedRow) return { status: 'saved', draft: mapDraft(clearedRow) }

  const current = readDraft(database, exerciseId)
  const idempotentRetry = current?.deleted === true && current.revision === baseRevision + 1
  return idempotentRetry ? { status: 'saved', draft: current } : { status: 'conflict', current }
}
