import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

let db: Database.Database | null = null

/** Reset singleton for testing. */
export function __resetDBForTesting() {
  if (db) {
    db.close()
  }
  db = null
}

export function getDB(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'codehelper.db')
    console.log('[STARTUP] Initializing database at:', dbPath)
    try {
      db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      db.pragma('foreign_keys = ON')
      console.log('[STARTUP] Database connected, WAL mode enabled')
    } catch (err) {
      console.error('[ERROR] Database connection failed:', err)
      throw err
    }

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

    if (schema) {
      try {
        db.exec(schema)
        console.log('[STARTUP] Schema executed successfully')
      } catch (err) {
        console.error('[ERROR] Schema execution failed:', err)
        throw err
      }
    }

    try {
      ensureSchemaColumns(db)
      ensureChatHistoryForeignKey(db)
      console.log('[STARTUP] Schema migrations ensured')
    } catch (err) {
      console.error('[ERROR] Schema migration failed:', err)
      throw err
    }

    console.log('[STARTUP] Database initialization complete')
  }
  return db
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

  try {
    database.exec(`
      BEGIN IMMEDIATE;
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
      COMMIT;
    `)
  } catch (error) {
    try {
      database.exec('ROLLBACK')
    } catch {
      // The migration may have failed before the transaction began.
    }
    throw error
  }
}
