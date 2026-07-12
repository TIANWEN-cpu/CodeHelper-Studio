import { ipcMain } from 'electron'
import { getDB } from '../db/index'
import {
  BUILTIN_PRESETS,
  extractMemoryCandidates,
  rankMemories,
  normalizeForDedup,
  normalizeCategory,
  MEMORY_CATEGORIES,
} from '../utils/chatHelpers'
import { trackPerformance } from '../utils/perfMonitor'
import { resolveAllowedProviderTarget } from '../utils/providerSecurity'
import { fetchResolvedProvider } from '../utils/providerFetch'
import {
  discardResponseBody,
  friendlyUpstreamError,
  redirectBlockedError,
  isRedirect,
} from '../utils/httpErrors'
import type { MemoryRow, AIConfigForChat } from '../types/db'
import { decryptApiKey } from '../utils/apiKeyStorage'

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

  // 发送前预览：返回本轮将注入的记忆（按类别过滤），不更新 last_used、不发起任何请求。
  ipcMain.handle(
    'chat-context-preview',
    (
      _e,
      args: { query?: string; includeMemories?: boolean; memoryCategories?: string[] },
    ): { memories: MemoryRow[] } => {
      if (!args || typeof args !== 'object') throw new Error('参数无效')
      const query = typeof args.query === 'string' ? args.query.slice(0, 2000) : ''
      if (args.includeMemories === false) return { memories: [] }
      const categories = sanitizeCategories(args.memoryCategories)
      return { memories: getRelevantMemories(query, 6, categories) }
    },
  )

  // 批量管理：启用/停用/置顶/取消置顶/删除。
  ipcMain.handle(
    'chat-memories-batch',
    (_e, args: { ids: number[]; action: string }): { affected: number } => {
      if (!args || typeof args !== 'object') throw new Error('参数无效')
      if (!Array.isArray(args.ids) || args.ids.length === 0) throw new Error('参数无效: ids')
      if (args.ids.length > 1000) throw new Error('数量超限')
      const ids = args.ids.map((id) => {
        if (typeof id !== 'number' || !Number.isFinite(id) || id < 1)
          throw new Error('参数无效: ids')
        return id
      })
      const actions: Record<string, string> = {
        enable: 'UPDATE memories SET enabled = 1, updated_at = CURRENT_TIMESTAMP',
        disable: 'UPDATE memories SET enabled = 0, updated_at = CURRENT_TIMESTAMP',
        pin: 'UPDATE memories SET pinned = 1, updated_at = CURRENT_TIMESTAMP',
        unpin: 'UPDATE memories SET pinned = 0, updated_at = CURRENT_TIMESTAMP',
        delete: 'DELETE FROM memories',
      }
      const sqlHead = actions[args.action]
      if (!sqlHead) throw new Error('参数无效: action')
      const db = getDB()
      const placeholders = ids.map(() => '?').join(',')
      const run = db.transaction(() => {
        db.prepare(`${sqlHead} WHERE id IN (${placeholders})`).run(...ids)
      })
      run()
      return { affected: ids.length }
    },
  )

  // mem0 式 LLM 抽取：调用已配置的 Provider，从消息中智能抽取长期记忆（含去重合并）。
  ipcMain.handle(
    'chat-memory-extract',
    async (
      _e,
      args: { content: string; configId?: number; sessionId?: string },
    ): Promise<MemoryRow[]> => {
      if (!args || typeof args !== 'object') throw new Error('参数无效')
      if (typeof args.content !== 'string' || !args.content.trim())
        throw new Error('参数无效: content')
      const content = args.content.trim().slice(0, 10000)
      let sessionId: string | undefined
      if (args.sessionId !== undefined) {
        if (typeof args.sessionId !== 'string') throw new Error('参数无效: sessionId')
        sessionId = args.sessionId.trim().slice(0, 200)
      }
      if (
        args.configId !== undefined &&
        (typeof args.configId !== 'number' || !Number.isFinite(args.configId) || args.configId < 1)
      )
        throw new Error('参数无效: configId')

      const candidates = await extractMemoriesViaLLM(content, args.configId)
      return persistMemoryCandidates(candidates, 'chat-llm', sessionId, 0.9)
    },
  )
}

/** 过滤出合法记忆类别；输入非数组返回 undefined（表示不限类别）。 */
function sanitizeCategories(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const allow = new Set<string>(MEMORY_CATEGORIES)
  return value.filter((item): item is string => typeof item === 'string' && allow.has(item))
}

export function getRelevantMemories(
  query: string,
  limit = 6,
  allowedCategories?: string[],
): MemoryRow[] {
  const db = getDB()
  let rows = db.prepare('SELECT * FROM memories WHERE enabled = 1').all() as MemoryRow[]
  // allowedCategories 为 undefined 表示不限类别；为数组（含空数组）则仅保留这些类别。
  if (allowedCategories) {
    const allow = new Set(allowedCategories)
    rows = rows.filter((row) => allow.has(row.category))
  }
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
  return persistMemoryCandidates(extractMemoryCandidates(content), 'chat', sessionId, 0.85)
}

