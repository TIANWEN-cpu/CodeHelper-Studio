// ============================================================
// Memory Service
// 渲染层访问长期记忆相关 IPC：列表、增删、批量、按类别发送预览、LLM 抽取，
// 以及记忆相关的用户设置（按类别发送开关、LLM 抽取开关）。
// ============================================================

import { typedInvoke, invalidateCache } from '@/api/ipc'

export type MemoryCategory = 'fact' | 'preference' | 'identity' | 'tech' | 'constraint' | 'goal'

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'fact',
  'preference',
  'identity',
  'tech',
  'constraint',
  'goal',
]

/** 类别的中文标签，用于 UI 展示。 */
export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: '事实',
  preference: '偏好',
  identity: '身份',
  tech: '技术栈',
  constraint: '约束',
  goal: '目标',
}

export interface Memory {
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

export type BatchAction = 'enable' | 'disable' | 'pin' | 'unpin' | 'delete'

export async function listMemories(search?: string): Promise<Memory[]> {
  return typedInvoke<Memory[]>('chat-memories-list', search)
}

export async function saveMemory(memory: Partial<Memory> & { content: string }): Promise<Memory> {
  return typedInvoke<Memory>('chat-memory-save', memory)
}

export async function deleteMemory(id: number): Promise<void> {
  await typedInvoke('chat-memory-delete', id)
}

export async function batchMemories(ids: number[], action: BatchAction): Promise<number> {
  const res = await typedInvoke<{ affected: number }>('chat-memories-batch', { ids, action })
  return res.affected
}

/** 发送前预览：返回本轮会注入的记忆（按类别过滤），无副作用。 */
export async function previewContext(
  query: string,
  includeMemories: boolean,
  memoryCategories?: string[],
): Promise<{ memories: Memory[] }> {
  return typedInvoke<{ memories: Memory[] }>('chat-context-preview', {
    query,
    includeMemories,
    memoryCategories,
  })
}

/** mem0 式 LLM 抽取：从一条消息中抽取长期记忆并入库。 */
export async function extractMemory(
  content: string,
  configId?: number,
  sessionId?: string,
): Promise<Memory[]> {
  return typedInvoke<Memory[]>('chat-memory-extract', { content, configId, sessionId })
}

// --------------- Memory-related settings ---------------

const KEY_SEND_CATEGORIES = 'memory_send_categories'
const KEY_LLM_EXTRACT = 'memory_llm_extract'

async function getSetting(key: string): Promise<string | null> {
  return typedInvoke<string | null>('db-get-setting', key)
}

async function setSetting(key: string, value: string): Promise<void> {
  await typedInvoke('db-set-setting', key, value)
  invalidateCache('db-get-setting')
}

/** 读取允许发送给 AI 的记忆类别；未设置时默认全部允许。 */
export async function getSendCategories(): Promise<MemoryCategory[]> {
  const raw = await getSetting(KEY_SEND_CATEGORIES)
  if (!raw) return [...MEMORY_CATEGORIES]
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const allow = new Set<string>(MEMORY_CATEGORIES)
      return parsed.filter((c): c is MemoryCategory => typeof c === 'string' && allow.has(c))
    }
  } catch {
    /* 损坏则回退到全部允许 */
  }
  return [...MEMORY_CATEGORIES]
}

export async function setSendCategories(categories: MemoryCategory[]): Promise<void> {
  await setSetting(KEY_SEND_CATEGORIES, JSON.stringify(categories))
}

export async function getLlmExtractEnabled(): Promise<boolean> {
  return (await getSetting(KEY_LLM_EXTRACT)) === 'true'
}

export async function setLlmExtractEnabled(enabled: boolean): Promise<void> {
  await setSetting(KEY_LLM_EXTRACT, String(enabled))
}
