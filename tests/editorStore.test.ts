import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { legacyExerciseRecoveryTabId } from '../src/shared/editorWorkspaceContract'
import {
  createBootScopedRecoverySessionId,
  getRecoveryBootScope,
} from '../src/utils/recoverySession'

// editorStore has no external deps beyond constants, no mock needed
const {
  EDITOR_RECOVERY_KEY,
  EDITOR_RECOVERY_KEY_PREFIX,
  EDITOR_STORAGE_KEY,
  EDITOR_STORAGE_VERSION,
  EDITOR_VIEW_RECOVERY_KEY_PREFIX,
  LEGACY_EDITOR_RECOVERY_KEY,
  LEGACY_EDITOR_STORAGE_KEY,
  MAX_EDITOR_TABS,
  WELCOME_TAB_CONTENT,
  captureEditorTabViewRecovery,
  clearEditorTabRecovery,
  clearEditorTabViewRecovery,
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

    function viewRecoveryDocument(values: Map<string, string>) {
      const entry = [...values.entries()].find(([key]) =>
        key.startsWith(EDITOR_VIEW_RECOVERY_KEY_PREFIX),
      )
      expect(entry).toBeDefined()
      return JSON.parse(entry?.[1] ?? '{}') as {
        version: number
        entries: Record<
          string,
          {
            cursorPosition: { lineNumber: number; column: number } | null
            scrollTop: number
            updatedAt: number
          }
        >
      }
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

    it('records and restores each viewport change before the debounced snapshot runs', () => {
      vi.useFakeTimers()
      const { values } = installStorage()
      flushPersistTabs()
      const durableBeforeViewChange = values.get(EDITOR_STORAGE_KEY)

      useEditorStore.getState().updateCursorPosition('welcome', 8, 4)
      let viewRecovery = viewRecoveryDocument(values)
      expect(viewRecovery.entries.welcome).toMatchObject({
        cursorPosition: { lineNumber: 8, column: 4 },
        scrollTop: 0,
      })

      useEditorStore.getState().updateScrollTop('welcome', 320)
      viewRecovery = viewRecoveryDocument(values)
      expect(viewRecovery.entries.welcome).toMatchObject({
        cursorPosition: { lineNumber: 8, column: 4 },
        scrollTop: 320,
      })
      expect(values.get(EDITOR_STORAGE_KEY)).toBe(durableBeforeViewChange)

      resetStore()
      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs[0]).toMatchObject({
        content: WELCOME_TAB_CONTENT,
        cursorPosition: { lineNumber: 8, column: 4 },
        scrollTop: 320,
      })
      expect(useEditorStore.getState().restoreStatus).toBe('recovered')
    })

    it('skips rewriting the recovery log when the tab content is unchanged', () => {
      const { setItem } = installStorage()
      const recoveryWrites = () =>
        setItem.mock.calls.filter(([key]) => (key as string).startsWith(EDITOR_RECOVERY_KEY_PREFIX))
          .length

      useEditorStore.getState().updateContent('welcome', 'same content')
      expect(recoveryWrites()).toBe(1)

      useEditorStore.getState().updateContent('welcome', 'same content')
      useEditorStore.getState().updateContent('welcome', 'same content')
      expect(recoveryWrites()).toBe(1)

      useEditorStore.getState().updateContent('welcome', 'changed content')
      expect(recoveryWrites()).toBe(2)
    })

    it('notifies subscribers exactly once per cursor and scroll update', () => {
      installStorage()
      const listener = vi.fn()
      const unsubscribe = useEditorStore.subscribe(listener)

      useEditorStore.getState().updateCursorPosition('welcome', 3, 5)
      expect(listener).toHaveBeenCalledTimes(1)
      useEditorStore.getState().updateScrollTop('welcome', 120)
      expect(listener).toHaveBeenCalledTimes(2)

      unsubscribe()
    })

    it('uses content-free view recovery for file, problem, and exercise tabs', () => {
      const { values } = installStorage()
      const cases = [
        {
          id: 'ordinary-file',
          filename: 'ordinary.py',
          kind: 'file' as const,
          content: 'file-secret-code',
        },
        {
          id: 'standalone-problem',
          filename: 'problem.py',
          kind: 'problem' as const,
          content: 'problem-secret-code',
        },
        {
          id: 'exercise-practice',
          filename: 'practice.py',
          kind: 'exercise' as const,
          content: 'practice-secret-code',
        },
      ]
      for (const [index, item] of cases.entries()) {
        useEditorStore.getState().addTab({ ...item, language: 'python' })
        useEditorStore.getState().updateCursorPosition(item.id, index + 2, index + 3)
        useEditorStore.getState().updateScrollTop(item.id, (index + 1) * 100)
      }

      const raw = [...values.entries()].find(([key]) =>
        key.startsWith(EDITOR_VIEW_RECOVERY_KEY_PREFIX),
      )?.[1]
      expect(raw).toBeDefined()
      expect(raw).not.toContain('file-secret-code')
      expect(raw).not.toContain('problem-secret-code')
      expect(raw).not.toContain('practice-secret-code')
      const viewRecovery = viewRecoveryDocument(values)
      for (const [index, item] of cases.entries()) {
        expect(viewRecovery.entries[item.id]).toEqual({
          cursorPosition: { lineNumber: index + 2, column: index + 3 },
          scrollTop: (index + 1) * 100,
          updatedAt: expect.any(Number),
        })
      }
      expect(
        useEditorStore.getState().tabs.find((tab) => tab.id === 'exercise-practice'),
      ).toMatchObject({
        kind: 'exercise',
        content: '',
      })
    })

    it('merges the newest window view without creating a content recovery branch', () => {
      installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'shared',
          tabs: [
            {
              id: 'shared',
              filename: 'shared.py',
              language: 'python',
              content: 'durable content',
              kind: 'file',
              cursorPosition: { lineNumber: 1, column: 1 },
              scrollTop: 0,
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: 1,
        }),
        [`${EDITOR_VIEW_RECOVERY_KEY_PREFIX}old-window-a`]: JSON.stringify({
          version: 1,
          entries: {
            shared: {
              cursorPosition: { lineNumber: 3, column: 2 },
              scrollTop: 120,
              updatedAt: 10,
            },
          },
        }),
        [`${EDITOR_VIEW_RECOVERY_KEY_PREFIX}old-window-b`]: JSON.stringify({
          version: 1,
          entries: {
            shared: {
              cursorPosition: { lineNumber: 9, column: 5 },
              scrollTop: 640,
              updatedAt: 20,
            },
          },
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toHaveLength(1)
      expect(useEditorStore.getState().tabs[0]).toMatchObject({
        id: 'shared',
        filename: 'shared.py',
        content: 'durable content',
        cursorPosition: { lineNumber: 9, column: 5 },
        scrollTop: 640,
      })
      expect(useEditorStore.getState().tabs[0].localOnly).toBeUndefined()
      expect(useEditorStore.getState().restoreStatus).toBe('recovered')
    })

    it('does not clear an interleaved newer view entry captured from an old renderer', () => {
      const oldRendererKey = `${EDITOR_VIEW_RECOVERY_KEY_PREFIX}old-renderer`
      const { values } = installStorage({
        [oldRendererKey]: JSON.stringify({
          version: 1,
          entries: {
            shared: {
              cursorPosition: { lineNumber: 2, column: 3 },
              scrollTop: 100,
              updatedAt: 10,
            },
            unrelated: {
              cursorPosition: null,
              scrollTop: 40,
              updatedAt: 11,
            },
          },
        }),
      })
      const expectation = captureEditorTabViewRecovery('shared')
      values.set(
        oldRendererKey,
        JSON.stringify({
          version: 1,
          entries: {
            shared: {
              cursorPosition: { lineNumber: 12, column: 7 },
              scrollTop: 900,
              updatedAt: 20,
            },
            unrelated: {
              cursorPosition: null,
              scrollTop: 40,
              updatedAt: 11,
            },
          },
        }),
      )

      clearEditorTabViewRecovery(expectation)

      expect(JSON.parse(values.get(oldRendererKey) ?? '{}')).toMatchObject({
        entries: {
          shared: {
            cursorPosition: { lineNumber: 12, column: 7 },
            scrollTop: 900,
          },
          unrelated: { scrollTop: 40 },
        },
      })
    })

    it('keeps another renderer view recovery read-only during the same app boot', () => {
      const liveRendererKey = `${EDITOR_VIEW_RECOVERY_KEY_PREFIX}${createBootScopedRecoverySessionId(
        'other-view-window',
        getRecoveryBootScope(),
      )}`
      const raw = JSON.stringify({
        version: 1,
        entries: {
          shared: {
            cursorPosition: { lineNumber: 4, column: 5 },
            scrollTop: 220,
            updatedAt: 10,
          },
        },
      })
      const { values } = installStorage({ [liveRendererKey]: raw })

      clearEditorTabViewRecovery(captureEditorTabViewRecovery('shared'))

      expect(values.get(liveRendererKey)).toBe(raw)
    })

    it('backs up a corrupt view recovery without replacing durable content', () => {
      const corruptKey = `${EDITOR_VIEW_RECOVERY_KEY_PREFIX}corrupt-window`
      const raw = '{broken-view-recovery'
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'durable',
          tabs: [
            {
              id: 'durable',
              filename: 'durable.py',
              language: 'python',
              content: 'durable code',
              kind: 'file',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: 10,
        }),
        [corruptKey]: raw,
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toEqual([
        expect.objectContaining({ id: 'durable', content: 'durable code' }),
      ])
      expect(useEditorStore.getState().restoreStatus).toBe('degraded')
      expect(useEditorStore.getState().restoreMessage).toContain('视图恢复日志已损坏')
      expect(
        [...values.entries()].some(
          ([key, value]) => key.startsWith(`${corruptKey}.corrupt.`) && value === raw,
        ),
      ).toBe(true)
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

    it('migrates a v3 snapshot to v4 without discarding practice-backed problem code', () => {
      const practiceProblem = {
        id: 'exercise-imported-problem',
        filename: 'imported.py',
        language: 'python',
        content: 'print("preserve imported draft")',
        kind: 'problem' as const,
        problemId: 'imported-problem',
        cursorPosition: { lineNumber: 1, column: 8 },
        scrollTop: 144,
      }
      const raw = JSON.stringify({
        version: 3,
        activeTabId: practiceProblem.id,
        tabs: [
          {
            id: 'standalone-problem',
            filename: 'standalone.py',
            language: 'python',
            content: 'print("standalone stays in the tab")',
            kind: 'problem',
            problemId: 'standalone-problem',
          },
          practiceProblem,
        ],
        recentlyClosedTabs: [],
        updatedAt: 30,
      })
      const { values } = installStorage({ [EDITOR_STORAGE_KEY]: raw })

      useEditorStore.getState().restoreTabs()

      const recoveryId = legacyExerciseRecoveryTabId(practiceProblem)
      expect(useEditorStore.getState()).toMatchObject({
        activeTabId: practiceProblem.id,
        tabs: expect.arrayContaining([
          expect.objectContaining({
            id: 'standalone-problem',
            content: 'print("standalone stays in the tab")',
          }),
          expect.objectContaining({
            id: practiceProblem.id,
            kind: 'problem',
            content: '',
            cursorPosition: { lineNumber: 1, column: 8 },
            scrollTop: 144,
          }),
          expect.objectContaining({
            id: recoveryId,
            kind: 'file',
            content: 'print("preserve imported draft")',
            recoveryOriginalId: practiceProblem.id,
          }),
        ]),
      })

      flushPersistTabs()
      expect(JSON.parse(values.get(EDITOR_STORAGE_KEY) ?? '{}')).toMatchObject({
        version: EDITOR_STORAGE_VERSION,
        activeTabId: practiceProblem.id,
      })
      expect([...values.entries()]).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.stringContaining(`${EDITOR_STORAGE_KEY}.migration-backup.`),
            raw,
          ]),
        ]),
      )
    })

    it('keeps exercise code from the legacy tabs key in a deterministic recovery file', () => {
      const legacyExercise = {
        id: 'legacy-exercise',
        filename: 'legacy.py',
        language: 'python',
        content: 'print("must survive")',
        kind: 'exercise' as const,
        problemId: 'exercise-legacy',
      }
      const { values } = installStorage({
        [LEGACY_EDITOR_STORAGE_KEY]: JSON.stringify([legacyExercise]),
      })

      useEditorStore.getState().restoreTabs()

      const recoveryId = legacyExerciseRecoveryTabId(legacyExercise)
      expect(useEditorStore.getState().tabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'legacy-exercise', kind: 'exercise', content: '' }),
          expect.objectContaining({
            id: recoveryId,
            kind: 'file',
            content: 'print("must survive")',
          }),
        ]),
      )
      flushPersistTabs()
      expect(JSON.parse(values.get(EDITOR_STORAGE_KEY) ?? '{}')).toMatchObject({
        version: EDITOR_STORAGE_VERSION,
        tabs: expect.arrayContaining([
          expect.objectContaining({ id: recoveryId, content: 'print("must survive")' }),
        ]),
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

    it('prioritizes legacy exercise code over topology when recovery lists are at capacity', () => {
      const openExercise = {
        id: 'open-exercise-at-cap',
        filename: 'open-cap.py',
        language: 'python',
        content: 'open code must remain visible',
        kind: 'exercise' as const,
        problemId: 'open-cap',
      }
      const closedExercise = {
        id: 'closed-exercise-at-cap',
        filename: 'closed-cap.js',
        language: 'javascript',
        content: 'closed code must remain visible',
        kind: 'exercise' as const,
        problemId: 'closed-cap',
      }
      installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: 2,
          activeTabId: openExercise.id,
          tabs: [
            ...Array.from({ length: MAX_EDITOR_TABS - 1 }, (_, index) => ({
              id: `open-file-${index}`,
              filename: `open-${index}.py`,
              language: 'python',
              content: `open ${index}`,
              kind: 'file',
            })),
            openExercise,
          ],
          recentlyClosedTabs: [
            ...Array.from({ length: 9 }, (_, index) => ({
              id: `closed-file-${index}`,
              filename: `closed-${index}.py`,
              language: 'python',
              content: `closed ${index}`,
              kind: 'file',
            })),
            closedExercise,
          ],
          updatedAt: 10,
        }),
      })

      useEditorStore.getState().restoreTabs()

      const openRecoveryId = legacyExerciseRecoveryTabId(openExercise)
      const closedRecoveryId = legacyExerciseRecoveryTabId(closedExercise)
      const restored = useEditorStore.getState()
      expect(restored.tabs).toHaveLength(MAX_EDITOR_TABS)
      expect(restored.tabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: openRecoveryId,
            kind: 'file',
            content: openExercise.content,
          }),
        ]),
      )
      expect(restored.tabs.some((tab) => tab.id === openExercise.id)).toBe(false)
      expect(restored.recentlyClosedTabs).toHaveLength(10)
      expect(restored.recentlyClosedTabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: closedRecoveryId,
            kind: 'file',
            content: closedExercise.content,
          }),
        ]),
      )
      expect(restored.recentlyClosedTabs.some((tab) => tab.id === closedExercise.id)).toBe(false)
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

    it('preserves an older divergent recovery as a separate file', () => {
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
              revision: 5,
              updatedAt: '1970-01-01T00:00:00.020Z',
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
                revision: 4,
              },
              updatedAt: 10,
            },
          },
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'durable')?.content).toBe(
        'new durable content',
      )
      expect(useEditorStore.getState().tabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filename: 'main.recovered.py',
            content: 'stale recovery content',
            kind: 'file',
            syncConflict: true,
            localOnly: true,
            recoverySourceKeys: [EDITOR_RECOVERY_KEY],
            recoveryOriginalId: 'durable',
          }),
        ]),
      )
      expect(useEditorStore.getState().restoreStatus).toBe('recovered')
      expect(values.has(EDITOR_RECOVERY_KEY)).toBe(true)
    })

    it('keeps a tab recovery when another window only advanced the workspace snapshot', () => {
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'other-tab',
          tabs: [
            {
              id: 'other-tab',
              filename: 'other.py',
              language: 'python',
              content: 'saved in window B',
              kind: 'file',
              revision: 9,
              updatedAt: '2026-07-15T12:00:00.000Z',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: Date.parse('2026-07-15T12:00:00.000Z'),
        }),
        [`${EDITOR_RECOVERY_KEY_PREFIX}window-a`]: JSON.stringify({
          version: 3,
          entries: {
            'unsaved-a': {
              activeTabId: 'unsaved-a',
              tab: {
                id: 'unsaved-a',
                filename: 'unsaved.py',
                language: 'python',
                content: 'must survive window B snapshot',
                kind: 'file',
                revision: 1,
              },
              updatedAt: Date.parse('2026-07-15T11:59:00.000Z'),
            },
          },
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'unsaved-a',
            content: 'must survive window B snapshot',
          }),
        ]),
      )
      expect(values.has(`${EDITOR_RECOVERY_KEY_PREFIX}window-a`)).toBe(true)
      expect(useEditorStore.getState().restoreStatus).toBe('recovered')
    })

    it('preserves divergent same-tab recoveries from two crashed renderer sessions', () => {
      const windowAKey = `${EDITOR_RECOVERY_KEY_PREFIX}window-a`
      const windowBKey = `${EDITOR_RECOVERY_KEY_PREFIX}window-b`
      const recovery = (content: string, updatedAt: number) =>
        JSON.stringify({
          version: 3,
          entries: {
            shared: {
              activeTabId: 'shared',
              tab: {
                id: 'shared',
                filename: 'shared.py',
                language: 'python',
                content,
                kind: 'file',
                revision: 4,
              },
              updatedAt,
            },
          },
        })
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'shared',
          tabs: [
            {
              id: 'shared',
              filename: 'shared.py',
              language: 'python',
              content: 'base revision four',
              kind: 'file',
              revision: 4,
              updatedAt: '1970-01-01T00:00:00.001Z',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: 1,
        }),
        [windowAKey]: recovery('window A unsaved branch', 10),
        [windowBKey]: recovery('window B unsaved branch', 20),
      })

      useEditorStore.getState().restoreTabs()

      const restored = useEditorStore.getState()
      expect(restored.tabs.find((tab) => tab.id === 'shared')).toMatchObject({
        content: 'window B unsaved branch',
        recoverySourceKeys: [windowBKey],
      })
      expect(restored.tabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filename: 'shared.recovered.py',
            content: 'window A unsaved branch',
            kind: 'file',
            syncConflict: true,
            localOnly: true,
            recoveryOriginalId: 'shared',
            recoverySourceKeys: [windowAKey],
          }),
        ]),
      )
      expect(values.has(windowAKey)).toBe(true)
      expect(values.has(windowBKey)).toBe(true)
      expect(restored.activeTabId).toBe('shared')
      expect(restored.restoreStatus).toBe('recovered')

      flushPersistTabs()
      resetStore()
      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filename: 'shared.recovered.py',
            content: 'window A unsaved branch',
            syncConflict: true,
            recoverySourceKeys: [windowAKey],
          }),
        ]),
      )
      expect(values.has(windowAKey)).toBe(true)
      expect(values.has(windowBKey)).toBe(true)
    })

    it('deduplicates identical same-tab recoveries while retaining every source key', () => {
      const windowAKey = `${EDITOR_RECOVERY_KEY_PREFIX}same-a`
      const windowBKey = `${EDITOR_RECOVERY_KEY_PREFIX}same-b`
      const recovery = (
        updatedAt: number,
        cursorPosition: { lineNumber: number; column: number },
        scrollTop: number,
      ) =>
        JSON.stringify({
          version: 3,
          entries: {
            shared: {
              activeTabId: 'shared',
              tab: {
                id: 'shared',
                filename: 'shared.py',
                language: 'python',
                content: 'same unsaved branch',
                kind: 'file',
                revision: 4,
                cursorPosition,
                scrollTop,
              },
              updatedAt,
            },
          },
        })
      const { values } = installStorage({
        [windowAKey]: recovery(10, { lineNumber: 2, column: 3 }, 100),
        [windowBKey]: recovery(20, { lineNumber: 7, column: 8 }, 900),
      })

      useEditorStore.getState().restoreTabs()

      const candidates = useEditorStore
        .getState()
        .tabs.filter((tab) => tab.content === 'same unsaved branch')
      expect(candidates).toHaveLength(1)
      expect(candidates[0].recoverySourceKeys).toEqual([windowAKey, windowBKey])
      expect(candidates[0].recoveryOriginalId).toBeUndefined()
      expect(candidates[0].cursorPosition).toEqual({ lineNumber: 7, column: 8 })
      expect(candidates[0].scrollTop).toBe(900)

      clearEditorTabRecovery('shared', candidates[0].recoverySourceKeys)
      expect(values.has(windowAKey)).toBe(false)
      expect(values.has(windowBKey)).toBe(false)
    })

    it('backs up an out-of-range recovery timestamp without re-reading corrupt backups', () => {
      const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}invalid-timestamp`
      const existingBackupKey = `${recoveryKey}.corrupt.1`
      const rawRecovery = JSON.stringify({
        version: 3,
        entries: {
          durable: {
            activeTabId: 'durable',
            tab: {
              id: 'durable',
              filename: 'main.py',
              language: 'python',
              content: 'invalid recovery content',
              kind: 'file',
              revision: 4,
            },
            updatedAt: 1e300,
          },
        },
      })
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'durable',
          tabs: [
            {
              id: 'durable',
              filename: 'main.py',
              language: 'python',
              content: 'durable content',
              kind: 'file',
              revision: 5,
              updatedAt: '2026-07-16T00:00:00.000Z',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: Date.parse('2026-07-16T00:00:00.000Z'),
        }),
        [recoveryKey]: rawRecovery,
        [existingBackupKey]: rawRecovery,
      })
      const initialKeys = new Set(values.keys())

      expect(() => useEditorStore.getState().restoreTabs()).not.toThrow()

      expect(useEditorStore.getState().tabs).toEqual([
        expect.objectContaining({ id: 'durable', content: 'durable content' }),
      ])
      expect(useEditorStore.getState().restoreStatus).toBe('degraded')
      expect(useEditorStore.getState().restoreMessage).toContain('多标签恢复日志包含损坏条目')
      const newBackupKeys = [...values.keys()].filter(
        (key) => key.startsWith(`${recoveryKey}.corrupt.`) && !initialKeys.has(key),
      )
      expect(newBackupKeys).toHaveLength(1)
      expect(values.get(newBackupKeys[0])).toBe(rawRecovery)
      expect(values.get(recoveryKey)).toBe(rawRecovery)
      expect(
        [...values.keys()].some((key) => key.startsWith(`${existingBackupKey}.corrupt.`)),
      ).toBe(false)
    })

    it('backs up and degrades an array-shaped content recovery map', () => {
      const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}array-entries`
      const rawRecovery = JSON.stringify({ version: 3, entries: [] })
      const { values } = installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'durable',
          tabs: [
            {
              id: 'durable',
              filename: 'main.py',
              language: 'python',
              content: 'durable content',
              kind: 'file',
              revision: 5,
              updatedAt: '2026-07-16T00:00:00.000Z',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: Date.parse('2026-07-16T00:00:00.000Z'),
        }),
        [recoveryKey]: rawRecovery,
      })
      const initialKeys = new Set(values.keys())

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toEqual([
        expect.objectContaining({ id: 'durable', content: 'durable content' }),
      ])
      expect(useEditorStore.getState().restoreStatus).toBe('degraded')
      expect(useEditorStore.getState().restoreMessage).toContain('多标签恢复日志格式不受支持')
      const newBackupKeys = [...values.keys()].filter(
        (key) => key.startsWith(`${recoveryKey}.corrupt.`) && !initialKeys.has(key),
      )
      expect(newBackupKeys).toHaveLength(1)
      expect(values.get(newBackupKeys[0])).toBe(rawRecovery)
    })

    it('re-reads a foreign recovery map before clearing an interleaved newer branch', () => {
      const windowBKey = `${EDITOR_RECOVERY_KEY_PREFIX}interleaved-window-b`
      const oldRecovery = JSON.stringify({
        version: 3,
        entries: {
          shared: {
            activeTabId: 'shared',
            tab: {
              id: 'shared',
              filename: 'shared.py',
              language: 'python',
              content: 'saved branch',
              kind: 'file',
              revision: 4,
            },
            updatedAt: 10,
          },
        },
      })
      const { values } = installStorage({ [windowBKey]: oldRecovery })
      useEditorStore.getState().restoreTabs()
      const restored = useEditorStore.getState().tabs.find((tab) => tab.id === 'shared')
      expect(restored).toMatchObject({ content: 'saved branch', recoverySourceKeys: [windowBKey] })

      const getItem = vi.mocked(window.localStorage.getItem)
      let injected = false
      getItem.mockImplementation((key: string) => {
        const before = values.get(key) ?? null
        if (key === windowBKey && !injected) {
          injected = true
          values.set(
            windowBKey,
            JSON.stringify({
              version: 3,
              entries: {
                shared: {
                  activeTabId: 'shared',
                  tab: {
                    id: 'shared',
                    filename: 'shared.py',
                    language: 'python',
                    content: 'newer B branch',
                    kind: 'file',
                    revision: 5,
                  },
                  updatedAt: 20,
                },
                other: {
                  activeTabId: 'shared',
                  tab: {
                    id: 'other',
                    filename: 'other.py',
                    language: 'python',
                    content: 'unrelated B recovery',
                    kind: 'file',
                    revision: 2,
                  },
                  updatedAt: 21,
                },
              },
            }),
          )
        }
        return before
      })

      clearEditorTabRecovery('shared', [windowBKey], restored)

      expect(JSON.parse(values.get(windowBKey) ?? '{}')).toMatchObject({
        entries: {
          shared: { tab: { content: 'newer B branch', revision: 5 } },
          other: { tab: { content: 'unrelated B recovery' } },
        },
      })
    })

    it('does not clear an interleaved recovery entry whose code is unchanged', () => {
      const windowBKey = `${EDITOR_RECOVERY_KEY_PREFIX}interleaved-same-code-window-b`
      const oldRecovery = JSON.stringify({
        version: 3,
        entries: {
          shared: {
            activeTabId: 'shared',
            tab: {
              id: 'shared',
              filename: 'shared.py',
              language: 'python',
              content: 'same saved branch',
              kind: 'file',
              revision: 4,
              cursorPosition: { lineNumber: 2, column: 1 },
              scrollTop: 100,
            },
            updatedAt: 10,
          },
        },
      })
      const { values } = installStorage({ [windowBKey]: oldRecovery })
      useEditorStore.getState().restoreTabs()
      const restored = useEditorStore.getState().tabs.find((tab) => tab.id === 'shared')
      const getItem = vi.mocked(window.localStorage.getItem)
      let injected = false
      getItem.mockImplementation((key: string) => {
        const before = values.get(key) ?? null
        if (key === windowBKey && !injected) {
          injected = true
          values.set(
            windowBKey,
            JSON.stringify({
              version: 3,
              entries: {
                shared: {
                  activeTabId: 'shared',
                  tab: {
                    id: 'shared',
                    filename: 'shared.py',
                    language: 'python',
                    content: 'same saved branch',
                    kind: 'file',
                    revision: 4,
                    cursorPosition: { lineNumber: 9, column: 4 },
                    scrollTop: 800,
                  },
                  updatedAt: 20,
                },
              },
            }),
          )
        }
        return before
      })

      expect(clearEditorTabRecovery('shared', [windowBKey], restored)).toBe(false)

      expect(JSON.parse(values.get(windowBKey) ?? '{}')).toMatchObject({
        entries: {
          shared: {
            tab: {
              content: 'same saved branch',
              cursorPosition: { lineNumber: 9, column: 4 },
              scrollTop: 800,
            },
            updatedAt: 20,
          },
        },
      })
    })

    it('clears only the matching foreign tab while preserving an interleaved recovery entry', () => {
      const windowBKey = `${EDITOR_RECOVERY_KEY_PREFIX}interleaved-other-window-b`
      const oldRecovery = JSON.stringify({
        version: 3,
        entries: {
          shared: {
            activeTabId: 'shared',
            tab: {
              id: 'shared',
              filename: 'shared.py',
              language: 'python',
              content: 'saved branch',
              kind: 'file',
              revision: 4,
            },
            updatedAt: 10,
          },
        },
      })
      const { values } = installStorage({ [windowBKey]: oldRecovery })
      useEditorStore.getState().restoreTabs()
      const restored = useEditorStore.getState().tabs.find((tab) => tab.id === 'shared')

      const getItem = vi.mocked(window.localStorage.getItem)
      let injected = false
      getItem.mockImplementation((key: string) => {
        const before = values.get(key) ?? null
        if (key === windowBKey && !injected) {
          injected = true
          const latest = JSON.parse(before ?? '{}') as {
            version: number
            entries: Record<string, unknown>
          }
          latest.entries.other = {
            activeTabId: 'shared',
            tab: {
              id: 'other',
              filename: 'other.py',
              language: 'python',
              content: 'interleaved unrelated recovery',
              kind: 'file',
              revision: 2,
            },
            updatedAt: 20,
          }
          values.set(windowBKey, JSON.stringify(latest))
        }
        return before
      })

      clearEditorTabRecovery('shared', [windowBKey], restored)

      expect(JSON.parse(values.get(windowBKey) ?? '{}')).toMatchObject({
        entries: {
          other: { tab: { content: 'interleaved unrelated recovery' } },
        },
      })
      expect(JSON.parse(values.get(windowBKey) ?? '{}').entries.shared).toBeUndefined()
    })

    it('does not clear another renderer recovery map from the current app boot', () => {
      const windowBKey = `${EDITOR_RECOVERY_KEY_PREFIX}${createBootScopedRecoverySessionId(
        'other-window',
        getRecoveryBootScope(),
      )}`
      const recovery = JSON.stringify({
        version: 3,
        entries: {
          shared: {
            activeTabId: 'shared',
            tab: {
              id: 'shared',
              filename: 'shared.py',
              language: 'python',
              content: 'live window recovery',
              kind: 'file',
              revision: 4,
            },
            updatedAt: 10,
          },
        },
      })
      const { values } = installStorage({ [windowBKey]: recovery })
      useEditorStore.getState().restoreTabs()
      const restored = useEditorStore.getState().tabs.find((tab) => tab.id === 'shared')

      clearEditorTabRecovery('shared', [windowBKey], restored)

      expect(values.get(windowBKey)).toBe(recovery)
    })

    it('keeps unsaved content over a newer snapshot carrying the same tab revision', () => {
      installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'other-tab',
          tabs: [
            {
              id: 'unsaved-a',
              filename: 'unsaved.py',
              language: 'python',
              content: 'stale content copied by window B',
              kind: 'file',
              revision: 3,
              updatedAt: '2026-07-15T12:00:00.000Z',
            },
            {
              id: 'other-tab',
              filename: 'other.py',
              language: 'python',
              content: 'window B edit',
              kind: 'file',
              revision: 8,
              updatedAt: '2026-07-15T12:00:00.000Z',
            },
          ],
          recentlyClosedTabs: [],
          updatedAt: Date.parse('2026-07-15T12:00:00.000Z'),
        }),
        [`${EDITOR_RECOVERY_KEY_PREFIX}window-a-stale-copy`]: JSON.stringify({
          version: 3,
          entries: {
            'unsaved-a': {
              activeTabId: 'unsaved-a',
              tab: {
                id: 'unsaved-a',
                filename: 'unsaved.py',
                language: 'python',
                content: 'new unsaved content from window A',
                kind: 'file',
                revision: 3,
              },
              updatedAt: Date.parse('2026-07-15T11:59:00.000Z'),
            },
          },
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'unsaved-a')?.content).toBe(
        'new unsaved content from window A',
      )
      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'other-tab')?.content).toBe(
        'window B edit',
      )
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

    it('does not drop a recovery entry when the normal tab limit is already full', () => {
      const tabs = Array.from({ length: MAX_EDITOR_TABS }, (_, index) => ({
        id: `tab-${index}`,
        filename: `tab-${index}.py`,
        language: 'python',
        content: `saved ${index}`,
        kind: 'file',
      }))
      installStorage({
        [EDITOR_STORAGE_KEY]: JSON.stringify({
          version: EDITOR_STORAGE_VERSION,
          activeTabId: 'tab-0',
          tabs,
          recentlyClosedTabs: [],
          updatedAt: 1,
        }),
        [`${EDITOR_RECOVERY_KEY_PREFIX}overflow`]: JSON.stringify({
          version: 3,
          entries: {
            overflow: {
              activeTabId: 'overflow',
              tab: {
                id: 'overflow',
                filename: 'overflow.py',
                language: 'python',
                content: 'must survive even above the normal limit',
                kind: 'file',
              },
              updatedAt: 2,
            },
          },
        }),
      })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs).toHaveLength(MAX_EDITOR_TABS + 1)
      expect(useEditorStore.getState().tabs.at(-1)).toMatchObject({
        id: 'overflow',
        content: 'must survive even above the normal limit',
      })
      flushPersistTabs()
      expect(useEditorStore.getState().persistenceError).toContain('本地保存上限')
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

    it('clears identical legacy and session recoveries from every recorded source', () => {
      const sessionKey = `${EDITOR_RECOVERY_KEY_PREFIX}legacy-duplicate`
      const sharedTab = {
        id: 'legacy-recovery',
        filename: 'legacy.py',
        language: 'python',
        content: 'same crash recovery',
        kind: 'file',
      }
      const { values } = installStorage({
        [LEGACY_EDITOR_RECOVERY_KEY]: JSON.stringify({
          version: 1,
          activeTabId: sharedTab.id,
          tab: sharedTab,
          updatedAt: 50,
        }),
        [sessionKey]: JSON.stringify({
          version: 3,
          entries: {
            [sharedTab.id]: {
              activeTabId: sharedTab.id,
              tab: sharedTab,
              updatedAt: 60,
            },
          },
        }),
      })

      useEditorStore.getState().restoreTabs()

      const restored = useEditorStore.getState().tabs.find((tab) => tab.id === sharedTab.id)
      expect(restored?.recoverySourceKeys).toEqual([LEGACY_EDITOR_RECOVERY_KEY, sessionKey])
      clearEditorTabRecovery(sharedTab.id, restored?.recoverySourceKeys)
      expect(values.has(LEGACY_EDITOR_RECOVERY_KEY)).toBe(false)
      expect(values.has(sessionKey)).toBe(false)
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

    it('preserves divergent open and closed entries with the same id', () => {
      const raw = JSON.stringify({
        version: EDITOR_STORAGE_VERSION,
        activeTabId: 'shared-id',
        tabs: [
          {
            id: 'shared-id',
            filename: 'shared.py',
            language: 'python',
            content: 'open branch',
            kind: 'file',
            revision: 2,
          },
        ],
        recentlyClosedTabs: [
          {
            id: 'shared-id',
            filename: 'shared.py',
            language: 'python',
            content: 'closed branch that must survive',
            kind: 'file',
            revision: 1,
          },
        ],
        updatedAt: 20,
      })
      const { values } = installStorage({ [EDITOR_STORAGE_KEY]: raw })

      useEditorStore.getState().restoreTabs()

      expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'shared-id')?.content).toBe(
        'open branch',
      )
      expect(useEditorStore.getState().tabs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filename: 'shared.recovered.py',
            content: 'closed branch that must survive',
            recoveryOriginalId: 'shared-id',
            localOnly: true,
          }),
        ]),
      )
      expect(useEditorStore.getState().recentlyClosedTabs).toEqual([])
      expect(useEditorStore.getState().restoreStatus).toBe('degraded')
      expect(
        [...values.entries()].some(
          ([key, value]) => key.startsWith(`${EDITOR_STORAGE_KEY}.corrupt.`) && value === raw,
        ),
      ).toBe(true)
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
