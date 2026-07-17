import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), getVersion: vi.fn(() => 'test') },
}))

import { runApplicationMigrationTransaction } from '../electron/db/index'

describe('application database migration transaction', () => {
  let rootDirectory: string | null = null

  afterEach(() => {
    if (rootDirectory) rmSync(rootDirectory, { recursive: true, force: true })
    rootDirectory = null
  })

  it('rolls back earlier DDL and data changes when a later migration step fails', () => {
    rootDirectory = mkdtempSync(join(tmpdir(), 'codehelper-migration-atomicity-'))
    const database = new Database(join(rootDirectory, 'codehelper.db'))
    database.exec(`
      CREATE TABLE baseline (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO baseline (id, value) VALUES (1, 'before');
    `)

    expect(() =>
      runApplicationMigrationTransaction(database, () => {
        database.exec("UPDATE baseline SET value = 'during' WHERE id = 1")
        database.exec('CREATE TABLE partially_migrated (id INTEGER PRIMARY KEY)')
        throw new Error('later component migration failed')
      }),
    ).toThrow('later component migration failed')

    expect(database.prepare('SELECT value FROM baseline WHERE id = 1').pluck().get()).toBe('before')
    expect(
      database
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
        .pluck()
        .get('partially_migrated'),
    ).toBe(0)
    database.close()
  })
})
