import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { openDatabaseWithRecovery } from './databaseRecovery'
import {
  DATABASE_RECOVERY_NOTICE_KEY,
  serializeDatabaseRecoveryNotice,
} from '../../src/shared/databaseRecoveryContract'
import { ensureExerciseDraftSchema } from './exerciseDraftRepository'
import { ensureEditorWorkspaceSchema } from './editorWorkspaceRepository'
import { ensureKnowledgeRetrievalSchema } from './knowledgeRetrievalRepository'
import { ensureKnowledgeMetadataSchema } from './knowledgeMetadataRepository'
import { ensureAgentSchema } from './agentRepository'
import {
  createVerifiedDatabaseBackup,
  readApplicationSchemaVersion,
  runDatabaseQuickCheck,
} from './databaseBackup'

let db: Database.Database | null = null

export const APPLICATION_SCHEMA_VERSION = 2

export interface DatabaseStartupStatus {
  initialized: boolean
  databasePath: string | null
  quickCheck: string[]
  applicationSchemaVersion: number
  migrationBackupPath: string | null
  recoveryBackupPath: string | null
  error: string | null
}

let databaseStartupStatus: DatabaseStartupStatus = {
  initialized: false,
  databasePath: null,
  quickCheck: [],
  applicationSchemaVersion: 0,
  migrationBackupPath: null,
  recoveryBackupPath: null,
  error: null,
}

export function getDatabaseStartupStatus(): DatabaseStartupStatus {
  return { ...databaseStartupStatus, quickCheck: [...databaseStartupStatus.quickCheck] }
}

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'codehelper.db')
}

export function runApplicationMigrationTransaction(
  database: Database.Database,
  migrate: () => void,
): void {
  database.transaction(migrate)()
}

/** Reset singleton for testing. */
export function __resetDBForTesting() {
  if (db) {
    db.close()
  }
  db = null
  databaseStartupStatus = {
    initialized: false,
    databasePath: null,
    quickCheck: [],
    applicationSchemaVersion: 0,
    migrationBackupPath: null,
    recoveryBackupPath: null,
    error: null,
  }
}

export function getDB(): Database.Database {
  if (!db) {
    const dbPath = getDatabasePath()
    console.log('[STARTUP] Initializing database at:', dbPath)

    // Load and execute schema - try multiple paths
    const candidates = [
      join(process.resourcesPath, 'db', 'schema.sql'), // packaged: extraResources
      join(__dirname, '../../electron/db/schema.sql'), // dev: source
      join(__dirname, '../db/schema.sql'), // fallback
    ]

    let schema = ''
    for (const p of candidates) {
      if (existsSync(p)) {
        schema = readFileSync(p, 'utf-8')
        console.log('[STARTUP] Schema loaded from:', p, `(${schema.length} chars)`)
        break
      }
    }

    if (!schema) {
      console.warn('[STARTUP] No schema file found in candidates:', candidates)
    }

    let candidate: Database.Database | null = null
    let migrationBackupPath: string | null = null
    let previousApplicationSchemaVersion = APPLICATION_SCHEMA_VERSION
    try {
      const opened = openDatabaseWithRecovery(
        dbPath,
        (database) => {
          database.pragma('journal_mode = WAL')
          database.pragma('foreign_keys = ON')
          console.log('[STARTUP] Database connected, WAL mode enabled')
          runApplicationMigrationTransaction(database, () => {
            if (schema) database.exec(schema)
            ensureSchemaColumns(database)
            ensureExerciseDraftSchema(database)
            ensureEditorWorkspaceSchema(database)
            ensureKnowledgeMetadataSchema(database, {
              fullBackfill: previousApplicationSchemaVersion < APPLICATION_SCHEMA_VERSION,
            })
            ensureKnowledgeRetrievalSchema(database)
            ensureAgentSchema(database)
            ensureChatHistoryForeignKey(database)
            const postMigrationQuickCheck = runDatabaseQuickCheck(database)
            if (
              postMigrationQuickCheck.length !== 1 ||
              postMigrationQuickCheck[0].trim().toLowerCase() !== 'ok'
            ) {
              throw new Error(
                `Database quick_check failed after migration: ${postMigrationQuickCheck.join('; ')}`,
              )
            }
            recordApplicationSchemaVersion(database, APPLICATION_SCHEMA_VERSION)
          })
          if (schema) console.log('[STARTUP] Schema executed successfully')
        },
        {
          beforeOpenWritable: (database) => {
            const recordedVersion = readApplicationSchemaVersion(database)
            previousApplicationSchemaVersion = recordedVersion
            if (recordedVersion > APPLICATION_SCHEMA_VERSION) {
              throw new Error(
                `Database schema version ${recordedVersion} is newer than this application supports (${APPLICATION_SCHEMA_VERSION})`,
              )
            }
            if (recordedVersion < APPLICATION_SCHEMA_VERSION) {
              const backup = createVerifiedDatabaseBackup(database, {
                kind: 'pre-migration',
                databasePath: dbPath,
                applicationVersion: app.getVersion(),
              })
              migrationBackupPath = backup.filePath
              console.log('[STARTUP] Verified pre-migration database backup:', backup.filePath)
            }
          },
        },
      )
      candidate = opened.database
      if (opened.recoveryNotice) {
        candidate
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run(DATABASE_RECOVERY_NOTICE_KEY, serializeDatabaseRecoveryNotice(opened.recoveryNotice))
        console.error(
          '[STARTUP][RECOVERY] Corrupt database isolated at:',
          opened.recoveryNotice.backupPath,
        )
      }
      db = candidate
      candidate = null
      databaseStartupStatus = {
        initialized: true,
        databasePath: dbPath,
        quickCheck: runDatabaseQuickCheck(db),
        applicationSchemaVersion: readApplicationSchemaVersion(db),
        migrationBackupPath,
        recoveryBackupPath: opened.recoveryNotice?.backupPath ?? null,
        error: null,
      }
      console.log('[STARTUP] Schema migrations ensured')
    } catch (err) {
      try {
        candidate?.close()
      } catch {
        // The original initialization failure is more useful than a close failure.
      }
      db = null
      databaseStartupStatus = {
        initialized: false,
        databasePath: dbPath,
        quickCheck: [],
        applicationSchemaVersion: 0,
        migrationBackupPath,
        recoveryBackupPath: null,
        error: err instanceof Error ? err.message : String(err),
      }
      console.error('[ERROR] Database initialization failed:', err)
      throw err
    }

    console.log('[STARTUP] Database initialization complete')
  }
  return db
}

