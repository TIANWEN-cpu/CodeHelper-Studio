import { create } from 'zustand'
import { typedInvoke } from '@/api/ipc'
import { reportError } from '@/utils/errorHandler'

type Role = 'user' | 'assistant' | 'system'
type Session = {
  id: string
  title: string
  system_prompt?: string
  created_at?: string
  updated_at?: string
}
type Message = { id: string; role: Role; content: string; timestamp?: number; created_at?: string }
type Preset = { id: number | string; name: string; prompt: string; is_builtin?: boolean }
type Memory = Record<string, unknown>

/**
 * 发送选项：
 * - sendOverride：实际发给模型的文本（带上下文/教学前缀）；显示与入库仍用原始 content。
 * - includeMemories：是否允许后端注入跨会话长期记忆。
 * - includeKnowledge：是否检索本地知识库（RAG）随请求发送。
 * - memoryCategories：按类别发送白名单（隐私控制），undefined=全部。
 * - llmExtract：true 时用 LLM 智能抽取记忆替代本地正则捕获。
 * - configId：指定 AI 配置；缺省用默认配置。
 * - captureMemory：是否从本轮用户文本写入长期记忆；Agent 审计运行会关闭。
 */
export type SendMessageOptions = {
  sendOverride?: string
  includeMemories?: boolean
  includeKnowledge?: boolean
  memoryCategories?: string[]
  llmExtract?: boolean
  configId?: number
  captureMemory?: boolean
}

type ChatStore = {
  sessions: Session[]
  activeSessionId: string | null
  messages: Message[]
  loading: boolean
  streaming: boolean
  currentRequestId: string | null
  error: string | null
  presets: Preset[]
  memories: Memory[]
  loadSessions: () => Promise<void>
  createSession: (systemPrompt?: string, title?: string) => Promise<string>
  switchSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>
  cancelCurrentRequest: () => Promise<boolean>
  appendChunk: (payload: { requestId: string; chunk: string }) => void
  finishStream: (payload: { requestId: string; content: string }) => Promise<void>
  loadPresets: () => Promise<void>
  loadMemories: (query?: string) => Promise<void>
  saveMemory: (memory: Record<string, unknown>) => Promise<void>
  deleteMemory: (id: number) => Promise<void>
}

function nowId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function makeTitle(content: string) {
  return content.length > 30 ? `${content.slice(0, 30)}...` : content
}

let sessionSwitchRequestId = 0
let pendingSessionSwitchId: string | null = null
const cancelledRequestIds = new Set<string>()

function throwIfRequestCancelled(requestId: string): void {
  if (!cancelledRequestIds.delete(requestId)) return
  throw new Error('AI 请求已取消')
}

