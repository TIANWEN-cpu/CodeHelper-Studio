/**
 * Raw database row types used by IPC handlers.
 *
 * These represent the exact shape of rows returned by better-sqlite3 queries.
 * They live here (electron/types/) to serve as the single source of truth for
 * all main-process code that interacts with the database.
 *
 * Renderer-side types (src/types/) are the public-facing representations and
 * may differ (e.g., JSON fields parsed into arrays).
 */

/** Row shape of the `problems` table. */
export interface ProblemRow {
  id: number
  title: string
  description: string
  difficulty: string
  tags: string
  languages: string
  examples: string
  test_cases: string
  starter_code: string
  source: string
  tracks: string
  platform: string
  mode: string
  exam_style: string
  year: number | null
  official_url: string | null
  estimated_time: number | null
}

/** Row shape of the `mistakes` table. */
export interface MistakeRow {
  id: number
  problem_id: number
  last_wrong_code: string
  error_types: string
  error_count: number
  correct_code: string | null
  updated_at: string
}

/**
 * A mistake row with joined problem fields.
 * Returned by `mistakes-list` (includes title, difficulty, tags).
 */
export interface MistakeWithProblemRow extends MistakeRow {
  title: string
  difficulty: string
  tags: string
}

/**
 * A detailed mistake row with more joined problem fields.
 * Returned by `mistakes-get` (includes description, starter_code).
 */
export interface MistakeDetailRow extends MistakeWithProblemRow {
  description: string
  starter_code: string
}

/** Row shape of the `ai_configs` table. */
export interface AIConfigRow {
  id: number
  name: string
  api_key: string
  base_url: string
  model: string
  is_default: number
  task_type: string | null
  created_at: string
}

/** AI configuration with a decrypted API key — safe to send to renderer. */
export interface AIConfigDecrypted {
  id: number
  name: string
  api_key: string
  base_url: string
  model: string
  is_default: number
  task_type: string | null
  created_at: string
}

/** Row shape of the `knowledge_chunks` table with joined filename. */
export interface KnowledgeChunkRow {
  id: number
  doc_id: number
  content: string
  chunk_index: number
  filename: string
}

/** Row shape of the `memories` table. */
export interface MemoryRow {
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

/** Minimal AI config shape used for API calls (subset of AIConfigRow). */
export interface AIConfigForChat {
  id: number
  name: string
  api_key: string
  base_url: string
  model: string
}

/** A single message in the OpenAI-compatible chat format. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** Row shape of the `chat_sessions` table. */
export interface ChatSessionRow {
  id: string
  title: string
  system_prompt: string
  created_at: string
  updated_at: string
}

/** Row shape of the `chat_history` table. */
export interface ChatHistoryMessageRow {
  id: number
  session_id: string
  role: string
  content: string
  model: string | null
  created_at: string
}

/** Row shape of the `submissions` table. */
export interface SubmissionRow {
  id: number
  problem_id: number
  language: string
  code: string
  status: string
  passed_cases: number
  total_cases: number
  duration_ms: number
  created_at: string
}

/** Row shape of the `knowledge_docs` table. */
export interface KnowledgeDocRow {
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
}

/** Row shape of the `prompt_presets` table. */
export interface PromptPresetRow {
  id: number
  name: string
  prompt: string
  is_builtin: number
}

/** Row shape of the `settings` table. */
export interface SettingsRow {
  key: string
  value: string
}
