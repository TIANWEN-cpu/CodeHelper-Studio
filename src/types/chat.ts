/**
 * Shared type definitions for the Chat module.
 *
 * These interfaces are the single source of truth for chat-related data
 * structures used across stores, views, and hooks.
 */

/** A single message in a chat session. */
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

/** A persisted chat session. */
export interface Session {
  id: string
  title: string
  system_prompt: string
  created_at: string
  updated_at: string
}

/** A built-in or user-created prompt preset. */
export interface PromptPreset {
  id: number
  name: string
  prompt: string
  is_builtin: number
}

/** A cross-session memory item used for long-term context. */
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

/** Payload received during AI streaming (per chunk). */
export interface StreamChunkPayload {
  requestId: string
  chunk: string
}

/** Payload received when the AI stream finishes. */
export interface StreamDonePayload {
  requestId: string
  content: string
}

/** AI model configuration. */
export interface ChatConfig {
  id?: number
  name: string
  api_key: string
  base_url: string
  model: string
  is_default: number
  task_type: string | null
}