/** 去重会话列表（按 id，保留首次出现），避免重复 key 渲染。 */
export function normalizeChatSessions<T extends { id?: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const session of list) {
    if (!session.id || seen.has(session.id)) continue
    seen.add(session.id)
    out.push(session)
  }
  return out
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  loading: false,
  streaming: false,
  currentRequestId: null,
  error: null,
  presets: [],
  memories: [],
  loadSessions: async () => {
    set({ loading: true })
    try {
      const sessions = await typedInvoke<Session[]>('chat-sessions-list')
      set({ sessions: normalizeChatSessions(sessions), error: null, loading: false })
    } catch (error) {
      console.error('[ChatStore.loadSessions]', error)
      set({ sessions: [], error: errorMessage(error), loading: false })
    }
  },
  createSession: async (systemPrompt = '', title = '新对话') => {
    const id = nowId('session')
    await typedInvoke('chat-session-create', { id, title, system_prompt: systemPrompt })
    await get().loadSessions()
    await get().switchSession(id)
    return id
  },
  switchSession: async (id) => {
    const requestId = ++sessionSwitchRequestId
    pendingSessionSwitchId = id
    set({ loading: true })
    try {
      const rows = await typedInvoke<Message[]>('chat-messages-load', id)
      if (sessionSwitchRequestId !== requestId) return
      set({
        activeSessionId: id,
        messages: Array.isArray(rows) ? rows : [],
        streaming: false,
        currentRequestId: null,
        error: null,
        loading: false,
      })
      pendingSessionSwitchId = null
    } catch (error) {
      if (sessionSwitchRequestId !== requestId) return
      pendingSessionSwitchId = null
      console.error('[ChatStore.switchSession]', error)
      set({ error: errorMessage(error), streaming: false, currentRequestId: null, loading: false })
    }
  },
  deleteSession: async (id) => {
    if (pendingSessionSwitchId === id) {
      sessionSwitchRequestId += 1
      pendingSessionSwitchId = null
    }
    const wasActive = get().activeSessionId === id
    await typedInvoke('chat-session-delete', id)
    await get().loadSessions()
    if (wasActive) {
      const next = get().sessions[0]
      if (next) await get().switchSession(next.id)
      else set({ activeSessionId: null, messages: [] })
    }
  },
  renameSession: async (id, title) => {
    await typedInvoke('chat-session-update', id, { title })
    await get().loadSessions()
  },
  sendMessage: async (content, options = {}) => {
    const {
      sendOverride,
      includeMemories = true,
      includeKnowledge = true,
      memoryCategories,
      llmExtract = false,
      configId,
      captureMemory = true,
    } = options
    let sessionId = get().activeSessionId
    if (!sessionId) sessionId = await get().createSession()
    const session = get().sessions.find((item) => item.id === sessionId)
    const requestId = nowId('req')
    const userMessage: Message = { id: nowId('user'), role: 'user', content, timestamp: Date.now() }
    const assistantMessage: Message = {
      id: nowId('assistant'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
      streaming: true,
      currentRequestId: requestId,
      error: null,
    }))

    try {
      const currentUserMessageId = await typedInvoke<number>('chat-message-save', {
        session_id: sessionId,
        role: 'user',
        content,
      })
      if (!Number.isSafeInteger(currentUserMessageId) || currentUserMessageId < 1) {
        throw new Error('消息保存未返回有效 ID')
      }
      throwIfRequestCancelled(requestId)
      // 从用户消息捕获长期记忆：开启 LLM 抽取则智能抽取，否则用本地正则规则。
      // best-effort：抽取失败（如网络超时）不应中断本轮对话。
      if (captureMemory) {
        try {
          if (llmExtract) {
            await typedInvoke('chat-memory-extract', { content, configId, sessionId })
          } else {
            await typedInvoke('chat-memory-capture', { content, session_id: sessionId })
          }
        } catch (memErr) {
          console.warn('[ChatStore] 记忆捕获失败，继续对话:', memErr)
        }
      }
      throwIfRequestCancelled(requestId)
      if (session?.title === '新对话') await get().renameSession(sessionId, makeTitle(content))
      // RAG：检索本地知识库片段与用户画像随请求发送；关闭或失败时跳过，不影响对话。
      let rag: unknown
      if (includeKnowledge) {
        try {
          rag = await typedInvoke('knowledge-rag-context', content)
        } catch (ragErr) {
          console.warn('[ChatStore] RAG 检索失败，跳过知识库注入:', ragErr)
        }
      }
      throwIfRequestCancelled(requestId)
      // 实际发给模型的内容可带上下文/教学前缀（sendOverride）；显示与入库仍用原始 content。
      const messages = [
        ...(session?.system_prompt
          ? [{ role: 'system' as const, content: session.system_prompt }]
          : []),
        { role: 'user' as const, content: sendOverride ?? content },
      ]
      await typedInvoke('ai-chat', {
        messages,
        sessionId,
        configId,
        requestId,
        includeMemories,
        ragContext: rag,
        memoryCategories,
        currentUserMessageId,
      })
    } catch (error) {
      cancelledRequestIds.delete(requestId)
      const msg = errorMessage(error)
      reportError(error, 'chat.sendMessage', { showToast: true })
      set((state) => ({
        error: msg,
        streaming: false,
        currentRequestId: null,
        messages: state.messages.map((message, index) =>
          index === state.messages.length - 1 && message.role === 'assistant'
            ? { ...message, content: msg }
            : message,
        ),
      }))
    }
  },
  cancelCurrentRequest: async () => {
    const requestId = get().currentRequestId
    if (!requestId) return false
    cancelledRequestIds.add(requestId)
    let cancelled = false
    try {
      const result = await typedInvoke<{ cancelled: boolean }>('ai-chat-cancel', requestId)
      cancelled = result.cancelled
    } catch {
      // The local cancellation marker still prevents a not-yet-dispatched request.
    }
    set((state) => ({
      streaming: false,
      currentRequestId: state.currentRequestId === requestId ? null : state.currentRequestId,
      error: 'AI 请求已取消',
    }))
    return cancelled || cancelledRequestIds.has(requestId)
  },
  appendChunk: ({ requestId, chunk }) => {
    const state = get()
    if (state.currentRequestId !== requestId) return
    const last = state.messages[state.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    set({
      messages: state.messages.map((message, index) =>
        index === state.messages.length - 1
          ? { ...message, content: message.content + chunk }
          : message,
      ),
    })
  },
  finishStream: async ({ requestId, content }) => {
    const state = get()
    if (state.currentRequestId !== requestId) return
    const last = state.messages[state.messages.length - 1]
    const finalContent = content || (last?.role === 'assistant' ? last.content : '')
    let persistenceError: string | null = null
    if (state.activeSessionId && finalContent) {
      try {
        await typedInvoke('chat-message-save', {
          session_id: state.activeSessionId,
          role: 'assistant',
          content: finalContent,
        })
      } catch (error) {
        persistenceError = errorMessage(error)
        reportError(error, 'chat.finishStream', { showToast: true })
      }
    }
    if (get().currentRequestId !== requestId) return
    await Promise.allSettled([get().loadSessions(), get().loadMemories()])
    if (get().currentRequestId !== requestId) return
    set({
      streaming: false,
      currentRequestId: null,
      ...(persistenceError ? { error: persistenceError } : {}),
    })
  },
  loadPresets: async () => {
    const presets = await typedInvoke<Preset[]>('chat-presets-list')
    set({ presets })
  },
  loadMemories: async (query) => {
    const memories = await typedInvoke<Memory[]>('chat-memories-list', query)
    set({ memories })
  },
  saveMemory: async (memory) => {
    await typedInvoke('chat-memory-save', memory)
    await get().loadMemories()
  },
  deleteMemory: async (id) => {
    await typedInvoke('chat-memory-delete', id)
    await get().loadMemories()
  },
}))

