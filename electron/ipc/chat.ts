import { ipcMain } from 'electron'
import { getDB } from '../db/index'

const BUILTIN_PRESETS = [
  { name: '通用助手', prompt: '你是一个友好的AI助手，请用中文回答问题。' },
  {
    name: '代码专家',
    prompt: '你是一个资深编程专家，擅长代码审查、调试和优化。请用中文回答，给出代码时附带注释。',
  },
  {
    name: '面试官',
    prompt:
      '你是一个技术面试官，会针对编程和算法提出问题，评估回答质量，并给出改进建议。请用中文交流。',
  },
  {
    name: '学习导师',
    prompt:
      '你是一个耐心的编程学习导师，善于用简单的语言解释复杂概念，会循序渐进地引导学习。请用中文教学。',
  },
]

export interface MemoryRow {
  id: number
  content: string
  category: string
  source: string
  source_ref: string | null
  pinned: number
  enabled: number
  confidence: number
  created_at: string
  updated_at: string
  last_used_at: string | null
}

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

export function registerChatIPC() {
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
      if (updates.title !== undefined) {
        getDB()
          .prepare(
            'UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          )
          .run(updates.title, id)
      }
      if (updates.system_prompt !== undefined) {
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

  ipcMain.handle('chat-messages-load', (_e, sessionId: string) => {
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('参数无效: sessionId')
    sessionId = sessionId.trim().slice(0, 200)
    return getDB()
      .prepare('SELECT * FROM chat_history WHERE session_id = ? ORDER BY created_at ASC, id ASC')
      .all(sessionId)
  })

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

  ipcMain.handle('chat-memories-list', (_e, search?: string) => {
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
        row.content.toLowerCase().includes(keyword) || row.category.toLowerCase().includes(keyword),
    )
  })

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

export function getRelevantMemories(query: string, limit = 6) {
  const db = getDB()
  const rows = db.prepare('SELECT * FROM memories WHERE enabled = 1').all() as MemoryRow[]
  const terms = buildSearchTerms(query)

  const scored = rows
    .map((row) => {
      let score = row.pinned ? 50 : 0
      const content = row.content.toLowerCase()

      for (const term of terms) {
        if (content.includes(term)) {
          score += Math.max(2, term.length)
        }
      }

      if (
        query &&
        (content.includes(query.toLowerCase()) || query.toLowerCase().includes(content))
      ) {
        score += 20
      }

      if (!score && row.pinned) {
        score = 1
      }

      return { row, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.row.id - a.row.id)

  if (scored.length > 0) {
    return scored.slice(0, limit).map((item) => item.row)
  }

  return rows
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.id - a.id)
    .slice(0, Math.min(limit, 3))
}

export function markMemoriesUsed(ids: number[]) {
  if (ids.length === 0) return
  const db = getDB()
  const stmt = db.prepare('UPDATE memories SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
  for (const id of ids) {
    stmt.run(id)
  }
}

export function captureMemoriesFromMessage(content: string, sessionId?: string) {
  const candidates = extractMemoryCandidates(content)
  const saved: MemoryRow[] = []
  const db = getDB()

  for (const candidate of candidates) {
    const existing = db
      .prepare('SELECT * FROM memories WHERE lower(content) = lower(?) LIMIT 1')
      .get(candidate.content) as MemoryRow | undefined

    if (existing) {
      db.prepare(
        'UPDATE memories SET category = ?, source = ?, source_ref = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).run(candidate.category, 'chat', sessionId ?? null, existing.id)
      saved.push(db.prepare('SELECT * FROM memories WHERE id = ?').get(existing.id) as MemoryRow)
      continue
    }

    const result = db
      .prepare(
        'INSERT INTO memories (content, category, source, source_ref, confidence) VALUES (?,?,?,?,?)',
      )
      .run(candidate.content, candidate.category, 'chat', sessionId ?? null, 0.85)
    saved.push(
      db.prepare('SELECT * FROM memories WHERE id = ?').get(result.lastInsertRowid) as MemoryRow,
    )
  }

  return saved
}

function extractMemoryCandidates(message: string) {
  const text = message.trim()
  const patterns: Array<{ regex: RegExp; category: string }> = [
    { regex: /^(?:请|帮我)?记住[:：\s]*(.+)$/i, category: 'fact' },
    { regex: /^(?:请|帮我)?记一下[:：\s]*(.+)$/i, category: 'fact' },
    { regex: /^(?:以后|后面)(.+)$/i, category: 'preference' },
  ]

  return patterns
    .map(({ regex, category }) => {
      const matched = text.match(regex)?.[1]?.trim()
      if (!matched || matched.length < 2) return null
      return { content: matched.slice(0, 300), category }
    })
    .filter((item): item is { content: string; category: string } => Boolean(item))
}

function buildSearchTerms(query: string) {
  const normalized = query.trim().toLowerCase()
  const terms = new Set<string>()

  normalized
    .split(/[\s,，。！？!?:：;；()[\]{}"'`]+/)
    .filter((item) => item.length >= 2)
    .forEach((item) => terms.add(item))

  const compact = normalized.replace(/\s+/g, '')
  if (compact.length >= 2) {
    terms.add(compact.slice(0, Math.min(compact.length, 12)))
  }

  return [...terms]
}
