/**
 * Type-safe IPC channel definitions.
 *
 * This file maps every IPC channel name to its argument types and return type,
 * eliminating `as` type assertions in renderer-side store code.
 *
 * Usage:
 * ```ts
 * import { typedInvoke } from '../api/ipc'
 * const problems = await typedInvoke('problems-list', filters)
 * // problems is automatically typed as Problem[]
 * ```
 */

import type { Problem, Submission } from './problem'
import type {
  Message,
  Session,
  PromptPreset,
  MemoryItem,
  StreamChunkPayload,
  StreamDonePayload,
  ChatConfig,
} from './chat'
import type {
  Document,
  SearchResult,
  SemanticSearchResult,
  SearchSummary,
  ConceptGraph,
  ConceptDetail,
  Tag,
  TagSuggestion,
  RAGContext,
} from './knowledge'
import type { AnalyticsEvent, AnalyticsSummary, WeeklyReportData } from './analytics'

/**
 * Mistake with joined problem fields (title, difficulty, tags).
 * Matches the row shape returned by `mistakes-list`.
 */
export interface MistakeWithProblemRow {
  id: number
  problem_id: number
  last_wrong_code: string
  error_types: string
  error_count: number
  correct_code: string | null
  updated_at: string
  title: string
  difficulty: string
  tags: string
}

/**
 * Detailed mistake with additional problem fields (description, starter_code).
 * Matches the row shape returned by `mistakes-get`.
 */
export interface MistakeDetailRow extends MistakeWithProblemRow {
  description: string
  starter_code: string
}

/**
 * Problem filter parameters (matches the filters object accepted by `problems-list`).
 */
export interface ProblemListFilters {
  difficulty?: string
  tag?: string
  status?: string
  source?: string
  track?: string
  platform?: string
  mode?: string
}

/**
 * Submit payload for `problems-submit`.
 */
export interface SubmitPayload {
  problemId: number
  code: string
  language: string
}

/**
 * Result returned by `problems-submit`.
 */
export interface SubmitResult {
  status: string
  passed: number
  total: number
  results: Array<{ input: string; expected: string; actual: string; passed: boolean }>
  duration: number
}

/**
 * Raw chat history row from the database (before conversion to Message).
 */
export interface ChatHistoryRow {
  id: number
  role: Message['role']
  content: string
  created_at: string
}

/**
 * AI config save payload (what the renderer sends).
 */
export interface AIConfigSavePayload {
  id?: number
  name: string
  api_key: string
  base_url: string
  model: string
  is_default?: boolean | number
  task_type?: string | null
}

/**
 * AI chat request payload.
 */
export interface AIChatPayload {
  messages: Array<{ role: string; content: string }>
  configId?: number
  requestId?: string
  includeMemories?: boolean
}

/**
 * AI chat response.
 */
export interface AIChatResult {
  success: boolean
  requestId: string
  content: string
}

/**
 * AI fetch models request payload.
 */
export interface AIFetchModelsPayload {
  api_key: string
  base_url: string
}

/**
 * Chat session create payload.
 */
export interface ChatSessionCreatePayload {
  id: string
  title?: string
  system_prompt?: string
}

/**
 * Chat session update payload.
 */
export interface ChatSessionUpdatePayload {
  title?: string
  system_prompt?: string
}

/**
 * Chat message save payload.
 */
export interface ChatMessageSavePayload {
  session_id: string
  role: string
  content: string
  model?: string
}

/**
 * Chat preset save payload.
 */
export interface ChatPresetSavePayload {
  id?: number
  name: string
  prompt: string
}

/**
 * Memory save payload.
 */
export interface MemorySavePayload {
  id?: number
  content: string
  category?: string
  source?: string
  source_ref?: string | null
  pinned?: number | boolean
  enabled?: number | boolean
  confidence?: number
}

/**
 * Memory capture payload.
 */
export interface MemoryCapturePayload {
  content: string
  session_id?: string
}

/**
 * Code run request payload.
 */
export interface RunCodePayload {
  code: string
  language: string
  stdin?: string
}

/**
 * Platform information returned by the 'platform-info' IPC channel.
 */
export interface PlatformInfo {
  platform: string
  arch: string
  osVersion: string
  electronVersion: string
  appVersion: string
  chromeVersion: string
  nodeVersion: string
}

/**
 * Code run result (from codeRunner).
 */
export interface RunCodeResult {
  stdout: string
  stderr: string
  exitCode: number
  stage?: string
}

/**
 * Complete IPC channel type map.
 *
 * Each key is an IPC channel name. The value defines:
 * - `args`: tuple of argument types (empty array if no args)
 * - `result`: the return type of the handler
 */
export interface IpcChannelMap {
  // Problems
  'problems-list': { args: [ProblemListFilters?]; result: Problem[] }
  'problems-get': { args: [number]; result: Problem | undefined }
  'problems-submit': { args: [SubmitPayload]; result: SubmitResult }
  'problems-submissions': { args: [number]; result: Submission[] }

