import { ipcMain, dialog } from 'electron'
import { getDB } from '../db/index'
import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import { splitIntoChunks, escapeRegExp } from '../utils/textUtils'

interface KnowledgeChunkRow {
  id: number
  doc_id: number
  content: string
  chunk_index: number
  filename: string
}

export function registerRAGIPC() {
  ipcMain.handle('knowledge-upload', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文档', extensions: ['txt', 'md', 'pdf'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const db = getDB()
    const uploaded: string[] = []

    for (const filePath of result.filePaths) {
      const filename = basename(filePath)
      const ext = extname(filePath).toLowerCase()
      let content = ''

      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
      const stat = require('fs').statSync(filePath)
      if (stat.size > MAX_FILE_SIZE) {
        throw new Error(`文件 "${filename}" 超过大小限制（最大 10MB）`)
      }

      if (ext === '.txt' || ext === '.md') {
        content = readFileSync(filePath, 'utf-8')
      } else if (ext === '.pdf') {
        try {
          const pdfParseModule = await import('pdf-parse').catch(() => {
            throw new Error('缺少 pdf-parse 模块，请运行: npm install pdf-parse')
          })
          const pdfParse = pdfParseModule.default
          const buffer = readFileSync(filePath)
          const data = await pdfParse(buffer)
          content = data.text
        } catch (error) {
          throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // Split into chunks (~500 chars)
      const chunks = splitIntoChunks(content, 500)

      const docResult = db.prepare(
        'INSERT INTO knowledge_docs (filename, file_type, content, chunk_count) VALUES (?,?,?,?)'
      ).run(filename, ext, content, chunks.length)

      const docId = docResult.lastInsertRowid
      const insertChunk = db.prepare(
        'INSERT INTO knowledge_chunks (doc_id, content, chunk_index) VALUES (?,?,?)'
      )

      chunks.forEach((chunk, i) => {
        insertChunk.run(docId, chunk, i)
      })

      uploaded.push(filename)
    }

    return uploaded
  })

  ipcMain.handle('knowledge-list', () => {
    return getDB().prepare('SELECT id, filename, file_type, chunk_count, created_at FROM knowledge_docs ORDER BY created_at DESC').all()
  })

  ipcMain.handle('knowledge-delete', (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    getDB().prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id)
  })

  ipcMain.handle('knowledge-search', (_e, query: string) => {
    if (typeof query !== 'string' || !query.trim()) throw new Error('参数无效: query')
    query = query.trim().slice(0, 1000)
    // Simple keyword search (no embedding for now)
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 1)
    if (keywords.length === 0) return []

    const db = getDB()
    const conditions = keywords.map(() => 'LOWER(kc.content) LIKE ?').join(' OR ')
    const params = keywords.map(kw => `%${kw}%`)
    const matchingChunks = db.prepare(
      `SELECT kc.*, kd.filename FROM knowledge_chunks kc JOIN knowledge_docs kd ON kc.doc_id = kd.id WHERE ${conditions}`
    ).all(...params) as KnowledgeChunkRow[]

    // Score chunks by keyword match frequency
    const scored = matchingChunks.map(chunk => {
      const text = chunk.content.toLowerCase()
      let score = 0
      for (const kw of keywords) {
        const matches = (text.match(new RegExp(escapeRegExp(kw), 'g')) || []).length
        score += matches
      }
      return { ...chunk, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 5)
  })
}

