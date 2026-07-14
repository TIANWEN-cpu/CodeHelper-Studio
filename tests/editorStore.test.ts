import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// editorStore has no external deps beyond constants, no mock needed
const {
  EDITOR_RECOVERY_KEY,
  EDITOR_RECOVERY_KEY_PREFIX,
  EDITOR_STORAGE_KEY,
  EDITOR_STORAGE_VERSION,
  LEGACY_EDITOR_RECOVERY_KEY,
  LEGACY_EDITOR_STORAGE_KEY,
  flushPersistTabs,
  useEditorStore,
} = await import('../src/stores/editorStore')

function resetStore() {
  useEditorStore.setState({
    tabs: [
      {
        id: 'welcome',
        filename: 'welcome.py',
        language: 'python',
        content: '# Welcome\nprint("hello")\n',
        kind: 'file',
      },
    ],
    activeTabId: 'welcome',
    hydrated: false,
    dirty: false,
    persistenceError: null,
    lastPersistedAt: null,
    recentlyClosedTabs: [],
    restoreStatus: 'idle',
    restoreMessage: null,
  })
}

beforeEach(() => {
  resetStore()
})

afterEach(() => {
  flushPersistTabs()
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
      expect(state.tabs[1]).toEqual({ ...newTab, kind: 'file' })
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
      const removeItem = vi.fn((key: string) => values.delete(key))
      vi.stubGlobal('window', {
        localStorage: {
          getItem: vi.fn((key: string) => values.get(key) ?? null),
          setItem,
          removeItem,
          get length() {
            return values.size
          },
          key: vi.fn((index: number) => [...values.keys()][index] ?? null),
        },
      })
      return { values, setItem, removeItem }
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

    it('recovers the latest code without waiting for the debounced workspace snapshot', () => {
      const { values } = installStorage()
      useEditorStore.getState().updateContent('welcome', 'last keystroke before crash')

      expect(values.has(EDITOR_STORAGE_KEY)).toBe(false)
      expect([...values.keys()].some((key) => key.startsWith(EDITOR_RECOVERY_KEY_PREFIX))).toBe(
        true,
      )
      resetStore()
      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs[0].content).toBe('last keystroke before crash')
      expect(useEditorStore.getState().dirty).toBe(true)
    })

    it('migrates a v1 workspace snapshot in place', () => {
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: 1,
          activeTabId: 'legacy-v1',
          tabs: [
            {
              id: 'legacy-v1',
              filename: 'legacy.py',
              language: 'python',
              content: 'preserved v1 code',
            },
          ],
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState()).toMatchObject({
        activeTabId: 'legacy-v1',
        tabs: [{ id: 'legacy-v1', content: 'preserved v1 code' }],
        recentlyClosedTabs: [],
      })
      flushPersistTabs()
      expect(JSON.parse(values.get(EDITOR_STORAGE_KEY) ?? '{}')).toMatchObject({
        version: EDITOR_STORAGE_VERSION,
        tabs: [{ id: 'legacy-v1', content: 'preserved v1 code' }],
        recentlyClosedTabs: [],
      })
    })

    it('persists problem and exercise tab kinds while upgrading missing kinds to files', () => {
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'legacy-file',
          tabs: [
            {
              id: 'legacy-file',
              filename: 'legacy.py',
              language: 'python',
              content: 'legacy',
            },
            {
              id: 'problem-a',
              filename: 'problem.py',
              language: 'python',
              content: 'solve()',
              kind: 'problem',
              problemId: 'problem-a',
            },
            {
              id: 'exercise-a',
              filename: 'exercise.py',
              language: 'python',
              content: 'practice()',
              kind: 'exercise',
              problemId: 'exercise-a',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: 10,
        }),
      })

      useEditorStore.getState().restoreTabs()

      const restoredKinds = useEditorStore.getState().tabs.map((tab) => [tab.id, tab.kind])
      expect(restoredKinds).toEqual(
        expect.arrayContaining([
          ['legacy-file', 'file'],
          ['problem-a', 'problem'],
          ['exercise-a', 'exercise'],
        ]),
      )
      // Legacy exercise content is stripped from the topology tab and kept as a
      // recovered ordinary file so draft authority stays outside editor_tabs.
      const recovered = useEditorStore
        .getState()
        .tabs.find((tab) => tab.id.startsWith('recovered-exercise-'))
      expect(recovered).toMatchObject({
        kind: 'file',
        content: 'practice()',
        recoveryOriginalId: 'exercise-a',
      })
      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'exercise-a')?.content).toBe(
        '',
      )
      flushPersistTabs()
      expect(
        JSON.parse(values.get(EDITOR_STORAGE_KEY) ?? '{}').tabs.map(
          (tab: { id: string; kind: string }) => [tab.id, tab.kind],
        ),
      ).toEqual(
        expect.arrayContaining([
          ['legacy-file', 'file'],
          ['problem-a', 'problem'],
          ['exercise-a', 'exercise'],
        ]),
      )
    })

    it('persists recently closed tabs across restart and can reopen them', () => {
      installStorage()
      useEditorStore.getState().addTab({
        id: 'recover-closed',
        filename: 'recover.py',
        language: 'python',
        content: 'closed but valuable',
      })
      useEditorStore.getState().closeTab('recover-closed')

      resetStore()
      useEditorStore.getState().restoreTabs()
      expect(useEditorStore.getState().recentlyClosedTabs[0]).toMatchObject({
        id: 'recover-closed',
        content: 'closed but valuable',
      })

      useEditorStore.getState().reopenLastClosed()
      expect(useEditorStore.getState().tabs.at(-1)).toMatchObject({
        id: 'recover-closed',
        content: 'closed but valuable',
      })
    })

    it('ignores and removes a recovery entry older than the durable v2 snapshot', () => {
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'durable',
          tabs: [
            {
              id: 'durable',
              filename: 'main.py',
              language: 'python',
              content: 'new durable content',
              kind: 'file',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: 20,
        }),
        [EDITOR_RECOVERY_KEY]: JSON.stringify({
          version: 2,
          entries: {
            durable: {
              activeTabId: 'durable',
              tab: {
                id: 'durable',
                filename: 'main.py',
                language: 'python',
                content: 'stale recovery content',
              },
              updatedAt: 10,
            },
          },
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs[0].content).toBe('new durable content')
      expect(useEditorStore.getState().restoreStatus).toBe('restored')
      expect(values.has(EDITOR_RECOVERY_KEY)).toBe(false)
    })

    it('recovers edits from more than one tab after an abnormal exit', () => {
      installStorage()
      useEditorStore.getState().addTab({
        id: 'second',
        filename: 'second.py',
        language: 'python',
        content: '',
      })
      useEditorStore.getState().updateContent('welcome', 'recovered first tab')
      useEditorStore.getState().updateContent('second', 'recovered second tab')

      resetStore()
      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'welcome')?.content).toBe(
        'recovered first tab',
      )
      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'second')?.content).toBe(
        'recovered second tab',
      )
    })

    it('migrates the legacy single-tab recovery log', () => {
      installStorage({
        [LEGACY_EDITOR_RECOVERY_KEY]: JSON.stringify({
          version: 1,
          activeTabId: 'legacy-recovery',
          tab: {
            id: 'legacy-recovery',
            filename: 'legacy.py',
            language: 'python',
            content: 'legacy crash recovery',
          },
          updatedAt: 50,
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(
        useEditorStore.getState().tabs.find((tab) => tab.id === 'legacy-recovery'),
      ).toMatchObject({ content: 'legacy crash recovery' })
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

    it('backs up and visibly degrades a partially malformed snapshot', () => {
      const raw = JSON.stringify({
        version: EDITOR_STORAGE_VERSION,
        activeTabId: 'missing',
        tabs: [
          { id: 'valid', filename: 'a.py', language: 'python', content: 'a' },
          { id: 'valid', filename: 'duplicate.py', language: 'python', content: 'b' },
          { id: '', filename: 'bad.py', language: 'python', content: 'bad' },
        ],
      })
      const { values } = installStorage({ [EDITOR_STORAGE_KEY]: raw })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toEqual([
        { id: 'valid', filename: 'a.py', language: 'python', content: 'a', kind: 'file' },
      ])
      expect(useEditorStore.getState().activeTabId).toBe('valid')
      expect(useEditorStore.getState().restoreStatus).toBe('degraded')
      expect(useEditorStore.getState().restoreMessage).toContain('重复、超限或损坏标签')
      expect([...values.values()].some((value) => value === raw)).toBe(true)
    })

    it('backs up an unreadable snapshot and keeps a clean in-memory tab', () => {
      const raw = '{broken'.padEnd(120_000, 'x')
      const { values } = installStorage({ [EDITOR_STORAGE_KEY]: raw })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs[0].id).toBe('welcome')
      expect(
        [...values.keys()].some((key) => key.startsWith(`${EDITOR_STORAGE_KEY}.corrupt.`)),
      ).toBe(true)
      const backup = [...values.entries()].find(([key]) =>
        key.startsWith(`${EDITOR_STORAGE_KEY}.corrupt.`),
      )
      expect(backup?.[1]).toBe(raw)
      expect(useEditorStore.getState()).toMatchObject({
        restoreStatus: 'degraded',
        restoreMessage: expect.stringContaining('恢复失败'),
      })
    })

    it('backs up an unsupported snapshot version instead of treating it as empty', () => {
      const raw = JSON.stringify({ version: 99, tabs: [{ content: 'future data' }] })
      const { values } = installStorage({ [EDITOR_STORAGE_KEY]: raw })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().restoreStatus).toBe('degraded')
      expect(useEditorStore.getState().restoreMessage).toContain('版本不受支持')
      expect([...values.values()].some((value) => value === raw)).toBe(true)
    })

    it('falls back to a valid legacy snapshot when the v2 snapshot is unreadable', () => {
      installStorage({
        [EDITOR_STORAGE_KEY]: '{broken',
        [LEGACY_EDITOR_STORAGE_KEY]: JSON.stringify([
          {
            id: 'legacy-safe',
            filename: 'legacy.py',
            language: 'python',
            content: 'preserved legacy content',
          },
        ]),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState()).toMatchObject({
        tabs: [{ id: 'legacy-safe', content: 'preserved legacy content', kind: 'file' }],
        restoreStatus: 'degraded',
        restoreMessage: expect.stringContaining('已使用仍可读取的工作区数据'),
      })
    })

    it('does not silently drop an oversized tab during persistence', () => {
      vi.useFakeTimers()
      const { values } = installStorage()
      useEditorStore.getState().updateContent('welcome', 'x'.repeat(5_000_001))

      flushPersistTabs()

      expect(values.has(EDITOR_STORAGE_KEY)).toBe(false)
      expect(useEditorStore.getState().persistenceError).toContain('超过本地保存上限')
    })

    it('keeps the in-memory document and exposes a recoverable error when storage fails', () => {
      vi.stubGlobal('window', {
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(() => {
            throw new Error('storage quota unavailable')
          }),
          removeItem: vi.fn(),
        },
      })

      useEditorStore.getState().updateContent('welcome', 'valuable unsaved content')

      expect(useEditorStore.getState().tabs[0].content).toBe('valuable unsaved content')
      expect(useEditorStore.getState().dirty).toBe(true)
      expect(useEditorStore.getState().persistenceError).toContain('storage quota unavailable')
    })
  })
})
