import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock typedInvoke before importing the store
const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

// Import store after mock is set up
const { useProblemStore } = await import('../src/stores/problemStore')

beforeEach(() => {
  // Reset store to initial state
  useProblemStore.setState({
    problems: [],
    activeProblemId: null,
    activeProblem: null,
    submitResult: null,
    submitting: false,
    selectedLanguage: 'python',
    filters: {},
    listCollapsed: false,
    aiPanelOpen: false,
    aiPanelWidth: 420,
  })
  mockInvoke.mockReset()
})

describe('problemStore', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useProblemStore.getState()
      expect(state.problems).toEqual([])
      expect(state.activeProblemId).toBeNull()
      expect(state.activeProblem).toBeNull()
      expect(state.submitResult).toBeNull()
      expect(state.submitting).toBe(false)
      expect(state.selectedLanguage).toBe('python')
      expect(state.filters).toEqual({})
      expect(state.listCollapsed).toBe(false)
      expect(state.aiPanelOpen).toBe(false)
      expect(state.aiPanelWidth).toBe(420)
    })
  })

  describe('loadProblems', () => {
    it('loads problems from IPC', async () => {
      const mockProblems = [
        { id: 1, title: 'Two Sum', difficulty: 'easy', tags: '[]' },
        { id: 2, title: 'Three Sum', difficulty: 'medium', tags: '[]' },
      ]
      mockInvoke.mockResolvedValueOnce(mockProblems)

      await useProblemStore.getState().loadProblems()

      expect(mockInvoke).toHaveBeenCalledWith('problems-list', {})
      expect(useProblemStore.getState().problems).toEqual(mockProblems)
    })

    it('passes current filters to IPC', async () => {
      mockInvoke.mockResolvedValueOnce([])
      useProblemStore.setState({ filters: { difficulty: 'easy', tag: 'array' } })

      await useProblemStore.getState().loadProblems()

      expect(mockInvoke).toHaveBeenCalledWith('problems-list', {
        difficulty: 'easy',
        tag: 'array',
      })
    })
  })

  describe('setActiveProblem', () => {
    it('loads problem by id and sets it active', async () => {
      const mockProblem = { id: 5, title: 'Test Problem', difficulty: 'hard' }
      mockInvoke.mockResolvedValueOnce(mockProblem)

      await useProblemStore.getState().setActiveProblem(5)

      expect(mockInvoke).toHaveBeenCalledWith('problems-get', 5)
      const state = useProblemStore.getState()
      expect(state.activeProblemId).toBe(5)
      expect(state.activeProblem).toEqual(mockProblem)
      expect(state.submitResult).toBeNull()
    })

    it('sets activeProblem to null when problem not found', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)

      await useProblemStore.getState().setActiveProblem(999)

      expect(useProblemStore.getState().activeProblem).toBeNull()
      expect(useProblemStore.getState().activeProblemId).toBe(999)
    })

    it('clears submitResult when switching problems', async () => {
      useProblemStore.setState({
        submitResult: { status: 'accepted', passed: 1, total: 1, results: [], duration: 100 },
      })
      mockInvoke.mockResolvedValueOnce({ id: 1, title: 'New' })

      await useProblemStore.getState().setActiveProblem(1)

      expect(useProblemStore.getState().submitResult).toBeNull()
    })
  })

  describe('setFilters', () => {
    it('updates filters and reloads problems', async () => {
      mockInvoke.mockResolvedValueOnce([])

      useProblemStore.getState().setFilters({ difficulty: 'medium' })

      expect(useProblemStore.getState().filters).toEqual({ difficulty: 'medium' })
      // loadProblems is called internally
      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('problems-list', { difficulty: 'medium' })
      })
    })
  })

  describe('simple setters', () => {
    it('setSelectedLanguage updates language', () => {
      useProblemStore.getState().setSelectedLanguage('javascript')
      expect(useProblemStore.getState().selectedLanguage).toBe('javascript')
    })

    it('setListCollapsed toggles collapse', () => {
      useProblemStore.getState().setListCollapsed(true)
      expect(useProblemStore.getState().listCollapsed).toBe(true)
    })

    it('setAIPanelOpen toggles panel', () => {
      useProblemStore.getState().setAIPanelOpen(true)
      expect(useProblemStore.getState().aiPanelOpen).toBe(true)
    })

    it('setAIPanelWidth updates width', () => {
      useProblemStore.getState().setAIPanelWidth(600)
      expect(useProblemStore.getState().aiPanelWidth).toBe(600)
    })
  })

  describe('submit', () => {
    it('does nothing when no active problem', async () => {
      useProblemStore.setState({ activeProblemId: null })

      await useProblemStore.getState().submit('print("hi")', 'python')

      expect(mockInvoke).not.toHaveBeenCalled()
      expect(useProblemStore.getState().submitting).toBe(false)
    })

    it('sets submitting state and clears previous result', async () => {
      useProblemStore.setState({ activeProblemId: 1 })
      const mockResult = { status: 'accepted', passed: 3, total: 3, results: [], duration: 50 }
      mockInvoke.mockResolvedValueOnce(mockResult)
      // loadProblems called after submit
      mockInvoke.mockResolvedValueOnce([])

      const submitPromise = useProblemStore.getState().submit('code', 'python')

      // Should be submitting immediately
      expect(useProblemStore.getState().submitting).toBe(true)
      expect(useProblemStore.getState().submitResult).toBeNull()

      await submitPromise

      expect(useProblemStore.getState().submitting).toBe(false)
      expect(useProblemStore.getState().submitResult).toEqual(mockResult)
    })

    it('handles submit error gracefully', async () => {
      useProblemStore.setState({ activeProblemId: 1 })
      mockInvoke.mockRejectedValueOnce(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useProblemStore.getState().submit('code', 'python')

      expect(useProblemStore.getState().submitting).toBe(false)
      expect(useProblemStore.getState().submitResult).toEqual({
        status: 'error',
        passed: 0,
        total: 0,
        results: [],
        duration: 0,
      })
      expect(consoleSpy).toHaveBeenCalledWith('[ProblemStore.submit]', 'Network error')
      consoleSpy.mockRestore()
    })

    it('calls loadProblems after successful submit', async () => {
      useProblemStore.setState({ activeProblemId: 1 })
      mockInvoke.mockResolvedValueOnce({
        status: 'accepted',
        passed: 1,
        total: 1,
        results: [],
        duration: 10,
      })
      mockInvoke.mockResolvedValueOnce([]) // loadProblems

      await useProblemStore.getState().submit('code', 'python')

      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'problems-list', {})
    })
  })

  describe('clearResult', () => {
    it('clears submitResult', () => {
      useProblemStore.setState({
        submitResult: { status: 'accepted', passed: 1, total: 1, results: [], duration: 10 },
      })
      useProblemStore.getState().clearResult()
      expect(useProblemStore.getState().submitResult).toBeNull()
    })
  })
})
