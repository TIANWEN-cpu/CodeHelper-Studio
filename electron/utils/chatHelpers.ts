/**
 * Pure helper functions extracted from chat IPC for testability.
 * These functions have zero Electron/Node dependencies.
 */

/** 记忆类别，用于分类展示与（未来的）按类发送控制。 */
export type MemoryCategory = 'fact' | 'preference' | 'identity' | 'tech' | 'constraint' | 'goal'

/** 全部记忆类别，供校验与 UI 枚举使用。 */
export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'fact',
  'preference',
  'identity',
  'tech',
  'constraint',
  'goal',
]

/** 将任意字符串规整为合法记忆类别，未知值归入 'fact'。 */
export function normalizeCategory(value: unknown): MemoryCategory {
  return typeof value === 'string' && (MEMORY_CATEGORIES as string[]).includes(value)
    ? (value as MemoryCategory)
    : 'fact'
}

/** 去掉捕获内容尾部的标点与空白，避免存入 "...回答。" 这类噪声。 */
function trimTrailingPunctuation(value: string): string {
  return value.replace(/[。.!！?？,，;；、\s]+$/u, '').trim()
}

/**
 * 从用户消息中抽取值得长期记忆的候选片段。
 * 采用一组锚定第一人称/祈使句的正则，覆盖事实、偏好、身份、技术栈、约束、目标六类，
 * 兼顾中英文。只在消息以明确记忆信号开头时触发，避免把普通提问误存为记忆。
 */
