import { ipcMain, dialog } from 'electron'
import { getDB } from '../db/index'
import { readFileSync, statSync } from 'fs'
import { basename, extname } from 'path'
import { splitIntoChunks } from '../utils/textUtils'
import { trackPerformance } from '../utils/perfMonitor'
import type Database from 'better-sqlite3'
import {
  getKnowledgeRetrievalStatus,
  searchKnowledgeHybrid,
} from '../db/knowledgeRetrievalRepository'
import {
  buildKnowledgeDocMetadata,
  getKnowledgeLinkAuditForDocument,
  insertKnowledgeDocMetadata,
  parseKnowledgeTagsJson,
  titleFromKnowledgeFilename,
} from '../db/knowledgeMetadataRepository'
import type { KnowledgeDocMetadataValues } from '../db/knowledgeMetadataRepository'
import type { KnowledgeSearchResult } from '../../src/shared/knowledgeRetrievalContract'

type KnowledgeDocListRow = {
  id: number
  filename: string
  file_type: string | null
  chunk_count: number
  created_at: string
  content_preview?: string | null
  metadata_fallback_content?: string | null
  metadata_doc_id?: number | null
  display_title?: string | null
  source_repo?: string | null
  source_url?: string | null
  source_path?: string | null
  source_commit?: string | null
  category_key?: string | null
  category_label?: string | null
  tags_json?: string | null
  import_target?: string | null
  generated_at?: string | null
  document_kind?: string | null
  visibility?: string | null
  content_sha256?: string | null
}
type KnowledgeDocDetailRow = KnowledgeDocListRow & {
  content: string | null
}
type KnowledgeDocMetadata = {
  display_title?: string
  source_repo?: string
  source_url?: string
  source_path?: string
  source_commit?: string
  category_key?: string
  category_label?: string
  category?: string
  category_dir?: string
  tags?: string[]
  import_target?: string
  generated_at?: string
  document_kind?: string
  visibility?: string
  content_sha256?: string
}

export type ScoredKnowledgeChunk = Pick<KnowledgeSearchResult, 'content' | 'score'>

// ---------------------------------------------------------------------------
// Deferred DB wrapper — prevents blocking startup with synchronous DB init.
//
// getDB() performs a synchronous SQLite open + schema + index creation. When
// called early in the app lifecycle this can block the Electron main thread
// and delay window creation. The wrapper below:
//   1. Kicks off init on first access (lazy).
//   2. Does NOT block the event loop — init runs in the microtask queue.
//   3. Adds a configurable timeout (default 15 s) so a hung DB open cannot
//      stall the app indefinitely.
// ---------------------------------------------------------------------------

const DB_INIT_TIMEOUT_MS = 15_000

let knowledgeDB: Database.Database | null = null
let knowledgeDBInitPromise: Promise<Database.Database> | null = null
let knowledgeDBReady = false
let knowledgeDBInitError: Error | null = null

/** Kick off DB init in the background (idempotent). */
function ensureKnowledgeDBInit(): void {
  if (knowledgeDBInitPromise) return
  knowledgeDBInitPromise = Promise.resolve()
    .then(() => {
      const db = getDB()
      knowledgeDB = db
      knowledgeDBReady = true
      return db
    })
    .catch((err) => {
      knowledgeDBInitError = err instanceof Error ? err : new Error(String(err))
      console.error('[knowledge-db] Deferred init failed:', knowledgeDBInitError)
      throw knowledgeDBInitError
    })
}

/**
 * Wait up to DB_INIT_TIMEOUT_MS for deferred initialization to finish.
 * Used whenever an IPC request needs a definitive database result instead of
 * silently degrading to an empty response during startup.
 */
async function getDBWithTimeout(): Promise<Database.Database> {
  if (knowledgeDBReady && knowledgeDB) return knowledgeDB
  ensureKnowledgeDBInit()

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('知识库数据库初始化超时，请稍后重试。')), DB_INIT_TIMEOUT_MS)
  })

  const db = await Promise.race([knowledgeDBInitPromise!, timeoutPromise])
  if (!knowledgeDB) knowledgeDB = db
  return db
}

function validateKnowledgeQuery(query: string): string {
  if (typeof query !== 'string' || !query.trim()) throw new Error('参数无效: query')
  return query.trim().slice(0, 1000)
}

export function extractYamlScalar(frontMatter: string, key: string): string | undefined {
  const match = frontMatter.match(new RegExp(`^${key}:\\s*"?([^"\\r\\n]+)"?\\s*$`, 'm'))
  return match?.[1]?.trim()
}

