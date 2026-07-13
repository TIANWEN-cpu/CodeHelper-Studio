import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// editorStore has no external deps beyond constants, no mock needed
const { EDITOR_STORAGE_KEY, EDITOR_STORAGE_VERSION, flushPersistTabs, useEditorStore } =
  await import('../src/stores/editorStore')

function resetStore() {
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
    hydrated: false,
    dirty: false,
    persistenceError: null,
    lastPersistedAt: null,
    recentlyClosedTabs: [],
  })
}

beforeEach(() => {
  resetStore()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('editorStore', () => {
  describe('initial state', () => {
    it('starts with a welcome tab', () => {
      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe('welcome')
      expect(state.tabs[0].filename).toBe('welcome.py')
      expect(state.activeTabId).toBe('welcome')
    })
  })

  describe('addTab', () => {
    it('adds a new tab and makes it active', () => {
      const newTab = {
        id: 'tab-2',
        filename: 'test.js',
        language: 'javascript',
        content: 'console.log("hi")',
      }
      useEditorStore.getState().addTab(newTab)

      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.tabs[1]).toEqual(newTab)
      expect(state.activeTabId).toBe('tab-2')
    })

    it('preserves existing tabs when adding', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'a', filename: 'a.py', language: 'python', content: 'a' })
      useEditorStore
        .getState()
        .addTab({ id: 'b', filename: 'b.py', language: 'python', content: 'b' })

      expect(useEditorStore.getState().tabs).toHaveLength(3)
    })
  })

  describe('closeTab', () => {
    it('removes the specified tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      useEditorStore.getState().closeTab('tab-2')

      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe('welcome')
    })

    it('switches to first remaining tab when closing active tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      // activeTabId is now 'tab-2'
      expect(useEditorStore.getState().activeTabId).toBe('tab-2')

      useEditorStore.getState().closeTab('tab-2')

      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })

    it('sets activeTabId to null when closing the last tab', () => {
      useEditorStore.getState().closeTab('welcome')

      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(0)
      expect(state.activeTabId).toBeNull()
    })

    it('does not change activeTabId when closing a non-active tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      useEditorStore.getState().setActiveTab('welcome')
      useEditorStore.getState().closeTab('tab-2')

      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })

    it('can reopen the most recently closed tab with its content intact', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'recover', filename: 'recover.py', language: 'python', content: 'valuable' })
      useEditorStore.getState().closeTab('recover')

      useEditorStore.getState().reopenLastClosed()

      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'recover')?.content).toBe(
        'valuable',
      )
      expect(useEditorStore.getState().activeTabId).toBe('recover')
    })
  })

  describe('setActiveTab', () => {
    it('switches active tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      useEditorStore.getState().setActiveTab('welcome')

      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })

    it('rejects an id that does not belong to an existing tab', () => {
      useEditorStore.getState().setActiveTab('ghost')

      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })
  })

  describe('updateContent', () => {
    it('updates content of the specified tab', () => {
      useEditorStore.getState().updateContent('welcome', 'new content')

      expect(useEditorStore.getState().tabs[0].content).toBe('new content')
    })

    it('does not affect other tabs', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: 'original' })
      useEditorStore.getState().updateContent('welcome', 'changed')

      expect(useEditorStore.getState().tabs[1].content).toBe('original')
    })

    it('updates the correct tab among multiple', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: 'a' })
      useEditorStore
        .getState()
        .addTab({ id: 'tab-3', filename: 'y.py', language: 'python', content: 'b' })
      useEditorStore.getState().updateContent('tab-2', 'updated-a')

      expect(useEditorStore.getState().tabs[0].content).toBe('# Welcome\nprint("hello")\n')
      expect(useEditorStore.getState().tabs[1].content).toBe('updated-a')
      expect(useEditorStore.getState().tabs[2].content).toBe('b')
    })
  })

  describe('persistence', () => {
    function installStorage(initial: Record<string, string> = {}) {
      const values = new Map(Object.entries(initial))
      const setItem = vi.fn((key: string, value: string) => values.set(key, value))
      vi.stubGlobal('window', {
        localStorage: {
          getItem: vi.fn((key: string) => values.get(key) ?? null),
          setItem,
        },
      })
      return { values, setItem }
    }

    it('persists the latest tab content and active tab after the debounce', async () => {
      vi.useFakeTimers()
      const { values } = installStorage()
      useEditorStore
        .getState()
        .addTab({ id: 'second', filename: 'second.py', language: 'python', content: '' })
      useEditorStore.getState().updateContent('second', 'print("persisted")')

      await vi.advanceTimersByTimeAsync(500)

      const snapshot = JSON.parse(values.get(EDITOR_STORAGE_KEY) ?? '{}')
      expect(snapshot.version).toBe(EDITOR_STORAGE_VERSION)
      expect(snapshot.activeTabId).toBe('second')
      expect(snapshot.tabs.find((tab: { id: string }) => tab.id === 'second').content).toBe(
        'print("persisted")',
      )
    })

    it('flushes synchronously for pagehide and restores the active tab', () => {
      const { values } = installStorage()
      useEditorStore
        .getState()
        .addTab({ id: 'second', filename: 'second.py', language: 'python', content: 'saved' })
      useEditorStore.getState().updateCursorPosition('second', 8, 4)
      useEditorStore.getState().updateScrollTop('second', 320)
      flushPersistTabs()

      resetStore()
      useEditorStore.getState().restoreTabs()

      expect(values.has(EDITOR_STORAGE_KEY)).toBe(true)
      expect(useEditorStore.getState().activeTabId).toBe('second')
      expect(useEditorStore.getState().tabs[1].content).toBe('saved')
      expect(useEditorStore.getState().tabs[1].cursorPosition).toEqual({
        lineNumber: 8,
        column: 4,
      })
      expect(useEditorStore.getState().tabs[1].scrollTop).toBe(320)
      expect(useEditorStore.getState().hydrated).toBe(true)
    })

    it('normalizes invalid viewport state and ignores updates for missing tabs', () => {
      useEditorStore.getState().updateCursorPosition('welcome', 0, -5)
      useEditorStore.getState().updateScrollTop('welcome', -100)
      useEditorStore.getState().updateCursorPosition('missing', 9, 9)
      useEditorStore.getState().updateScrollTop('missing', 900)

      expect(useEditorStore.getState().tabs[0]).toMatchObject({
        cursorPosition: { lineNumber: 1, column: 1 },
        scrollTop: 0,
      })
      expect(useEditorStore.getState().tabs).toHaveLength(1)
    })

    it('ignores duplicate and malformed tabs during restore', () => {
      installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'missing',
          tabs: [
            { id: 'valid', filename: 'a.py', language: 'python', content: 'a' },
            { id: 'valid', filename: 'duplicate.py', language: 'python', content: 'b' },
            { id: '', filename: 'bad.py', language: 'python', content: 'bad' },
          ],
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toEqual([
        { id: 'valid', filename: 'a.py', language: 'python', content: 'a' },
      ])
      expect(useEditorStore.getState().activeTabId).toBe('valid')
    })

    it('backs up an unreadable snapshot and keeps a clean in-memory tab', () => {
      const { values } = installStorage({ [EDITOR_STORAGE_KEY]: '{broken' })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs[0].id).toBe('welcome')
      expect(
        [...values.keys()].some((key) => key.startsWith(`${EDITOR_STORAGE_KEY}.corrupt.`)),
      ).toBe(true)
    })

    it('does not silently drop an oversized tab during persistence', () => {
      vi.useFakeTimers()
      const { values } = installStorage()
      useEditorStore.getState().updateContent('welcome', 'x'.repeat(5_000_001))

      flushPersistTabs()

      expect(values.has(EDITOR_STORAGE_KEY)).toBe(false)
      expect(useEditorStore.getState().persistenceError).toContain('超过本地保存上限')
    })
  })
})
