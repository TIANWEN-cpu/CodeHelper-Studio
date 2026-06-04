// ============================================================
// AI Chat Service
// Provides AI chat functionality with streaming support.
// ============================================================

import { track } from './analyticsService'

// --------------- Types ---------------

export interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  created_at: string
}

export interface PromptPreset {
  id: number
  name: string
  prompt: string
  is_builtin: boolean
}

// --------------- IPC Helpers ---------------

/**
 * Generic wrapper around `window.api.invoke` for brevity.
 * Assumes `window.api.invoke` is exposed via preload script.
 */
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.api.invoke(channel, ...args) as Promise<T>
}

// --------------- Session CRUD ---------------

/** Fetch all chat sessions. */
export async function getSessions(): Promise<ChatSession[]> {
  return invoke<ChatSession[]>('chat-sessions-list')
}

/** Create a new chat session with the given title. */
export async function createSession(title: string): Promise<ChatSession> {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return invoke<ChatSession>('chat-session-create', { id, title })
}

/** Delete a chat session by its ID. */
export async function deleteSession(sessionId: string): Promise<void> {
  return invoke<void>('chat-session-delete', sessionId)
}

// --------------- Messages ---------------

/** Load all messages for a given session. */
export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  return invoke<ChatMessage[]>('chat-messages-load', sessionId)
}

/** Save a single message to the database. */
export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  model?: string,
): Promise<void> {
  return invoke<void>('chat-message-save', { session_id: sessionId, role, content, model })
}

/**
 * Send a chat message to the AI provider.
 * The backend streams response chunks via `ai-chat-chunk` / `ai-chat-done` events.
 * The `messages` array is required by the backend (which fetches history from DB);
 * here we send the single outgoing message and let the backend build context.
 */
export async function sendMessage(
  sessionId: string,
  content: string,
  configId?: number,
): Promise<void> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // 埋点：向 AI 发送了一条提问。
  track('ai_chat_sent', {})
  return invoke<void>('ai-chat', {
    messages: [{ role: 'user' as const, content }],
    configId,
    requestId,
  })
}

// --------------- Streaming Subscriptions ---------------

/**
 * Subscribe to incremental content chunks during an AI response.
 * The backend sends `{ requestId, chunk }` objects.
 * Returns an unsubscribe function that removes the listener.
 */
export function onChunk(callback: (chunk: string) => void): () => void {
  // preload 的 on() 已剥离 event，回调首个参数即后端发送的 data。
  // on() 返回的就是取消订阅函数（preload 没有暴露 off）。
  return window.api.on('ai-chat-chunk', (...args: unknown[]) => {
    const data = args[0] as { requestId: string; chunk: string } | undefined
    if (data && typeof data.chunk === 'string') callback(data.chunk)
  })
}

/**
 * Subscribe to the "done" event that fires when the AI finishes
 * generating a complete response.
 * The backend sends `{ requestId, content }` objects.
 * Returns an unsubscribe function.
 */
export function onDone(callback: (fullContent: string) => void): () => void {
  return window.api.on('ai-chat-done', (...args: unknown[]) => {
    const data = args[0] as { requestId: string; content: string } | undefined
    if (data && typeof data.content === 'string') callback(data.content)
  })
}

// --------------- Presets ---------------

/** Fetch the list of available prompt presets. */
export async function getPresets(): Promise<PromptPreset[]> {
  return invoke<PromptPreset[]>('chat-presets-list')
}

// --------------- Convenience ---------------

/**
 * Quick one-shot ask: creates a temporary session, sends the prompt,
 * waits for the assistant's full response, then returns it.
 *
 * NOTE: The caller is responsible for deleting the temporary session
 * if it is no longer needed.
 */
export async function quickAsk(prompt: string): Promise<string> {
  const session = await createSession('Quick Ask')

  return new Promise<string>((resolve, reject) => {
    const cleanupDone = onDone((fullContent) => {
      cleanupChunk()
      cleanupDone()
      resolve(fullContent)
    })

    // Also listen for errors reported via chunks (optional safeguard)
    const cleanupChunk = onChunk(() => {
      // Chunks are consumed by onDone; nothing extra required here.
    })

    sendMessage(session.id, prompt).catch((err) => {
      cleanupChunk()
      cleanupDone()
      reject(err)
    })
  })
}