export function extractYamlTags(frontMatter: string): string[] {
  const tagsBlock = frontMatter.match(/^tags:\s*\r?\n((?:\s+-\s*.*\r?\n?)+)/m)?.[1]
  if (!tagsBlock) return []
  return tagsBlock
    .split(/\r?\n/)
    .map((line) => line.match(/^\s+-\s*"?([^"]+)"?\s*$/)?.[1]?.trim())
    .filter((tag): tag is string => Boolean(tag))
}

export function titleFromFilename(filename: string): string {
  return titleFromKnowledgeFilename(filename)
}

function enrichKnowledgeDoc<T extends KnowledgeDocListRow | KnowledgeDocDetailRow>(
  row: T,
): T & KnowledgeDocMetadata {
  const base = { ...row } as Record<string, unknown>
  for (const key of [
    'metadata_fallback_content',
    'metadata_doc_id',
    'display_title',
    'source_repo',
    'source_url',
    'source_path',
    'source_commit',
    'category_key',
    'category_label',
    'tags_json',
    'import_target',
    'generated_at',
    'document_kind',
    'visibility',
    'content_sha256',
  ]) {
    delete base[key]
  }

  let metadata: KnowledgeDocMetadata
  if (row.metadata_doc_id !== null && row.metadata_doc_id !== undefined) {
    metadata = {
      display_title: row.display_title ?? undefined,
      source_repo: row.source_repo ?? undefined,
      source_url: row.source_url ?? undefined,
      source_path: row.source_path ?? undefined,
      source_commit: row.source_commit ?? undefined,
      category_key: row.category_key ?? undefined,
      category_label: row.category_label ?? undefined,
      tags: parseKnowledgeTagsJson(row.tags_json),
      import_target: row.import_target ?? undefined,
      generated_at: row.generated_at ?? undefined,
      document_kind: row.document_kind ?? undefined,
      visibility: row.visibility ?? undefined,
      content_sha256: row.content_sha256 ?? undefined,
    }
  } else {
    const fallback = buildKnowledgeDocMetadata({
      filename: row.filename,
      fileType: row.file_type,
      content:
        ('content' in row ? row.content : null) ??
        row.metadata_fallback_content ??
        row.content_preview,
    })
    metadata = {
      display_title: fallback.display_title,
      source_repo: fallback.source_repo ?? undefined,
      source_url: fallback.source_url ?? undefined,
      source_path: fallback.source_path ?? undefined,
      source_commit: fallback.source_commit ?? undefined,
      category_key: fallback.category_key ?? undefined,
      category_label: fallback.category_label ?? undefined,
      tags: fallback.tags,
      import_target: fallback.import_target ?? undefined,
      generated_at: fallback.generated_at ?? undefined,
      document_kind: fallback.document_kind,
      visibility: fallback.visibility,
      content_sha256: fallback.content_sha256,
    }
  }

  metadata.category = metadata.category_label
  metadata.category_dir = metadata.category_key

  return Object.fromEntries(
    Object.entries({ ...base, ...metadata }).filter(([, value]) => value !== undefined),
  ) as unknown as T & KnowledgeDocMetadata
}

