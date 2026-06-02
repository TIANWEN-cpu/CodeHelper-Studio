/**
 * Barrel export for shared TypeScript interfaces.
 */

export type {
  Problem,
  TestCase,
  TestResult,
  Submission,
  Difficulty,
  ProblemFilters,
} from './problem'

export type {
  Message,
  Session,
  PromptPreset,
  MemoryItem,
  StreamChunkPayload,
  StreamDonePayload,
  ChatConfig,
} from './chat'

export type { Document, Chunk, SearchResult } from './knowledge'

export type {
  IpcChannelMap,
  IpcEventMap,
  ProblemListFilters,
  SubmitPayload,
  SubmitResult,
  ChatHistoryRow,
  AIConfigSavePayload,
  AIChatPayload,
  AIChatResult,
  AIFetchModelsPayload,
  ChatSessionCreatePayload,
  ChatSessionUpdatePayload,
  ChatMessageSavePayload,
  ChatPresetSavePayload,
  MemorySavePayload,
  MemoryCapturePayload,
  RunCodePayload,
  RunCodeResult,
} from './ipc'
