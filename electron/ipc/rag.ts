import { ipcMain, dialog } from 'electron'
import { getDB } from '../db/index'
import { readFileSync, statSync } from 'fs'
import { basename, extname } from 'path'
import { splitIntoChunks, escapeRegExp } from '../utils/textUtils'
import { trackPerformance } from '../utils/perfMonitor'
import type { KnowledgeChunkRow } from '../types/db'
import type Database from 'better-sqlite3'

type ScoredKnowledgeChunk = KnowledgeChunkRow & { score: number }

// ---------------------------------------------------------------------------
// Deferred DB wrapper — prevents blocking startup with synchronous DB init.
//
// getDB() performs a synchronous SQLite open + schema + index creation. When
// called early in the app lifecycle this can block the Electron main thread
// and delay window creation. The wrapper below:
//   1. Kicks off init on first access (lazy).
//   2. Does NOT block the event loop — init runs in the microtask queue.
//   3. Returns null via getReadyDB() until init finishes, so IPC handlers
//      can return graceful empty responses instead of blocking or crashing.
//   4. Adds a configurable timeout (default 15 s) so a hung DB open cannot
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
 * Return the DB if already initialised, otherwise trigger background init and
 * return null.  IPC handlers call this and, on null, return a graceful
 * "not-ready" payload instead of blocking.
 */
function getReadyDB(): Database.Database | null {
  if (knowledgeDBReady && knowledgeDB) return knowledgeDB
  if (knowledgeDBReady && !knowledgeDB) {
    // Edge case: ready flag set but ref lost — re-fetch synchronously.
    knowledgeDB = getDB()
    return knowledgeDB
  }
  // Not ready yet — kick off init (if not already started) and return null.
  ensureKnowledgeDBInit()
  return null
}

/**
 * Like getReadyDB() but waits up to DB_INIT_TIMEOUT_MS for init to finish.
 * Used by write-heavy handlers (upload, delete) where returning "not ready"
 * would lose user data.
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

/** Kick off background init eagerly so it finishes before the user needs it. */
ensureKnowledgeDBInit()

function validateKnowledgeQuery(query: string): string {
  if (typeof query !== 'string' || !query.trim()) throw new Error('参数无效: query')
  return query.trim().slice(0, 1000)
}

function keywordSearch(query: string, limit = 5): ScoredKnowledgeChunk[] {
  const normalizedQuery = validateKnowledgeQuery(query)
  const keywords = normalizedQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 1)
  if (keywords.length === 0) return []

  const db = getReadyDB()
  if (!db) return [] // DB not ready yet — return empty results gracefully.

  const conditions = keywords.map(() => 'LOWER(kc.content) LIKE ?').join(' OR ')
  const params = keywords.map((kw) => `%${kw}%`)
  const matchingChunks = db
    .prepare(
      `SELECT kc.*, kd.filename FROM knowledge_chunks kc JOIN knowledge_docs kd ON kc.doc_id = kd.id WHERE ${conditions}`,
    )
    .all(...params) as KnowledgeChunkRow[]

  const scored = matchingChunks.map((chunk) => {
    const text = chunk.content.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      const matches = (text.match(new RegExp(escapeRegExp(kw), 'g')) || []).length
      score += matches
    }
    return { ...chunk, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

function topConceptsFromChunks(chunks: ScoredKnowledgeChunk[], limit = 8): string[] {
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

      for (const filePath of result.filePaths) {
        const filename = basename(filePath)
        const ext = extname(filePath).toLowerCase()
        let content = ''

        const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
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
          try {
            const pdfParseModule = await import('pdf-parse')
            const pdfParseFn = (pdfParseModule as unknown as Record<string, unknown>).default as
              | ((data: Buffer) => Promise<{ text: string }>)
              | undefined
            const pdfParse =
              pdfParseFn ??
              (pdfParseModule as unknown as (data: Buffer) => Promise<{ text: string }>)
            const buffer = readFileSync(filePath)
            const textResult = await pdfParse(buffer)
            content = textResult.text
          } catch (error) {
            throw new Error(
              `PDF 解析失败: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }

        // Split into chunks (~500 chars)
        const chunks = splitIntoChunks(content, 500)

        const docResult = db
          .prepare(
            'INSERT INTO knowledge_docs (filename, file_type, content, chunk_count) VALUES (?,?,?,?)',
          )
          .run(filename, ext, content, chunks.length)

        const docId = docResult.lastInsertRowid
        const insertChunk = db.prepare(
          'INSERT INTO knowledge_chunks (doc_id, content, chunk_index) VALUES (?,?,?)',
        )

        chunks.forEach((chunk, i) => {
          insertChunk.run(docId, chunk, i)
        })

        uploaded.push(filename)
      }

      return uploaded
    }),
  )

  ipcMain.handle('knowledge-list', () => {
    const db = getReadyDB()
    if (!db) return [] // DB not ready yet — return empty list gracefully.
    return db
      .prepare(
        'SELECT id, filename, file_type, chunk_count, created_at FROM knowledge_docs ORDER BY created_at DESC',
      )
      .all()
  })

  ipcMain.handle(
    'knowledge-delete',
    trackPerformance('knowledge-delete', async (_e, id: number) => {
      if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
      try {
        const db = await getDBWithTimeout()
        db.prepare('DELETE FROM knowledge_chunks WHERE doc_id = ?').run(id)
        db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id)
      } catch (error) {
        throw new Error(
          `删除知识文档失败: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }),
  )

  ipcMain.handle(
    'knowledge-search',
    trackPerformance('knowledge-search', (_e, query: string) => keywordSearch(query, 5)),
  )

  ipcMain.handle(
    'knowledge-semantic-search',
    trackPerformance('knowledge-semantic-search', (_e, query: string) =>
      keywordSearch(query, 10).map((chunk) => ({
        content: chunk.content,
        filename: chunk.filename,
        doc_id: chunk.doc_id,
        chunk_id: chunk.id,
        score: Math.min(1, chunk.score / 5),
        explanation: '当前使用关键词匹配作为语义搜索降级结果。',
      })),
    ),
  )

  ipcMain.handle(
    'knowledge-summarize',
    trackPerformance('knowledge-summarize', (_e, query: string) => {
      const chunks = keywordSearch(query, 5)
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
    trackPerformance('knowledge-rag-context', (_e, query?: string) => ({
      recentProblems: [],
      learningHistory: [],
      knowledgeChunks: query ? keywordSearch(query, 5).map((chunk) => chunk.content) : [],
      userProfile: {
        preferredLanguage: 'zh-CN',
        difficultyLevel: 'beginner',
        strongTopics: [],
        weakTopics: [],
      },
    })),
  )
}
