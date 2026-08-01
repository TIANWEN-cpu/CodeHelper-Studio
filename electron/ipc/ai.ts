import { ipcMain, BrowserWindow } from 'electron'
import { withMiddleware, rateLimitMiddleware } from '../utils/middleware'
import { getDB } from '../db/index'
import { getRelevantMemories, markMemoriesUsed } from './chat'
import { resolveAllowedProviderTarget } from '../utils/providerSecurity'
import { fetchResolvedProvider } from '../utils/providerFetch'
import {
  discardResponseBody,
  friendlyUpstreamError,
  redirectBlockedError,
  isRedirect,
} from '../utils/httpErrors'
import type { AIConfigForChat, ChatMessage } from '../types/db'
import { decryptApiKey } from '../utils/apiKeyStorage'

// ---------------------------------------------------------------------------
// 并发上限：ai-chat 是长连接流式请求（最多 120s），多个请求同时占用
// Provider 连接会打爆上游。渲染层已串行化发送，这里兜底：超过 3 个并发
// 直接拒绝，避免排队导致更长的悬挂。
// ---------------------------------------------------------------------------
const MAX_CONCURRENT_AI_CHAT = 3
let activeAiChatCount = 0

function acquireAiChatSlot(): void {
  if (activeAiChatCount >= MAX_CONCURRENT_AI_CHAT) {
    throw new Error('同时进行的 AI 请求过多，请稍后再试')
  }
  activeAiChatCount += 1
}

function releaseAiChatSlot(): void {
  activeAiChatCount = Math.max(0, activeAiChatCount - 1)
}

// 流式 chunk 批量下发间隔：把每行 SSE 一条 IPC 收敛为 ~20 条/秒，
// 渲染端 markdown 重渲染与 scrollIntoView 随之降到可接受频率。
const CHUNK_FLUSH_INTERVAL_MS = 50

export function parseSseContentLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const data = trimmed.slice(5).trimStart()
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data)
    const content = parsed.choices?.[0]?.delta?.content
    return typeof content === 'string' && content ? content : null
  } catch {
    console.debug('[ai] Skipping malformed SSE chunk:', data.slice(0, 100))
    return null
  }
}

