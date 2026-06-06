import { invoke } from './ipc'

export interface KnowledgeDoc {
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
}

export interface SearchResult {
  doc_id: number
  filename: string
  content: string
  score: number
  chunk_index: number
}

export interface ResourcePackImportResult {
  rootPath: string
  manifest?: {
    generated_at?: string
    source_root?: string
    output_root?: string
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

export async function getDocuments(): Promise<KnowledgeDoc[]> {
  return invoke<KnowledgeDoc[]>('knowledge-list')
}

export async function searchDocuments(query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('knowledge-search', query)
}

export async function semanticSearch(query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('knowledge-semantic-search', query)
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

export async function getRAGContext(query: string): Promise<string> {
  return invoke<string>('knowledge-rag-context', query)
}

export async function summarize(query: string): Promise<string> {
  return invoke<string>('knowledge-summarize', query)
}
