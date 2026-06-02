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