export function registerAIIPC(): void {
  const activeRequests = new Map<string, AbortController>()
  let firstCall = true

  ipcMain.handle(
    'ai-chat',
    withMiddleware(
      'ai-chat',
      async (event, ...rest: unknown[]) => {
        const args = rest[0] as {
          messages: ChatMessage[]
          configId?: number
          requestId?: string
          includeMemories?: boolean
          sessionId?: string
          currentUserMessageId?: number
          ragContext?: RagContext
          memoryCategories?: string[]
        }
        if (firstCall) {
          firstCall = false
          console.log('[IPC] First call to "ai-chat"')
        }
        if (!args || typeof args !== 'object') throw new Error('参数无效')
        if (!Array.isArray(args.messages) || args.messages.length === 0)
          throw new Error('参数无效: messages')
        if (args.messages.length > 200) throw new Error('消息数量超限')
        for (const msg of args.messages) {
          if (!msg || typeof msg !== 'object') throw new Error('参数无效: message')
          if (!['user', 'assistant', 'system'].includes(msg.role))
            throw new Error('参数无效: message role')
          if (typeof msg.content !== 'string') throw new Error('参数无效: message content')
          msg.content = msg.content.slice(0, 100000)
        }
        if (
          args.configId !== undefined &&
          (typeof args.configId !== 'number' ||
            !Number.isFinite(args.configId) ||
            args.configId < 1)
        )
          throw new Error('参数无效: configId')
        if (args.requestId !== undefined) {
          if (typeof args.requestId !== 'string') throw new Error('参数无效: requestId')
          args.requestId = args.requestId.trim().slice(0, 200)
        }
        if (args.sessionId !== undefined) {
          if (typeof args.sessionId !== 'string') throw new Error('参数无效: sessionId')
          args.sessionId = args.sessionId.trim().slice(0, 200)
        }
        if (
          args.currentUserMessageId !== undefined &&
          (!Number.isSafeInteger(args.currentUserMessageId) || args.currentUserMessageId < 1)
        ) {
          throw new Error('参数无效: currentUserMessageId')
        }

        const requestId = args.requestId ?? `req-${Date.now()}`

        // Cancel any previous request with the same requestId
        const existingController = activeRequests.get(requestId)
        if (existingController) {
          existingController.abort()
        }

        const controller = new AbortController()
        activeRequests.set(requestId, controller)

        // Auto-abort after 120s to prevent indefinite hangs
        const requestTimeout = setTimeout(() => controller.abort(), 120000)

        let slotAcquired = false
        try {
          acquireAiChatSlot()
          slotAcquired = true
          const db = getDB()
          let config: AIConfigForChat | undefined

          if (args.configId) {
            config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(args.configId) as
              | AIConfigForChat
              | undefined
          } else {
            config = db.prepare('SELECT * FROM ai_configs WHERE is_default = 1').get() as
              | AIConfigForChat
              | undefined
            if (!config) {
              config = db.prepare('SELECT * FROM ai_configs LIMIT 1').get() as
                | AIConfigForChat
                | undefined
            }
          }

          if (!config) {
            throw new Error('未配置AI模型，请先在设置中添加')
          }

          config = { ...config, api_key: decryptApiKey(config.api_key) }
          if (!config.api_key) throw new Error('API key could not be decrypted')
          const provider = await resolveAllowedProviderTarget(config.base_url)
          const requestTarget = { ...provider, url: `${provider.url}/chat/completions` }
          const win = BrowserWindow.fromWebContents(event.sender)
          const withHistory = buildSessionMessages(
            db,
            args.sessionId,
            args.messages,
            args.currentUserMessageId,
          )
          const memoryCategories = Array.isArray(args.memoryCategories)
            ? args.memoryCategories.filter((c): c is string => typeof c === 'string')
            : undefined
          const withMemories = injectMemories(
            withHistory,
            args.includeMemories ?? true,
            memoryCategories,
          )
          const messages = injectRagContext(withMemories, args.ragContext)

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
                messages,
                stream: true,
              }),
              redirect: 'manual',
              signal: controller.signal,
            })
          } catch (fetchError) {
            const msg = fetchError instanceof Error ? fetchError.message : String(fetchError)
            if (msg.includes('abort')) {
              throw new Error('AI 请求已取消或超时')
            }
            console.warn('[ai] chat fetch failed:', msg)
            throw new Error('网络连接失败，请检查网络或 Base URL')
          }

          // 出于 SSRF 防护，拒绝跟随上游重定向（可能指向内网/元数据地址）
          if (isRedirect(response.status)) {
            await discardResponseBody(response)
            throw redirectBlockedError('chat')
          }

          if (!response.ok) {
            await discardResponseBody(response)
            console.warn(`[ai] upstream chat error ${response.status}`)
            throw new Error(friendlyUpstreamError(response.status, 'chat'))
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error('AI 响应为空')
          }
          const decoder = new TextDecoder()

          // chunk 批量下发：缓冲累计增量，按 ~50ms 间隔 flush，避免每行 SSE 触发
          // 一次 IPC 与渲染端全量 markdown 重渲染；结束/出错时兜底清空缓冲。
          let buffer = ''
          let fullContent = ''
          let pendingChunk = ''
          let chunkTimer: ReturnType<typeof setTimeout> | null = null
          const flushChunk = () => {
            if (!pendingChunk) return
            const chunk = pendingChunk
            pendingChunk = ''
            if (win) win.webContents.send('ai-chat-chunk', { requestId, chunk })
          }
          const scheduleFlush = () => {
            if (chunkTimer) return
            chunkTimer = setTimeout(() => {
              chunkTimer = null
              flushChunk()
            }, CHUNK_FLUSH_INTERVAL_MS)
          }

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                const content = parseSseContentLine(line)
                if (content) {
                  fullContent += content
                  pendingChunk += content
                  scheduleFlush()
                }
              }
            }

            buffer += decoder.decode()
            const finalContent = parseSseContentLine(buffer)
            if (finalContent) {
              fullContent += finalContent
              pendingChunk += finalContent
            }

            if (chunkTimer) {
              clearTimeout(chunkTimer)
              chunkTimer = null
            }
            flushChunk()

            if (win) {
              win.webContents.send('ai-chat-done', { requestId, content: fullContent })
            }
            return { success: true, requestId, content: fullContent }
          } finally {
            // 出错/取消路径：把已缓冲的部分内容也下发，渲染端可展示后再报错。
            if (chunkTimer) {
              clearTimeout(chunkTimer)
              chunkTimer = null
            }
            flushChunk()
          }
        } finally {
          if (slotAcquired) releaseAiChatSlot()
          clearTimeout(requestTimeout)
          // 仅当 map 中仍是本次的 controller 时才删除：避免被同 requestId 的后续请求
          // 取代后，本请求的清理误删掉后续请求的 controller（否则会漏掉对后续请求的取消）。
          if (activeRequests.get(requestId) === controller) {
            activeRequests.delete(requestId)
          }
        }
      },
      [rateLimitMiddleware({ maxCalls: 5, windowMs: 10_000 })],
    ),
  )

  ipcMain.handle('ai-chat-cancel', (_event, requestId: string) => {
    if (typeof requestId !== 'string' || !requestId.trim()) throw new Error('参数无效: requestId')
    const normalized = requestId.trim().slice(0, 200)
    const controller = activeRequests.get(normalized)
    if (!controller) return { cancelled: false }
    controller.abort()
    return { cancelled: true }
  })
}

/** 历史消息上限：拼接最近 N 条，避免上下文无限增长。 */
const MAX_HISTORY_MESSAGES = 20

/**
 * 按 sessionId 组装发给模型的消息：[会话人设 system?] + [最近历史] + [本轮新消息]。
 * 渲染层会在请求前持久化当前 user 消息；通过数据库行 ID 从历史中精确排除它，
 * 再使用 outgoing 版本（可能包含 sendOverride 上下文）。无 sessionId 时按原样返回。
 */
