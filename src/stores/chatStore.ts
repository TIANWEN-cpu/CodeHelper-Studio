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
import { toErrorMessage } from '../utils/errors'
import { typedInvoke } from '../api/ipc'

// Re-export types so existing consumers are not broken
export type { Message as ChatMessage, Session as ChatSession, PromptPreset, MemoryItem }
export type { StreamChunkPayload, StreamDonePayload }

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
    const sessions = await typedInvoke('chat-sessions-list')
    set({ sessions })
  },

  createSession: async (systemPrompt?: string, title?: string) => {
    const id = `session-${Date.now()}`
    await typedInvoke('chat-session-create', {
      id,
      title: title || '新对话',
      system_prompt: systemPrompt || '',
    })
    await get().loadSessions()
    await get().switchSession(id)
    return id
  },

  switchSession: async (id: string) => {
    const rows = await typedInvoke('chat-messages-load', id)
    const messages: Message[] = rows.map((row) => ({
      id: `msg-${row.id}`,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.created_at).getTime(),
    }))
    set({ activeSessionId: id, messages, error: null, streaming: false, currentRequestId: null })
  },

  deleteSession: async (id: string) => {
    await typedInvoke('chat-session-delete', id)
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
  },

  renameSession: async (id: string, title: string) => {
    await typedInvoke('chat-session-update', id, { title })
    await get().loadSessions()
  },

  sendMessage: async (content: string, configId?: number) => {
    let { activeSessionId } = get()
    if (!activeSessionId) {
      activeSessionId = await get().createSession()
    }

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

    const session = get().sessions.find((item) => item.id === activeSessionId)
    if (session && session.title === '新对话') {
      const title =
        content.slice(0, SESSION_TITLE_MAX_LENGTH) +
        (content.length > SESSION_TITLE_MAX_LENGTH ? '...' : '')
      await get().renameSession(activeSessionId, title)
    }

    const apiMessages: Array<{ role: string; content: string }> = []
    if (session?.system_prompt) {
      apiMessages.push({ role: 'system', content: session.system_prompt })
    }
    for (const message of get().messages) {
      if (message.content && message.id !== assistantMsg.id) {
        apiMessages.push({ role: message.role, content: message.content })
      }
    }

    try {
      await typedInvoke('ai-chat', {
        messages: apiMessages,
        configId,
        requestId,
        includeMemories: true,
      })
    } catch (error: unknown) {
      const errMsg = toErrorMessage(error)
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
      return { messages }
    })
  },

  finishStream: async (payload) => {
    if (payload.requestId !== get().currentRequestId) {
      return
    }

    const { activeSessionId, messages } = get()
    const last = messages[messages.length - 1]
    const assistantContent = payload.content || (last?.role === 'assistant' ? last.content : '')

    if (assistantContent && activeSessionId) {
      await typedInvoke('chat-message-save', {
        session_id: activeSessionId,
        role: 'assistant',
        content: assistantContent,
      })
    }

    set({ streaming: false, currentRequestId: null })
    await get().loadSessions()
    await get().loadMemories()
  },

  loadPresets: async () => {
    const presets = await typedInvoke('chat-presets-list')
    set({ presets })
  },

  loadMemories: async (search?: string) => {
    const memories = await typedInvoke('chat-memories-list', search)
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

function buildRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