export function extractMemoryCandidates(
  message: string,
): Array<{ content: string; category: MemoryCategory }> {
  const text = message.trim()
  const patterns: Array<{ regex: RegExp; category: MemoryCategory }> = [
    // 显式记忆指令
    { regex: /^(?:请|帮我)?记住[:：\s]*(.+)$/i, category: 'fact' },
    { regex: /^(?:请|帮我)?记一下[:：\s]*(.+)$/i, category: 'fact' },
    { regex: /^(?:请)?记得[:：\s]*(.+)$/i, category: 'fact' },
    { regex: /^remember(?:\s+that)?[:\s]+(.+)$/i, category: 'fact' },
    // 偏好（含"以后/后面"沿用历史语义）
    { regex: /^(?:以后|后面|今后)(.+)$/i, category: 'preference' },
    { regex: /^我(?:比较|更|最)?(?:喜欢|偏好|倾向于?|习惯)\s*(.+)$/i, category: 'preference' },
    { regex: /^i\s+(?:prefer|like|usually)\s+(.+)$/i, category: 'preference' },
    // 身份
    { regex: /^我(?:叫|的名字(?:是|叫))\s*(.+)$/i, category: 'identity' },
    { regex: /^我是(?:一名|一个|个)?\s*(.+)$/i, category: 'identity' },
    { regex: /^my\s+name\s+is\s+(.+)$/i, category: 'identity' },
    // 技术栈
    { regex: /^我(?:目前|现在|平时)?(?:在|正在)?用(?:的是)?\s*(.+)$/i, category: 'tech' },
    { regex: /^(?:我的)?(?:技术栈|项目)(?:是|用的?是?|用)\s*(.+)$/i, category: 'tech' },
    { regex: /^i(?:'m| am)?\s+using\s+(.+)$/i, category: 'tech' },
    // 约束（对助手的禁止/要求）
    { regex: /^(?:请不要|不要再?|别再?|千万别)\s*(.+)$/i, category: 'constraint' },
    { regex: /^(?:don'?t|do not|never)\s+(.+)$/i, category: 'constraint' },
    // 目标
    { regex: /^我(?:的目标是|想学|要学|打算学|准备学|正在学)\s*(.+)$/i, category: 'goal' },
  ]

  const seen = new Set<string>()
  const candidates: Array<{ content: string; category: MemoryCategory }> = []
  for (const { regex, category } of patterns) {
    const matched = text.match(regex)?.[1]
    if (!matched) continue
    const content = trimTrailingPunctuation(matched).slice(0, 300)
    if (content.length < 2) continue
    const key = content.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ content, category })
    if (candidates.length >= 3) break // 单条消息最多抽取 3 条，避免刷屏
  }
  return candidates
}

export function buildSearchTerms(query: string): string[] {
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

// --------------- Memory ranking (relevance + recency + importance) ---------------
// 借鉴 Stanford Generative Agents 的检索打分：score = 相关性 + 新近度 + 重要性，
// 让"最近用过/置信度高"的记忆更易被召回，且全程本地计算、无需额外 LLM 调用。

/** 可参与排序的记忆最小字段集。 */
export interface ScorableMemory {
  id: number
  content: string
  pinned?: number | boolean | null
  confidence?: number | null
  created_at?: string | null
  last_used_at?: string | null
}

/** 解析 SQLite 的 'YYYY-MM-DD HH:MM:SS'（UTC）时间戳为毫秒；无效返回 NaN。 */
export function parseSqliteTime(value?: string | null): number {
  if (!value) return NaN
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const withZone = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`
  return Date.parse(withZone)
}

/** 指数时间衰减：当前时刻为 1，每过约 1 小时乘以 0.99（约一周后衰减到 ~0.18）。 */
export function recencyWeight(timestampMs: number, nowMs: number): number {
  if (!Number.isFinite(timestampMs)) return 0
  const hours = Math.max(0, (nowMs - timestampMs) / 3_600_000)
  return Math.pow(0.99, hours)
}

/**
 * 归一化记忆内容用于近似去重：转小写并去除所有空白、标点与符号（含中文标点）。
 * 例如 "我喜欢 Python。" 与 "我喜欢python" 归一化后相同。
 */
export function normalizeForDedup(content: string): string {
  return content.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

const REL_WEIGHT_RECENCY = 4
const REL_WEIGHT_IMPORTANCE = 3
const PINNED_BOOST = 50

/** 计算单条记忆相对查询的关键词相关性（与历史口径一致）。 */
export function memoryRelevance(content: string, terms: string[], query: string): number {
  const lower = content.toLowerCase()
  let relevance = 0
  for (const term of terms) {
    if (lower.includes(term)) relevance += Math.max(2, term.length)
  }
  const q = query.trim().toLowerCase()
  if (q && (lower.includes(q) || q.includes(lower))) relevance += 20
  return relevance
}

/**
 * 对记忆按"相关性 + 新近度 + 重要性 + 置顶"综合排序，返回前 limit 条。
 * 仅当某条记忆有关键词相关性或被置顶时才视为"命中"；全部未命中时回退到
 * 置顶/最近的少量核心记忆（最多 3 条），与历史行为保持一致。
 */
export function rankMemories<T extends ScorableMemory>(
  rows: T[],
  query: string,
  nowMs: number,
  limit = 6,
): T[] {
  const terms = buildSearchTerms(query)

  const scored = rows.map((row) => {
    const relevance = memoryRelevance(row.content, terms, query)
    const pinned = Boolean(row.pinned)
    const importance = Math.min(1, Math.max(0, row.confidence ?? 1))
    const recency = recencyWeight(parseSqliteTime(row.last_used_at ?? row.created_at), nowMs)
    const score =
      relevance +
      (pinned ? PINNED_BOOST : 0) +
      REL_WEIGHT_RECENCY * recency +
      REL_WEIGHT_IMPORTANCE * importance
    return { row, relevance, pinned, recency, score }
  })

  const hits = scored.filter((item) => item.relevance > 0 || item.pinned)
  if (hits.length > 0) {
    hits.sort((a, b) => b.score - a.score || b.row.id - a.row.id)
    return hits.slice(0, limit).map((item) => item.row)
  }

  return [...scored]
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.recency - a.recency || b.row.id - a.row.id,
    )
    .slice(0, Math.min(limit, 3))
    .map((item) => item.row)
}

export const BUILTIN_PRESETS = [
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
