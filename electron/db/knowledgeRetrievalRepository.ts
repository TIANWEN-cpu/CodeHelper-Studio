import type Database from 'better-sqlite3'
import type {
  KnowledgeRetrievalStatus,
  KnowledgeSearchResponse,
} from '../../src/shared/knowledgeRetrievalContract'
import {
  expandKnowledgeQuery,
  fuseKnowledgeCandidates,
  type KnowledgeRetrievalCandidate,
} from '../utils/knowledgeRetrieval'

const KNOWLEDGE_RETRIEVAL_COMPONENT = 'knowledge-retrieval'
export const KEYWORD_SCHEMA_VERSION = 1
export const TRIGRAM_SCHEMA_VERSION = 2
const CHANNEL_CANDIDATE_LIMIT = 80
const LIKE_TERM_LIMIT = 12

type RetrievalCapability = {
  keywordFts: boolean
  trigramFts: boolean
  databaseReadable: boolean
  reason: string
  indexedAt: number
}

type FtsCandidateRow = KnowledgeRetrievalCandidate & { backend_score?: number }

const capabilityCache = new WeakMap<Database.Database, RetrievalCapability>()

function migrationVersion(database: Database.Database): number {
  const row = database
    .prepare('SELECT version FROM schema_migrations WHERE component = ?')
    .get(KNOWLEDGE_RETRIEVAL_COMPONENT) as { version?: number } | undefined
  return Number(row?.version ?? 0)
}

function setMigrationVersion(database: Database.Database, version: number): void {
  database
    .prepare(
      `INSERT INTO schema_migrations (component, version, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(component) DO UPDATE SET
         version = excluded.version,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(KNOWLEDGE_RETRIEVAL_COMPONENT, version)
}

function virtualTableExists(database: Database.Database, table: string): boolean {
  const row = database
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { found?: number } | undefined
  return row?.found === 1
}

function ensureKeywordFts(database: Database.Database, currentVersion: number): boolean {
  try {
    const existed = virtualTableExists(database, 'knowledge_chunks_fts')
    database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
        content,
        content='knowledge_chunks',
        content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_ai AFTER INSERT ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_ad AFTER DELETE ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content)
        VALUES ('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS knowledge_chunks_fts_au AFTER UPDATE OF content ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content)
        VALUES ('delete', old.id, old.content);
        INSERT INTO knowledge_chunks_fts(rowid, content) VALUES (new.id, new.content);
      END;
    `)
    if (!existed || currentVersion < KEYWORD_SCHEMA_VERSION) {
      database.exec(`INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts) VALUES ('rebuild')`)
      setMigrationVersion(database, Math.max(currentVersion, KEYWORD_SCHEMA_VERSION))
    }
    return true
  } catch (error) {
    console.warn('[knowledge-retrieval] FTS5 BM25 index unavailable:', error)
    return false
  }
}