function recordApplicationSchemaVersion(database: Database.Database, version: number): void {
  database
    .prepare(
      `INSERT INTO schema_migrations (component, version, updated_at)
       VALUES ('application', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(component) DO UPDATE SET
         version = excluded.version,
         updated_at = excluded.updated_at`,
    )
    .run(version)
}

export function closeDB() {
  if (db) {
    db.close()
    db = null
  }
}

function ensureSchemaColumns(database: Database.Database) {
  const columns = database.prepare('PRAGMA table_info(problems)').all() as Array<{ name: string }>
  const existing = new Set(columns.map((column) => column.name))
  const additions = [
    { name: 'tracks', sql: "ALTER TABLE problems ADD COLUMN tracks TEXT DEFAULT '[]'" },
    { name: 'platform', sql: "ALTER TABLE problems ADD COLUMN platform TEXT DEFAULT 'internal'" },
    { name: 'mode', sql: "ALTER TABLE problems ADD COLUMN mode TEXT DEFAULT 'oj'" },
    { name: 'exam_style', sql: "ALTER TABLE problems ADD COLUMN exam_style TEXT DEFAULT 'acm'" },
    { name: 'year', sql: 'ALTER TABLE problems ADD COLUMN year INTEGER' },
    { name: 'official_url', sql: 'ALTER TABLE problems ADD COLUMN official_url TEXT' },
    { name: 'estimated_time', sql: 'ALTER TABLE problems ADD COLUMN estimated_time INTEGER' },
  ]

  for (const item of additions) {
    if (!existing.has(item.name)) {
      database.exec(item.sql)
    }
  }
}

export function ensureChatHistoryForeignKey(database: Database.Database): void {
  const foreignKeys = database.prepare('PRAGMA foreign_key_list(chat_history)').all() as Array<{
    table: string
    from: string
    on_delete: string
  }>
  const hasSessionCascade = foreignKeys.some(
    (foreignKey) =>
      foreignKey.table === 'chat_sessions' &&
      foreignKey.from === 'session_id' &&
      foreignKey.on_delete.toUpperCase() === 'CASCADE',
  )
  if (hasSessionCascade) return

  const ownsTransaction = !database.inTransaction
  try {
    if (ownsTransaction) database.exec('BEGIN IMMEDIATE')
    database.exec(`
      DROP TABLE IF EXISTS chat_history_migrated;
      CREATE TABLE chat_history_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role TEXT CHECK(role IN ('user','assistant','system')),
        content TEXT NOT NULL,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT OR IGNORE INTO chat_sessions (id, title)
      SELECT DISTINCT h.session_id, 'Recovered conversation'
      FROM chat_history h
      LEFT JOIN chat_sessions s ON s.id = h.session_id
      WHERE s.id IS NULL;
      INSERT INTO chat_history_migrated (id, session_id, role, content, model, created_at)
      SELECT h.id, h.session_id, h.role, h.content, h.model, h.created_at
      FROM chat_history h;
      DROP TABLE chat_history;
      ALTER TABLE chat_history_migrated RENAME TO chat_history;
      CREATE INDEX IF NOT EXISTS idx_chat_history_session
        ON chat_history(session_id, created_at, id);
    `)
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
