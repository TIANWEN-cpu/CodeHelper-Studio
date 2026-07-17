import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import {
  ensureKnowledgeRetrievalSchema,
  getKnowledgeRetrievalStatus,
  searchKnowledgeHybrid,
} from '../electron/db/knowledgeRetrievalRepository'

type Candidate = {
  id: number
  doc_id: number
  filename: string
  content: string
  chunk_index: number
}

function createDatabase(options?: {
  failFts?: boolean
  failLike?: boolean
  failMigrationRead?: boolean
  failDocumentCount?: boolean
  failChunkCount?: boolean
  version?: number
  keyword?: Candidate[]
  semantic?: Candidate[]
  fallback?: Candidate[]
}) {
  const exec = vi.fn((sql: string) => {
    if (options?.failFts && sql.includes('CREATE VIRTUAL TABLE')) {
      throw new Error('no such module: fts5')
    }
  })
  const prepare = vi.fn((sql: string) => {
    if (sql.includes('SELECT version FROM schema_migrations')) {
      if (options?.failMigrationRead) throw new Error('schema_migrations is unreadable')
      return { get: vi.fn(() => ({ version: options?.version ?? 0 })) }
    }
    if (sql.includes('sqlite_master')) return { get: vi.fn(() => undefined) }
    if (sql.includes('INSERT INTO schema_migrations')) return { run: vi.fn() }
    if (sql.includes('COUNT(*)') && sql.includes('knowledge_docs')) {
      if (options?.failDocumentCount) throw new Error('no such table: knowledge_docs')
      return { get: vi.fn(() => ({ count: 3 })) }
    }
    if (sql.includes('COUNT(*)') && sql.includes('knowledge_chunks')) {
      if (options?.failChunkCount) throw new Error('no such table: knowledge_chunks')
      return { get: vi.fn(() => ({ count: 7 })) }
    }
    if (sql.includes('FROM knowledge_chunks_fts')) {
      return { all: vi.fn(() => options?.keyword ?? []) }
    }
    if (sql.includes('FROM knowledge_chunks_trigram')) {
      return { all: vi.fn(() => options?.semantic ?? []) }
    }
    if (sql.includes('instr(LOWER(kc.content)')) {
      return {
        all: vi.fn(() => {
          if (options?.failLike) throw new Error('LIKE query failed')
          return options?.fallback ?? []
        }),
      }
    }
    return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() }
  })
  return {
    database: { exec, prepare } as unknown as Database.Database,
    exec,
    prepare,
  }
}

const binarySearch: Candidate = {
  id: 1,
  doc_id: 1,
  filename: 'binary-search.md',
  content: 'Binary search halves a sorted array. 二分查找要求有序数据。',
  chunk_index: 0,
}

describe('knowledge retrieval repository', () => {
  it('creates and rebuilds both FTS indexes for an existing database', () => {
    const { database, exec } = createDatabase({ version: 0 })
    const capability = ensureKnowledgeRetrievalSchema(database)

    expect(capability).toMatchObject({ keywordFts: true, trigramFts: true })
    expect(exec.mock.calls.some(([sql]) => String(sql).includes('knowledge_chunks_fts'))).toBe(true)
    expect(exec.mock.calls.some(([sql]) => String(sql).includes("VALUES ('rebuild')"))).toBe(true)
  })

  it('reports an honest bounded-LIKE fallback when FTS5 is unavailable', () => {
    const { database } = createDatabase({ failFts: true })
    const status = getKnowledgeRetrievalStatus(database)

    expect(status).toMatchObject({
      available: true,
      degraded: true,
      mode: 'keyword-fallback',
      lexicalBackend: 'bounded-like',
      semanticBackend: 'local-ngram-rerank',
    })
    expect(status.reason).toMatch(/FTS5|LIKE/)
  })

  it('reports unavailable when retrieval schema metadata cannot be read', () => {
    const { database } = createDatabase({ failMigrationRead: true })
    const status = getKnowledgeRetrievalStatus(database)

    expect(status).toMatchObject({
      available: false,
      degraded: true,
      mode: 'unavailable',
      lexicalBackend: 'none',
      semanticBackend: 'none',
    })
    expect(status.reason).toContain('schema_migrations is unreadable')
  })

  it('reports unavailable when a required knowledge table cannot be read', () => {
    const { database } = createDatabase({ version: 2, failChunkCount: true })
    const status = getKnowledgeRetrievalStatus(database)

    expect(status).toMatchObject({
      available: false,
      degraded: true,
      mode: 'unavailable',
      lexicalBackend: 'none',
      semanticBackend: 'none',
      documentCount: 3,
      chunkCount: 0,
    })
  })

  it('returns fused results and retrieval diagnostics', () => {
    const { database, prepare } = createDatabase({
      version: 2,
      keyword: [binarySearch],
      semantic: [binarySearch],
      fallback: [binarySearch],
    })
    const response = searchKnowledgeHybrid(database, '二分搜索', 5)

    expect(response.results[0]).toMatchObject({
      filename: 'binary-search.md',
      channels: expect.arrayContaining(['keyword', 'semantic']),
    })
    expect(response.results[0].channels).not.toContain('fallback')
    expect(
      prepare.mock.calls.some(([sql]) => String(sql).includes('instr(LOWER(kc.content)')),
    ).toBe(false)
    expect(response.retrieval).toMatchObject({
      mode: 'hybrid',
      candidateCount: 1,
      documentCount: 3,
      chunkCount: 7,
    })
  })

  it('keeps results available through fallback candidates when FTS creation fails', () => {
    const { database } = createDatabase({ failFts: true, fallback: [binarySearch] })
    const response = searchKnowledgeHybrid(database, 'binary search', 5)

    expect(response.results[0].filename).toBe('binary-search.md')
    expect(response.retrieval).toMatchObject({
      degraded: true,
      mode: 'keyword-fallback',
      candidateCount: 1,
    })
  })

  it('uses bounded LIKE when healthy FTS indexes return no candidates', () => {
    const { database } = createDatabase({ version: 2, fallback: [binarySearch] })
    const response = searchKnowledgeHybrid(database, 'binary-search.md', 5)

    expect(response.results[0]).toMatchObject({
      filename: 'binary-search.md',
      channels: ['fallback'],
    })
    expect(response.retrieval.mode).toBe('hybrid')
  })

  it('returns unavailable instead of throwing when every retrieval backend fails', () => {
    const { database } = createDatabase({ failFts: true, failLike: true })
    const response = searchKnowledgeHybrid(database, 'binary search', 5)

    expect(response.results).toEqual([])
    expect(response.retrieval).toMatchObject({
      available: false,
      degraded: true,
      mode: 'unavailable',
      lexicalBackend: 'none',
      semanticBackend: 'none',
    })
    expect(response.retrieval.reason).toMatch(/LIKE query failed/)
  })
})
