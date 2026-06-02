/**
 * Shared type definitions for the Knowledge module.
 *
 * These interfaces are the single source of truth for knowledge-base related
 * data structures used across stores, views, and IPC calls.
 */

/** A document uploaded to the knowledge base. */
export interface Document {
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
}

/** A chunk of text from a knowledge base document. */
export interface Chunk {
  id: number
  document_id: number
  content: string
  chunk_index: number
}

/** A single search result from the knowledge base. */
export interface SearchResult {
  content: string
  filename: string
  score: number
}
