import { create } from 'zustand'
import { typedInvoke } from '@/api/ipc'

type Role = 'user' | 'assistant' | 'system'
type Session = {
  id: string
  title: string
  system_prompt?: string
  created_at?: string
  updated_at?: string
}
type Message = { id: string; role: Role; content: string; timestamp?: number; created_at?: string }
type Preset = Record<string, unknown>
type Memory = Record<string, unknown>

type ChatStore = {
  sessions: Session[]
  activeSessionId: string | null
  messages: Message[]
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
  sendMessage: (content: string) => Promise<void>
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

export const useChatStore = create<ChatStore>((set, get) => ({
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
      const sessions = await typedInvoke<Session[]>('chat-sessions-list')
      set({ sessions, error: null })
    } catch (error) {
      console.error('[ChatStore.loadSessions]', error)
      set({ sessions: [], error: errorMessage(error) })
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
    try {
      const rows = await typedInvoke<Message[]>('chat-messages-load', id)
      set({
        activeSessionId: id,
        messages: Array.isArray(rows) ? rows : [],
        streaming: false,
        currentRequestId: null,
        error: null,
      })
    } catch (error) {
      console.error('[ChatStore.switchSession]', error)
      set({ error: errorMessage(error), streaming: false, currentRequestId: null })
    }
  },
  deleteSession: async (id) => {
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
  sendMessage: async (content) => {
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
      await typedInvoke('chat-message-save', { session_id: sessionId, role: 'user', content })
      await typedInvoke('chat-memory-capture', { content, session_id: sessionId })
      if (session?.title === '新对话') await get().renameSession(sessionId, makeTitle(content))
      const rag = await typedInvoke('knowledge-rag-context', content)
      const messages = [
        ...(session?.system_prompt
          ? [{ role: 'system' as const, content: session.system_prompt }]
          : []),
        { role: 'user' as const, content },
      ]
      await typedInvoke('ai-chat', { messages, sessionId, requestId, ragContext: rag })
    } catch (error) {
      const msg = errorMessage(error)
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
    if (state.activeSessionId && finalContent) {
      await typedInvoke('chat-message-save', {
        session_id: state.activeSessionId,
        role: 'assistant',
        content: finalContent,
      })
    }
    set({ streaming: false, currentRequestId: null })
    await get().loadSessions()
    await get().loadMemories()
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
