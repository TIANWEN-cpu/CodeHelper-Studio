/**
 * Demo data loading IPC handler.
 *
 * Reads sample-problems.json and sample-chat-history.json from the
 * resources/demo/ directory and inserts them into the SQLite database.
 * Also copies knowledge markdown files into the knowledge base.
 */

import { ipcMain } from 'electron'
import { getDB } from '../db/index'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/** Resolve the demo data directory, supporting both dev and packaged builds. */
function getDemoDir(): string {
  const candidates = [
    join(process.resourcesPath, 'demo'), // packaged: extraResources
    join(__dirname, '../../resources/demo'), // dev: source
    join(__dirname, '../resources/demo'), // fallback
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[1] // default to dev path
}

/** Load demo problems from sample-problems.json into the problems table. */
function loadDemoProblems(): number {
  const demoDir = getDemoDir()
  const filePath = join(demoDir, 'sample-problems.json')
  if (!existsSync(filePath)) {
    throw new Error(`Demo problems file not found: ${filePath}`)
  }

  const problems = JSON.parse(readFileSync(filePath, 'utf-8')) as Array<Record<string, unknown>>
  const db = getDB()

  // Check which demo problems already exist (by title + source)
  const existing = new Set(
    (
      db.prepare("SELECT title FROM problems WHERE source = 'demo'").all() as Array<{
        title: string
      }>
    ).map((r) => r.title),
  )

  const stmt = db.prepare(`
    INSERT INTO problems (title, description, difficulty, tags, languages, examples,
      test_cases, starter_code, source, tracks, platform, mode, estimated_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let inserted = 0
  const insertMany = db.transaction(() => {
    for (const p of problems) {
      if (existing.has(p.title as string)) continue
      stmt.run(
        p.title,
        p.description,
        p.difficulty,
        p.tags ?? '[]',
        p.languages ?? '["python"]',
        p.examples ?? '[]',
        p.test_cases ?? '[]',
        p.starter_code ?? '{}',
        p.source ?? 'demo',
        p.tracks ?? '[]',
        p.platform ?? 'leetcode',
        p.mode ?? 'oj',
        p.estimated_time ?? null,
      )
      inserted++
    }
  })
  insertMany()

  return inserted
}

/** Load demo knowledge markdown files into the knowledge base. */
function loadDemoKnowledge(): number {
  const demoDir = getDemoDir()
  const knowledgeDir = join(demoDir, 'sample-knowledge')
  if (!existsSync(knowledgeDir)) {
    return 0
  }

  const db = getDB()
  const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'))

  // Check which demo knowledge files already exist
  const existing = new Set(
    (db.prepare('SELECT filename FROM knowledge_docs').all() as Array<{ filename: string }>).map(
      (r) => r.filename,
    ),
  )

  let inserted = 0
  const insertMany = db.transaction(() => {
    for (const file of files) {
      if (existing.has(file)) continue

      const content = readFileSync(join(knowledgeDir, file), 'utf-8')
      const chunkSize = 1500
      const chunks: string[] = []
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize))
      }

      const docResult = db
        .prepare(
          'INSERT INTO knowledge_docs (filename, file_type, content, chunk_count) VALUES (?,?,?,?)',
        )
        .run(file, 'md', content, chunks.length)

      const chunkStmt = db.prepare(
        'INSERT INTO knowledge_chunks (doc_id, content, chunk_index) VALUES (?,?,?)',
      )
      for (let i = 0; i < chunks.length; i++) {
        chunkStmt.run(docResult.lastInsertRowid, chunks[i], i)
      }
      inserted++
    }
  })
  insertMany()

  return inserted
}

/** Load demo chat sessions, messages, memories, and presets from sample-chat-history.json. */
function loadDemoChatHistory(): {
  sessions: number
  messages: number
  memories: number
  presets: number
} {
  const demoDir = getDemoDir()
  const filePath = join(demoDir, 'sample-chat-history.json')
  if (!existsSync(filePath)) {
    return { sessions: 0, messages: 0, memories: 0, presets: 0 }
  }

  const data = JSON.parse(readFileSync(filePath, 'utf-8')) as {
    sessions?: Array<{
      id: string
      title: string
      system_prompt: string
      created_at: string
      updated_at: string
      messages: Array<{ role: string; content: string; timestamp: number }>
    }>
    memories?: Array<{
      content: string
      category: string
      source: string
      pinned: number
      enabled: number
      confidence: number
      created_at: string
    }>
    presets?: Array<{
      name: string
      prompt: string
      is_builtin: number
    }>
  }

  const db = getDB()

  // Check existing demo sessions
  const existingSessions = new Set(
    (
      db.prepare("SELECT id FROM chat_sessions WHERE id LIKE 'demo-session-%'").all() as Array<{
        id: string
      }>
    ).map((r) => r.id),
  )

  let sessionCount = 0
  let messageCount = 0
  let memoryCount = 0
  let presetCount = 0

  const insertAll = db.transaction(() => {
    // Insert sessions and messages
    for (const session of data.sessions ?? []) {
      if (existingSessions.has(session.id)) continue

      db.prepare(
        'INSERT INTO chat_sessions (id, title, system_prompt, created_at, updated_at) VALUES (?,?,?,?,?)',
      ).run(
        session.id,
        session.title,
        session.system_prompt,
        session.created_at,
        session.updated_at,
      )
      sessionCount++

      for (const msg of session.messages ?? []) {
        db.prepare('INSERT INTO chat_history (session_id, role, content) VALUES (?,?,?)').run(
          session.id,
          msg.role,
          msg.content,
        )
        messageCount++
      }
    }

    // Insert memories (skip duplicates by content)
    const existingMemories = new Set(
      (db.prepare('SELECT content FROM memories').all() as Array<{ content: string }>).map(
        (r) => r.content,
      ),
    )

    for (const mem of data.memories ?? []) {
      if (existingMemories.has(mem.content)) continue
      db.prepare(
        'INSERT INTO memories (content, category, source, pinned, enabled, confidence, created_at) VALUES (?,?,?,?,?,?,?)',
      ).run(
        mem.content,
        mem.category,
        mem.source,
        mem.pinned,
        mem.enabled,
        mem.confidence,
        mem.created_at,
      )
      memoryCount++
    }

    // Insert presets (skip builtin ones that already exist)
    const existingPresets = new Set(
      (db.prepare('SELECT name FROM prompt_presets').all() as Array<{ name: string }>).map(
        (r) => r.name,
      ),
    )

    for (const preset of data.presets ?? []) {
      if (existingPresets.has(preset.name)) continue
      db.prepare('INSERT INTO prompt_presets (name, prompt, is_builtin) VALUES (?,?,?)').run(
        preset.name,
        preset.prompt,
        preset.is_builtin ?? 0,
      )
      presetCount++
    }
  })
  insertAll()

  return {
    sessions: sessionCount,
    messages: messageCount,
    memories: memoryCount,
    presets: presetCount,
  }
}

export interface DemoLoadResult {
  problems: number
  knowledge: number
  sessions: number
  messages: number
  memories: number
  presets: number
}

export function registerDemoDataIPC(): void {
  ipcMain.handle('demo-load-data', (): DemoLoadResult => {
    const problems = loadDemoProblems()
    const knowledge = loadDemoKnowledge()
    const chat = loadDemoChatHistory()
    return {
      problems,
      knowledge,
      ...chat,
    }
  })
}
