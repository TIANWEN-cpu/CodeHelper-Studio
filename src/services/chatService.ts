/**
 * Chat service — abstracts chat-related IPC calls.
 *
 * Wraps all `chat-*` IPC channels behind a clean interface
 * that can be mocked for testing.
 */

import { typedInvoke } from '../api/ipc'
import type {
  ChatSessionCreatePayload,
  ChatSessionUpdatePayload,
  ChatMessageSavePayload,
  ChatHistoryRow,
  ChatPresetSavePayload,
  MemorySavePayload,
  MemoryCapturePayload,
} from '../types/ipc'
import type { Session, PromptPreset, MemoryItem } from '../types/chat'

export interface IChatService {
  sessions(): Promise<Session[]>
  createSession(payload: ChatSessionCreatePayload): Promise<Session | undefined>
  updateSession(id: string, updates: ChatSessionUpdatePayload): Promise<void>
  deleteSession(id: string): Promise<void>
  loadMessages(sessionId: string): Promise<ChatHistoryRow[]>
  saveMessage(payload: ChatMessageSavePayload): Promise<void>
  presets(): Promise<PromptPreset[]>
  savePreset(payload: ChatPresetSavePayload): Promise<void>
  deletePreset(id: number): Promise<void>
  memories(search?: string): Promise<MemoryItem[]>
  saveMemory(payload: MemorySavePayload): Promise<MemoryItem | undefined>
  deleteMemory(id: number): Promise<void>
  captureMemory(payload: MemoryCapturePayload): Promise<MemoryItem[]>
}

class ChatServiceImpl implements IChatService {
  sessions(): Promise<Session[]> {
    return typedInvoke('chat-sessions-list')
  }

  createSession(payload: ChatSessionCreatePayload): Promise<Session | undefined> {
    return typedInvoke('chat-session-create', payload)
  }

  updateSession(id: string, updates: ChatSessionUpdatePayload): Promise<void> {
    return typedInvoke('chat-session-update', id, updates)
  }

  deleteSession(id: string): Promise<void> {
    return typedInvoke('chat-session-delete', id)
  }

  loadMessages(sessionId: string): Promise<ChatHistoryRow[]> {
    return typedInvoke('chat-messages-load', sessionId)
  }

  saveMessage(payload: ChatMessageSavePayload): Promise<void> {
    return typedInvoke('chat-message-save', payload)
  }

  presets(): Promise<PromptPreset[]> {
    return typedInvoke('chat-presets-list')
  }

  savePreset(payload: ChatPresetSavePayload): Promise<void> {
    return typedInvoke('chat-preset-save', payload)
  }

  deletePreset(id: number): Promise<void> {
    return typedInvoke('chat-preset-delete', id)
  }

  memories(search?: string): Promise<MemoryItem[]> {
    return typedInvoke('chat-memories-list', search)
  }

  saveMemory(payload: MemorySavePayload): Promise<MemoryItem | undefined> {
    return typedInvoke('chat-memory-save', payload)
  }

  deleteMemory(id: number): Promise<void> {
    return typedInvoke('chat-memory-delete', id)
  }

  captureMemory(payload: MemoryCapturePayload): Promise<MemoryItem[]> {
    return typedInvoke('chat-memory-capture', payload)
  }
}

// ---------------------------------------------------------------------------
// Singleton with swappable implementation
// ---------------------------------------------------------------------------

let instance: IChatService = new ChatServiceImpl()

export const chatService: IChatService = {
  sessions: (...args) => instance.sessions(...args),
  createSession: (...args) => instance.createSession(...args),
  updateSession: (...args) => instance.updateSession(...args),
  deleteSession: (...args) => instance.deleteSession(...args),
  loadMessages: (...args) => instance.loadMessages(...args),
  saveMessage: (...args) => instance.saveMessage(...args),
  presets: (...args) => instance.presets(...args),
  savePreset: (...args) => instance.savePreset(...args),
  deletePreset: (...args) => instance.deletePreset(...args),
  memories: (...args) => instance.memories(...args),
  saveMemory: (...args) => instance.saveMemory(...args),
  deleteMemory: (...args) => instance.deleteMemory(...args),
  captureMemory: (...args) => instance.captureMemory(...args),
}

/**
 * Replace the default chat service (useful for testing).
 */
export function setChatService(service: IChatService): void {
  instance = service
}