export function topConceptsFromChunks(
  chunks: Array<Pick<KnowledgeSearchResult, 'content'>>,
  limit = 8,
): string[] {
  const counts = new Map<string, number>()
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'from',
    'are',
    'was',
    'were',
  ])

  for (const chunk of chunks) {
    for (const word of chunk.content.toLowerCase().match(/[a-z0-9_一-龥]{2,}/g) ?? []) {
      if (stopWords.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word)
}

export function registerRAGIPC(): void {
  ipcMain.handle(
    'knowledge-upload',
    trackPerformance('knowledge-upload', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '文档', extensions: ['txt', 'md', 'pdf'] }],
      })

      if (result.canceled || result.filePaths.length === 0) return null

      const db = await getDBWithTimeout()
      const uploaded: string[] = []
      const skipped: string[] = []

      // 与 resource-pack-import 一致：按 filename 去重，已存在的文档直接跳过。
      const existing = new Set(
        (
          db.prepare('SELECT filename FROM knowledge_docs').all() as Array<{
            filename?: string | null
          }>
        )
          .map((row) => row.filename)
          .filter((name): name is string => typeof name === 'string'),
      )

      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

      type PreparedUpload = {
        filename: string
        ext: string
        content: string
        chunks: string[]
        metadata: KnowledgeDocMetadataValues
      }
      const prepared: PreparedUpload[] = []

      for (const filePath of result.filePaths) {
        const filename = basename(filePath)
        const ext = extname(filePath).toLowerCase()
        let content = ''

        let stat
        try {
          stat = statSync(filePath)
        } catch (error) {
          throw new Error(
            `无法读取文件 "${filename}": ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        if (stat.size > MAX_FILE_SIZE) {
          throw new Error(`文件 "${filename}" 超过大小限制（最大 10MB）`)
        }

        if (ext === '.txt' || ext === '.md') {
          try {
            content = readFileSync(filePath, 'utf-8')
          } catch (error) {
            throw new Error(
              `读取文件 "${filename}" 失败: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        } else if (ext === '.pdf') {
          let parser: import('pdf-parse').PDFParse | null = null
          try {
            const { PDFParse } = await import('pdf-parse')
            const buffer = readFileSync(filePath)
            parser = new PDFParse({ data: new Uint8Array(buffer) })
            const textResult = await parser.getText()
            content = textResult.text
            if (!content.trim()) {
              throw new Error('未提取到可读文本，文件可能是扫描版 PDF')
            }
          } catch (error) {
            throw new Error(
              `PDF 解析失败: ${error instanceof Error ? error.message : String(error)}`,
            )
          } finally {
            await parser?.destroy().catch(() => undefined)
          }
        }

        // Split into chunks (~500 chars)
        const chunks = splitIntoChunks(content, 500)
        const metadata = buildKnowledgeDocMetadata({
          filename,
          fileType: ext,
          content,
          fallbacks: {
            source_repo: 'local-import',
            source_path: filePath,
            import_target: 'manual-upload',
            visibility: 'local',
          },
        })
        prepared.push({ filename, ext, content, chunks, metadata })
      }

      // 整批写入包进一个事务：任一文件失败即整体回滚（all-or-nothing），
      // 避免失败时留下 1..N-1 的“半截批次”；单文件的 doc + chunks 也在同一事务内，
      // 保证 chunk_count 与实际 chunk 数一致。
      const insertMany = db.transaction((docs: PreparedUpload[]) => {
        const insertDoc = db.prepare(
          'INSERT INTO knowledge_docs (filename, file_type, content, chunk_count) VALUES (?,?,?,?)',
        )
        const insertChunk = db.prepare(
          'INSERT INTO knowledge_chunks (doc_id, content, chunk_index) VALUES (?,?,?)',
        )
        for (const doc of docs) {
          if (existing.has(doc.filename)) {
            skipped.push(doc.filename)
            continue
          }
          try {
            const docResult = insertDoc.run(doc.filename, doc.ext, doc.content, doc.chunks.length)
            const docId = Number(docResult.lastInsertRowid)
            insertKnowledgeDocMetadata(db, docId, doc.metadata)
            doc.chunks.forEach((chunk, i) => {
              insertChunk.run(docId, chunk, i)
            })
            existing.add(doc.filename)
            uploaded.push(doc.filename)
          } catch (error) {
            throw new Error(
              `上传文件 "${doc.filename}" 失败: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      })
      insertMany(prepared)

      return uploaded
    }),
  )

  ipcMain.handle('knowledge-list', async () => {
    const db = await getDBWithTimeout()
    return db
      .prepare(
        `SELECT kd.id, kd.filename, kd.file_type, kd.chunk_count, kd.created_at,
                substr(kd.content, 1, 1800) AS content_preview,
                CASE WHEN metadata.doc_id IS NULL THEN kd.content ELSE NULL END
                  AS metadata_fallback_content,
                metadata.doc_id AS metadata_doc_id,
                metadata.display_title, metadata.source_repo, metadata.source_url,
                metadata.source_path, metadata.source_commit, metadata.category_key,
                metadata.category_label, metadata.tags_json, metadata.import_target,
                metadata.generated_at, metadata.document_kind, metadata.visibility,
                metadata.content_sha256
         FROM knowledge_docs kd
         LEFT JOIN knowledge_doc_metadata metadata ON metadata.doc_id = kd.id
         ORDER BY kd.created_at DESC, kd.id DESC`,
      )
      .all()
      .map((row) => enrichKnowledgeDoc(row as KnowledgeDocListRow))
  })

  ipcMain.handle(
    'knowledge-get',
    trackPerformance('knowledge-get', async (_e, id: number) => {
      if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
      const db = await getDBWithTimeout()
      const row = db
        .prepare(
          `SELECT kd.id, kd.filename, kd.file_type, kd.content, kd.chunk_count, kd.created_at,
                  metadata.doc_id AS metadata_doc_id,
                  metadata.display_title, metadata.source_repo, metadata.source_url,
                  metadata.source_path, metadata.source_commit, metadata.category_key,
                  metadata.category_label, metadata.tags_json, metadata.import_target,
                  metadata.generated_at, metadata.document_kind, metadata.visibility,
                  metadata.content_sha256
           FROM knowledge_docs kd
           LEFT JOIN knowledge_doc_metadata metadata ON metadata.doc_id = kd.id
           WHERE kd.id = ?`,
        )
        .get(id) as KnowledgeDocDetailRow | undefined
      return row ? enrichKnowledgeDoc(row) : null
    }),
  )

  ipcMain.handle(
    'knowledge-link-audit',
    trackPerformance('knowledge-link-audit', async (_e, id: number) => {
      if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
      return getKnowledgeLinkAuditForDocument(await getDBWithTimeout(), id)
    }),
  )

  ipcMain.handle(
    'knowledge-delete',
    trackPerformance('knowledge-delete', async (_e, id: number) => {
      if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
      try {
        const db = await getDBWithTimeout()
        db.transaction((docId: number) => {
          db.prepare('DELETE FROM knowledge_chunks WHERE doc_id = ?').run(docId)
          db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(docId)
        })(id)
      } catch (error) {
        throw new Error(
          `删除知识文档失败: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }),
  )

  ipcMain.handle(
    'knowledge-search',
    trackPerformance('knowledge-search', async (_e, query: string) => {
      const normalizedQuery = validateKnowledgeQuery(query)
      return searchKnowledgeHybrid(await getDBWithTimeout(), normalizedQuery, 12)
    }),
  )

  ipcMain.handle(
    'knowledge-retrieval-status',
    trackPerformance('knowledge-retrieval-status', async () =>
      getKnowledgeRetrievalStatus(await getDBWithTimeout()),
    ),
  )

  ipcMain.handle(
    'knowledge-semantic-search',
    trackPerformance('knowledge-semantic-search', async (_e, query: string) => {
      const response = searchKnowledgeHybrid(
        await getDBWithTimeout(),
        validateKnowledgeQuery(query),
        10,
      )
      return response.results
        .slice()
        .sort((a, b) => b.semanticScore - a.semanticScore || b.score - a.score)
    }),
  )

  ipcMain.handle(
    'knowledge-summarize',
    trackPerformance('knowledge-summarize', async (_e, query: string) => {
      const chunks = searchKnowledgeHybrid(
        await getDBWithTimeout(),
        validateKnowledgeQuery(query),
        5,
      ).results
      const keyConcepts = topConceptsFromChunks(chunks, 6)
      return {
        summary:
          chunks.length > 0
            ? `基于 ${chunks.length} 个知识库片段的关键词检索结果生成降级摘要。`
            : '知识库中暂未找到相关内容。',
        keyConcepts,
      }
    }),
  )

  ipcMain.handle('knowledge-concept-graph', () => ({ nodes: [], edges: [] }))

  ipcMain.handle('knowledge-concept-detail', (_e, conceptId: string) => {
    if (typeof conceptId !== 'string' || !conceptId.trim()) throw new Error('参数无效: conceptId')
    const label = conceptId.trim()
    return {
      concept: { id: label, label, weight: 0, category: 'keyword' },
      documents: [],
      relatedConcepts: [],
      description: '当前概念图谱为实验性能力，暂无可用详情。',
    }
  })

  ipcMain.handle('knowledge-auto-tag', (_e, docId: number) => {
    if (typeof docId !== 'number' || !Number.isFinite(docId) || docId < 1)
      throw new Error('参数无效: docId')
    return []
  })

  ipcMain.handle('knowledge-tags', () => [])

  ipcMain.handle('knowledge-tag-documents', (_e, tag: string) => {
    if (typeof tag !== 'string' || !tag.trim()) throw new Error('参数无效: tag')
    return []
  })

  ipcMain.handle(
    'knowledge-rag-context',
    trackPerformance('knowledge-rag-context', async (_e, query?: string) => {
      const db = await getDBWithTimeout()
      const response =
        typeof query === 'string' && query.trim()
          ? searchKnowledgeHybrid(db, validateKnowledgeQuery(query), 8)
          : null
      return {
        recentProblems: [],
        learningHistory: [],
        knowledgeChunks:
          response?.results.map(
            (chunk) => `来源：${chunk.filename}#片段${chunk.chunk_index + 1}\n${chunk.content}`,
          ) ?? [],
        knowledgeSources:
          response?.results.map((chunk) => ({
            docId: chunk.doc_id,
            filename: chunk.filename,
            chunkIndex: chunk.chunk_index,
            score: chunk.score,
          })) ?? [],
        retrieval: response?.retrieval ?? getKnowledgeRetrievalStatus(db),
        // 没有真实的用户画像数据来源：不伪造用户属性，调用方遇到 null 时跳过画像注入。
        userProfile: null,
      }
    }),
  )
}
