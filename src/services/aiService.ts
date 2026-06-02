/**
 * AI service — abstracts AI-related IPC calls.
 *
 * Wraps `ai-chat` IPC channel behind a clean interface
 * that can be mocked for testing.
 */

import { typedInvoke } from '../api/ipc'
import type { AIChatPayload, AIChatResult } from '../types/ipc'

export interface IAIService {
  chat(payload: AIChatPayload): Promise<AIChatResult>
}

class AIServiceImpl implements IAIService {
  chat(payload: AIChatPayload): Promise<AIChatResult> {
    return typedInvoke('ai-chat', payload)
  }
}

// ---------------------------------------------------------------------------
// Singleton with swappable implementation
// ---------------------------------------------------------------------------

let instance: IAIService = new AIServiceImpl()

export const aiService: IAIService = {
  chat: (...args) => instance.chat(...args),
}

/**
 * Replace the default AI service (useful for testing).
 */
export function setAIService(service: IAIService): void {
  instance = service
}
