export type KnowledgeRetrievalMode =
  | 'hybrid'
  | 'hybrid-degraded'
  | 'keyword-fallback'
  | 'unavailable'

export type KnowledgeRetrievalChannel = 'keyword' | 'semantic' | 'fallback'

export interface KnowledgeRetrievalStatus {
  available: boolean
  degraded: boolean
  mode: KnowledgeRetrievalMode
  lexicalBackend: 'fts5-bm25' | 'bounded-like' | 'none'
  semanticBackend: 'fts5-trigram-local-ngram' | 'local-ngram-rerank' | 'none'
  reason: string
  documentCount: number
  chunkCount: number
  indexedAt: number
}

export interface KnowledgeSearchResult {
  id: number
  doc_id: number
  filename: string
  content: string
  chunk_index: number
  score: number
  keywordScore: number
  semanticScore: number
  channels: KnowledgeRetrievalChannel[]
  explanation: string
}

export interface KnowledgeSearchResponse {
  query: string
  results: KnowledgeSearchResult[]
  retrieval: KnowledgeRetrievalStatus & {
    candidateCount: number
    durationMs: number
  }
}

export interface KnowledgeRagSource {
  docId: number
  filename: string
  chunkIndex: number
  score: number
}