function ensureTrigramFts(database: Database.Database, currentVersion: number): boolean {
  try {
    const existed = virtualTableExists(database, 'knowledge_chunks_trigram')
    database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_trigram USING fts5(
        content,
        content='knowledge_chunks',
        content_rowid='id',
        tokenize='trigram'
      );
      CREATE TRIGGER IF NOT EXISTS knowledge_chunks_trigram_ai AFTER INSERT ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_trigram(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS knowledge_chunks_trigram_ad AFTER DELETE ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram, rowid, content)
        VALUES ('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS knowledge_chunks_trigram_au AFTER UPDATE OF content ON knowledge_chunks BEGIN
        INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram, rowid, content)
        VALUES ('delete', old.id, old.content);
        INSERT INTO knowledge_chunks_trigram(rowid, content) VALUES (new.id, new.content);
      END;
    `)
    if (!existed || currentVersion < TRIGRAM_SCHEMA_VERSION) {
      database.exec(
        `INSERT INTO knowledge_chunks_trigram(knowledge_chunks_trigram) VALUES ('rebuild')`,
      )
      setMigrationVersion(database, Math.max(currentVersion, TRIGRAM_SCHEMA_VERSION))
    }
    return true
  } catch (error) {
    console.warn('[knowledge-retrieval] FTS5 trigram index unavailable:', error)
    return false
  }
}

export function ensureKnowledgeRetrievalSchema(database: Database.Database): RetrievalCapability {
  const cached = capabilityCache.get(database)
  if (cached) return cached

  let currentVersion = 0
  try {
    currentVersion = migrationVersion(database)
  } catch (error) {
    const capability = {
      keywordFts: false,
      trigramFts: false,
      databaseReadable: false,
      reason: `知识检索迁移状态不可用：${error instanceof Error ? error.message : String(error)}`,
      indexedAt: Date.now(),
    }
    capabilityCache.set(database, capability)
    return capability
  }

  const keywordFts = ensureKeywordFts(database, currentVersion)
  currentVersion = Math.max(currentVersion, keywordFts ? KEYWORD_SCHEMA_VERSION : 0)
  const trigramFts = ensureTrigramFts(database, currentVersion)
  const capability: RetrievalCapability = {
    keywordFts,
    trigramFts,
    databaseReadable: true,
    reason:
      keywordFts && trigramFts
        ? 'SQLite FTS5 BM25 与 trigram 索引均可用；结果使用本地语义近似与 RRF 融合。'
        : keywordFts
          ? 'trigram 索引不可用；保留 BM25，并使用本地 n-gram 重排。'
          : 'FTS5 索引不可用；检索降级为有界 LIKE 扫描与本地 n-gram 重排。',
    indexedAt: Date.now(),
  }
  capabilityCache.set(database, capability)
  return capability
}

function readCount(
  database: Database.Database,
  table: 'knowledge_docs' | 'knowledge_chunks',
): { ok: boolean; count: number } {
  try {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
      | { count?: number }
      | undefined
    return { ok: true, count: Number(row?.count ?? 0) }
  } catch {
    return { ok: false, count: 0 }
  }
}

export function getKnowledgeRetrievalStatus(
  database: Database.Database,
  capability = ensureKnowledgeRetrievalSchema(database),
): KnowledgeRetrievalStatus {
  const documents = readCount(database, 'knowledge_docs')
  const chunks = readCount(database, 'knowledge_chunks')
  const documentCount = documents.count
  const chunkCount = chunks.count
  if (!capability.databaseReadable || !documents.ok || !chunks.ok) {
    return {
      available: false,
      degraded: true,
      mode: 'unavailable',
      lexicalBackend: 'none',
      semanticBackend: 'none',
      reason: !capability.databaseReadable
        ? capability.reason
        : '知识库基础表不可读；检索已停止，避免把数据库故障误报为可用降级。',
      documentCount,
      chunkCount,
      indexedAt: capability.indexedAt,
    }
  }
  if (capability.keywordFts && capability.trigramFts) {
    return {
      available: true,
      degraded: false,
      mode: 'hybrid',
      lexicalBackend: 'fts5-bm25',
      semanticBackend: 'fts5-trigram-local-ngram',
      reason: capability.reason,
      documentCount,
      chunkCount,
      indexedAt: capability.indexedAt,
    }
  }
  if (capability.keywordFts || capability.trigramFts) {
    return {
      available: true,
      degraded: true,
      mode: 'hybrid-degraded',
      lexicalBackend: capability.keywordFts ? 'fts5-bm25' : 'bounded-like',
      semanticBackend: capability.trigramFts ? 'fts5-trigram-local-ngram' : 'local-ngram-rerank',
      reason: capability.reason,
      documentCount,
      chunkCount,
      indexedAt: capability.indexedAt,
    }
  }
  return {
    available: true,
    degraded: true,
    mode: 'keyword-fallback',
    lexicalBackend: 'bounded-like',
    semanticBackend: 'local-ngram-rerank',
    reason: capability.reason,
    documentCount,
    chunkCount,
    indexedAt: capability.indexedAt,
  }
}

function ftsExpression(terms: string[], minimumLength: number): string | null {
  const quoted = terms
    .filter((term) => Array.from(term.replace(/\s+/g, '')).length >= minimumLength)
    .slice(0, 12)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
  return quoted.length > 0 ? quoted.join(' OR ') : null
}

function searchFts(
  database: Database.Database,
  table: 'knowledge_chunks_fts' | 'knowledge_chunks_trigram',
  expression: string | null,
  limit: number,
): KnowledgeRetrievalCandidate[] {
  if (!expression) return []
  const rows = database
    .prepare(
      `SELECT kc.id, kc.doc_id, kc.content, kc.chunk_index, kd.filename,
              bm25(${table}) AS backend_score
       FROM ${table}
       JOIN knowledge_chunks kc ON kc.id = ${table}.rowid
       JOIN knowledge_docs kd ON kd.id = kc.doc_id
       WHERE ${table} MATCH ?
       ORDER BY backend_score ASC, kc.id ASC
       LIMIT ?`,
    )
    .all(expression, limit) as FtsCandidateRow[]
  return rows.map(({ backend_score: _backendScore, ...row }) => row)
}

function searchBoundedLike(
  database: Database.Database,
  terms: string[],
  limit: number,
): KnowledgeRetrievalCandidate[] {
  const selectedTerms = terms.slice(0, LIKE_TERM_LIMIT)
  if (selectedTerms.length === 0) return []
  const conditions = selectedTerms
    .map(() => '(instr(LOWER(kc.content), ?) > 0 OR instr(LOWER(kd.filename), ?) > 0)')
    .join(' OR ')
  const params = selectedTerms.flatMap((term) => [term.toLowerCase(), term.toLowerCase()])
  return database
    .prepare(
      `SELECT kc.id, kc.doc_id, kc.content, kc.chunk_index, kd.filename
       FROM knowledge_chunks kc
       JOIN knowledge_docs kd ON kd.id = kc.doc_id
       WHERE ${conditions}
       ORDER BY kc.id DESC
       LIMIT ?`,
    )
    .all(...params, limit) as KnowledgeRetrievalCandidate[]
}

export function searchKnowledgeHybrid(
  database: Database.Database,
  query: string,
  limit = 10,
): KnowledgeSearchResponse {
  const startedAt = performance.now()
  const terms = expandKnowledgeQuery(query)
  const capability = ensureKnowledgeRetrievalSchema(database)
  let keywordFts = capability.keywordFts
  let trigramFts = capability.trigramFts
  let keyword: KnowledgeRetrievalCandidate[] = []
  let semantic: KnowledgeRetrievalCandidate[] = []

  if (keywordFts) {
    try {
      keyword = searchFts(
        database,
        'knowledge_chunks_fts',
        ftsExpression(terms, 2),
        CHANNEL_CANDIDATE_LIMIT,
      )
    } catch (error) {
      keywordFts = false
      console.warn('[knowledge-retrieval] BM25 query failed, falling back:', error)
    }
  }
  if (trigramFts) {
    try {
      semantic = searchFts(
        database,
        'knowledge_chunks_trigram',
        ftsExpression(terms, 3),
        CHANNEL_CANDIDATE_LIMIT,
      )
    } catch (error) {
      trigramFts = false
      console.warn('[knowledge-retrieval] Trigram query failed, falling back:', error)
    }
  }

  let fallback: KnowledgeRetrievalCandidate[] = []
  let fallbackAvailable = true
  let fallbackError = ''
  const needsFallback =
    !keywordFts || !trigramFts || (keyword.length === 0 && semantic.length === 0)
  if (needsFallback) {
    try {
      fallback = searchBoundedLike(database, terms, CHANNEL_CANDIDATE_LIMIT)
    } catch (error) {
      fallbackAvailable = false
      fallbackError = error instanceof Error ? error.message : String(error)
      console.warn('[knowledge-retrieval] Bounded LIKE fallback failed:', error)
    }
  }
  const results = fuseKnowledgeCandidates(query, { keyword, semantic, fallback }, limit)
  const requestCapability: RetrievalCapability = {
    ...capability,
    keywordFts,
    trigramFts,
    reason:
      keywordFts && trigramFts
        ? capability.reason
        : keywordFts || trigramFts
          ? '本次检索有一个 FTS 通道不可用，已使用剩余索引与有界 LIKE 降级融合。'
          : '本次检索无法使用 FTS5，已降级为有界 LIKE 与本地 n-gram 重排。',
  }
  const status =
    !keywordFts && !trigramFts && !fallbackAvailable
      ? {
          available: false,
          degraded: true,
          mode: 'unavailable' as const,
          lexicalBackend: 'none' as const,
          semanticBackend: 'none' as const,
          reason: `FTS5 与 bounded LIKE 均不可用：${fallbackError || '未知检索错误'}`,
          documentCount: readCount(database, 'knowledge_docs').count,
          chunkCount: readCount(database, 'knowledge_chunks').count,
          indexedAt: requestCapability.indexedAt,
        }
      : getKnowledgeRetrievalStatus(database, requestCapability)
  return {
    query,
    results,
    retrieval: {
      ...status,
      candidateCount: new Set([...keyword, ...semantic, ...fallback].map((item) => item.id)).size,
      durationMs: Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100),
    },
  }
}
