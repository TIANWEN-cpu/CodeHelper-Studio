import { create } from 'zustand'
import type {
  Message,
  Session,
  PromptPreset,
  MemoryItem,
  StreamChunkPayload,
  StreamDonePayload,
} from '../types/chat'
import { SESSION_TITLE_MAX_LENGTH } from '../constants'
import { toErrorMessage, getUserMessage } from '../utils/errors'
import { typedInvoke, invalidateCache } from '../api/ipc'
import { eventBus } from '../utils/eventBus'
import { ragContextService } from '../utils/ragContextService'

// Re-export types so existing consumers are not broken
export type { Message as ChatMessage, Session as ChatSession, PromptPreset, MemoryItem }
export type { StreamChunkPayload, StreamDonePayload }

/** Max messages kept in memory per session to prevent unbounded growth. */
const MAX_MESSAGES_IN_MEMORY = 500

interface ChatState {
  sessions: Session[]
  activeSessionId: string | null
  messages: Message[]
  streaming: boolean
  currentRequestId: string | null
  error: string | null
  presets: PromptPreset[]
  memories: MemoryItem[]
  loadSessions: () => Promise<void>
  createSession: (systemPrompt?: string, title?: string) => Promise<string>
  switchSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  sendMessage: (content: string, configId?: number) => Promise<void>
  appendChunk: (payload: StreamChunkPayload) => void
  finishStream: (payload: StreamDonePayload) => Promise<void>
  loadPresets: () => Promise<void>
  loadMemories: (search?: string) => Promise<void>
  saveMemory: (memory: Partial<MemoryItem> & { content: string }) => Promise<void>
  deleteMemory: (id: number) => Promise<void>
}

/** Ensure an active session exists, creating one if needed. Returns the session ID. */
async function ensureActiveSession(get: () => ChatState): Promise<string> {
  let { activeSessionId } = get()
  if (!activeSessionId) {
    activeSessionId = await get().createSession()
  }
  return activeSessionId
}

/** Auto-rename sessions still titled '新对话' based on the first user message. */
async function autoRenameIfNeeded(
  get: () => ChatState,
  sessionId: string,
  content: string,
): Promise<void> {
  const session = get().sessions.find((item) => item.id === sessionId)
  if (!session || session.title !== '新对话') return

  const title =
    content.slice(0, SESSION_TITLE_MAX_LENGTH) +
    (content.length > SESSION_TITLE_MAX_LENGTH ? '...' : '')
  await get().renameSession(sessionId, title)
}

/** Build the API message array from current state, injecting system prompt. */
function buildApiMessages(
  get: () => ChatState,
  session: Session | undefined,
  excludeMsgId: string,
): Array<{ role: string; content: string }> {
  const apiMessages: Array<{ role: string; content: string }> = []
  if (session?.system_prompt) {
    apiMessages.push({ role: 'system', content: session.system_prompt })
  }
  for (const message of get().messages) {
    if (message.content && message.id !== excludeMsgId) {
      apiMessages.push({ role: message.role, content: message.content })
    }
  }
  return apiMessages
}

function buildRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  streaming: false,
  currentRequestId: null,
  error: null,
  presets: [],
  memories: [],

  loadSessions: async () => {
    try {
      const sessions = await typedInvoke('chat-sessions-list')
      set({ sessions })
    } catch (error) {
      console.error('[ChatStore.loadSessions]', toErrorMessage(error))
    }
  },

  createSession: async (systemPrompt?: string, title?: string) => {
    const id = `session-${Date.now()}`
    await typedInvoke('chat-session-create', {
      id,
      title: title || '新对话',
      system_prompt: systemPrompt || '',
    })
    invalidateCache('chat-sessions-list')
    await get().loadSessions()
    await get().switchSession(id)
    eventBus.emit('session:created', id)
    return id
  },

  switchSession: async (id: string) => {
    try {
      const rows = await typedInvoke('chat-messages-load', id)
      let messages: Message[] = rows.map((row) => ({
        id: `msg-${row.id}`,
        role: row.role,
        content: row.content,
        timestamp: new Date(row.created_at).getTime(),
      }))
      // Trim to prevent unbounded memory growth — keep most recent messages
      if (messages.length > MAX_MESSAGES_IN_MEMORY) {
        messages = messages.slice(-MAX_MESSAGES_IN_MEMORY)
      }
      set({ activeSessionId: id, messages, error: null, streaming: false, currentRequestId: null })
      eventBus.emit('session:switched', id)
    } catch (error) {
      const errMsg = getUserMessage(error)
      console.error('[ChatStore.switchSession]', toErrorMessage(error))
      set({ error: errMsg })
    }
  },

  deleteSession: async (id: string) => {
    try {
      await typedInvoke('chat-session-delete', id)
      invalidateCache('chat-sessions-list')
      const { activeSessionId } = get()
      await get().loadSessions()
      if (activeSessionId === id) {
        const sessions = get().sessions
        if (sessions.length > 0) {
          await get().switchSession(sessions[0].id)
        } else {
          set({ activeSessionId: null, messages: [], streaming: false, currentRequestId: null })
        }
      }
      eventBus.emit('session:deleted', id)
    } catch (error) {
      console.error('[ChatStore.deleteSession]', toErrorMessage(error))
    }
  },

  renameSession: async (id: string, title: string) => {
    try {
      await typedInvoke('chat-session-update', id, { title })
      invalidateCache('chat-sessions-list')
      await get().loadSessions()
    } catch (error) {
      console.error('[ChatStore.renameSession]', toErrorMessage(error))
    }
  },

  sendMessage: async (content: string, configId?: number) => {
    const activeSessionId = await ensureActiveSession(get)

    const requestId = buildRequestId()
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    const assistantMsg: Message = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }

    set((state) => ({
      messages: [...state.messages, userMsg, assistantMsg],
      streaming: true,
      currentRequestId: requestId,
      error: null,
    }))

    await typedInvoke('chat-message-save', {
      session_id: activeSessionId,
      role: 'user',
      content,
    })
    await typedInvoke('chat-memory-capture', { content, session_id: activeSessionId })

    await autoRenameIfNeeded(get, activeSessionId, content)

    const session = get().sessions.find((item) => item.id === activeSessionId)
    const apiMessages = buildApiMessages(get, session, assistantMsg.id)

    try {
      const enrichedMessages = await ragContextService.enrichMessages(apiMessages, {
        query: content,
        maxProblems: 3,
        maxHistory: 3,
      })

      await typedInvoke('ai-chat', {
        messages: enrichedMessages,
        configId,
        requestId,
        includeMemories: true,
      })
    } catch (error: unknown) {
      const errMsg = getUserMessage(error)
      console.error('[ChatStore.sendMessage]', toErrorMessage(error))
      set((state) => ({
        error: errMsg,
        streaming: false,
        currentRequestId: null,
        messages: state.messages.map((message, index) =>
          index === state.messages.length - 1 && message.role === 'assistant'
            ? { ...message, content: errMsg }
            : message,
        ),
      }))
    }
  },

  appendChunk: (payload) => {
    if (payload.requestId !== get().currentRequestId) {
      return
    }

    set((state) => {
      const messages = [...state.messages]
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') {
        messages[messages.length - 1] = { ...last, content: last.content + payload.chunk }
      }
      // Trim oldest messages if over limit during streaming
      const trimmed =
        messages.length > MAX_MESSAGES_IN_MEMORY
          ? messages.slice(-MAX_MESSAGES_IN_MEMORY)
          : messages
      return { messages: trimmed }
    })
  },

  finishStream: async (payload) => {
    if (payload.requestId !== get().currentRequestId) {
      return
    }

    const { activeSessionId, messages } = get()
    const last = messages[messages.length - 1]
    const assistantContent = payload.content || (last?.role === 'assistant' ? last.content : '')

    try {
      if (assistantContent && activeSessionId) {
        await typedInvoke('chat-message-save', {
          session_id: activeSessionId,
          role: 'assistant',
          content: assistantContent,
        })
      }

      set({ streaming: false, currentRequestId: null })
      await get().loadSessions()
    } catch (error) {
      console.error('[ChatStore.finishStream]', toErrorMessage(error))
      set({ streaming: false, currentRequestId: null })
    }
  },

  loadPresets: async () => {
    try {
      const presets = await typedInvoke('chat-presets-list')
      set({ presets })
    } catch (error) {
      console.error('[ChatStore.loadPresets]', toErrorMessage(error))
    }
  },

  loadMemories: async (search?: string) => {
    try {
      const memories = await typedInvoke('chat-memories-list', search)
      set({ memories })
    } catch (error) {
      console.error('[ChatStore.loadMemories]', toErrorMessage(error))
    }
  },

  saveMemory: async (memory) => {
    try {
      await typedInvoke('chat-memory-save', memory)
      invalidateCache('chat-memories-list')
      await get().loadMemories()
    } catch (error) {
      console.error('[ChatStore.saveMemory]', toErrorMessage(error))
      throw error
    }
  },

  deleteMemory: async (id) => {
    try {
      await typedInvoke('chat-memory-delete', id)
      invalidateCache('chat-memories-list')
      await get().loadMemories()
    } catch (error) {
      console.error('[ChatStore.deleteMemory]', toErrorMessage(error))
    }
  },
}))