  // Mistakes
  'mistakes-list': { args: []; result: MistakeWithProblemRow[] }
  'mistakes-get': { args: [number]; result: MistakeDetailRow | undefined }
  'mistakes-update-analysis': { args: [number, string]; result: void }
  'mistakes-delete': { args: [number]; result: void }

  // Knowledge
  'knowledge-upload': { args: []; result: string[] | null }
  'knowledge-list': { args: []; result: Document[] }
  'knowledge-delete': { args: [number]; result: void }
  'knowledge-search': { args: [string]; result: SearchResult[] }
  'knowledge-semantic-search': { args: [string]; result: SemanticSearchResult[] }
  'knowledge-summarize': { args: [string]; result: SearchSummary }
  'knowledge-concept-graph': { args: []; result: ConceptGraph }
  'knowledge-concept-detail': { args: [string]; result: ConceptDetail }
  'knowledge-auto-tag': { args: [number]; result: TagSuggestion[] }
  'knowledge-tags': { args: []; result: Tag[] }
  'knowledge-tag-documents': { args: [string]; result: Document[] }
  'knowledge-rag-context': { args: [string?]; result: RAGContext }

  // Chat
  'chat-sessions-list': { args: []; result: Session[] }
  'chat-session-create': { args: [ChatSessionCreatePayload]; result: Session | undefined }
  'chat-session-update': { args: [string, ChatSessionUpdatePayload]; result: void }
  'chat-session-delete': { args: [string]; result: void }
  'chat-messages-load': { args: [string]; result: ChatHistoryRow[] }
  'chat-message-save': { args: [ChatMessageSavePayload]; result: void }
  'chat-presets-list': { args: []; result: PromptPreset[] }
  'chat-preset-save': { args: [ChatPresetSavePayload]; result: void }
  'chat-preset-delete': { args: [number]; result: void }
  'chat-memories-list': { args: [string?]; result: MemoryItem[] }
  'chat-memory-save': { args: [MemorySavePayload]; result: MemoryItem | undefined }
  'chat-memory-delete': { args: [number]; result: void }
  'chat-memory-capture': { args: [MemoryCapturePayload]; result: MemoryItem[] }

  // AI
  'ai-chat': { args: [AIChatPayload]; result: AIChatResult }
  'ai-fetch-models': { args: [AIFetchModelsPayload]; result: string[] }

  // Database / Settings
  'db-get-ai-configs': { args: []; result: ChatConfig[] }
  'db-save-ai-config': { args: [AIConfigSavePayload]; result: number | bigint }
  'db-delete-ai-config': { args: [number]; result: void }
  'db-get-default-ai-config': { args: []; result: ChatConfig | null }
  'db-get-setting': { args: [string]; result: string | null }
  'db-set-setting': { args: [string, string]; result: void }

  // Code execution
  'run-code': { args: [RunCodePayload]; result: RunCodeResult }

  // External
  'open-external': { args: [string]; result: void }

  // Platform
  'platform-info': { args: []; result: PlatformInfo }

  // Analytics
  'analytics-track': {
    args: [string, Record<string, unknown>?]
    result: void
  }
  'analytics-get-events': {
    args: [{ eventType?: string; since?: string; until?: string }?]
    result: AnalyticsEvent[]
  }
  'analytics-get-summary': { args: [number?]; result: AnalyticsSummary }
  'analytics-get-weekly-report': { args: [number?]; result: WeeklyReportData }
  'analytics-clear': { args: []; result: void }

  // Performance
  'perf-get-ipc-stats': {
    args: []
    result: Record<
      string,
      { calls: number; avgMs: number; slowCalls: number; lastCalledAt: number }
    >
  }

  // Demo data
  'demo-load-data': {
    args: []
    result: {
      problems: number
      knowledge: number
      sessions: number
      messages: number
      memories: number
      presets: number
    }
  }

  // Export/Import
  'export-data': {
    args: [string[]]
    result: { success: boolean; filePath?: string; error?: string }
  }
  'export-data-to-path': {
    args: [string[], string]
    result: { success: boolean; filePath?: string; error?: string }
  }
  'import-data': {
    args: [{ conflictResolution: string; selectedData: string[] }?]
    result: {
      success: boolean
      imported: Record<string, number>
      skipped: Record<string, number>
      errors: string[]
    }
  }
  'import-data-from-path': {
    args: [string, { conflictResolution: string; selectedData: string[] }?]
    result: {
      success: boolean
      imported: Record<string, number>
      skipped: Record<string, number>
      errors: string[]
    }
  }
  'export-get-counts': {
    args: []
    result: Record<string, number>
  }
}

/**
 * Event channel payload types (main -> renderer).
 */
export interface IpcEventMap {
  'ai-chat-chunk': StreamChunkPayload
  'ai-chat-done': StreamDonePayload
}
