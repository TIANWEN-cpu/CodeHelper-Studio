/**
 * useAIStream — shared hook for AI chat streaming.
 *
 * Encapsulates the IPC listener lifecycle for `ai-chat-chunk` and `ai-chat-done`
 * events, along with auto-scroll behavior. Extracted from ChatView.tsx to allow
 * reuse in any view that needs AI streaming (e.g. MistakesView AI analysis).
 */

import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import { typedOn } from '../api/ipc'

interface UseAIStreamOptions {
  /** Whether to auto-scroll a container ref when new messages arrive. */
  autoScroll?: boolean
}

export interface UseAIStreamReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>
  scrollToBottom: () => void
}

export function useAIStream(options: UseAIStreamOptions = {}): UseAIStreamReturn {
  const { autoScroll = true } = options
  const appendChunk = useChatStore((s) => s.appendChunk)
  const finishStream = useChatStore((s) => s.finishStream)
  const messages = useChatStore((s) => s.messages)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Subscribe to stream events via IPC
  useEffect(() => {
    const unsubChunk = typedOn('ai-chat-chunk', (payload) => {
      appendChunk(payload)
    })
    const unsubDone = typedOn('ai-chat-done', (payload) => {
      void finishStream(payload)
    })

    return () => {
      unsubChunk()
      unsubDone()
    }
  }, [appendChunk, finishStream])

  // Auto-scroll when messages change
  useEffect(() => {
    if (autoScroll) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, autoScroll])

  /** Scroll to bottom manually. */
  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return { scrollRef, scrollToBottom }
}
