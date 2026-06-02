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
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

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
        break
      }
    }

    if (schema) {
      db.exec(schema)
    }

    ensureSchemaColumns(db)
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
