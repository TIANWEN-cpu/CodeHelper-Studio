import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChatSession,
  ChatMessage,
  PromptPreset,
  getSessions,
  createSession as createSessionApi,
  deleteSession as deleteSessionApi,
  loadMessages,
  sendMessage as sendMessageApi,
  saveMessage,
  captureMemory,
  onChunk,
  onDone,
  getPresets as getPresetsApi,
  quickAsk as quickAskApi,
} from '../services/aiService'

// --------------- Types ---------------

export interface UseAIChatReturn {
  /** All chat sessions, newest first. */
  sessions: ChatSession[]
  /** The currently active session (null if none selected). */
  currentSession: ChatSession | null
  /** Messages belonging to the current session. */
  messages: ChatMessage[]
  /** Whether any session / message list is being loaded. */
  loading: boolean
  /** Whether we are currently waiting for an AI streaming response. */
  streaming: boolean
  /** The incremental content being assembled during streaming. */
  streamingContent: string
  /** Last error message, or null. */
  error: string | null
  /** Available prompt presets. */
  presets: PromptPreset[]

  // Session management
  loadSessions: () => Promise<void>
  createSession: (title: string) => Promise<ChatSession>
  switchSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>

  // Messaging
  sendMessage: (content: string, configId?: number, sendOverride?: string) => Promise<void>

  // Quick ask (one-shot, returns the full answer)
  quickAsk: (prompt: string) => Promise<string>

  // Presets
  loadPresets: () => Promise<void>
}

// --------------- Hook ---------------

export function useAIChat(): UseAIChatReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [presets, setPresets] = useState<PromptPreset[]>([])

  // Track the active stream unsubscribers so we can clean up.
  const unsubscribersRef = useRef<Array<() => void>>([])

  // ---------- Cleanup on unmount ----------

  useEffect(() => {
    return () => {
      unsubscribersRef.current.forEach((unsub) => unsub())
      unsubscribersRef.current = []
    }
  }, [])

  // ---------- Helper: tear down current stream listeners ----------

  const teardownStream = useCallback(() => {
    unsubscribersRef.current.forEach((unsub) => unsub())
    unsubscribersRef.current = []
  }, [])

  // ---------- Load sessions ----------

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getSessions()
      setSessions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载会话列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load sessions on mount.
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // ---------- Create session ----------

  const createSession = useCallback(async (title: string) => {
    setLoading(true)
    setError(null)
    try {
      const session = await createSessionApi(title)
      // Prepend the new session and switch to it immediately.
      setSessions((prev) => [session, ...prev])
      setCurrentSession(session)
      setMessages([])
      return session
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建会话失败'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  // ---------- Switch session ----------

  const sessionsRef = useRef<ChatSession[]>([])
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  const switchSession = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const msgs = await loadMessages(id)
      setMessages(msgs)
      const found = sessionsRef.current.find((s) => s.id === id) ?? null
      setCurrentSession(found)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // Track the current session id via ref to avoid stale closures.
  const currentSessionIdRef = useRef<string | null>(null)
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id ?? null
  }, [currentSession?.id])

  // ---------- Delete session ----------

  const deleteSession = useCallback(async (id: string) => {
    setError(null)
    try {
      await deleteSessionApi(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      // If we just deleted the active session, clear it.
      if (currentSessionIdRef.current === id) {
        setCurrentSession(null)
        setMessages([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除会话失败')
    }
  }, [])

  // ---------- Send message with streaming ----------

  const sendMessage = useCallback(
    async (content: string, configId?: number, sendOverride?: string) => {
      if (streaming) return
      setError(null)

      // 确保有会话；使用 createSession 的返回值，避免 setState 异步导致的 stale 闭包。
      let session = currentSession
      if (!session) {
        const title = content.length > 20 ? content.slice(0, 20) + '...' : content || '新对话'
        try {
          session = await createSession(title)
        } catch {
          // createSession 已设置错误信息。
          return
        }
      }
      const sessionId = session.id

      setStreaming(true)
      setStreamingContent('')

      // Tear down any leftover listeners from a previous stream.
      teardownStream()

      // 乐观显示用户消息，始终为原始问题（不含上下文前缀）。
      const userMsg: ChatMessage = {
        id: `temp-user-${Date.now()}`,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])

      try {
        // 实际发给模型的内容可带上下文前缀（sendOverride）；显示与入库仍用原始 content。
        await sendMessageApi(sessionId, sendOverride ?? content, configId)

        // Subscribe to chunk events.
        const unsubC = onChunk((chunk) => {
          setStreamingContent((prev) => prev + chunk)
        })

        // Subscribe to the done event.
        const unsubD = onDone(async (fullContent) => {
          // Replace streaming content with the final assistant message.
          const assistantMsg: ChatMessage = {
            id: `temp-assistant-${Date.now()}`,
            role: 'assistant',
            content: fullContent,
            created_at: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, assistantMsg])
          setStreamingContent('')
          setStreaming(false)

          // Clean up this stream's listeners.
          unsubC()
          unsubD()
          unsubscribersRef.current = unsubscribersRef.current.filter(
            (u) => u !== unsubC && u !== unsubD,
          )

          // Persist both messages to the database (best-effort; errors should not break the UI).
          try {
            await saveMessage(sessionId, 'user', content)
            await saveMessage(sessionId, 'assistant', fullContent)
            // 自动从用户消息捕获长期记忆（"记住…/以后…"等），跨会话复用。
            await captureMemory(content, sessionId)
          } catch (saveErr) {
            console.warn('[useAIChat] Failed to persist messages:', saveErr)
          }
        })

        unsubscribersRef.current.push(unsubC, unsubD)
      } catch (err) {
        setStreaming(false)
        setStreamingContent('')
        // Remove the optimistically added user message on failure.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
        setError(err instanceof Error ? err.message : '发送消息失败')
      }
    },
    [currentSession, createSession, teardownStream, streaming],
  )

  // ---------- Quick ask ----------

  const quickAsk = useCallback(async (prompt: string): Promise<string> => {
    setError(null)
    try {
      return await quickAskApi(prompt)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '快速提问失败'
      setError(msg)
      throw err
    }
  }, [])

  // ---------- Load presets ----------

  const loadPresets = useCallback(async () => {
    try {
      const list = await getPresetsApi()
      setPresets(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载预设失败')
    }
  }, [])

  // Auto-load presets on mount.
  useEffect(() => {
    loadPresets()
  }, [loadPresets])

  // ---------- Return ----------

  return {
    sessions,
    currentSession,
    messages,
    loading,
    streaming,
    streamingContent,
    error,
    presets,

    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    sendMessage,
    quickAsk,
    loadPresets,
  }
}
