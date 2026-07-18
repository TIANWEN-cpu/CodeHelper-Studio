import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronState.userDataPath),
    getVersion: vi.fn(() => '2.4.1-migration-test'),
  },
}))

import {
  APPLICATION_SCHEMA_VERSION,
  __resetDBForTesting,
  closeDB,
  getDB,
  getDatabaseStartupStatus,
} from '../electron/db/index'

type LegacyDatabaseOptions = {
  incompatibleMetadataTable?: boolean
}

const LEGACY_CONTENT = `---
title: "Legacy Migration Guide"
source_repo: "acme/legacy-docs"
source_url: "https://example.com/acme/legacy-docs"
source_path: "guides/migration.md"
source_commit: "abc123"
category: "Guides"
category_dir: "guides"
tags:
  - "sqlite"
  - "migration"
---

# Legacy Migration Guide

Preserve this v1 document during startup migration.
`

function createLegacyV1Database(databasePath: string, options: LegacyDatabaseOptions = {}): void {
  const database = new Database(databasePath)
  try {
    database.pragma('foreign_keys = ON')
    database.exec(`
      CREATE TABLE knowledge_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        file_type TEXT,
        content TEXT,
        chunk_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE knowledge_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER REFERENCES knowledge_docs(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding TEXT,
        chunk_index INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE schema_migrations (
        component TEXT PRIMARY KEY,
        version INTEGER NOT NULL CHECK(version >= 0),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE legacy_sentinel (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_migrations (component, version) VALUES ('application', 1);
      INSERT INTO legacy_sentinel (id, value) VALUES (1, 'preserved');
    `)

    const firstDoc = database
      .prepare(
        `INSERT INTO knowledge_docs (filename, file_type, content, chunk_count)
         VALUES (?, ?, ?, 1)`,
      )
      .run('legacy__migration-guide.md', 'md', LEGACY_CONTENT)
    database
      .prepare(
        `INSERT INTO knowledge_chunks (doc_id, content, chunk_index)
         VALUES (?, ?, 0)`,
      )
      .run(firstDoc.lastInsertRowid, 'Preserve this v1 document during startup migration.')
    database
      .prepare(
        `INSERT INTO knowledge_docs (filename, file_type, content, chunk_count)
         VALUES (?, ?, ?, 0)`,
      )
      .run('plain-notes.txt', 'txt', 'Legacy plain text')

    if (options.incompatibleMetadataTable) {
      database.exec(`
        CREATE TABLE knowledge_doc_metadata (
          doc_id INTEGER PRIMARY KEY,
          legacy_value TEXT
        );
      `)
    }
  } finally {
    database.close()
  }
}

function tableNames(database: Database.Database): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((row) => row.name)
}

