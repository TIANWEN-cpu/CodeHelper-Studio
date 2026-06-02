import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ChatSession {
  id: string
  title: string
  system_prompt: string
  created_at: string
  updated_at: string
}

export interface PromptPreset {
  id: number
  name: string
  prompt: string
  is_builtin: number
}

export interface MemoryItem {
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

interface StreamChunkPayload {
  requestId: string
  chunk: string
}

interface StreamDonePayload {
  requestId: string
  content: string
}

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessage[]
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
    const sessions = (await window.api.invoke('chat-sessions-list')) as ChatSession[]
    set({ sessions })
  },

  createSession: async (systemPrompt?: string, title?: string) => {
    const id = `session-${Date.now()}`
    await window.api.invoke('chat-session-create', {
      id,
      title: title || '新对话',
      system_prompt: systemPrompt || '',
    })
    await get().loadSessions()
    await get().switchSession(id)
    return id
  },

  switchSession: async (id: string) => {
    const rows = (await window.api.invoke('chat-messages-load', id)) as Array<{
      id: number
      role: ChatMessage['role']
      content: string
      created_at: string
    }>
    const messages: ChatMessage[] = rows.map((row) => ({
      id: `msg-${row.id}`,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.created_at).getTime(),
    }))
    set({ activeSessionId: id, messages, error: null, streaming: false, currentRequestId: null })
  },

  deleteSession: async (id: string) => {
    await window.api.invoke('chat-session-delete', id)
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
    await window.api.invoke('chat-session-update', id, { title })
    await get().loadSessions()
  },

  sendMessage: async (content: string, configId?: number) => {
    let { activeSessionId } = get()
    if (!activeSessionId) {
      activeSessionId = await get().createSession()
    }

    const requestId = buildRequestId()
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    const assistantMsg: ChatMessage = {
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

    await window.api.invoke('chat-message-save', {
      session_id: activeSessionId,
      role: 'user',
      content,
    })
    await window.api.invoke('chat-memory-capture', { content, session_id: activeSessionId })

    const session = get().sessions.find((item) => item.id === activeSessionId)
    if (session && session.title === '新对话') {
      const title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
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
      await window.api.invoke('ai-chat', {
        messages: apiMessages,
        configId,
        requestId,
        includeMemories: true,
      })
    } catch (error: unknown) {
      set((state) => ({
        error: String(error),
        streaming: false,
        currentRequestId: null,
        messages: state.messages.map((message, index) =>
          index === state.messages.length - 1 && message.role === 'assistant'
            ? { ...message, content: String(error) }
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
      await window.api.invoke('chat-message-save', {
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
    const presets = (await window.api.invoke('chat-presets-list')) as PromptPreset[]
    set({ presets })
  },

  loadMemories: async (search?: string) => {
    const memories = (await window.api.invoke('chat-memories-list', search)) as MemoryItem[]
    set({ memories })
  },

  saveMemory: async (memory) => {
    await window.api.invoke('chat-memory-save', memory)
    await get().loadMemories()
  },

  deleteMemory: async (id) => {
    await window.api.invoke('chat-memory-delete', id)
    await get().loadMemories()
  },
}))

function buildRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
