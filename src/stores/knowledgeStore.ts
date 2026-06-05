import { create } from 'zustand'
import { typedInvoke } from '@/api/ipc'

type KnowledgeStore = {
  documents: unknown[]
  loadingDocs: boolean
  searchResults: unknown[]
  searching: boolean
  semanticResults: unknown[]
  semanticSearching: boolean
  searchSummary: unknown
  summarizing: boolean
  conceptGraph: unknown
  loadingGraph: boolean
  selectedConcept: string | null
  conceptDetail: unknown
  loadingConceptDetail: boolean
  tags: unknown[]
  loadingTags: boolean
  tagSuggestions: unknown[]
  suggestingTags: boolean
  activeTagFilter: string | null
  tagDocuments: unknown[]
  loadingTagDocuments: boolean
  ragContext: unknown
  loadingRAGContext: boolean
  error: string | null
  loadDocuments: () => Promise<void>
  search: (query: string) => Promise<void>
  semanticSearch: (query: string) => Promise<void>
  summarizeResults: (query: string) => Promise<void>
  loadConceptGraph: () => Promise<void>
  evictConceptGraph: () => void
  selectConcept: (id: string) => Promise<void>
  clearConceptSelection: () => void
  loadTags: () => Promise<void>
  autoTagDocument: (id: number) => Promise<unknown[]>
  setActiveTagFilter: (tag: string | null) => Promise<void>
  loadRAGContext: (query?: string) => Promise<void>
  deleteDocument: (id: number) => Promise<void>
  clearError: () => void
  clearSearch: () => void
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
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
  loadDocuments: async () => {
    set({ loadingDocs: true, error: null })
    try {
      set({ documents: await typedInvoke<unknown[]>('knowledge-list') })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingDocs: false })
    }
  },
  search: async (query) => {
    if (!query.trim()) return
    set({ searching: true, error: null })
    try {
      set({ searchResults: await typedInvoke<unknown[]>('knowledge-search', query) })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ searching: false })
    }
  },
  semanticSearch: async (query) => {
    if (!query.trim()) return
    set({ semanticSearching: true, searchSummary: null, error: null })
    try {
      set({ semanticResults: await typedInvoke<unknown[]>('knowledge-semantic-search', query) })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ semanticSearching: false })
    }
  },
  summarizeResults: async (query) => {
    if (!query.trim()) return
    set({ summarizing: true, error: null })
    try {
      set({ searchSummary: await typedInvoke('knowledge-summarize', query) })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ summarizing: false })
    }
  },
  loadConceptGraph: async () => {
    if (get().conceptGraph) return
    set({ loadingGraph: true, error: null })
    try {
      set({ conceptGraph: await typedInvoke('knowledge-concept-graph') })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingGraph: false })
    }
  },
  evictConceptGraph: () => set({ conceptGraph: null }),
  selectConcept: async (id) => {
    set({ selectedConcept: id, loadingConceptDetail: true, error: null })
    try {
      set({ conceptDetail: await typedInvoke('knowledge-concept-detail', id) })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingConceptDetail: false })
    }
  },
  clearConceptSelection: () => set({ selectedConcept: null, conceptDetail: null }),
  loadTags: async () => {
    set({ loadingTags: true, error: null })
    try {
      set({ tags: await typedInvoke<unknown[]>('knowledge-tags') })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingTags: false })
    }
  },
  autoTagDocument: async (id) => {
    set({ suggestingTags: true, error: null })
    try {
      const tagSuggestions = await typedInvoke<unknown[]>('knowledge-auto-tag', id)
      set({ tagSuggestions })
      return tagSuggestions
    } catch (error) {
      set({ error: message(error), tagSuggestions: [] })
      return []
    } finally {
      set({ suggestingTags: false })
    }
  },
  setActiveTagFilter: async (tag) => {
    set({ activeTagFilter: tag, error: null })
    if (!tag) return
    set({ loadingTagDocuments: true })
    try {
      set({ tagDocuments: await typedInvoke<unknown[]>('knowledge-tag-documents', tag) })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingTagDocuments: false })
    }
  },
  loadRAGContext: async (query) => {
    set({ loadingRAGContext: true, error: null })
    try {
      set({ ragContext: await typedInvoke('knowledge-rag-context', query) })
    } catch (error) {
      set({ error: message(error) })
    } finally {
      set({ loadingRAGContext: false })
    }
  },
  deleteDocument: async (id) => {
    set({ error: null })
    try {
      await typedInvoke('knowledge-delete', id)
      await get().loadDocuments()
    } catch (error) {
      set({ error: message(error) })
    }
  },
  clearError: () => set({ error: null }),
  clearSearch: () => set({ searchResults: [], semanticResults: [], searchSummary: null }),
}))