describe('application v1 to v2 SQLite startup migration', () => {
  let rootDirectory = ''
  let databasePath = ''

  beforeEach(() => {
    rootDirectory = mkdtempSync(join(tmpdir(), 'codehelper-v1-v2-migration-'))
    electronState.userDataPath = rootDirectory
    databasePath = join(rootDirectory, 'codehelper.db')
    process.resourcesPath = join(process.cwd(), 'electron')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    closeDB()
    __resetDBForTesting()
    vi.restoreAllMocks()
    rmSync(rootDirectory, { recursive: true, force: true })
  })

  it('backs up v1, migrates the real database, backfills metadata, and records schema v2', () => {
    createLegacyV1Database(databasePath)

    const database = getDB()
    const startup = getDatabaseStartupStatus()

    expect(startup).toMatchObject({
      initialized: true,
      databasePath,
      quickCheck: ['ok'],
      applicationSchemaVersion: APPLICATION_SCHEMA_VERSION,
      recoveryBackupPath: null,
      error: null,
    })
    expect(startup.migrationBackupPath).toBeTruthy()

    const backupPath = startup.migrationBackupPath!
    const manifestPath = `${backupPath}.manifest.json`
    expect(existsSync(backupPath)).toBe(true)
    expect(existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({
      kind: 'pre-migration',
      integrity: 'ok',
      quickCheck: ['ok'],
      applicationVersion: '2.4.1-migration-test',
      applicationSchemaVersion: 1,
    })
    expect(manifest.sha256).toBe(
      createHash('sha256').update(readFileSync(backupPath)).digest('hex'),
    )

    const backup = new Database(backupPath, { readonly: true, fileMustExist: true })
    try {
      expect(backup.pragma('quick_check', { simple: true })).toBe('ok')
      expect(
        backup
          .prepare("SELECT version FROM schema_migrations WHERE component = 'application'")
          .pluck()
          .get(),
      ).toBe(1)
      expect(tableNames(backup)).not.toContain('knowledge_doc_metadata')
      expect(backup.prepare('SELECT COUNT(*) FROM knowledge_docs').pluck().get()).toBe(2)
    } finally {
      backup.close()
    }

    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        'knowledge_doc_metadata',
        'knowledge_link_audit',
        'knowledge_maintenance_runs',
        'knowledge_maintenance_actions',
      ]),
    )
    expect(database.pragma('quick_check', { simple: true })).toBe('ok')
    expect(
      database
        .prepare("SELECT version FROM schema_migrations WHERE component = 'application'")
        .pluck()
        .get(),
    ).toBe(APPLICATION_SCHEMA_VERSION)
    expect(database.prepare('SELECT COUNT(*) FROM knowledge_chunks').pluck().get()).toBe(1)
    expect(database.prepare('SELECT value FROM legacy_sentinel WHERE id = 1').pluck().get()).toBe(
      'preserved',
    )

    const metadata = database
      .prepare(
        `SELECT display_title, source_repo, source_url, source_path, source_commit,
                category_key, category_label, tags_json, document_kind, visibility,
                content_sha256
         FROM knowledge_doc_metadata
         WHERE doc_id = 1`,
      )
      .get() as Record<string, unknown>
    expect(metadata).toMatchObject({
      display_title: 'Legacy Migration Guide',
      source_repo: 'acme/legacy-docs',
      source_url: 'https://example.com/acme/legacy-docs',
      source_path: 'guides/migration.md',
      source_commit: 'abc123',
      category_key: 'guides',
      category_label: 'Guides',
      document_kind: 'markdown',
      visibility: 'local',
      content_sha256: createHash('sha256').update(LEGACY_CONTENT, 'utf8').digest('hex'),
    })
    expect(JSON.parse(String(metadata.tags_json))).toEqual(['sqlite', 'migration'])
    expect(database.prepare('SELECT COUNT(*) FROM knowledge_doc_metadata').pluck().get()).toBe(2)
    expect(database.prepare('SELECT COUNT(*) FROM knowledge_maintenance_runs').pluck().get()).toBe(
      0,
    )
  })

  it('keeps v1 unchanged when an incompatible legacy table makes migration fail', () => {
    createLegacyV1Database(databasePath, { incompatibleMetadataTable: true })

    expect(() => getDB()).toThrow(/knowledge_doc_metadata|category_key/)

    const startup = getDatabaseStartupStatus()
    expect(startup).toMatchObject({
      initialized: false,
      databasePath,
      applicationSchemaVersion: 0,
    })
    expect(startup.error).toMatch(/knowledge_doc_metadata|category_key/)
    expect(startup.migrationBackupPath).toBeTruthy()

    const backup = new Database(startup.migrationBackupPath!, {
      readonly: true,
      fileMustExist: true,
    })
    try {
      expect(backup.pragma('quick_check', { simple: true })).toBe('ok')
      expect(
        backup
          .prepare("SELECT version FROM schema_migrations WHERE component = 'application'")
          .pluck()
          .get(),
      ).toBe(1)
      expect(tableNames(backup)).not.toContain('knowledge_link_audit')
    } finally {
      backup.close()
    }

    const unchanged = new Database(databasePath, { readonly: true, fileMustExist: true })
    try {
      expect(unchanged.pragma('quick_check', { simple: true })).toBe('ok')
      expect(
        unchanged
          .prepare("SELECT version FROM schema_migrations WHERE component = 'application'")
          .pluck()
          .get(),
      ).toBe(1)
      expect(tableNames(unchanged)).not.toContain('knowledge_link_audit')
      expect(tableNames(unchanged)).not.toContain('knowledge_maintenance_runs')
      expect(unchanged.prepare('SELECT COUNT(*) FROM knowledge_docs').pluck().get()).toBe(2)
      expect(
        unchanged.prepare('SELECT value FROM legacy_sentinel WHERE id = 1').pluck().get(),
      ).toBe('preserved')
      expect(unchanged.prepare('PRAGMA table_info(knowledge_doc_metadata)').all()).toEqual([
        expect.objectContaining({ name: 'doc_id' }),
        expect.objectContaining({ name: 'legacy_value' }),
      ])
    } finally {
      unchanged.close()
    }
  })
})
