import { afterEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
}))

import { ensureChatHistoryForeignKey } from '../electron/db/index'

function queryAll(database: SqlJsDatabase, sql: string): Record<string, unknown>[] {
  const statement = database.prepare(sql)
  const rows: Record<string, unknown>[] = []
  while (statement.step()) rows.push(statement.getAsObject())
  statement.free()
  return rows
}

function migrationAdapter(
  database: SqlJsDatabase,
): Parameters<typeof ensureChatHistoryForeignKey>[0] {
  return {
    prepare: (sql: string) => ({ all: () => queryAll(database, sql) }),
    exec: (sql: string) => database.run(sql),
    inTransaction: false,
  } as unknown as Parameters<typeof ensureChatHistoryForeignKey>[0]
}

describe('database migrations', () => {
  let database: SqlJsDatabase | null = null

  afterEach(() => {
    database?.close()
    database = null
  })

  it('rebuilds legacy chat history with a working cascade foreign key', async () => {
    const SQL = await initSqlJs()
    database = new SQL.Database()
    database.run('PRAGMA foreign_keys = ON')
    database.run(`
      CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT,
        content TEXT NOT NULL,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO chat_sessions (id, title) VALUES ('session-1', 'Session');
      INSERT INTO chat_history (session_id, role, content) VALUES
        ('session-1', 'user', 'kept'),
        ('missing-session', 'assistant', 'orphan');
    `)

    ensureChatHistoryForeignKey(migrationAdapter(database))

    expect(queryAll(database, 'PRAGMA foreign_key_list(chat_history)')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'chat_sessions',
          from: 'session_id',
          on_delete: 'CASCADE',
        }),
      ]),
    )
    expect(queryAll(database, 'SELECT content FROM chat_history ORDER BY id')).toEqual([
      { content: 'kept' },
      { content: 'orphan' },
    ])
    expect(
      queryAll(database, "SELECT title FROM chat_sessions WHERE id = 'missing-session'"),
    ).toEqual([{ title: 'Recovered conversation' }])

    database.run("DELETE FROM chat_sessions WHERE id = 'session-1'")
    expect(queryAll(database, 'SELECT COUNT(*) AS count FROM chat_history')).toEqual([{ count: 1 }])
    database.run("DELETE FROM chat_sessions WHERE id = 'missing-session'")
    expect(queryAll(database, 'SELECT COUNT(*) AS count FROM chat_history')).toEqual([{ count: 0 }])
  })
})
