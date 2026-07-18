import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backfillKnowledgeDocMetadata,
  completeKnowledgeMaintenanceRun,
  ensureKnowledgeMetadataSchema,
  getKnowledgeLinkAuditForDocument,
  KNOWLEDGE_METADATA_SCHEMA_SQL,
  parseKnowledgeFrontMatter,
  parseKnowledgeTagsJson,
  recordKnowledgeMaintenanceAction,
  startKnowledgeMaintenanceRun,
} from '../electron/db/knowledgeMetadataRepository'

let database: Database.Database

function insertDocument(filename: string, content: string, fileType = 'md'): number {
  const result = database
    .prepare(
      `INSERT INTO knowledge_docs (filename, file_type, content, chunk_count)
       VALUES (?, ?, ?, 0)`,
    )
    .run(filename, fileType, content)
  return Number(result.lastInsertRowid)
}

describe('knowledgeMetadataRepository', () => {
  beforeEach(() => {
    database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    database.exec(`
      CREATE TABLE knowledge_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        file_type TEXT,
        content TEXT,
        chunk_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)
  })

  afterEach(() => {
    database.close()
  })

  it('creates metadata and audit tables and backfills legacy documents', () => {
    const docId = insertDocument(
      'repo__guide.md',
      `---
title: "Guide"
source_repo: "acme/docs"
source_url: "https://github.com/acme/docs"
source_path: "docs/guide.md"
source_commit: "abc123"
category: "Documentation"
category_dir: "docs"
tags:
  - "reference"
  - "markdown"
generated_at: "2026-07-18T00:00:00Z"
---

# Guide
`,
    )

    expect(ensureKnowledgeMetadataSchema(database)).toBe(1)

    const metadata = database
      .prepare('SELECT * FROM knowledge_doc_metadata WHERE doc_id = ?')
      .get(docId) as Record<string, unknown>
    expect(metadata).toMatchObject({
      display_title: 'Guide',
      source_repo: 'acme/docs',
      source_path: 'docs/guide.md',
      source_commit: 'abc123',
      category_key: 'docs',
      category_label: 'Documentation',
      document_kind: 'markdown',
      visibility: 'local',
    })
    expect(JSON.parse(String(metadata.tags_json))).toEqual(['reference', 'markdown'])
    expect(metadata.content_sha256).toMatch(/^[0-9a-f]{64}$/)

    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'knowledge_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'knowledge_doc_metadata',
        'knowledge_link_audit',
        'knowledge_maintenance_actions',
        'knowledge_maintenance_runs',
      ]),
    )
  })

  it('parses frontmatter beyond the old 1800-character preview boundary', () => {
    const padding = 'x'.repeat(2200)
    const content = `---
title: "Long frontmatter"
description: "${padding}"
source_repo: "acme/long-docs"
source_path: "manual/long.md"
source_commit: "deadbeef"
---

# Body`
    const docId = insertDocument('long.md', content)

    ensureKnowledgeMetadataSchema(database)

    const metadata = database
      .prepare(
        `SELECT display_title, source_repo, source_path, source_commit
         FROM knowledge_doc_metadata WHERE doc_id = ?`,
      )
      .get(docId)
    expect(metadata).toEqual({
      display_title: 'Long frontmatter',
      source_repo: 'acme/long-docs',
      source_path: 'manual/long.md',
      source_commit: 'deadbeef',
    })
  })

  it('preserves canonical metadata while refreshing the content hash', () => {
    const docId = insertDocument(
      'canonical.md',
      '---\ntitle: Original\ncategory: Original category\n---\n# Original',
    )
    ensureKnowledgeMetadataSchema(database)
    database
      .prepare(
        `UPDATE knowledge_doc_metadata
         SET display_title = ?, category_key = ?, category_label = ?
         WHERE doc_id = ?`,
      )
      .run('Canonical title', '01-core-cs-foundation', 'Core CS Foundation', docId)
    database
      .prepare('UPDATE knowledge_docs SET content = ? WHERE id = ?')
      .run('---\ntitle: Changed source\ncategory: Changed\n---\n# Changed', docId)

    const previousHash = database
      .prepare('SELECT content_sha256 FROM knowledge_doc_metadata WHERE doc_id = ?')
      .pluck()
      .get(docId)
    expect(backfillKnowledgeDocMetadata(database)).toBe(1)
    expect(
      database
        .prepare(
          `SELECT display_title, category_key, category_label, content_sha256
           FROM knowledge_doc_metadata WHERE doc_id = ?`,
        )
        .get(docId),
    ).toEqual({
      display_title: 'Canonical title',
      category_key: '01-core-cs-foundation',
      category_label: 'Core CS Foundation',
      content_sha256: expect.not.stringMatching(String(previousHash)),
    })
  })

  it('accepts exactly the seven canonical link statuses', () => {
    const docId = insertDocument('statuses.md', '# Statuses')
    ensureKnowledgeMetadataSchema(database)
    const insert = database.prepare(
      `INSERT INTO knowledge_link_audit
         (doc_id, line_number, raw_target, link_kind, status)
       VALUES (?, ?, ?, 'external', ?)`,
    )
    const statuses = [
      'reachable',
      'not_found',
      'temporary_error',
      'restricted',
      'malformed',
      'unresolved_relative',
      'unchecked',
    ]
    statuses.forEach((status, index) => insert.run(docId, index + 1, `target-${index}`, status))
    expect(() => insert.run(docId, 20, 'legacy', 'ok')).toThrow()
  })

  it('fails closed when an existing link audit table has a weak status constraint', () => {
    database.exec(`
      CREATE TABLE knowledge_link_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL CHECK(line_number >= 1),
        raw_target TEXT NOT NULL,
        resolved_target TEXT,
        link_kind TEXT NOT NULL,
        status TEXT NOT NULL CHECK(length(trim(status)) > 0),
        http_status INTEGER,
        checked_at TEXT,
        detail TEXT,
        UNIQUE(doc_id, line_number, raw_target)
      )
    `)

    expect(() => ensureKnowledgeMetadataSchema(database)).toThrow(
      'canonical status constraint is required',
    )
  })

  it('enforces maintenance foreign keys, uniqueness, JSON, counts, and hashes', () => {
    ensureKnowledgeMetadataSchema(database)
    const runId = startKnowledgeMaintenanceRun(database, {
      runKey: 'constraints',
      planSha256: 'b'.repeat(64),
      operation: 'cleanup',
    })
    expect(() =>
      startKnowledgeMaintenanceRun(database, {
        runKey: 'constraints',
        planSha256: 'c'.repeat(64),
        operation: 'cleanup',
      }),
    ).toThrow()
    expect(() =>
      recordKnowledgeMaintenanceAction(database, {
        runId: runId + 999,
        actionId: 'missing-run',
        actionType: 'delete',
        reasonCode: 'placeholder',
        filename: 'missing.md',
      }),
    ).toThrow()
    recordKnowledgeMaintenanceAction(database, {
      runId,
      actionId: 'one',
      actionType: 'delete',
      reasonCode: 'placeholder',
      filename: 'one.md',
    })
    expect(() =>
      recordKnowledgeMaintenanceAction(database, {
        runId,
        actionId: 'one',
        actionType: 'delete',
        reasonCode: 'placeholder',
        filename: 'again.md',
      }),
    ).toThrow()
    expect(() =>
      database
        .prepare('UPDATE knowledge_maintenance_runs SET before_doc_count = -1 WHERE id = ?')
        .run(runId),
    ).toThrow()
    expect(() =>
      database
        .prepare("UPDATE knowledge_maintenance_runs SET summary_json = '[]' WHERE id = ?")
        .run(runId),
    ).toThrow()
    expect(() =>
      database
        .prepare("UPDATE knowledge_maintenance_actions SET content_sha256 = 'ABC' WHERE run_id = ?")
        .run(runId),
    ).toThrow()
    database.prepare('DELETE FROM knowledge_maintenance_runs WHERE id = ?').run(runId)
    expect(
      database
        .prepare('SELECT COUNT(*) FROM knowledge_maintenance_actions WHERE run_id = ?')
        .pluck()
        .get(runId),
    ).toBe(0)
  })

  it('keeps the repository schema SQL aligned with schema.sql', () => {
    const schema = readFileSync(join(__dirname, '..', 'electron', 'db', 'schema.sql'), 'utf8')
    const fromFile = new Database(':memory:')
    const fromRepository = new Database(':memory:')
    try {
      for (const target of [fromFile, fromRepository]) {
        target.pragma('foreign_keys = ON')
        target.exec('CREATE TABLE knowledge_docs (id INTEGER PRIMARY KEY)')
      }
      fromFile.exec(schema)
      fromRepository.exec(KNOWLEDGE_METADATA_SCHEMA_SQL)
      const normalizeSql = (sql: unknown) =>
        String(sql)
          .replace(/--[^\n]*/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      const objectSql = (target: Database.Database) =>
        (
          target
            .prepare(
              `SELECT type, name, replace(sql, char(13), '') AS sql
             FROM sqlite_master
             WHERE name LIKE 'knowledge_doc_metadata%'
                OR name LIKE 'knowledge_link_audit%'
                OR name LIKE 'knowledge_maintenance_%'
                OR name LIKE 'idx_knowledge_doc_metadata_%'
                OR name LIKE 'idx_knowledge_link_audit_%'
             ORDER BY type, name`,
            )
            .all() as Array<{ type: string; name: string; sql: string }>
        ).map((item) => ({
          ...item,
          sql: normalizeSql(item.sql),
        }))
      expect(objectSql(fromRepository)).toEqual(objectSql(fromFile))
    } finally {
      fromFile.close()
      fromRepository.close()
    }
  })

  it('reads per-document link audits in source order', () => {
    const docId = insertDocument('links.md', '# Links')
    ensureKnowledgeMetadataSchema(database)
    const insert = database.prepare(
      `INSERT INTO knowledge_link_audit
         (doc_id, line_number, raw_target, resolved_target, link_kind, status, http_status, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insert.run(
      docId,
      8,
      'https://example.com',
      'https://example.com/',
      'external',
      'reachable',
      200,
      null,
    )
    insert.run(
      docId,
      3,
      './missing.md',
      'docs/missing.md',
      'corpus-document',
      'unresolved_relative',
      null,
      'not imported',
    )

    expect(getKnowledgeLinkAuditForDocument(database, docId)).toMatchObject([
      { line_number: 3, raw_target: './missing.md', status: 'unresolved_relative' },
      { line_number: 8, raw_target: 'https://example.com', http_status: 200 },
    ])
  })

  it('keeps maintenance action source snapshots after the document is deleted', () => {
    const docId = insertDocument('duplicate.md', '# Duplicate')
    ensureKnowledgeMetadataSchema(database)
    const metadata = database
      .prepare('SELECT * FROM knowledge_doc_metadata WHERE doc_id = ?')
      .get(docId) as Record<string, unknown>
    const runId = startKnowledgeMaintenanceRun(database, {
      runKey: 'test-run',
      planSha256: 'a'.repeat(64),
      operation: 'deduplicate',
      beforeDocCount: 1,
      beforeChunkCount: 0,
    })
    recordKnowledgeMaintenanceAction(database, {
      runId,
      actionId: 'delete-duplicate',
      docId,
      actionType: 'delete',
      reasonCode: 'exact-duplicate',
      reasonDetail: 'Same normalized content as canonical document 1',
      filename: 'duplicate.md',
      metadata: metadata as never,
      before: { chunk_count: 0 },
    })
    database.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(docId)
    completeKnowledgeMaintenanceRun(database, runId, 0, 0, { deleted: 1 })

    expect(
      database
        .prepare(
          `SELECT doc_id, filename, reason_code, source_path
           FROM knowledge_maintenance_actions WHERE run_id = ?`,
        )
        .get(runId),
    ).toMatchObject({
      doc_id: docId,
      filename: 'duplicate.md',
      reason_code: 'exact-duplicate',
    })
    expect(
      database
        .prepare(
          'SELECT status, before_doc_count, after_doc_count FROM knowledge_maintenance_runs WHERE id = ?',
        )
        .get(runId),
    ).toEqual({ status: 'committed', before_doc_count: 1, after_doc_count: 0 })
  })

  it('parses conservative YAML forms and rejects malformed tags JSON safely', () => {
    expect(
      parseKnowledgeFrontMatter(
        "---\ntitle: 'Quoted title'\ntags: [alpha, 'beta tag', alpha]\n---\nBody",
      ),
    ).toMatchObject({ display_title: 'Quoted title', tags: ['alpha', 'beta tag'] })
    expect(parseKnowledgeTagsJson('["one", 2, "one", " two "]')).toEqual(['one', 'two'])
    expect(parseKnowledgeTagsJson('{broken')).toEqual([])
  })
})
