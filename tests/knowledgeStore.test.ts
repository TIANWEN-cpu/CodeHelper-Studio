import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock typedInvoke before importing the store
const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

const { useKnowledgeStore } = await import('../src/stores/knowledgeStore')

beforeEach(() => {
  useKnowledgeStore.setState({
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
  })
  mockInvoke.mockReset()
})

describe('knowledgeStore', () => {
  // -------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useKnowledgeStore.getState()
      expect(state.documents).toEqual([])
      expect(state.searchResults).toEqual([])
      expect(state.semanticResults).toEqual([])
      expect(state.searchSummary).toBeNull()
      expect(state.searching).toBe(false)
      expect(state.semanticSearching).toBe(false)
      expect(state.summarizing).toBe(false)
      expect(state.conceptGraph).toBeNull()
      expect(state.loadingGraph).toBe(false)
      expect(state.selectedConcept).toBeNull()
      expect(state.conceptDetail).toBeNull()
      expect(state.tags).toEqual([])
      expect(state.activeTagFilter).toBeNull()
      expect(state.ragContext).toBeNull()
      expect(state.error).toBeNull()
    })
  })

  // -------------------------------------------------------------------
  // loadDocuments
  // -------------------------------------------------------------------
  describe('loadDocuments', () => {
    it('loads documents from IPC', async () => {
      const docs = [
        { id: 1, filename: 'test.pdf', chunk_count: 5, created_at: '2024-01-01' },
        { id: 2, filename: 'readme.md', chunk_count: 3, created_at: '2024-01-02' },
      ]
      mockInvoke.mockResolvedValueOnce(docs)

      await useKnowledgeStore.getState().loadDocuments()

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-list')
      expect(useKnowledgeStore.getState().documents).toEqual(docs)
      expect(useKnowledgeStore.getState().loadingDocs).toBe(false)
    })

    it('sets loading state during load', async () => {
      let resolvePromise: (v: unknown) => void
      mockInvoke.mockReturnValueOnce(new Promise((r) => (resolvePromise = r)))

      const loadPromise = useKnowledgeStore.getState().loadDocuments()
      expect(useKnowledgeStore.getState().loadingDocs).toBe(true)

      resolvePromise!([])
      await loadPromise
      expect(useKnowledgeStore.getState().loadingDocs).toBe(false)
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('DB error'))

      await useKnowledgeStore.getState().loadDocuments()

      expect(useKnowledgeStore.getState().error).toBe('DB error')
      expect(useKnowledgeStore.getState().loadingDocs).toBe(false)
    })

    it('clears previous error on new load', async () => {
      useKnowledgeStore.setState({ error: 'previous error' })
      mockInvoke.mockResolvedValueOnce([])

      await useKnowledgeStore.getState().loadDocuments()

      expect(useKnowledgeStore.getState().error).toBeNull()
    })
  })

  // -------------------------------------------------------------------
  // search (keyword)
  // -------------------------------------------------------------------
  describe('search', () => {
    it('invokes keyword search IPC', async () => {
      const results = [{ filename: 'test.pdf', content: 'match', score: 0.9 }]
      mockInvoke.mockResolvedValueOnce(results)

      await useKnowledgeStore.getState().search('algorithm')

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-search', 'algorithm')
      expect(useKnowledgeStore.getState().searchResults).toEqual(results)
      expect(useKnowledgeStore.getState().searching).toBe(false)
    })

    it('skips search for empty query', async () => {
      await useKnowledgeStore.getState().search('')
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('skips search for whitespace-only query', async () => {
      await useKnowledgeStore.getState().search('   ')
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('sets error on search failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Network error'))

      await useKnowledgeStore.getState().search('test')

      expect(useKnowledgeStore.getState().error).toBe('Network error')
    })

    it('sets searching state', async () => {
      let resolve: (v: unknown) => void
      mockInvoke.mockReturnValueOnce(new Promise((r) => (resolve = r)))

      const p = useKnowledgeStore.getState().search('query')
      expect(useKnowledgeStore.getState().searching).toBe(true)

      resolve!([])
      await p
      expect(useKnowledgeStore.getState().searching).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // semanticSearch
  // -------------------------------------------------------------------
  describe('semanticSearch', () => {
    it('invokes semantic search IPC', async () => {
      const results = [
        { doc_id: 1, chunk_id: 'c1', filename: 'doc.pdf', content: 'match', score: 0.85 },
      ]
      mockInvoke.mockResolvedValueOnce(results)

      await useKnowledgeStore.getState().semanticSearch('dynamic programming')

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-semantic-search', 'dynamic programming')
      expect(useKnowledgeStore.getState().semanticResults).toEqual(results)
    })

    it('skips search for empty query', async () => {
      await useKnowledgeStore.getState().semanticSearch('')
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('clears searchSummary on new search', async () => {
      useKnowledgeStore.setState({ searchSummary: { summary: 'old', keyConcepts: [] } })
      mockInvoke.mockResolvedValueOnce([])

      await useKnowledgeStore.getState().semanticSearch('new query')

      expect(useKnowledgeStore.getState().searchSummary).toBeNull()
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('API error'))

      await useKnowledgeStore.getState().semanticSearch('query')

      expect(useKnowledgeStore.getState().error).toBe('API error')
      expect(useKnowledgeStore.getState().semanticSearching).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // summarizeResults
  // -------------------------------------------------------------------
  describe('summarizeResults', () => {
    it('invokes summarize IPC', async () => {
      const summary = { summary: 'Summary text', keyConcepts: ['DP', 'graph'] }
      mockInvoke.mockResolvedValueOnce(summary)

      await useKnowledgeStore.getState().summarizeResults('algorithms')

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-summarize', 'algorithms')
      expect(useKnowledgeStore.getState().searchSummary).toEqual(summary)
    })

    it('skips for empty query', async () => {
      await useKnowledgeStore.getState().summarizeResults('')
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('timeout'))
      await useKnowledgeStore.getState().summarizeResults('query')
      expect(useKnowledgeStore.getState().error).toBe('timeout')
    })
  })

  // -------------------------------------------------------------------
  // loadConceptGraph
  // -------------------------------------------------------------------
  describe('loadConceptGraph', () => {
    it('loads concept graph from IPC', async () => {
      const graph = { nodes: [{ id: 'a', label: 'A' }], edges: [] }
      mockInvoke.mockResolvedValueOnce(graph)

      await useKnowledgeStore.getState().loadConceptGraph()

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-concept-graph')
      expect(useKnowledgeStore.getState().conceptGraph).toEqual(graph)
    })

    it('returns cached graph if already loaded', async () => {
      const graph = { nodes: [], edges: [] }
      useKnowledgeStore.setState({ conceptGraph: graph })

      await useKnowledgeStore.getState().loadConceptGraph()

      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('fail'))
      await useKnowledgeStore.getState().loadConceptGraph()
      expect(useKnowledgeStore.getState().error).toBe('fail')
    })
  })

  // -------------------------------------------------------------------
  // evictConceptGraph
  // -------------------------------------------------------------------
  describe('evictConceptGraph', () => {
    it('clears concept graph cache', () => {
      useKnowledgeStore.setState({ conceptGraph: { nodes: [], edges: [] } })
      useKnowledgeStore.getState().evictConceptGraph()
      expect(useKnowledgeStore.getState().conceptGraph).toBeNull()
    })
  })

  // -------------------------------------------------------------------
  // selectConcept
  // -------------------------------------------------------------------
  describe('selectConcept', () => {
    it('loads concept detail from IPC', async () => {
      const detail = { id: 'dp', label: 'Dynamic Programming', relatedConcepts: [] }
      mockInvoke.mockResolvedValueOnce(detail)

      await useKnowledgeStore.getState().selectConcept('dp')

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-concept-detail', 'dp')
      expect(useKnowledgeStore.getState().selectedConcept).toBe('dp')
      expect(useKnowledgeStore.getState().conceptDetail).toEqual(detail)
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('not found'))
      await useKnowledgeStore.getState().selectConcept('xyz')
      expect(useKnowledgeStore.getState().error).toBe('not found')
      expect(useKnowledgeStore.getState().loadingConceptDetail).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // clearConceptSelection
  // -------------------------------------------------------------------
  describe('clearConceptSelection', () => {
    it('clears selected concept and detail', () => {
      useKnowledgeStore.setState({
        selectedConcept: 'dp',
        conceptDetail: { id: 'dp', label: 'DP', relatedConcepts: [] },
      })
      useKnowledgeStore.getState().clearConceptSelection()
      expect(useKnowledgeStore.getState().selectedConcept).toBeNull()
      expect(useKnowledgeStore.getState().conceptDetail).toBeNull()
    })
  })

  // -------------------------------------------------------------------
  // loadTags
  // -------------------------------------------------------------------
  describe('loadTags', () => {
    it('loads tags from IPC', async () => {
      const tags = [
        { name: 'algorithm', count: 10 },
        { name: 'data-structure', count: 5 },
      ]
      mockInvoke.mockResolvedValueOnce(tags)

      await useKnowledgeStore.getState().loadTags()

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-tags')
      expect(useKnowledgeStore.getState().tags).toEqual(tags)
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('fail'))
      await useKnowledgeStore.getState().loadTags()
      expect(useKnowledgeStore.getState().error).toBe('fail')
    })
  })

  // -------------------------------------------------------------------
  // autoTagDocument
  // -------------------------------------------------------------------
  describe('autoTagDocument', () => {
    it('invokes auto-tag IPC and returns suggestions', async () => {
      const suggestions = [{ tag: 'algorithm', confidence: 0.9 }]
      mockInvoke.mockResolvedValueOnce(suggestions)

      const result = await useKnowledgeStore.getState().autoTagDocument(1)

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-auto-tag', 1)
      expect(result).toEqual(suggestions)
      expect(useKnowledgeStore.getState().tagSuggestions).toEqual(suggestions)
    })

    it('returns empty array on error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('AI error'))

      const result = await useKnowledgeStore.getState().autoTagDocument(1)

      expect(result).toEqual([])
      expect(useKnowledgeStore.getState().error).toBe('AI error')
    })
  })

  // -------------------------------------------------------------------
  // setActiveTagFilter
  // -------------------------------------------------------------------
  describe('setActiveTagFilter', () => {
    it('loads documents by tag', async () => {
      const docs = [{ id: 1, filename: 'doc.pdf', chunk_count: 3 }]
      mockInvoke.mockResolvedValueOnce(docs)

      await useKnowledgeStore.getState().setActiveTagFilter('algorithm')

      expect(useKnowledgeStore.getState().activeTagFilter).toBe('algorithm')
      expect(mockInvoke).toHaveBeenCalledWith('knowledge-tag-documents', 'algorithm')
      expect(useKnowledgeStore.getState().tagDocuments).toEqual(docs)
    })

    it('clears filter and skips IPC when null', async () => {
      await useKnowledgeStore.getState().setActiveTagFilter(null)
      expect(useKnowledgeStore.getState().activeTagFilter).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('filter error'))
      await useKnowledgeStore.getState().setActiveTagFilter('bad-tag')
      expect(useKnowledgeStore.getState().error).toBe('filter error')
    })
  })

  // -------------------------------------------------------------------
  // loadRAGContext
  // -------------------------------------------------------------------
  describe('loadRAGContext', () => {
    it('loads RAG context from IPC', async () => {
      const context = { documents: [], memories: [] }
      mockInvoke.mockResolvedValueOnce(context)

      await useKnowledgeStore.getState().loadRAGContext('test query')

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-rag-context', 'test query')
      expect(useKnowledgeStore.getState().ragContext).toEqual(context)
    })

    it('loads without query', async () => {
      mockInvoke.mockResolvedValueOnce({ documents: [], memories: [] })
      await useKnowledgeStore.getState().loadRAGContext()
      expect(mockInvoke).toHaveBeenCalledWith('knowledge-rag-context', undefined)
    })

    it('sets error on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('RAG error'))
      await useKnowledgeStore.getState().loadRAGContext()
      expect(useKnowledgeStore.getState().error).toBe('RAG error')
    })
  })

  // -------------------------------------------------------------------
  // deleteDocument
  // -------------------------------------------------------------------
  describe('deleteDocument', () => {
    it('deletes document and reloads list', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // delete
      mockInvoke.mockResolvedValueOnce([]) // reload

      await useKnowledgeStore.getState().deleteDocument(1)

      expect(mockInvoke).toHaveBeenCalledWith('knowledge-delete', 1)
      expect(mockInvoke).toHaveBeenCalledWith('knowledge-list')
    })

    it('sets error on delete failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('delete failed'))

      await useKnowledgeStore.getState().deleteDocument(99)

      expect(useKnowledgeStore.getState().error).toBe('delete failed')
    })
  })

  // -------------------------------------------------------------------
  // clearError
  // -------------------------------------------------------------------
  describe('clearError', () => {
    it('clears the error state', () => {
      useKnowledgeStore.setState({ error: 'some error' })
      useKnowledgeStore.getState().clearError()
      expect(useKnowledgeStore.getState().error).toBeNull()
    })
  })

  // -------------------------------------------------------------------
  // clearSearch
  // -------------------------------------------------------------------
  describe('clearSearch', () => {
    it('clears all search state', () => {
      useKnowledgeStore.setState({
        searchResults: [{ filename: 'a', content: 'b', score: 1 }],
        semanticResults: [{ doc_id: 1, chunk_id: 'c', filename: 'd', content: 'e', score: 1 }],
        searchSummary: { summary: 's', keyConcepts: ['a'] },
      })

      useKnowledgeStore.getState().clearSearch()

      expect(useKnowledgeStore.getState().searchResults).toEqual([])
      expect(useKnowledgeStore.getState().semanticResults).toEqual([])
      expect(useKnowledgeStore.getState().searchSummary).toBeNull()
    })
  })
})