/**
 * 把一组记忆候选写入库：归一化近似去重（命中则更新并启用），否则插入；最后做上限修剪。
 * 供正则捕获（captureMemoriesFromMessage）与 LLM 抽取（chat-memory-extract）共用。
 */
function persistMemoryCandidates(
  candidates: Array<{ content: string; category: string }>,
  source: string,
  sessionId?: string,
  confidence = 0.85,
): MemoryRow[] {
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
      ).run(candidate.category, source, sessionId ?? null, existingId)
      saved.push(db.prepare('SELECT * FROM memories WHERE id = ?').get(existingId) as MemoryRow)
      continue
    }

    const result = db
      .prepare(
        'INSERT INTO memories (content, category, source, source_ref, confidence) VALUES (?,?,?,?,?)',
      )
      .run(candidate.content, candidate.category, source, sessionId ?? null, confidence)
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

/** 防止自动记忆无限增长：仅修剪 source 为 'chat'/'chat-llm' 且未置顶的记忆，置顶/手动记忆永不删除。 */
function pruneAutoMemories(db: ReturnType<typeof getDB>): void {
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM memories WHERE source IN ('chat', 'chat-llm') AND pinned = 0",
    )
    .get() as { c: number } | undefined
  const count = row?.c ?? 0
  if (count <= MAX_AUTO_MEMORIES) return
  db.prepare(
    `DELETE FROM memories WHERE id IN (
       SELECT id FROM memories
       WHERE source IN ('chat', 'chat-llm') AND pinned = 0
       ORDER BY confidence DESC, COALESCE(last_used_at, created_at) DESC, id DESC
       LIMIT -1 OFFSET ?
     )`,
  ).run(MAX_AUTO_MEMORIES)
}

/** 读取用于记忆抽取的 AI 配置（指定 id 或默认/首个）。 */
function getConfigForExtraction(configId?: number): AIConfigForChat | undefined {
  const db = getDB()
  if (configId) {
    const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(configId) as
      | AIConfigForChat
      | undefined
    return config ? { ...config, api_key: decryptApiKey(config.api_key) } : undefined
  }
  const config = (db.prepare('SELECT * FROM ai_configs WHERE is_default = 1').get() ??
    db.prepare('SELECT * FROM ai_configs LIMIT 1').get()) as AIConfigForChat | undefined
  return config ? { ...config, api_key: decryptApiKey(config.api_key) } : undefined
}

const EXTRACTION_SYSTEM_PROMPT = `你是一个记忆抽取器。从用户消息中抽取值得长期记住的稳定信息（身份、长期偏好、技术栈、对助手的约束、学习目标、确定的事实）。
只输出一个 JSON 数组，每个元素形如 {"content": string, "category": "fact"|"preference"|"identity"|"tech"|"constraint"|"goal"}。
忽略一次性问题、闲聊、临时上下文。没有可记的内容时输出 []。不要输出 JSON 以外的任何文字。`

/** 从模型返回文本中提取第一个 JSON 数组并解析为记忆候选。 */
export function parseExtractedMemories(text: string): Array<{ content: string; category: string }> {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  const out: Array<{ content: string; category: string }> = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const raw = (item as { content?: unknown }).content
    if (typeof raw !== 'string') continue
    const content = raw.trim().slice(0, 300)
    if (content.length < 2) continue
    const key = content.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ content, category: normalizeCategory((item as { category?: unknown }).category) })
    if (out.length >= 8) break
  }
  return out
}

/** 调用 Provider 的非流式 chat completions 抽取记忆候选；复用出站安全校验与错误脱敏。 */
async function extractMemoriesViaLLM(
  content: string,
  configId?: number,
): Promise<Array<{ content: string; category: string }>> {
  const config = getConfigForExtraction(configId)
  if (!config) throw new Error('未配置AI模型，请先在设置中添加')
  if (!config.api_key) throw new Error('API key could not be decrypted')

  const provider = await resolveAllowedProviderTarget(config.base_url)
  const requestTarget = { ...provider, url: `${provider.url}/chat/completions` }
  let response: Response
  try {
    response = await fetchResolvedProvider(requestTarget, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        stream: false,
        temperature: 0,
      }),
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('abort') || msg.includes('timeout')) throw new Error('记忆抽取超时')
    console.warn('[memory] extract fetch failed:', msg)
    throw new Error('网络连接失败，请检查网络或 Base URL')
  }

  if (isRedirect(response.status)) {
    await discardResponseBody(response)
    throw redirectBlockedError('chat')
  }
  if (!response.ok) {
    await discardResponseBody(response)
    console.warn(`[memory] extract upstream error ${response.status}`)
    throw new Error(friendlyUpstreamError(response.status, 'chat'))
  }

  const json = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const text = json?.choices?.[0]?.message?.content ?? ''
  return parseExtractedMemories(text)
}
