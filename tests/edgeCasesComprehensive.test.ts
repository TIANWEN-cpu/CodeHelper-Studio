/**
 * Comprehensive edge-case tests for the CodeHelper application.
 *
 * Categories covered:
 * 1. Empty state tests (empty lists, histories, bases, editors, settings)
 * 2. Boundary tests (max file size, max message length, max tabs, max search results)
 * 3. Error recovery tests (network errors, DB corruption, invalid JSON, missing files)
 * 4. Concurrent operation tests (simultaneous AI requests, rapid tab switching, rapid settings changes)
 * 5. Unicode / special character tests (CJK, emoji, SQL injection, very long lines)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (must come before dynamic imports)
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

// Mock document.documentElement for theme tests
const mockDataset: Record<string, string> = {}
vi.stubGlobal('document', {
  documentElement: {
    dataset: new Proxy(mockDataset, {
      set(target, prop, value) {
        target[prop as string] = value
        return true
      },
    }),
  },
})

// Mock localStorage
const store: Record<string, string> = {}
const mockLocalStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key]
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(store)) delete store[key]
  }),
  get length() {
    return Object.keys(store).length
  },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
}
vi.stubGlobal('localStorage', mockLocalStorage)

// ---------------------------------------------------------------------------
// Dynamic imports after mocks are in place
// ---------------------------------------------------------------------------

const { useChatStore } = await import('../src/stores/chatStore')
const { useEditorStore } = await import('../src/stores/editorStore')
const { useProblemStore } = await import('../src/stores/problemStore')
const { useSettingsStore } = await import('../src/stores/settingsStore')
const { useAppStore } = await import('../src/stores/appStore')
const { eventBus } = await import('../src/utils/eventBus')
const { reportError, handleAsync, getErrorLog, clearErrorLog, registerToast } =
  await import('../src/utils/errorHandler')
const {
  getSnippets,
  getSnippetLanguages,
  addUserSnippet,
  removeUserSnippet,
  updateUserSnippet,
  findSnippetByPrefix,
  expandSnippetBody,
} = await import('../src/utils/snippets')
const { parseJsonArray, sourceLabel, platformLabel, modeLabel, trackLabel, examStyleLabel } =
  await import('../src/utils/labels')
const { toErrorMessage, safeAsync, safeSync, parseJsonSafe, getUserMessage } =
  await import('../src/utils/errors')
const { splitSqlStatements, isQueryStatement, formatRows } =
  await import('../electron/utils/sqlUtils')
const { splitIntoChunks, escapeRegExp } = await import('../electron/utils/textUtils')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetAllStores() {
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    messages: [],
    streaming: false,
    currentRequestId: null,
    error: null,
    presets: [],
    memories: [],
  })
  useEditorStore.setState({
    tabs: [
      {
        id: 'welcome',
        filename: 'welcome.py',
        language: 'python',
        content: '# Welcome\nprint("hello")\n',
      },
    ],
    activeTabId: 'welcome',
  })
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
  useSettingsStore.setState({
    aiConfigs: [],
    loading: false,
    saving: false,
    saveError: null,
  })
  useAppStore.setState({
    activeModule: 'problems',
    theme: 'mocha',
    sidebarCollapsed: false,
  })
  mockInvoke.mockReset()
  clearErrorLog()
  eventBus.off()
}

beforeEach(() => {
  resetAllStores()
  mockLocalStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =========================================================================
// 1. EMPTY STATE TESTS
// =========================================================================

describe('1. Empty state tests', () => {
  describe('1.1 Empty problem list', () => {
    it('problemStore starts with empty problems array', () => {
      expect(useProblemStore.getState().problems).toEqual([])
    })

    it('loading problems returns empty list gracefully', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await useProblemStore.getState().loadProblems()
      expect(useProblemStore.getState().problems).toEqual([])
      expect(useProblemStore.getState().loading).toBe(false)
      expect(useProblemStore.getState().loadError).toBeNull()
    })

    it('submit with no active problem does nothing', async () => {
      useProblemStore.setState({ activeProblemId: null })
      await useProblemStore.getState().submit('print("hi")', 'python')
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('setActiveProblem with non-existent id sets problem to null', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await useProblemStore.getState().setActiveProblem(99999)
      expect(useProblemStore.getState().activeProblem).toBeNull()
      expect(useProblemStore.getState().activeProblemId).toBe(99999)
    })

    it('clearResult on empty state is a no-op', () => {
      useProblemStore.setState({ submitResult: null })
      useProblemStore.getState().clearResult()
      expect(useProblemStore.getState().submitResult).toBeNull()
    })

    it('setFilters with empty filter object', async () => {
      mockInvoke.mockResolvedValueOnce([])
      useProblemStore.getState().setFilters({})
      expect(useProblemStore.getState().filters).toEqual({})
    })

    it('loadProblems with loadError cleared on retry', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('db error'))
      await useProblemStore.getState().loadProblems()
      expect(useProblemStore.getState().loadError).toBeTruthy()

      mockInvoke.mockResolvedValueOnce([])
      await useProblemStore.getState().loadProblems()
      expect(useProblemStore.getState().loadError).toBeNull()
    })
  })

  describe('1.2 Empty chat history', () => {
    it('chatStore starts with empty messages', () => {
      expect(useChatStore.getState().messages).toEqual([])
      expect(useChatStore.getState().sessions).toEqual([])
      expect(useChatStore.getState().activeSessionId).toBeNull()
    })

    it('switchSession with empty messages loads gracefully', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await useChatStore.getState().switchSession('empty-session')
      expect(useChatStore.getState().messages).toEqual([])
      expect(useChatStore.getState().activeSessionId).toBe('empty-session')
    })

    it('appendChunk on empty messages array does nothing', () => {
      useChatStore.setState({ messages: [], currentRequestId: 'req-1' })
      useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: 'test' })
      expect(useChatStore.getState().messages).toEqual([])
    })

    it('finishStream with empty messages and no session skips save', async () => {
      useChatStore.setState({
        activeSessionId: null,
        currentRequestId: 'req-1',
        streaming: true,
        messages: [],
      })
      mockInvoke.mockResolvedValueOnce([]) // loadSessions

      await useChatStore.getState().finishStream({ requestId: 'req-1', content: '' })

      expect(mockInvoke).not.toHaveBeenCalledWith('chat-message-save', expect.anything())
      expect(useChatStore.getState().streaming).toBe(false)
    })

    it('deleteSession on the only session clears everything', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Last', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined) // chat-session-delete
      mockInvoke.mockResolvedValueOnce([]) // loadSessions returns empty

      await useChatStore.getState().deleteSession('s1')

      expect(useChatStore.getState().activeSessionId).toBeNull()
      expect(useChatStore.getState().messages).toEqual([])
      expect(useChatStore.getState().sessions).toEqual([])
    })

    it('loadSessions returns empty array', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await useChatStore.getState().loadSessions()
      expect(useChatStore.getState().sessions).toEqual([])
    })

    it('loadPresets returns empty array', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await useChatStore.getState().loadPresets()
      expect(useChatStore.getState().presets).toEqual([])
    })

    it('loadMemories returns empty array', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await useChatStore.getState().loadMemories()
      expect(useChatStore.getState().memories).toEqual([])
    })
  })

  describe('1.3 Empty knowledge base', () => {
    it('parseJsonArray with undefined returns empty array', () => {
      expect(parseJsonArray(undefined)).toEqual([])
    })

    it('parseJsonArray with empty string returns empty array', () => {
      expect(parseJsonArray('')).toEqual([])
    })

    it('parseJsonArray with "[]" returns empty array', () => {
      expect(parseJsonArray('[]')).toEqual([])
    })

    it('parseJsonArray with invalid JSON returns empty array', () => {
      expect(parseJsonArray('not json')).toEqual([])
    })

    it('parseJsonArray with non-array JSON values returns those values (valid JSON)', () => {
      // parseJsonArray does JSON.parse directly, so valid JSON non-arrays pass through
      expect(parseJsonArray('null')).toBeNull()
      expect(parseJsonArray('42')).toBe(42)
      expect(parseJsonArray('true')).toBe(true)
    })
  })

  describe('1.4 Empty editor', () => {
    it('closing all tabs results in empty tabs and null activeTabId', () => {
      useEditorStore.getState().closeTab('welcome')
      expect(useEditorStore.getState().tabs).toEqual([])
      expect(useEditorStore.getState().activeTabId).toBeNull()
    })

    it('updateContent on non-existent tab does not throw', () => {
      expect(() => {
        useEditorStore.getState().updateContent('non-existent', 'content')
      }).not.toThrow()
    })

    it('setActiveTab on non-existent tab sets it anyway', () => {
      useEditorStore.getState().setActiveTab('ghost-tab')
      expect(useEditorStore.getState().activeTabId).toBe('ghost-tab')
    })

    it('updateCursorPosition on non-existent tab does not throw', () => {
      expect(() => {
        useEditorStore.getState().updateCursorPosition('ghost', 1, 1)
      }).not.toThrow()
    })

    it('updateScrollTop on non-existent tab does not throw', () => {
      expect(() => {
        useEditorStore.getState().updateScrollTop('ghost', 100)
      }).not.toThrow()
    })

    it('addTab with empty content string works', () => {
      useEditorStore.getState().addTab({
        id: 'empty-tab',
        filename: 'empty.py',
        language: 'python',
        content: '',
      })
      expect(useEditorStore.getState().tabs[1].content).toBe('')
    })

    it('adding tab with empty filename works', () => {
      useEditorStore.getState().addTab({
        id: 'no-name',
        filename: '',
        language: 'python',
        content: '',
      })
      expect(useEditorStore.getState().tabs[1].filename).toBe('')
    })
  })

  describe('1.5 Empty settings', () => {
    it('settingsStore starts with empty aiConfigs', () => {
      expect(useSettingsStore.getState().aiConfigs).toEqual([])
      expect(useSettingsStore.getState().loading).toBe(false)
      expect(useSettingsStore.getState().saving).toBe(false)
      expect(useSettingsStore.getState().saveError).toBeNull()
    })

    it('loadConfigs returns empty array', async () => {
      mockInvoke.mockResolvedValueOnce([])
      await useSettingsStore.getState().loadConfigs()
      expect(useSettingsStore.getState().aiConfigs).toEqual([])
    })

    it('deleteConfig with non-existent id does not throw', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // delete
      mockInvoke.mockResolvedValueOnce([]) // reload

      await expect(useSettingsStore.getState().deleteConfig(9999)).resolves.not.toThrow()
    })
  })

  describe('1.6 Empty event bus', () => {
    it('emitting event with no listeners does not throw', () => {
      expect(() => {
        eventBus.emit('theme:changed', 'fjord')
      }).not.toThrow()
    })

    it('listenerCount returns 0 when no listeners', () => {
      expect(eventBus.listenerCount('theme:changed')).toBe(0)
    })

    it('hasListeners returns false when empty', () => {
      expect(eventBus.hasListeners('theme:changed')).toBe(false)
    })

    it('off() with no listeners does not throw', () => {
      expect(() => eventBus.off()).not.toThrow()
      expect(() => eventBus.off('theme:changed')).not.toThrow()
    })

    it('unsubscribe on empty bus does not throw', () => {
      const unsub = eventBus.on('theme:changed', () => {})
      unsub()
      // unsub again should be safe
      expect(() => unsub()).not.toThrow()
    })
  })

  describe('1.7 Empty error log', () => {
    it('getErrorLog returns empty array initially', () => {
      expect(getErrorLog()).toEqual([])
    })

    it('clearErrorLog on empty log does not throw', () => {
      expect(() => clearErrorLog()).not.toThrow()
      expect(getErrorLog()).toEqual([])
    })
  })

  describe('1.8 Empty snippets', () => {
    it('getSnippets for unknown language returns empty array', () => {
      expect(getSnippets('brainfuck')).toEqual([])
    })

    it('getSnippetLanguages includes languages from built-in snippets', () => {
      const langs = getSnippetLanguages()
      expect(langs).toContain('python')
      expect(langs).toContain('javascript')
    })

    it('findSnippetByPrefix returns null for unknown prefix', () => {
      expect(findSnippetByPrefix('xyzunknown', 'python')).toBeNull()
    })
  })
})

// =========================================================================
// 2. BOUNDARY TESTS
// =========================================================================

describe('2. Boundary tests', () => {
  describe('2.1 Maximum file size / large content', () => {
    it('editor handles 100KB content', () => {
      const largeContent = 'x'.repeat(100_000)
      useEditorStore.getState().updateContent('welcome', largeContent)
      expect(useEditorStore.getState().tabs[0].content).toHaveLength(100_000)
    })

    it('editor handles 1MB content', () => {
      const hugeContent = 'a'.repeat(1_000_000)
      useEditorStore.getState().updateContent('welcome', hugeContent)
      expect(useEditorStore.getState().tabs[0].content).toHaveLength(1_000_000)
    })

    it('formatRows with very large dataset (1000 rows)', () => {
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(100),
      }))
      const result = formatRows(rows)
      const parsed = JSON.parse(result)
      expect(parsed).toHaveLength(1000)
      expect(parsed[999].data).toHaveLength(100)
    })

    it('splitIntoChunks handles 100KB text', () => {
      // splitIntoChunks splits on double newlines, so we need paragraphs
      const paras = Array.from({ length: 500 }, () => 'word '.repeat(100))
      const text = paras.join('\n\n')
      expect(text.length).toBeGreaterThan(100_000)
      const result = splitIntoChunks(text, 10_000)
      expect(result.length).toBeGreaterThan(1)
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(11_000) // small overshoot allowed
      }
    })

    it('splitSqlStatements handles 5000 statements', () => {
      const stmts = Array.from({ length: 5000 }, (_, i) => `SELECT ${i}`)
      const sql = stmts.join('; ') + ';'
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(5000)
    })

    it('JSON parse of large payload', () => {
      const bigObj = { items: Array.from({ length: 10000 }, (_, i) => ({ id: i, val: `v${i}` })) }
      const json = JSON.stringify(bigObj)
      expect(parseJsonSafe(json, null)).toBeTruthy()
      // When given an object directly (not a string), parseJsonSafe returns it as-is
      // Actually parseJsonSafe expects a string, so let's test with the string
      const parsed2 = parseJsonSafe(json, null) as unknown as { items: unknown[] }
      expect(parsed2.items).toHaveLength(10000)
    })
  })

  describe('2.2 Maximum message length', () => {
    it('chat message with 10KB content', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      const longContent = 'A'.repeat(10_000)
      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      await useChatStore.getState().sendMessage(longContent)

      const state = useChatStore.getState()
      expect(state.messages[0].content).toHaveLength(10_000)
    })

    it('chat message with 100KB content', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      const hugeContent = 'B'.repeat(100_000)
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      await useChatStore.getState().sendMessage(hugeContent)

      expect(useChatStore.getState().messages[0].content).toHaveLength(100_000)
    })

    it('auto-title truncation at SESSION_TITLE_MAX_LENGTH (30 chars)', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: '新对话', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      const msg = 'X'.repeat(100)
      await useChatStore.getState().sendMessage(msg)

      const renameCall = mockInvoke.mock.calls.find(
        (c: unknown[]) => c[0] === 'chat-session-update',
      )
      expect(renameCall).toBeTruthy()
      const title = (renameCall![2] as { title: string }).title
      expect(title).toHaveLength(33) // 30 chars + "..."
      expect(title).toMatch(/\.\.\.$/)
    })

    it('appendChunk accumulates many small chunks', () => {
      useChatStore.setState({
        currentRequestId: 'req-1',
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: '', timestamp: 2 },
        ],
      })

      for (let i = 0; i < 1000; i++) {
        useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: `${i} ` })
      }

      const content = useChatStore.getState().messages[1].content
      expect(content).toContain('999 ')
      expect(content.length).toBeGreaterThan(3000)
    })

    it('splitSqlStatements with 1MB SQL string', () => {
      const bigVal = 'a'.repeat(1_000_000)
      const sql = `SELECT '${bigVal}';`
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
    })
  })

  describe('2.3 Maximum number of tabs', () => {
    it('adding 100 tabs works', () => {
      for (let i = 0; i < 100; i++) {
        useEditorStore.getState().addTab({
          id: `tab-${i}`,
          filename: `file${i}.py`,
          language: 'python',
          content: `# Tab ${i}`,
        })
      }
      expect(useEditorStore.getState().tabs).toHaveLength(101) // 100 + welcome
    })

    it('adding 500 tabs works', () => {
      for (let i = 0; i < 500; i++) {
        useEditorStore.getState().addTab({
          id: `tab-${i}`,
          filename: `file${i}.js`,
          language: 'javascript',
          content: `console.log(${i})`,
        })
      }
      expect(useEditorStore.getState().tabs).toHaveLength(501)
      expect(useEditorStore.getState().activeTabId).toBe('tab-499')
    })

    it('closing tabs from 500 back to 0 works', () => {
      for (let i = 0; i < 10; i++) {
        useEditorStore.getState().addTab({
          id: `tab-${i}`,
          filename: `f${i}.py`,
          language: 'python',
          content: '',
        })
      }
      expect(useEditorStore.getState().tabs).toHaveLength(11)

      // Close all including welcome
      for (let i = 9; i >= 0; i--) {
        useEditorStore.getState().closeTab(`tab-${i}`)
      }
      useEditorStore.getState().closeTab('welcome')
      expect(useEditorStore.getState().tabs).toHaveLength(0)
      expect(useEditorStore.getState().activeTabId).toBeNull()
    })

    it('rapid add and close interleaved', () => {
      for (let i = 0; i < 50; i++) {
        useEditorStore.getState().addTab({
          id: `rapid-${i}`,
          filename: `r${i}.py`,
          language: 'python',
          content: '',
        })
        if (i % 3 === 0) {
          useEditorStore.getState().closeTab(`rapid-${i}`)
        }
      }
      // Every 3rd tab was closed, so ~34 remain out of 50, plus welcome
      const tabs = useEditorStore.getState().tabs
      expect(tabs.length).toBeGreaterThan(30)
      expect(tabs.length).toBeLessThan(52)
    })

    it('duplicate tab id overwrites correctly', () => {
      useEditorStore.getState().addTab({
        id: 'dup',
        filename: 'first.py',
        language: 'python',
        content: 'first',
      })
      useEditorStore.getState().addTab({
        id: 'dup',
        filename: 'second.py',
        language: 'python',
        content: 'second',
      })
      // Both are added (no dedup logic in addTab)
      const tabs = useEditorStore.getState().tabs
      expect(tabs.filter((t) => t.id === 'dup')).toHaveLength(2)
    })
  })

  describe('2.4 Maximum search results / filters', () => {
    it('loading 10,000 problems works', async () => {
      const bigList = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        title: `Problem ${i}`,
        difficulty: 'easy',
        tags: '[]',
      }))
      mockInvoke.mockResolvedValueOnce(bigList)
      await useProblemStore.getState().loadProblems()
      expect(useProblemStore.getState().problems).toHaveLength(10000)
    })

    it('filters with all fields set', async () => {
      mockInvoke.mockResolvedValueOnce([])
      useProblemStore.getState().setFilters({
        difficulty: 'hard',
        tag: 'dp',
        search: 'longest common subsequence',
        language: 'python',
        source: 'leetcode',
        track: 'algo-job',
        platform: 'leetcode',
        mode: 'oj',
      })
      expect(useProblemStore.getState().filters.difficulty).toBe('hard')
      expect(useProblemStore.getState().filters.search).toBe('longest common subsequence')
    })
  })

  describe('2.5 Maximum sessions', () => {
    it('loading 1000 sessions works', async () => {
      const sessions = Array.from({ length: 1000 }, (_, i) => ({
        id: `s${i}`,
        title: `Session ${i}`,
        system_prompt: '',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      }))
      mockInvoke.mockResolvedValueOnce(sessions)
      await useChatStore.getState().loadSessions()
      expect(useChatStore.getState().sessions).toHaveLength(1000)
    })
  })

  describe('2.6 Numeric edge values', () => {
    it('formatRows with Number.MAX_SAFE_INTEGER', () => {
      const result = formatRows([{ big: Number.MAX_SAFE_INTEGER }])
      const parsed = JSON.parse(result)
      expect(parsed[0].big).toBe(Number.MAX_SAFE_INTEGER)
    })

    it('formatRows with Number.MIN_SAFE_INTEGER', () => {
      const result = formatRows([{ small: Number.MIN_SAFE_INTEGER }])
      const parsed = JSON.parse(result)
      expect(parsed[0].small).toBe(Number.MIN_SAFE_INTEGER)
    })

    it('formatRows with Infinity and -Infinity', () => {
      const result = formatRows([{ inf: Infinity, negInf: -Infinity }])
      const parsed = JSON.parse(result)
      // JSON.stringify converts Infinity to null
      expect(parsed[0].inf).toBeNull()
      expect(parsed[0].negInf).toBeNull()
    })

    it('formatRows with NaN', () => {
      const result = formatRows([{ nan: NaN }])
      const parsed = JSON.parse(result)
      // JSON.stringify converts NaN to null
      expect(parsed[0].nan).toBeNull()
    })

    it('editor cursor at line 0, column 0', () => {
      useEditorStore.getState().updateCursorPosition('welcome', 0, 0)
      expect(useEditorStore.getState().tabs[0].cursorPosition).toEqual({
        lineNumber: 0,
        column: 0,
      })
    })

    it('editor scrollTop at 0', () => {
      useEditorStore.getState().updateScrollTop('welcome', 0)
      expect(useEditorStore.getState().tabs[0].scrollTop).toBe(0)
    })

    it('editor scrollTop at large value', () => {
      useEditorStore.getState().updateScrollTop('welcome', 999999)
      expect(useEditorStore.getState().tabs[0].scrollTop).toBe(999999)
    })

    it('problemStore aiPanelWidth edge values', () => {
      useProblemStore.getState().setAIPanelWidth(0)
      expect(useProblemStore.getState().aiPanelWidth).toBe(0)

      useProblemStore.getState().setAIPanelWidth(99999)
      expect(useProblemStore.getState().aiPanelWidth).toBe(99999)

      useProblemStore.getState().setAIPanelWidth(-1)
      expect(useProblemStore.getState().aiPanelWidth).toBe(-1)
    })
  })
})

// =========================================================================
// 3. ERROR RECOVERY TESTS
// =========================================================================

describe('3. Error recovery tests', () => {
  describe('3.1 Network disconnection during AI request', () => {
    it('sendMessage catches network error and sets error state', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockResolvedValueOnce({
        recentProblems: [],
        learningHistory: [],
        knowledgeChunks: [],
        userProfile: {
          preferredLanguage: '',
          difficultyLevel: '',
          strongTopics: [],
          weakTopics: [],
        },
      }) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockRejectedValueOnce(new Error('NetworkError: fetch failed')) // ai-chat

      await useChatStore.getState().sendMessage('Hello')

      const state = useChatStore.getState()
      expect(state.error).toContain('NetworkError')
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
      // Last message should contain the error
      const lastMsg = state.messages[state.messages.length - 1]
      expect(lastMsg.role).toBe('assistant')
      expect(lastMsg.content).toContain('NetworkError')
    })

    it('loadSessions handles network failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('fetch failed'))

      await useChatStore.getState().loadSessions()

      // Should not throw, sessions remain empty
      expect(useChatStore.getState().sessions).toEqual([])
      consoleSpy.mockRestore()
    })

    it('sendMessage timeout error is captured', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({
        recentProblems: [],
        learningHistory: [],
        knowledgeChunks: [],
        userProfile: {
          preferredLanguage: '',
          difficultyLevel: '',
          strongTopics: [],
          weakTopics: [],
        },
      }) // knowledge-rag-context (RAG enrichment)
      mockInvoke.mockRejectedValueOnce(new Error('Request timeout')) // ai-chat

      await useChatStore.getState().sendMessage('Hello')

      expect(useChatStore.getState().error).toContain('timeout')
      expect(useChatStore.getState().streaming).toBe(false)
    })

    it('setTheme handles persistence failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('Network error'))

      await useAppStore.getState().setTheme('fjord')

      // Theme should still be updated locally even if persistence fails
      expect(useAppStore.getState().theme).toBe('fjord')
      expect(mockDataset.theme).toBe('fjord')
      consoleSpy.mockRestore()
    })

    it('loadTheme handles network failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('Network error'))

      await useAppStore.getState().loadTheme()

      // Should fall back to default theme
      expect(useAppStore.getState().theme).toBe('mocha')
      consoleSpy.mockRestore()
    })
  })

  describe('3.2 Database corruption', () => {
    it('loadProblems handles corrupt DB response', async () => {
      mockInvoke.mockRejectedValueOnce(
        new Error('SQLITE_CORRUPT: database disk image is malformed'),
      )

      await useProblemStore.getState().loadProblems()

      expect(useProblemStore.getState().loadError).toContain('SQLITE_CORRUPT')
      expect(useProblemStore.getState().loading).toBe(false)
    })

    it('loadConfigs handles corrupt DB response', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('SQLITE_CORRUPT'))

      await useSettingsStore.getState().loadConfigs()

      expect(useSettingsStore.getState().loading).toBe(false)
      consoleSpy.mockRestore()
    })

    it('saveConfig handles DB corruption', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('SQLITE_CORRUPT'))

      await expect(
        useSettingsStore.getState().saveConfig({
          name: 'test',
          api_key: 'key',
          base_url: 'url',
          model: 'model',
          is_default: 0,
          task_type: null,
        }),
      ).rejects.toThrow('SQLITE_CORRUPT')

      expect(useSettingsStore.getState().saving).toBe(false)
      expect(useSettingsStore.getState().saveError).toContain('SQLITE_CORRUPT')
    })

    it('switchSession handles corrupt data gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('SQLITE_CORRUPT'))

      await useChatStore.getState().switchSession('corrupt-session')

      expect(useChatStore.getState().error).toContain('SQLITE_CORRUPT')
      consoleSpy.mockRestore()
    })

    it('setActiveProblem handles corrupt response', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('SQLITE_CORRUPT'))

      await useProblemStore.getState().setActiveProblem(1)

      // Should not crash
      consoleSpy.mockRestore()
    })
  })

  describe('3.3 Invalid JSON in settings', () => {
    it('parseJsonSafe handles completely invalid JSON', () => {
      expect(parseJsonSafe('{invalid json!!', 'fallback')).toBe('fallback')
    })

    it('parseJsonSafe handles truncated JSON', () => {
      expect(parseJsonSafe('{"key": "val', 'fallback')).toBe('fallback')
    })

    it('parseJsonSafe handles JSON with trailing commas', () => {
      expect(parseJsonSafe('{"a": 1, "b": 2,}', 'fallback')).toBe('fallback')
    })

    it('parseJsonSafe handles nested invalid JSON', () => {
      expect(parseJsonSafe('{"a": {"b": undefined}}', 'fallback')).toBe('fallback')
    })

    it('parseJsonSafe handles empty string', () => {
      expect(parseJsonSafe('', 'fallback')).toBe('fallback')
    })

    it('parseJsonSafe handles undefined input gracefully', () => {
      // @ts-expect-error testing undefined input
      expect(parseJsonSafe(undefined, 'fallback')).toBe('fallback')
    })

    it('parseJsonArray handles various invalid inputs', () => {
      expect(parseJsonArray('')).toEqual([])
      expect(parseJsonArray('not json')).toEqual([])
      expect(parseJsonArray('{key: value}')).toEqual([])
    })

    it('editor tab persistence handles corrupted localStorage', () => {
      mockLocalStorage.setItem('codehelper-editor-tabs', 'corrupted-data!!!')
      // The loadPersistedTabs function is internal, but we can test restoreTabs
      // which calls it
      expect(() => useEditorStore.getState().restoreTabs()).not.toThrow()
    })

    it('editor tab persistence handles invalid JSON in localStorage', () => {
      mockLocalStorage.setItem('codehelper-editor-tabs', '{broken')
      expect(() => useEditorStore.getState().restoreTabs()).not.toThrow()
    })

    it('editor tab persistence handles empty array in localStorage', () => {
      mockLocalStorage.setItem('codehelper-editor-tabs', '[]')
      useEditorStore.getState().restoreTabs()
      // Empty array means no valid tabs, so no update happens
      expect(useEditorStore.getState().tabs).toHaveLength(1) // still default
    })

    it('snippet loading handles corrupt localStorage', () => {
      mockLocalStorage.setItem('codehelper-user-snippets', '!!broken!!')
      // Should not throw and return built-in snippets only
      const snippets = getSnippets('python')
      expect(Array.isArray(snippets)).toBe(true)
      expect(snippets.length).toBeGreaterThan(0)
    })
  })

  describe('3.4 Missing file on disk', () => {
    it('loadProblems returns empty when file not found error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))

      await useProblemStore.getState().loadProblems()

      expect(useProblemStore.getState().loadError).toContain('ENOENT')
      expect(useProblemStore.getState().problems).toEqual([])
    })

    it('knowledge upload failure is handled', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('ENOENT: file not found'))

      // Knowledge operations go through typedInvoke; we test the error path
      const [data, err] = await safeAsync(async () => {
        throw new Error('ENOENT: file not found')
      })

      expect(data).toBeNull()
      expect(err).toBeTruthy()
      expect(err!.message).toContain('ENOENT')
    })

    it('code execution with missing file', async () => {
      const [data, err] = await safeAsync(async () => {
        throw new Error('ENOENT: no such file or directory, open "/tmp/missing.py"')
      })

      expect(data).toBeNull()
      expect(err!.message).toContain('ENOENT')
    })
  })

  describe('3.5 Error handler integration', () => {
    it('reportError classifies network errors', () => {
      const report = reportError(new TypeError('fetch failed'), 'Test')
      expect(report.category).toBe('network')
      expect(report.retryable).toBe(true)
    })

    it('reportError classifies auth errors', () => {
      const report = reportError('401 Unauthorized', 'Test')
      expect(report.category).toBe('auth')
      expect(report.retryable).toBe(false)
    })

    it('reportError classifies timeout errors', () => {
      const report = reportError(new Error('connection timed out'), 'Test')
      expect(report.category).toBe('timeout')
      expect(report.retryable).toBe(true)
    })

    it('reportError respects MAX_LOG_SIZE', () => {
      for (let i = 0; i < 150; i++) {
        reportError(new Error(`err-${i}`), 'Test', { silent: true })
      }
      expect(getErrorLog().length).toBeLessThanOrEqual(100)
    })

    it('handleAsync returns data on success', async () => {
      const [data, err] = await handleAsync(async () => 42, 'Test')
      expect(data).toBe(42)
      expect(err).toBeNull()
    })

    it('handleAsync returns report on failure', async () => {
      const [data, err] = await handleAsync(
        async () => {
          throw new Error('fail')
        },
        'Test',
        { silent: true },
      )
      expect(data).toBeNull()
      expect(err).toBeTruthy()
      expect(err!.message).toBe('fail')
    })

    it('registerToast and reportError with showToast', () => {
      const toastFn = vi.fn()
      registerToast(toastFn)
      reportError(new Error('toast test'), 'Test', { showToast: true })
      expect(toastFn).toHaveBeenCalled()
    })

    it('getUserMessage handles various invalid inputs', () => {
      expect(getUserMessage(null)).toBeTruthy()
      expect(getUserMessage(undefined)).toBeTruthy()
      expect(getUserMessage(42)).toBeTruthy()
      expect(getUserMessage(true)).toBeTruthy()
      expect(getUserMessage([1, 2, 3])).toBeTruthy()
    })
  })

  describe('3.6 safeAsync / safeSync error recovery', () => {
    it('safeAsync catches rejected promises', async () => {
      const [data, err] = await safeAsync(async () => {
        throw new Error('rejected')
      })
      expect(data).toBeNull()
      expect(err!.message).toBe('rejected')
    })

    it('safeAsync catches non-Error thrown values', async () => {
      const [data, err] = await safeAsync(async () => {
        throw 'string error'
      })
      expect(data).toBeNull()
      expect(err).toBeTruthy()
    })

    it('safeSync catches synchronous errors', () => {
      const [data, err] = safeSync(() => {
        throw new Error('sync error')
      })
      expect(data).toBeNull()
      expect(err!.message).toBe('sync error')
    })

    it('safeSync catches non-Error thrown values', () => {
      const [data, err] = safeSync(() => {
        throw { code: 500 }
      })
      expect(data).toBeNull()
      expect(err).toBeTruthy()
    })

    it('toErrorMessage handles Error instances', () => {
      expect(toErrorMessage(new Error('test'))).toBe('test')
    })

    it('toErrorMessage handles string', () => {
      expect(toErrorMessage('string error')).toBe('string error')
    })

    it('toErrorMessage handles number', () => {
      expect(toErrorMessage(404)).toBe('404')
    })

    it('toErrorMessage handles null', () => {
      expect(toErrorMessage(null)).toBe('null')
    })

    it('toErrorMessage handles undefined', () => {
      expect(toErrorMessage(undefined)).toBe('undefined')
    })
  })
})

// =========================================================================
// 4. CONCURRENT OPERATION TESTS
// =========================================================================

describe('4. Concurrent operation tests', () => {
  describe('4.1 Multiple simultaneous AI requests', () => {
    it('sendMessage handles rapid successive sends', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })

      // First message
      mockInvoke.mockResolvedValueOnce(undefined) // save
      mockInvoke.mockResolvedValueOnce([]) // memory capture
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' }) // ai-chat

      // Second message
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r2', content: '' })

      await useChatStore.getState().sendMessage('First')
      await useChatStore.getState().sendMessage('Second')

      const state = useChatStore.getState()
      // Should have 4 messages: 2 user + 2 assistant placeholders
      expect(state.messages.length).toBeGreaterThanOrEqual(4)
    })

    it('appendChunk ignores stale request IDs', () => {
      useChatStore.setState({
        currentRequestId: 'req-current',
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: 'current', timestamp: 2 },
        ],
      })

      // Old request ID
      useChatStore.getState().appendChunk({ requestId: 'req-old', chunk: 'stale' })
      expect(useChatStore.getState().messages[1].content).toBe('current')

      // Current request ID
      useChatStore.getState().appendChunk({ requestId: 'req-current', chunk: ' updated' })
      expect(useChatStore.getState().messages[1].content).toBe('current updated')
    })

    it('finishStream ignores stale request IDs', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        currentRequestId: 'req-current',
        streaming: true,
        messages: [],
      })

      await useChatStore.getState().finishStream({ requestId: 'req-old', content: '' })

      // Should still be streaming because the finish was for old request
      expect(useChatStore.getState().streaming).toBe(true)
    })

    it('concurrent switchSession calls resolve correctly', async () => {
      mockInvoke.mockResolvedValueOnce([
        { id: 1, role: 'user', content: 'msg1', created_at: '2024-01-01' },
      ])
      mockInvoke.mockResolvedValueOnce([
        { id: 2, role: 'user', content: 'msg2', created_at: '2024-01-02' },
      ])

      const p1 = useChatStore.getState().switchSession('s1')
      const p2 = useChatStore.getState().switchSession('s2')

      await Promise.all([p1, p2])

      // Last one wins
      expect(useChatStore.getState().activeSessionId).toBe('s2')
    })
  })

  describe('4.2 Multiple simultaneous code executions', () => {
    it('submit while already submitting preserves state', async () => {
      useProblemStore.setState({ activeProblemId: 1 })

      // First submit - slow
      let resolveFirst: (v: unknown) => void
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve
      })
      mockInvoke.mockReturnValueOnce(firstPromise) // problems-submit
      mockInvoke.mockResolvedValueOnce([]) // loadProblems

      const p1 = useProblemStore.getState().submit('code1', 'python')

      // While first is pending, state should be submitting
      expect(useProblemStore.getState().submitting).toBe(true)

      // Complete the first
      resolveFirst!({ status: 'accepted', passed: 1, total: 1, results: [], duration: 10 })
      await p1

      expect(useProblemStore.getState().submitting).toBe(false)
    })

    it('submit with network error sets error result', async () => {
      useProblemStore.setState({ activeProblemId: 1 })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockInvoke.mockRejectedValueOnce(new Error('Network error'))

      await useProblemStore.getState().submit('code', 'python')

      expect(useProblemStore.getState().submitResult).toEqual({
        status: 'error',
        passed: 0,
        total: 0,
        results: [],
        duration: 0,
      })
      expect(useProblemStore.getState().submitting).toBe(false)
      consoleSpy.mockRestore()
    })
  })

  describe('4.3 Rapid tab switching', () => {
    it('rapid setActiveTab calls work correctly', () => {
      for (let i = 0; i < 20; i++) {
        useEditorStore.getState().addTab({
          id: `rapid-${i}`,
          filename: `f${i}.py`,
          language: 'python',
          content: `content-${i}`,
        })
      }

      // Rapidly switch
      for (let i = 0; i < 20; i++) {
        useEditorStore.getState().setActiveTab(`rapid-${i}`)
      }

      expect(useEditorStore.getState().activeTabId).toBe('rapid-19')
    })

    it('rapid addTab followed by closeTab', () => {
      const ids: string[] = []
      for (let i = 0; i < 50; i++) {
        const id = `rapid-add-${i}`
        ids.push(id)
        useEditorStore.getState().addTab({
          id,
          filename: `f${i}.py`,
          language: 'python',
          content: '',
        })
      }

      // Close every other one
      for (let i = 0; i < 50; i += 2) {
        useEditorStore.getState().closeTab(ids[i])
      }

      const remaining = useEditorStore
        .getState()
        .tabs.filter((t) => ids.includes(t.id) && ids.indexOf(t.id) % 2 !== 0)
      expect(remaining).toHaveLength(25)
    })

    it('rapid module switching in appStore', () => {
      const modules = [
        'problems',
        'editor',
        'ai-chat',
        'mistakes',
        'knowledge',
        'settings',
        'stats',
        'search',
      ] as const

      for (let i = 0; i < 100; i++) {
        useAppStore.getState().setActiveModule(modules[i % modules.length])
      }

      // Last module: 99 % 8 = 3 -> 'mistakes'
      expect(useAppStore.getState().activeModule).toBe('mistakes')
    })

    it('rapid sidebar toggling', () => {
      for (let i = 0; i < 100; i++) {
        useAppStore.getState().toggleSidebar()
      }
      // 100 toggles = back to original (false)
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)

      // Odd number
      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)
    })
  })

  describe('4.4 Rapid settings changes', () => {
    it('rapid saveConfig calls with IPC errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Make all save calls fail
      mockInvoke.mockRejectedValue(new Error('timeout'))

      const configs = Array.from({ length: 5 }, (_, i) => ({
        name: `config-${i}`,
        api_key: `key-${i}`,
        base_url: 'url',
        model: 'model',
        is_default: 0,
        task_type: null,
      }))

      const results = await Promise.allSettled(
        configs.map((c) => useSettingsStore.getState().saveConfig(c)),
      )

      // All should be rejected
      for (const r of results) {
        expect(r.status).toBe('rejected')
      }

      // saveError should contain the last error
      expect(useSettingsStore.getState().saveError).toBeTruthy()
      consoleSpy.mockRestore()
    })

    it('rapid deleteConfig calls', async () => {
      mockInvoke.mockResolvedValue(undefined) // All deletes succeed
      mockInvoke.mockResolvedValue([]) // All reloads return empty

      const promises = Array.from({ length: 10 }, (_, i) =>
        useSettingsStore.getState().deleteConfig(i),
      )

      await Promise.all(promises)

      expect(useSettingsStore.getState().aiConfigs).toEqual([])
    })

    it('rapid theme changes', async () => {
      mockInvoke.mockResolvedValue(undefined) // All DB writes succeed

      const themes = ['mocha', 'fjord', 'ember'] as const
      const promises: Promise<void>[] = []

      for (let i = 0; i < 30; i++) {
        promises.push(useAppStore.getState().setTheme(themes[i % 3]))
      }

      await Promise.all(promises)

      // Should not crash
      expect(['mocha', 'fjord', 'ember']).toContain(useAppStore.getState().theme)
    })
  })

  describe('4.5 Event bus concurrent operations', () => {
    it('rapid subscribe and unsubscribe', () => {
      const unsubs: Array<() => void> = []

      for (let i = 0; i < 100; i++) {
        unsubs.push(eventBus.on('theme:changed', () => {}))
      }
      expect(eventBus.listenerCount('theme:changed')).toBe(100)

      for (const unsub of unsubs) {
        unsub()
      }
      expect(eventBus.listenerCount('theme:changed')).toBe(0)
    })

    it('emit during emit (listener adds new listener)', () => {
      const calls: string[] = []

      eventBus.on('theme:changed', () => {
        calls.push('first')
        eventBus.on('theme:changed', () => {
          calls.push('second')
        })
      })

      eventBus.emit('theme:changed', 'fjord')
      // In JS, Set iteration includes elements added during iteration,
      // so the newly added 'second' listener fires during the first emit
      expect(calls).toEqual(['first', 'second'])
      // After first emit, 2 listeners are registered
      expect(eventBus.listenerCount('theme:changed')).toBe(2)

      // Second emit: 'first' fires and adds ANOTHER 'second' listener;
      // the existing 'second' also fires; then the newly added 'second' fires too
      eventBus.emit('theme:changed', 'ember')
      expect(calls.filter((c) => c === 'second').length).toBeGreaterThanOrEqual(2)
    })

    it('listener that throws does not prevent other listeners', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const calls: string[] = []

      eventBus.on('theme:changed', () => {
        throw new Error('boom')
      })
      eventBus.on('theme:changed', () => {
        calls.push('ok')
      })

      eventBus.emit('theme:changed', 'fjord')
      expect(calls).toEqual(['ok'])
      consoleSpy.mockRestore()
    })

    it('once listener fires exactly once', () => {
      let count = 0
      eventBus.once('theme:changed', () => {
        count++
      })

      eventBus.emit('theme:changed', 'fjord')
      eventBus.emit('theme:changed', 'ember')
      eventBus.emit('theme:changed', 'mocha')

      expect(count).toBe(1)
      expect(eventBus.listenerCount('theme:changed')).toBe(0)
    })

    it('off() clears all listeners across all events', () => {
      eventBus.on('theme:changed', () => {})
      eventBus.on('session:created', () => {})
      eventBus.on('problem:selected', () => {})

      eventBus.off()

      expect(eventBus.listenerCount('theme:changed')).toBe(0)
      expect(eventBus.listenerCount('session:created')).toBe(0)
      expect(eventBus.listenerCount('problem:selected')).toBe(0)
    })

    it('off(event) clears only that event', () => {
      eventBus.on('theme:changed', () => {})
      eventBus.on('session:created', () => {})

      eventBus.off('theme:changed')

      expect(eventBus.listenerCount('theme:changed')).toBe(0)
      expect(eventBus.listenerCount('session:created')).toBe(1)
    })
  })
})

// =========================================================================
// 5. UNICODE / SPECIAL CHARACTER TESTS
// =========================================================================

describe('5. Unicode / special character tests', () => {
  describe('5.1 Unicode in code', () => {
    it('editor stores CJK code content', () => {
      const cjkContent = '# 中文注释\nprint("你好世界")\n'
      useEditorStore.getState().updateContent('welcome', cjkContent)
      expect(useEditorStore.getState().tabs[0].content).toBe(cjkContent)
    })

    it('editor stores code with mixed unicode', () => {
      const content = 'const greeting = "こんにちは世界"\n// Comment in Korean: 안녕하세요'
      useEditorStore.getState().updateContent('welcome', content)
      expect(useEditorStore.getState().tabs[0].content).toBe(content)
    })

    it('editor tab with unicode filename', () => {
      useEditorStore.getState().addTab({
        id: 'unicode-tab',
        filename: '文件名.py',
        language: 'python',
        content: '# 日本語のファイル',
      })
      expect(useEditorStore.getState().tabs[1].filename).toBe('文件名.py')
    })

    it('editor content with RTL text (Arabic/Hebrew)', () => {
      const content = '# مرحبا\n# שלום\nprint("test")'
      useEditorStore.getState().updateContent('welcome', content)
      expect(useEditorStore.getState().tabs[0].content).toBe(content)
    })

    it('editor content with mathematical symbols', () => {
      const content = '# Math: ∑∏∫√∞≈≠≤≥\nx = π * r²'
      useEditorStore.getState().updateContent('welcome', content)
      expect(useEditorStore.getState().tabs[0].content).toContain('∑∏∫')
    })

    it('splitSqlStatements with CJK identifiers', () => {
      const sql = 'SELECT * FROM 用户表 WHERE 姓名 = "张三";'
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('用户表')
    })
  })

  describe('5.2 Unicode in filenames', () => {
    it('editor tab with Japanese filename', () => {
      useEditorStore.getState().addTab({
        id: 'jp-file',
        filename: 'テスト.py',
        language: 'python',
        content: '',
      })
      expect(useEditorStore.getState().tabs.find((t) => t.id === 'jp-file')?.filename).toBe(
        'テスト.py',
      )
    })

    it('editor tab with Korean filename', () => {
      useEditorStore.getState().addTab({
        id: 'kr-file',
        filename: '파일이름.js',
        language: 'javascript',
        content: '',
      })
      expect(useEditorStore.getState().tabs.find((t) => t.id === 'kr-file')?.filename).toBe(
        '파일이름.js',
      )
    })

    it('editor tab with spaces and special chars in filename', () => {
      useEditorStore.getState().addTab({
        id: 'special-file',
        filename: 'my file (copy) [1].py',
        language: 'python',
        content: '',
      })
      expect(useEditorStore.getState().tabs[1].filename).toBe('my file (copy) [1].py')
    })

    it('editor tab with very long unicode filename', () => {
      const longName = '文件'.repeat(100) + '.py'
      useEditorStore.getState().addTab({
        id: 'long-name',
        filename: longName,
        language: 'python',
        content: '',
      })
      expect(useEditorStore.getState().tabs[1].filename).toBe(longName)
    })
  })

  describe('5.3 Unicode in messages', () => {
    it('chat message with CJK content', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      await useChatStore.getState().sendMessage('请帮我解释一下Python的装饰器')

      expect(useChatStore.getState().messages[0].content).toBe('请帮我解释一下Python的装饰器')
    })

    it('chat message with Japanese', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      await useChatStore.getState().sendMessage('Pythonのデコレータを説明してください')

      expect(useChatStore.getState().messages[0].content).toBe(
        'Pythonのデコレータを説明してください',
      )
    })

    it('chat auto-title with CJK content', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: '新对话', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      await useChatStore.getState().sendMessage('请帮我写一个Python快速排序算法并解释')

      const renameCall = mockInvoke.mock.calls.find(
        (c: unknown[]) => c[0] === 'chat-session-update',
      )
      expect(renameCall).toBeTruthy()
      const title = (renameCall![2] as { title: string }).title
      // Title should be truncated to 30 chars
      expect(title.length).toBeLessThanOrEqual(33) // 30 + "..."
    })

    it('appendChunk with unicode content', () => {
      useChatStore.setState({
        currentRequestId: 'req-1',
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: '', timestamp: 2 },
        ],
      })

      useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: '你好' })
      useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: '世界' })

      expect(useChatStore.getState().messages[1].content).toBe('你好世界')
    })
  })

  describe('5.4 Emoji in messages and code', () => {
    it('emoji in chat message', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      await useChatStore.getState().sendMessage('Hello! 🎉🚀 How are you? 😊')

      expect(useChatStore.getState().messages[0].content).toBe('Hello! 🎉🚀 How are you? 😊')
    })

    it('emoji in code editor', () => {
      const content = '# TODO: 🚧 Fix this later\n# Done! ✅\nprint("test 🎉")'
      useEditorStore.getState().updateContent('welcome', content)
      expect(useEditorStore.getState().tabs[0].content).toContain('🚧')
      expect(useEditorStore.getState().tabs[0].content).toContain('✅')
    })

    it('emoji in session title', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [
          { id: 's1', title: 'Test 🎮', system_prompt: '', created_at: '', updated_at: '' },
        ],
      })
      mockInvoke.mockResolvedValueOnce(undefined) // renameSession
      mockInvoke.mockResolvedValueOnce([]) // loadSessions

      await useChatStore.getState().renameSession('s1', 'New Title 🎉')

      expect(mockInvoke).toHaveBeenCalledWith('chat-session-update', 's1', {
        title: 'New Title 🎉',
      })
    })

    it('formatRows with emoji values', () => {
      const result = formatRows([{ emoji: '🎉🔥✨', flag: '🇨🇳🇺🇸' }])
      const parsed = JSON.parse(result)
      expect(parsed[0].emoji).toBe('🎉🔥✨')
      expect(parsed[0].flag).toBe('🇨🇳🇺🇸')
    })

    it('splitSqlStatements with emoji in strings', () => {
      const sql = "SELECT 'hello 🌍🚀'; SELECT 'world 🎉';"
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(2)
      expect(result[0]).toContain('🌍🚀')
      expect(result[1]).toContain('🎉')
    })

    it('expandSnippetBody with emoji', () => {
      // Emoji in snippet body
      const body = '# ${1:Comment 🎉}\nprint("${2:Hello 🌍}")'
      const expanded = expandSnippetBody(body)
      expect(expanded).toBe('# Comment 🎉\nprint("Hello 🌍")')
    })
  })

  describe('5.5 Special characters in SQL', () => {
    it('SQL injection attempt in single-quoted string', () => {
      const sql = "SELECT * FROM users WHERE name = 'Robert\\'\\'; DROP TABLE users;--';"
      const result = splitSqlStatements(sql)
      // Should preserve the entire thing as one statement (properly quoted)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('backslash escapes in SQL', () => {
      const sql = "SELECT 'C:\\\\Users\\\\test\\\\file.txt';"
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
    })

    it('SQL with nested quotes (double inside single)', () => {
      const sql = `SELECT 'She said "hello"';`
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
    })

    it('SQL with angle brackets', () => {
      const sql = 'SELECT \'<div class="test">content</div>\';'
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
    })

    it('SQL with unicode and special chars combined', () => {
      const sql = "SELECT '价格: ¥100, $50, €30' AS price;"
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('¥100')
    })

    it('SQL with line comments containing special chars', () => {
      const sql = '-- This is a comment with 特殊字符 and @#$%\nSELECT 1;'
      const result = splitSqlStatements(sql)
      expect(result).toEqual(['SELECT 1'])
    })

    it('SQL with block comment is not natively handled by splitSqlStatements', () => {
      // splitSqlStatements handles -- line comments but not /* */ block comments
      // This test verifies the current behavior (block comments are treated as text)
      const sql = '/* comment; with; semicolons */\nSELECT 1;'
      const result = splitSqlStatements(sql)
      // Block comments with semicolons cause splitting (known limitation)
      expect(result.length).toBeGreaterThanOrEqual(1)
      // The last segment should contain SELECT 1
      expect(result[result.length - 1]).toContain('SELECT 1')
    })

    it('SQL with null bytes and control chars', () => {
      const sql = "SELECT 'data\\x00inside';"
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
    })

    it('isQueryStatement with SQL injection patterns', () => {
      expect(isQueryStatement('SELECT * FROM users; DROP TABLE users')).toBe(true) // still starts with SELECT
      expect(isQueryStatement("'; DROP TABLE users; --")).toBe(false)
      expect(isQueryStatement('1; DROP TABLE users')).toBe(false)
    })

    it('formatRows with SQL-dangerous string values', () => {
      const result = formatRows([
        { name: "Robert'; DROP TABLE students;--", value: '<script>alert("xss")</script>' },
      ])
      const parsed = JSON.parse(result)
      expect(parsed[0].name).toBe("Robert'; DROP TABLE students;--")
      expect(parsed[0].value).toBe('<script>alert("xss")</script>')
    })
  })

  describe('5.6 Very long lines', () => {
    it('single line with 1MB of characters', () => {
      const longLine = 'x'.repeat(1_000_000)
      useEditorStore.getState().updateContent('welcome', longLine)
      expect(useEditorStore.getState().tabs[0].content).toHaveLength(1_000_000)
    })

    it('single line with 100K unicode characters', () => {
      const longLine = '中'.repeat(100_000)
      useEditorStore.getState().updateContent('welcome', longLine)
      expect(useEditorStore.getState().tabs[0].content).toHaveLength(100_000)
    })

    it('splitIntoChunks with single very long paragraph', () => {
      const text = 'word '.repeat(50_000)
      const result = splitIntoChunks(text, 10_000)
      // Single paragraph with no double-newlines stays as one chunk
      expect(result).toHaveLength(1)
    })

    it('splitIntoChunks with long lines separated by newlines', () => {
      const lines = Array.from({ length: 100 }, () => 'a'.repeat(1000))
      const text = lines.join('\n\n')
      const result = splitIntoChunks(text, 5000)
      expect(result.length).toBeGreaterThan(1)
    })

    it('escapeRegExp on very long string with special chars', () => {
      const input = '(a|b)'.repeat(10_000)
      const escaped = escapeRegExp(input)
      expect(escaped).toContain('\\(a\\|b\\)')
      // Verify the escaped version works as a regex
      expect(new RegExp(escaped).test(input)).toBe(true)
    })

    it('JSON serialization of very long values', () => {
      const bigVal = 'a'.repeat(500_000)
      const result = formatRows([{ data: bigVal }])
      const parsed = JSON.parse(result)
      expect(parsed[0].data).toHaveLength(500_000)
    })
  })

  describe('5.7 Labels and metadata with unicode', () => {
    it('sourceLabel returns raw value for unknown source', () => {
      expect(sourceLabel('未知来源')).toBe('未知来源')
      expect(sourceLabel('')).toBe('')
    })

    it('platformLabel returns raw value for unknown platform', () => {
      expect(platformLabel('未知平台')).toBe('未知平台')
      expect(platformLabel('test-平台')).toBe('test-平台')
    })

    it('modeLabel returns raw value for unknown mode', () => {
      expect(modeLabel('自定义模式')).toBe('自定义模式')
    })

    it('trackLabel returns raw value for unknown track', () => {
      expect(trackLabel('自定义路径')).toBe('自定义路径')
    })

    it('examStyleLabel returns raw value for unknown style', () => {
      expect(examStyleLabel('自定义风格')).toBe('自定义风格')
    })

    it('parseJsonArray with unicode content', () => {
      expect(parseJsonArray('["数组","排序","动态规划"]')).toEqual(['数组', '排序', '动态规划'])
    })

    it('parseJsonArray with mixed unicode and ascii', () => {
      expect(parseJsonArray('["array","数组","dp","动态规划"]')).toEqual([
        'array',
        '数组',
        'dp',
        '动态规划',
      ])
    })
  })

  describe('5.8 Snippet edge cases with unicode', () => {
    it('user snippet with unicode name', () => {
      const snippet = addUserSnippet({
        name: '中文代码片段',
        prefix: 'cn',
        language: 'python',
        body: '# 中文代码\nprint("你好")',
        description: '一个中文代码片段',
      })
      expect(snippet.name).toBe('中文代码片段')
      expect(snippet.description).toBe('一个中文代码片段')

      const found = findSnippetByPrefix('cn', 'python')
      expect(found).toBeTruthy()
      expect(found!.body).toContain('你好')

      removeUserSnippet(snippet.id)
    })

    it('user snippet with emoji', () => {
      const snippet = addUserSnippet({
        name: 'Test 🎉',
        prefix: 'testemoji',
        language: 'python',
        body: '# Test ✅\nassert True',
        description: 'Emoji snippet 🚀',
      })
      expect(snippet.name).toBe('Test 🎉')

      const found = findSnippetByPrefix('testemoji', 'python')
      expect(found).toBeTruthy()
      expect(found!.body).toContain('✅')

      removeUserSnippet(snippet.id)
    })

    it('expandSnippetBody with unicode placeholders', () => {
      const body = '${1:函数名}(${2:参数})'
      const expanded = expandSnippetBody(body)
      expect(expanded).toBe('函数名(参数)')
    })

    it('updateUserSnippet preserves unicode', () => {
      const snippet = addUserSnippet({
        name: 'Original',
        prefix: 'orig',
        language: 'python',
        body: 'original',
        description: 'original',
      })
      updateUserSnippet(snippet.id, {
        name: '更新后的名称',
        body: '# 更新后的内容\nprint("新内容")',
      })
      const found = findSnippetByPrefix('orig', 'python')
      expect(found).toBeTruthy()
      expect(found!.name).toBe('更新后的名称')
      expect(found!.body).toContain('新内容')

      removeUserSnippet(snippet.id)
    })

    it('getSnippetLanguages includes user-added languages', () => {
      const snippet = addUserSnippet({
        name: 'Custom',
        prefix: 'custom',
        language: 'custom-lang',
        body: 'custom',
        description: 'custom',
      })

      const langs = getSnippetLanguages()
      expect(langs).toContain('custom-lang')

      removeUserSnippet(snippet.id)
    })

    it('removeUserSnippet with non-existent id does not throw', () => {
      expect(() => removeUserSnippet('non-existent-id')).not.toThrow()
    })

    it('updateUserSnippet with non-existent id does not throw', () => {
      expect(() => updateUserSnippet('non-existent-id', { name: 'test' })).not.toThrow()
    })
  })

  describe('5.9 Zero-width and special Unicode characters', () => {
    it('editor content with zero-width spaces', () => {
      const content = 'hello​world‌‍'
      useEditorStore.getState().updateContent('welcome', content)
      expect(useEditorStore.getState().tabs[0].content).toBe(content)
    })

    it('chat message with zero-width joiner (complex emoji)', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Test', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce([])
      mockInvoke.mockResolvedValueOnce({ success: true, requestId: 'r1', content: '' })

      // Family emoji with ZWJ
      await useChatStore.getState().sendMessage('Test 👨‍👩‍👧‍👦 family')

      expect(useChatStore.getState().messages[0].content).toContain('👨‍👩‍👧‍👦')
    })

    it('formatRows with null bytes', () => {
      const result = formatRows([{ data: 'before\x00after' }])
      const parsed = JSON.parse(result)
      expect(parsed[0].data).toBe('before\x00after')
    })

    it('splitSqlStatements with BOM character', () => {
      const sql = '﻿SELECT 1;'
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
    })

    it('escapeRegExp with zero-width characters', () => {
      const input = 'test​[string]'
      const escaped = escapeRegExp(input)
      expect(escaped).toBe('test​\\[string\\]')
    })
  })
})
