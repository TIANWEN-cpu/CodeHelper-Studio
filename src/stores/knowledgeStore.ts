/**
 * Knowledge store — manages knowledge base state with AI-enhanced features.
 *
 * Extends the basic document list with:
 * - Semantic search + AI summarization
 * - Concept graph for knowledge exploration
 * - Auto-tagging of documents
 * - RAG context assembly for personalized AI responses
 */

import { create } from 'zustand'
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
} from '../types/knowledge'
import { toErrorMessage } from '../utils/errors'
import { typedInvoke, invalidateCache } from '../api/ipc'

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

interface KnowledgeState {
  // Documents
  documents: Document[]
  loadingDocs: boolean

  // Keyword search (legacy)
  searchResults: SearchResult[]
  searching: boolean

  // Semantic search (AI-powered)
  semanticResults: SemanticSearchResult[]
  semanticSearching: boolean
  searchSummary: SearchSummary | null
  summarizing: boolean

  // Concept graph
  conceptGraph: ConceptGraph | null
  loadingGraph: boolean
  selectedConcept: string | null
  conceptDetail: ConceptDetail | null
  loadingConceptDetail: boolean

  // Tags
  tags: Tag[]
  loadingTags: boolean
  tagSuggestions: TagSuggestion[]
  suggestingTags: boolean
  activeTagFilter: string | null
  tagDocuments: Document[]
  loadingTagDocuments: boolean

  // RAG context
  ragContext: RAGContext | null
  loadingRAGContext: boolean

  // Shared
  error: string | null

  // Actions
  loadDocuments: () => Promise<void>
  search: (query: string) => Promise<void>
  semanticSearch: (query: string) => Promise<void>
  summarizeResults: (query: string) => Promise<void>
  loadConceptGraph: () => Promise<void>
  evictConceptGraph: () => void
  selectConcept: (conceptId: string) => Promise<void>
  clearConceptSelection: () => void
  loadTags: () => Promise<void>
  autoTagDocument: (docId: number) => Promise<TagSuggestion[]>
  setActiveTagFilter: (tag: string | null) => Promise<void>
  loadRAGContext: (query?: string) => Promise<void>
  deleteDocument: (id: number) => Promise<void>
  clearError: () => void
  clearSearch: () => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  // Initial state
  documents: [],
  loadingDocs: false,

  searchResults: [],
  searching: false,

  semanticResults: [],
  semanticSearching: false,
  searchSummary: null,
  summarizing: false,

  conceptGraph: null,
  loadingGraph: false,
  selectedConcept: null,
  conceptDetail: null,
  loadingConceptDetail: false,

  tags: [],
  loadingTags: false,
  tagSuggestions: [],
  suggestingTags: false,
  activeTagFilter: null,
  tagDocuments: [],
  loadingTagDocuments: false,

  ragContext: null,
  loadingRAGContext: false,

  error: null,

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  loadDocuments: async () => {
    set({ loadingDocs: true, error: null })
    try {
      const docs = await typedInvoke('knowledge-list')
      set({ documents: docs })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ loadingDocs: false })
    }
  },

  search: async (query: string) => {
    if (!query.trim()) return
    set({ searching: true, error: null })
    try {
      const results = await typedInvoke('knowledge-search', query)
      set({ searchResults: results })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ searching: false })
    }
  },

  semanticSearch: async (query: string) => {
    if (!query.trim()) return
    set({ semanticSearching: true, error: null, searchSummary: null })
    try {
      const results = await typedInvoke('knowledge-semantic-search', query)
      set({ semanticResults: results })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ semanticSearching: false })
    }
  },

  summarizeResults: async (query: string) => {
    if (!query.trim()) return
    set({ summarizing: true, error: null })
    try {
      const summary = await typedInvoke('knowledge-summarize', query)
      set({ searchSummary: summary })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ summarizing: false })
    }
  },

  loadConceptGraph: async () => {
    // Return cached graph if available
    if (get().conceptGraph) return
    set({ loadingGraph: true, error: null })
    try {
      const graph = await typedInvoke('knowledge-concept-graph')
      set({ conceptGraph: graph })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ loadingGraph: false })
    }
  },

  /**
   * Evict the cached concept graph to free memory.
   * Call when navigating away from the knowledge view.
   */
  evictConceptGraph: () => {
    set({ conceptGraph: null })
  },

  selectConcept: async (conceptId: string) => {
    set({ selectedConcept: conceptId, loadingConceptDetail: true, error: null })
    try {
      const detail = await typedInvoke('knowledge-concept-detail', conceptId)
      set({ conceptDetail: detail })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ loadingConceptDetail: false })
    }
  },

  clearConceptSelection: () => {
    set({ selectedConcept: null, conceptDetail: null })
  },

  loadTags: async () => {
    set({ loadingTags: true, error: null })
    try {
      const tags = await typedInvoke('knowledge-tags')
      set({ tags })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ loadingTags: false })
    }
  },

  autoTagDocument: async (docId: number) => {
    set({ suggestingTags: true, error: null })
    try {
      const suggestions = await typedInvoke('knowledge-auto-tag', docId)
      set({ tagSuggestions: suggestions })
      return suggestions
    } catch (err) {
      set({ error: toErrorMessage(err) })
      return []
    } finally {
      set({ suggestingTags: false })
    }
  },

  setActiveTagFilter: async (tag: string | null) => {
    set({ activeTagFilter: tag, loadingTagDocuments: !!tag, tagDocuments: [] })
    if (!tag) return
    try {
      const docs = await typedInvoke('knowledge-tag-documents', tag)
      set({ tagDocuments: docs })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ loadingTagDocuments: false })
    }
  },

  loadRAGContext: async (query?: string) => {
    set({ loadingRAGContext: true, error: null })
    try {
      const context = await typedInvoke('knowledge-rag-context', query)
      set({ ragContext: context })
    } catch (err) {
      set({ error: toErrorMessage(err) })
    } finally {
      set({ loadingRAGContext: false })
    }
  },

  deleteDocument: async (id: number) => {
    try {
      await typedInvoke('knowledge-delete', id)
      invalidateCache('knowledge-list')
      await get().loadDocuments()
    } catch (err) {
      set({ error: toErrorMessage(err) })
    }
  },

  clearError: () => set({ error: null }),
  clearSearch: () =>
    set({
      searchResults: [],
      semanticResults: [],
      searchSummary: null,
    }),
}))
