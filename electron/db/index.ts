import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { openDatabaseWithRecovery } from './databaseRecovery'
import {
  DATABASE_RECOVERY_NOTICE_KEY,
  serializeDatabaseRecoveryNotice,
} from '../../src/shared/databaseRecoveryContract'
import { ensureExerciseDraftSchema } from './exerciseDraftRepository'
import {
  EDITOR_WORKSPACE_SCHEMA_VERSION,
  ensureEditorWorkspaceSchema,
} from './editorWorkspaceRepository'
import {
  KEYWORD_SCHEMA_VERSION,
  TRIGRAM_SCHEMA_VERSION,
  ensureKnowledgeRetrievalSchema,
} from './knowledgeRetrievalRepository'
import {
  KNOWLEDGE_METADATA_SCHEMA_SQL,
  ensureKnowledgeMetadataSchema,
} from './knowledgeMetadataRepository'
import { AGENT_SCHEMA_VERSION, ensureAgentSchema } from './agentRepository'
import {
  createVerifiedDatabaseBackup,
  readApplicationSchemaVersion,
  runDatabaseQuickCheck,
} from './databaseBackup'

let db: Database.Database | null = null

export const APPLICATION_SCHEMA_VERSION = 2

const SCHEMA_COLUMN_ADDITIONS = [
  { name: 'tracks', sql: "ALTER TABLE problems ADD COLUMN tracks TEXT DEFAULT '[]'" },
  { name: 'platform', sql: "ALTER TABLE problems ADD COLUMN platform TEXT DEFAULT 'internal'" },
  { name: 'mode', sql: "ALTER TABLE problems ADD COLUMN mode TEXT DEFAULT 'oj'" },
  { name: 'exam_style', sql: "ALTER TABLE problems ADD COLUMN exam_style TEXT DEFAULT 'acm'" },
  { name: 'year', sql: 'ALTER TABLE problems ADD COLUMN year INTEGER' },
  { name: 'official_url', sql: 'ALTER TABLE problems ADD COLUMN official_url TEXT' },
  { name: 'estimated_time', sql: 'ALTER TABLE problems ADD COLUMN estimated_time INTEGER' },
]

/**
 * 当前构建实际执行的 schema 内容指纹。
 *
 * 备份/回填触发不再只依赖手维护的 APPLICATION_SCHEMA_VERSION 计数器：任何一次发布
 * 修改了 schema.sql 或 ensure* 迁移片段而忘记递增计数器，哈希也会变化，从而在下次
 * 启动触发一次已验证的迁移前备份。计数器仍保留作为次要信号。
 */
function computeSchemaFingerprint(schema: string): string {
  const hash = createHash('sha256')
  hash.update(`application-schema:${APPLICATION_SCHEMA_VERSION}\n`)
  hash.update(schema)
  hash.update('\n')
  for (const addition of SCHEMA_COLUMN_ADDITIONS) hash.update(`schema-columns:${addition.sql}\n`)
  hash.update(`exercise-draft:1\n`)
  hash.update(`editor-workspace:${EDITOR_WORKSPACE_SCHEMA_VERSION}\n`)
  hash.update(`knowledge-metadata:${KNOWLEDGE_METADATA_SCHEMA_SQL}\n`)
  hash.update(
    `knowledge-retrieval:keyword:${KEYWORD_SCHEMA_VERSION}:trigram:${TRIGRAM_SCHEMA_VERSION}\n`,
  )
  hash.update(`agent:${AGENT_SCHEMA_VERSION}\n`)
  hash.update('chat-history-fk:1\n')
  return hash.digest('hex')
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  )
}

function hasColumn(database: Database.Database, tableName: string, columnName: string): boolean {
  if (!hasTable(database, tableName)) return false
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string
  }>
  return columns.some((column) => column.name === columnName)
}

/** 读取上次迁移后记录的 schema 指纹；无记录（旧库/无列）返回 null。 */
function readRecordedSchemaHash(database: Database.Database): string | null {
  if (!hasColumn(database, 'schema_migrations', 'schema_hash')) return null
  const row = database
    .prepare("SELECT schema_hash FROM schema_migrations WHERE component = 'application'")
    .get() as { schema_hash: string | null } | undefined
  return typeof row?.schema_hash === 'string' && row.schema_hash ? row.schema_hash : null
}

function ensureSchemaHashColumn(database: Database.Database): void {
  if (!hasColumn(database, 'schema_migrations', 'schema_hash')) {
    database.exec('ALTER TABLE schema_migrations ADD COLUMN schema_hash TEXT')
  }
}

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
    let previousSchemaHashDiffers = false
    const schemaFingerprint = computeSchemaFingerprint(schema)
    try {
      const opened = openDatabaseWithRecovery(
        dbPath,
        (database) => {
          database.pragma('journal_mode = WAL')
          database.pragma('foreign_keys = ON')
          console.log('[STARTUP] Database connected, WAL mode enabled')
          runApplicationMigrationTransaction(database, () => {
            if (schema) database.exec(schema)
            ensureSchemaHashColumn(database)
            ensureSchemaColumns(database)
            ensureExerciseDraftSchema(database)
            ensureEditorWorkspaceSchema(database)
            ensureKnowledgeMetadataSchema(database, {
              fullBackfill:
                previousApplicationSchemaVersion < APPLICATION_SCHEMA_VERSION ||
                previousSchemaHashDiffers,
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
            recordApplicationSchemaHash(database, schemaFingerprint)
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
            // 指纹不同（schema.sql 或 ensure* 迁移发生变化、或旧库尚未记录指纹）
            // 与版本计数器任一中触发，都先做一次已验证的迁移前备份。
            previousSchemaHashDiffers = readRecordedSchemaHash(database) !== schemaFingerprint
            if (recordedVersion < APPLICATION_SCHEMA_VERSION || previousSchemaHashDiffers) {
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

function recordApplicationSchemaHash(database: Database.Database, schemaHash: string): void {
  database
    .prepare("UPDATE schema_migrations SET schema_hash = ? WHERE component = 'application'")
    .run(schemaHash)
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

  for (const item of SCHEMA_COLUMN_ADDITIONS) {
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
