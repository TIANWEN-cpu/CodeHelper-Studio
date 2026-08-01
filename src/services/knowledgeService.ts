import { invoke } from './ipc'
import type {
  KnowledgeRetrievalStatus,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from '../shared/knowledgeRetrievalContract'

export interface KnowledgeDoc {
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
  content_preview?: string
  display_title?: string
  source_repo?: string
  source_url?: string
  source_path?: string
  source_commit?: string
  category_key?: string
  category_label?: string
  category?: string
  category_dir?: string
  tags?: string[]
  import_target?: string
  generated_at?: string
  document_kind?: string
  visibility?: string
  content_sha256?: string
}

export interface KnowledgeDocDetail extends KnowledgeDoc {
  content: string
}

export type SearchResult = KnowledgeSearchResult

export interface KnowledgeSummary {
  summary: string
  keyConcepts: string[]
}

export interface ResourcePackImportResult {
  rootPath: string
  manifest?: {
    id?: string
    title?: string
    generated_at?: string
    source_root?: string
    output_root?: string
    import_target?: string
  }
  knowledge: {
    found: number
    imported: number
    skipped: number
    chunks: number
  }
  problems: {
    files: number
    found: number
    imported: number
    updated: number
    skipped: number
  }
  errors: string[]
}

export interface KnowledgeLinkAuditRecord {
  id: number
  doc_id: number
  line_number: number
  raw_target: string
  resolved_target: string | null
  link_kind: string
  status: string
  http_status: number | null
  checked_at: string | null
  detail: string | null
}

export async function getDocuments(): Promise<KnowledgeDoc[]> {
  return invoke<KnowledgeDoc[]>('knowledge-list')
}

export async function getDocument(docId: number): Promise<KnowledgeDocDetail | null> {
  return invoke<KnowledgeDocDetail | null>('knowledge-get', docId)
}

export async function getDocumentLinkAudit(docId: number): Promise<KnowledgeLinkAuditRecord[]> {
  return invoke<KnowledgeLinkAuditRecord[]>('knowledge-link-audit', docId)
}

export async function searchDocuments(query: string): Promise<KnowledgeSearchResponse> {
  return invoke<KnowledgeSearchResponse>('knowledge-search', query)
}

export async function semanticSearch(query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('knowledge-semantic-search', query)
}

export async function getRetrievalStatus(): Promise<KnowledgeRetrievalStatus> {
  return invoke<KnowledgeRetrievalStatus>('knowledge-retrieval-status')
}

export async function uploadDocument(): Promise<void> {
  return invoke<void>('knowledge-upload')
}

export async function importResourcePack(
  rootPath?: string,
): Promise<ResourcePackImportResult | null> {
  return invoke<ResourcePackImportResult | null>('resource-pack-import', { rootPath })
}

export async function deleteDocument(docId: number): Promise<void> {
  return invoke<void>('knowledge-delete', docId)
}

export type RAGContext = {
  recentProblems: unknown[]
  learningHistory: unknown[]
  knowledgeChunks: string[]
  knowledgeSources?: Array<{
    docId: number
    filename: string
    chunkIndex: number
    score: number
  }>
  retrieval?: KnowledgeRetrievalStatus
  userProfile: {
    preferredLanguage: string
    difficultyLevel: string
    strongTopics: string[]
    weakTopics: string[]
  } | null
}

export async function getRAGContext(query: string): Promise<RAGContext> {
  return invoke<RAGContext>('knowledge-rag-context', query)
}

export async function summarizeDocuments(query: string): Promise<KnowledgeSummary> {
  return invoke<KnowledgeSummary>('knowledge-summarize', query)
}