// ---------------------------------------------------------------------------
// 流式事件桥接
// ---------------------------------------------------------------------------

let streamingBridgeReady = false

/**
 * 把后端的流式事件接到 store：ai-chat-chunk → appendChunk，ai-chat-done → finishStream。
 * 幂等且常驻整个应用生命周期——多个聊天视图（AITutorView / AITutorPanel）可重复调用，
 * 首次之后即为 no-op，避免某个视图卸载时误拆掉另一视图仍依赖的订阅。
 * 在非 Electron 环境（如单测）下 window.api 不存在，直接跳过。
 */
export function initChatStreaming(): void {
  if (streamingBridgeReady) return
  const api = (
    globalThis as unknown as {
      api?: { on?: (channel: string, cb: (...args: unknown[]) => void) => () => void }
    }
  ).api
  if (!api?.on) return
  streamingBridgeReady = true

  api.on('ai-chat-chunk', (...args: unknown[]) => {
    const data = args[0] as { requestId?: string; chunk?: string } | undefined
    if (data && typeof data.requestId === 'string' && typeof data.chunk === 'string') {
      useChatStore.getState().appendChunk({ requestId: data.requestId, chunk: data.chunk })
    }
  })
  api.on('ai-chat-done', (...args: unknown[]) => {
    const data = args[0] as { requestId?: string; content?: string } | undefined
    if (data && typeof data.requestId === 'string' && typeof data.content === 'string') {
      void useChatStore
        .getState()
        .finishStream({ requestId: data.requestId, content: data.content })
    }
  })
}
