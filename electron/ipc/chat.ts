import { ipcMain } from 'electron'
import { getDB } from '../db/index'
import {
  BUILTIN_PRESETS,
  extractMemoryCandidates,
  rankMemories,
  normalizeForDedup,
} from '../utils/chatHelpers'
import { trackPerformance } from '../utils/perfMonitor'
import type { MemoryRow } from '../types/db'

// Re-export for ai.ts which imports getRelevantMemories
export type { MemoryRow }

interface MemoryInput {
  id?: number
  content: string
  category?: string
  source?: string
  source_ref?: string
  pinned?: number | boolean
  enabled?: number | boolean
  confidence?: number
}

export function registerChatIPC(): void {
  const presetCount = (
    getDB().prepare('SELECT COUNT(*) as c FROM prompt_presets WHERE is_builtin = 1').get() as {
      c: number
    }
  ).c
  if (presetCount === 0) {
    const stmt = getDB().prepare(
      'INSERT INTO prompt_presets (name, prompt, is_builtin) VALUES (?,?,1)',
    )
    for (const preset of BUILTIN_PRESETS) {
      stmt.run(preset.name, preset.prompt)
    }
  }

  ipcMain.handle('chat-sessions-list', () => {
    return getDB().prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all()
  })

  ipcMain.handle(
    'chat-session-create',
    (_e, args: { id: string; title?: string; system_prompt?: string }) => {
      if (!args || typeof args !== 'object') throw new Error('参数无效')
      if (typeof args.id !== 'string' || !args.id.trim()) throw new Error('参数无效: id')
      args.id = args.id.trim().slice(0, 200)
      if (args.title !== undefined) {
        if (typeof args.title !== 'string') throw new Error('参数无效: title')
        args.title = args.title.trim().slice(0, 500)
      }
      if (args.system_prompt !== undefined) {
        if (typeof args.system_prompt !== 'string') throw new Error('参数无效: system_prompt')
        args.system_prompt = args.system_prompt.slice(0, 10000)
      }
      getDB()
        .prepare('INSERT INTO chat_sessions (id, title, system_prompt) VALUES (?,?,?)')
        .run(args.id, args.title || '新对话', args.system_prompt || '')
      return getDB().prepare('SELECT * FROM chat_sessions WHERE id = ?').get(args.id)
    },
  )

  ipcMain.handle(
    'chat-session-update',
    (_e, id: string, updates: { title?: string; system_prompt?: string }) => {
      if (typeof id !== 'string' || !id.trim()) throw new Error('参数无效: id')
      if (!updates || typeof updates !== 'object') throw new Error('参数无效: updates')
      id = id.trim().slice(0, 200)
      if (updates.title !== undefined) {
        if (typeof updates.title !== 'string') throw new Error('参数无效: title')
        updates.title = updates.title.trim().slice(0, 500)
      }
      if (updates.system_prompt !== undefined) {
        if (typeof updates.system_prompt !== 'string') throw new Error('参数无效: system_prompt')
        updates.system_prompt = updates.system_prompt.slice(0, 10000)
      }
      if (updates.title !== undefined && updates.system_prompt !== undefined) {
        getDB()
          .prepare(
            'UPDATE chat_sessions SET title = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          )
          .run(updates.title, updates.system_prompt, id)
      } else if (updates.title !== undefined) {
        getDB()
          .prepare(
            'UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          )
          .run(updates.title, id)
      } else if (updates.system_prompt !== undefined) {
        getDB()
          .prepare(
            'UPDATE chat_sessions SET system_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          )
          .run(updates.system_prompt, id)
      }
    },
  )

  ipcMain.handle('chat-session-delete', (_e, id: string) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('参数无效: id')
    id = id.trim().slice(0, 200)
    getDB().prepare('DELETE FROM chat_history WHERE session_id = ?').run(id)
    getDB().prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
  })

  ipcMain.handle(
    'chat-messages-load',
    trackPerformance('chat-messages-load', (_e, sessionId: string) => {
      if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('参数无效: sessionId')
      sessionId = sessionId.trim().slice(0, 200)
      return getDB()
        .prepare('SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at ASC, id ASC')
        .all(sessionId)
    }),
  )

  ipcMain.handle(
    'chat-message-save',
    (_e, msg: { session_id: string; role: string; content: string; model?: string }) => {
      if (!msg || typeof msg !== 'object') throw new Error('参数无效')
      if (typeof msg.session_id !== 'string' || !msg.session_id.trim())
        throw new Error('参数无效: session_id')
      if (typeof msg.role !== 'string' || !['user', 'assistant', 'system'].includes(msg.role))
        throw new Error('参数无效: role')
      if (typeof msg.content !== 'string') throw new Error('参数无效: content')
      msg.session_id = msg.session_id.trim().slice(0, 200)
      msg.content = msg.content.slice(0, 100000)
      if (msg.model !== undefined) {
        if (typeof msg.model !== 'string') throw new Error('参数无效: model')
        msg.model = msg.model.trim().slice(0, 200)
      }
      getDB()
        .prepare('INSERT INTO chat_history (session_id, role, content, model) VALUES (?,?,?,?)')
        .run(msg.session_id, msg.role, msg.content, msg.model || null)
      getDB()
        .prepare('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(msg.session_id)
    },
  )

  ipcMain.handle('chat-presets-list', () => {
    return getDB().prepare('SELECT * FROM prompt_presets ORDER BY is_builtin DESC, id ASC').all()
  })

  ipcMain.handle(
    'chat-preset-save',
    (_e, preset: { id?: number; name: string; prompt: string }) => {
      if (!preset || typeof preset !== 'object') throw new Error('参数无效')
      if (typeof preset.name !== 'string' || !preset.name.trim()) throw new Error('参数无效: name')
      if (typeof preset.prompt !== 'string') throw new Error('参数无效: prompt')
      preset.name = preset.name.trim().slice(0, 200)
      preset.prompt = preset.prompt.slice(0, 10000)
      if (
        preset.id !== undefined &&
        (typeof preset.id !== 'number' || !Number.isFinite(preset.id) || preset.id < 1)
      )
        throw new Error('参数无效: id')
      if (preset.id) {
        getDB()
          .prepare('UPDATE prompt_presets SET name = ?, prompt = ? WHERE id = ? AND is_builtin = 0')
          .run(preset.name, preset.prompt, preset.id)
        return
      }
      getDB()
        .prepare('INSERT INTO prompt_presets (name, prompt) VALUES (?,?)')
        .run(preset.name, preset.prompt)
    },
  )

  ipcMain.handle('chat-preset-delete', (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    getDB().prepare('DELETE FROM prompt_presets WHERE id = ? AND is_builtin = 0').run(id)
  })

  ipcMain.handle(
    'chat-memories-list',
    trackPerformance('chat-memories-list', (_e, search?: string) => {
      if (search !== undefined && search !== null) {
        if (typeof search !== 'string') throw new Error('参数无效: search')
        search = search.slice(0, 500)
      }
      const rows = getDB()
        .prepare('SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC, id DESC')
        .all() as MemoryRow[]
      if (!search?.trim()) {
        return rows
      }
      const keyword = search.trim().toLowerCase()
      return rows.filter(
        (row) =>
          row.content.toLowerCase().includes(keyword) ||
          row.category.toLowerCase().includes(keyword),
      )
    }),
  )

  ipcMain.handle('chat-memory-save', (_e, memory: MemoryInput) => {
    if (!memory || typeof memory !== 'object') throw new Error('参数无效')
    if (typeof memory.content !== 'string' || !memory.content.trim())
      throw new Error('参数无效: content')
    memory.content = memory.content.trim().slice(0, 1000)
    if (
      memory.id !== undefined &&
      (typeof memory.id !== 'number' || !Number.isFinite(memory.id) || memory.id < 1)
    )
      throw new Error('参数无效: id')
    if (memory.category !== undefined) {
      if (typeof memory.category !== 'string') throw new Error('参数无效: category')
      memory.category = memory.category.trim().slice(0, 100)
    }
    if (memory.source !== undefined) {
      if (typeof memory.source !== 'string') throw new Error('参数无效: source')
      memory.source = memory.source.trim().slice(0, 100)
    }
    if (memory.source_ref !== undefined) {
      if (typeof memory.source_ref !== 'string') throw new Error('参数无效: source_ref')
      memory.source_ref = memory.source_ref.trim().slice(0, 500)
    }
    if (
      memory.confidence !== undefined &&
      (typeof memory.confidence !== 'number' || !Number.isFinite(memory.confidence))
    )
      throw new Error('参数无效: confidence')
    if (memory.id) {
      getDB()
        .prepare(
          `UPDATE memories
         SET content = ?, category = ?, pinned = ?, enabled = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        )
        .run(
          memory.content,
          memory.category ?? 'general',
          memory.pinned ? 1 : 0,
          memory.enabled === false ? 0 : 1,
          memory.confidence ?? 1,
          memory.id,
        )
      return getDB().prepare('SELECT * FROM memories WHERE id = ?').get(memory.id)
    }

    const existing = getDB()
      .prepare('SELECT * FROM memories WHERE lower(content) = lower(?) LIMIT 1')
      .get(memory.content) as MemoryRow | undefined
    if (existing) {
      getDB()
        .prepare(
          `UPDATE memories
         SET category = ?, pinned = ?, enabled = ?, confidence = ?, source = ?, source_ref = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        )
        .run(
          memory.category ?? existing.category,
          memory.pinned ? 1 : 0,
          memory.enabled === false ? 0 : 1,
          memory.confidence ?? existing.confidence ?? 1,
          memory.source ?? existing.source,
          memory.source_ref ?? existing.source_ref,
          existing.id,
        )
      return getDB().prepare('SELECT * FROM memories WHERE id = ?').get(existing.id)
    }

    const result = getDB()
      .prepare(
        'INSERT INTO memories (content, category, source, source_ref, pinned, enabled, confidence) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        memory.content,
        memory.category ?? 'general',
        memory.source ?? 'manual',
        memory.source_ref ?? null,
        memory.pinned ? 1 : 0,
        memory.enabled === false ? 0 : 1,
        memory.confidence ?? 1,
      )
    return getDB().prepare('SELECT * FROM memories WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('chat-memory-delete', (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    getDB().prepare('DELETE FROM memories WHERE id = ?').run(id)
  })

  ipcMain.handle('chat-memory-capture', (_e, args: { content: string; session_id?: string }) => {
    if (!args || typeof args !== 'object') throw new Error('参数无效')
    if (typeof args.content !== 'string' || !args.content.trim())
      throw new Error('参数无效: content')
    args.content = args.content.trim().slice(0, 10000)
    if (args.session_id !== undefined) {
      if (typeof args.session_id !== 'string') throw new Error('参数无效: session_id')
      args.session_id = args.session_id.trim().slice(0, 200)
    }
    return captureMemoriesFromMessage(args.content, args.session_id)
  })
}

export function getRelevantMemories(query: string, limit = 6): MemoryRow[] {
  const db = getDB()
  const rows = db.prepare('SELECT * FROM memories WHERE enabled = 1').all() as MemoryRow[]
  return rankMemories(rows, query, Date.now(), limit)
}

export function markMemoriesUsed(ids: number[]): void {
  if (ids.length === 0) return
  const db = getDB()
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE memories SET last_used_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
  ).run(...ids)
}

export function captureMemoriesFromMessage(content: string, sessionId?: string): MemoryRow[] {
  const candidates = extractMemoryCandidates(content)
  if (candidates.length === 0) return []

  const db = getDB()
  const saved: MemoryRow[] = []

  // 取现有记忆，按归一化内容建索引，用于近似去重（避免 "我喜欢Python" / "我喜欢 python。" 重复入库）。
  const existingRows = db.prepare('SELECT id, content FROM memories').all() as Array<{
    id: number
    content: string
  }>
  const normIndex = new Map<string, number>()
  for (const row of existingRows) {
    if (!row || typeof row.content !== 'string') continue
    const norm = normalizeForDedup(row.content)
    if (norm) normIndex.set(norm, row.id)
  }

  for (const candidate of candidates) {
    const norm = normalizeForDedup(candidate.content)
    const existingId = norm ? normIndex.get(norm) : undefined

    if (existingId !== undefined) {
      db.prepare(
        'UPDATE memories SET category = ?, source = ?, source_ref = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).run(candidate.category, 'chat', sessionId ?? null, existingId)
      saved.push(db.prepare('SELECT * FROM memories WHERE id = ?').get(existingId) as MemoryRow)
      continue
    }

    const result = db
      .prepare(
        'INSERT INTO memories (content, category, source, source_ref, confidence) VALUES (?,?,?,?,?)',
      )
      .run(candidate.content, candidate.category, 'chat', sessionId ?? null, 0.85)
    if (norm) normIndex.set(norm, Number(result.lastInsertRowid))
    saved.push(
      db.prepare('SELECT * FROM memories WHERE id = ?').get(result.lastInsertRowid) as MemoryRow,
    )
  }

  pruneAutoMemories(db)
  return saved
}

/** 自动捕获记忆的数量上限：超出后按 置信度→新近度 保留前 N 条，修剪其余非置顶项。 */
const MAX_AUTO_MEMORIES = 200

/** 防止聊天自动记忆无限增长：仅修剪 source='chat' 且未置顶的记忆，置顶/手动记忆永不删除。 */
function pruneAutoMemories(db: ReturnType<typeof getDB>): void {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM memories WHERE source = 'chat' AND pinned = 0")
    .get() as { c: number } | undefined
  const count = row?.c ?? 0
  if (count <= MAX_AUTO_MEMORIES) return
  db.prepare(
    `DELETE FROM memories WHERE id IN (
       SELECT id FROM memories
       WHERE source = 'chat' AND pinned = 0
       ORDER BY confidence DESC, COALESCE(last_used_at, created_at) DESC, id DESC
       LIMIT -1 OFFSET ?
     )`,
  ).run(MAX_AUTO_MEMORIES)
}