export function buildSessionMessages(
  db: ReturnType<typeof getDB>,
  sessionId: string | undefined,
  outgoing: ChatMessage[],
  currentUserMessageId?: number,
): ChatMessage[] {
  if (!sessionId) return outgoing
  try {
    const prefix: ChatMessage[] = []
    const session = db
      .prepare('SELECT system_prompt FROM chat_sessions WHERE id = ?')
      .get(sessionId) as { system_prompt?: string } | undefined
    const persona = session?.system_prompt?.trim()
    if (persona) prefix.push({ role: 'system', content: persona })

    const rows = db
      .prepare(
        'SELECT id, role, content FROM chat_history WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      )
      .all(sessionId, MAX_HISTORY_MESSAGES + 1) as { id: number; role: string; content: string }[]
    const history = [...rows]
      .reverse()
      .filter((row) => row.id !== currentUserMessageId)
      .slice(-MAX_HISTORY_MESSAGES)
    const outgoingWithoutPersona =
      persona && outgoing[0]?.role === 'system' && outgoing[0].content.trim() === persona
        ? outgoing.slice(1)
        : outgoing
    for (const row of history) {
      if (row.role === 'user' || row.role === 'assistant' || row.role === 'system') {
        prefix.push({ role: row.role, content: row.content })
      }
    }
    return [...prefix, ...outgoingWithoutPersona]
  } catch (error) {
    console.warn('[ai] Failed to build session history, sending outgoing only:', error)
    return outgoing
  }
}

function injectMemories(
  messages: ChatMessage[],
  includeMemories = false,
  memoryCategories?: string[],
): ChatMessage[] {
  if (!includeMemories) {
    return messages
  }

  try {
    const lastUserMessage =
      [...messages]
        .reverse()
        .find((message) => message.role === 'user')
        ?.content.trim() ?? ''
    const memories = getRelevantMemories(lastUserMessage, 6, memoryCategories)

    if (memories.length === 0) {
      return messages
    }

    markMemoriesUsed(memories.map((memory) => memory.id))

    const memoryPrompt = [
      '以下是用户的跨对话长期记忆，仅在相关时使用，不要生硬复述：',
      ...memories.map((memory, index) => `${index + 1}. [${memory.category}] ${memory.content}`),
    ].join('\n')

    return [{ role: 'system', content: memoryPrompt }, ...messages]
  } catch (error) {
    console.warn('[ai] Failed to inject memories, proceeding without:', error)
    return messages
  }
}

/** RAG 上下文结构，由渲染层经 knowledge-rag-context 取得后传入。 */
export type RagContext = {
  recentProblems?: unknown[]
  learningHistory?: unknown[]
  knowledgeChunks?: unknown
  userProfile?: {
    preferredLanguage?: string
    difficultyLevel?: string
    strongTopics?: string[]
    weakTopics?: string[]
  } | null
}

const MAX_RAG_CHUNKS = 8
const MAX_RAG_CHARS = 8000

/**
 * 将本地学习上下文（知识库片段 + 用户画像）拼成一条 system 消息注入到请求最前面，
 * 让 AI 回答结合用户的本地学习数据。无有效内容时原样返回。
 */
export function injectRagContext(
  messages: ChatMessage[],
  rag: RagContext | undefined,
): ChatMessage[] {
  if (!rag || typeof rag !== 'object') return messages
  try {
    const parts: string[] = []

    const chunks = Array.isArray(rag.knowledgeChunks)
      ? rag.knowledgeChunks
          .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0)
          .slice(0, MAX_RAG_CHUNKS)
      : []
    if (chunks.length > 0) {
      const joined = chunks
        .map((chunk, index) => `【片段${index + 1}】${chunk.trim()}`)
        .join('\n')
        .slice(0, MAX_RAG_CHARS)
      parts.push(
        `以下是与用户问题相关的知识库内容，请优先据此作答。使用片段时保留其中的“来源：文件名#片段序号”标识；证据不足时明确说明知识库未提供足够依据：\n${joined}`,
      )
    }

    const profile = rag.userProfile
    if (profile !== null && profile !== undefined && typeof profile === 'object') {
      const bits: string[] = []
      if (profile.preferredLanguage) bits.push(`偏好语言：${profile.preferredLanguage}`)
      if (profile.difficultyLevel) bits.push(`水平：${profile.difficultyLevel}`)
      if (Array.isArray(profile.weakTopics) && profile.weakTopics.length > 0)
        bits.push(`薄弱点：${profile.weakTopics.slice(0, 10).join('、')}`)
      if (Array.isArray(profile.strongTopics) && profile.strongTopics.length > 0)
        bits.push(`擅长：${profile.strongTopics.slice(0, 10).join('、')}`)
      if (bits.length > 0)
        parts.push(`用户画像（用于调整讲解深度，不要直接复述）：${bits.join('；')}`)
    }

    if (parts.length === 0) return messages
    return [{ role: 'system', content: parts.join('\n\n') }, ...messages]
  } catch (error) {
    console.warn('[ai] Failed to inject RAG context, proceeding without:', error)
    return messages
  }
}
