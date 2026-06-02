/**
 * Integration test: Problem selection -> code edit -> submission flow.
 *
 * Exercises the full lifecycle across problemStore + editorStore,
 * verifying that IPC calls fire in the correct order and state
 * transitions are consistent.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ---- Mock IPC layer -------------------------------------------------------
const mockInvoke = vi.fn() as Mock
vi.mock('../../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

// ---- Import stores after mocks are installed --------------------------------
const { useProblemStore } = await import('../../src/stores/problemStore')
const { useEditorStore } = await import('../../src/stores/editorStore')

// ---- Fixtures --------------------------------------------------------------
const MOCK_PROBLEMS = [
  {
    id: 1,
    title: 'Two Sum',
    description: 'Given an array...',
    difficulty: 'easy',
    tags: '["array","hash-table"]',
    languages: '["python","javascript"]',
    examples: '[{"input":"[2,7,11,15], 9","output":"[0,1]"}]',
    test_cases: '[{"input":"[2,7,11,15], 9","expected":"[0,1]"}]',
    starter_code: 'def twoSum(nums, target):\n    pass\n',
    solved: 0,
  },
  {
    id: 2,
    title: 'Valid Parentheses',
    description: 'Given a string...',
    difficulty: 'medium',
    tags: '["stack","string"]',
    languages: '["python","javascript"]',
    examples: '[]',
    test_cases: '[]',
    starter_code: '',
    solved: 1,
  },
]

const MOCK_SUBMISSION_PASS = {
  status: 'accepted',
  passed: 3,
  total: 3,
  results: [
    { input: '[2,7,11,15], 9', expected: '[0,1]', actual: '[0,1]', passed: true },
    { input: '[3,2,4], 6', expected: '[1,2]', actual: '[1,2]', passed: true },
    { input: '[3,3], 6', expected: '[0,1]', actual: '[0,1]', passed: true },
  ],
  duration: 42,
}

const MOCK_SUBMISSION_FAIL = {
  status: 'wrong_answer',
  passed: 1,
  total: 3,
  results: [
    { input: '[2,7,11,15], 9', expected: '[0,1]', actual: '[0,1]', passed: true },
    { input: '[3,2,4], 6', expected: '[1,2]', actual: '[0,1]', passed: false },
    { input: '[3,3], 6', expected: '[0,1]', actual: '[]', passed: false },
  ],
  duration: 38,
}

// ---- Helpers ---------------------------------------------------------------
function resetStores() {
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
    loading: false,
    loadError: null,
  })
  useEditorStore.setState({
    tabs: [
      { id: 'welcome', filename: 'welcome.py', language: 'python', content: 'print("hello")' },
    ],
    activeTabId: 'welcome',
  })
  mockInvoke.mockReset()
}

// ---- Tests ------------------------------------------------------------------
describe('Integration: problem flow', () => {
  beforeEach(resetStores)

  // ---- Full happy path: load -> select -> edit -> submit (pass) -----------
  describe('happy path: load -> select -> edit -> submit', () => {
    it('completes the full cycle and records a passing submission', async () => {
      // 1. loadProblems
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS)
      await useProblemStore.getState().loadProblems()
      expect(useProblemStore.getState().problems).toHaveLength(2)
      expect(useProblemStore.getState().loading).toBe(false)
      expect(useProblemStore.getState().loadError).toBeNull()

      // 2. setActiveProblem (select problem 1)
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS[0])
      await useProblemStore.getState().setActiveProblem(1)
      const { activeProblem, activeProblemId } = useProblemStore.getState()
      expect(activeProblemId).toBe(1)
      expect(activeProblem!.title).toBe('Two Sum')

      // 3. Simulate code edit in editor (open starter code in a new tab)
      const starterCode = activeProblem!.starter_code
      useEditorStore.getState().addTab({
        id: 'problem-1',
        filename: 'two_sum.py',
        language: 'python',
        content: starterCode,
      })
      expect(useEditorStore.getState().tabs).toHaveLength(2)

      // User edits the code
      const userCode =
        'def twoSum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target-n], i]\n        seen[n] = i\n'
      useEditorStore.getState().updateContent('problem-1', userCode)
      expect(useEditorStore.getState().tabs.find((t) => t.id === 'problem-1')!.content).toBe(
        userCode,
      )

      // 4. Submit the solution
      mockInvoke.mockResolvedValueOnce(MOCK_SUBMISSION_PASS)
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS) // loadProblems refresh after submit
      await useProblemStore.getState().submit(userCode, 'python')

      const { submitResult, submitting } = useProblemStore.getState()
      expect(submitting).toBe(false)
      expect(submitResult!.status).toBe('accepted')
      expect(submitResult!.passed).toBe(3)
      expect(submitResult!.total).toBe(3)
      expect(submitResult!.results.every((r) => r.passed)).toBe(true)

      // 5. Verify IPC calls were in correct order
      const calls = mockInvoke.mock.calls.map((c) => c[0])
      expect(calls).toEqual([
        'problems-list',
        'problems-get',
        'problems-submit',
        'problems-list', // refresh after submit
      ])
    })
  })

  // ---- Submission fails (wrong answer) -----------------------------------
  describe('wrong answer submission', () => {
    it('records a failed submission with detailed test results', async () => {
      // Load and select
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS)
      await useProblemStore.getState().loadProblems()
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS[0])
      await useProblemStore.getState().setActiveProblem(1)

      // Submit with wrong code
      mockInvoke.mockResolvedValueOnce(MOCK_SUBMISSION_FAIL)
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS)
      await useProblemStore.getState().submit('def twoSum(): pass', 'python')

      const { submitResult } = useProblemStore.getState()
      expect(submitResult!.status).toBe('wrong_answer')
      expect(submitResult!.passed).toBe(1)
      expect(submitResult!.total).toBe(3)
      expect(submitResult!.results.filter((r) => !r.passed)).toHaveLength(2)
    })
  })

  // ---- IPC error during load --------------------------------------------
  describe('error: problem list load failure', () => {
    it('sets loadError and does not populate problems', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Database corrupted'))

      await useProblemStore.getState().loadProblems()

      expect(useProblemStore.getState().problems).toEqual([])
      expect(useProblemStore.getState().loadError).toBe('Database corrupted')
      expect(useProblemStore.getState().loading).toBe(false)
    })
  })

  // ---- IPC error during submission ---------------------------------------
  describe('error: submission IPC failure', () => {
    it('sets a generic error submission result when IPC rejects', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS)
      await useProblemStore.getState().loadProblems()
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS[0])
      await useProblemStore.getState().setActiveProblem(1)

      mockInvoke.mockRejectedValueOnce(new Error('Runner crashed'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useProblemStore.getState().submit('code', 'python')

      expect(useProblemStore.getState().submitResult).toEqual({
        status: 'error',
        passed: 0,
        total: 0,
        results: [],
        duration: 0,
      })
      expect(useProblemStore.getState().submitting).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ---- Submit with no active problem -------------------------------------
  describe('submit with no active problem', () => {
    it('does nothing and does not call IPC', async () => {
      await useProblemStore.getState().submit('code', 'python')
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  // ---- Filter then load --------------------------------------------------
  describe('filter-driven reload', () => {
    it('sets filters and triggers a new loadProblems call', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS.filter((p) => p.difficulty === 'easy'))

      useProblemStore.getState().setFilters({ difficulty: 'easy' })

      await vi.waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('problems-list', { difficulty: 'easy' })
      })
      expect(useProblemStore.getState().filters).toEqual({ difficulty: 'easy' })
    })
  })

  // ---- Switching problems clears previous submission ----------------------
  describe('switching problems clears state', () => {
    it('clears submitResult when selecting a different problem', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS)
      await useProblemStore.getState().loadProblems()
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS[0])
      await useProblemStore.getState().setActiveProblem(1)
      mockInvoke.mockResolvedValueOnce(MOCK_SUBMISSION_PASS)
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS)
      await useProblemStore.getState().submit('code', 'python')
      expect(useProblemStore.getState().submitResult).not.toBeNull()

      // Switch to problem 2
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS[1])
      await useProblemStore.getState().setActiveProblem(2)
      expect(useProblemStore.getState().submitResult).toBeNull()
      expect(useProblemStore.getState().activeProblem!.title).toBe('Valid Parentheses')
    })
  })

  // ---- Problem not found -------------------------------------------------
  describe('selecting a non-existent problem', () => {
    it('sets activeProblemId but activeProblem stays null', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await useProblemStore.getState().setActiveProblem(999)

      expect(useProblemStore.getState().activeProblemId).toBe(999)
      expect(useProblemStore.getState().activeProblem).toBeNull()
    })
  })

  // ---- Editor tab lifecycle alongside problem flow -----------------------
  describe('editor tab lifecycle', () => {
    it('manages tabs for multiple problems', () => {
      // Open tabs for two problems
      useEditorStore
        .getState()
        .addTab({ id: 'p1', filename: 'two_sum.py', language: 'python', content: 'code1' })
      useEditorStore
        .getState()
        .addTab({ id: 'p2', filename: 'parentheses.py', language: 'python', content: 'code2' })
      expect(useEditorStore.getState().tabs).toHaveLength(3) // welcome + 2

      // Close the first problem tab
      useEditorStore.getState().closeTab('p1')
      expect(useEditorStore.getState().tabs).toHaveLength(2)
      expect(useEditorStore.getState().tabs.find((t) => t.id === 'p2')).toBeTruthy()

      // Active tab should have switched if we closed the active one
      useEditorStore.getState().setActiveTab('p2')
      useEditorStore.getState().closeTab('p2')
      // Should fall back to welcome
      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })
  })

  // ---- Language selection persistence ------------------------------------
  describe('language selection across problem switch', () => {
    it('persists language selection when switching problems', async () => {
      useProblemStore.getState().setSelectedLanguage('javascript')
      expect(useProblemStore.getState().selectedLanguage).toBe('javascript')

      // Switch problems -- language should remain
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS[0])
      await useProblemStore.getState().setActiveProblem(1)
      expect(useProblemStore.getState().selectedLanguage).toBe('javascript')
    })
  })

  // ---- AI panel state ----------------------------------------------------
  describe('AI panel toggle during problem solving', () => {
    it('can toggle AI panel open/closed independently of problem state', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS)
      await useProblemStore.getState().loadProblems()
      mockInvoke.mockResolvedValueOnce(MOCK_PROBLEMS[0])
      await useProblemStore.getState().setActiveProblem(1)

      useProblemStore.getState().setAIPanelOpen(true)
      useProblemStore.getState().setAIPanelWidth(500)

      expect(useProblemStore.getState().aiPanelOpen).toBe(true)
      expect(useProblemStore.getState().aiPanelWidth).toBe(500)
      expect(useProblemStore.getState().activeProblemId).toBe(1) // problem state preserved
    })
  })
})
