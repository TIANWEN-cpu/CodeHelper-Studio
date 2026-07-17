import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EditorWorkspaceSynchronizer,
  type EditorWorkspaceSyncDependencies,
} from '../src/services/editorWorkspaceSync'
import {
  EDITOR_RECOVERY_KEY_PREFIX,
  EDITOR_RECOVERY_KEY,
  EDITOR_STORAGE_VERSION,
  EDITOR_STORAGE_KEY,
  EDITOR_VIEW_RECOVERY_KEY_PREFIX,
  useEditorStore,
  type EditorTab,
} from '../src/stores/editorStore'
import type {
  EditorTabRecord,
  EditorWorkspaceChangedEvent,
  EditorWorkspaceRecord,
} from '../src/services/editorWorkspaceService'
import {
  legacyExerciseRecoveryFilename,
  legacyExerciseRecoveryTabId,
} from '../src/shared/editorWorkspaceContract'
import {
  createBootScopedRecoverySessionId,
  getRecoveryBootScope,
} from '../src/utils/recoverySession'

function record(overrides: Partial<EditorTabRecord> = {}): EditorTabRecord {
  return {
    workspaceId: 'default',
    id: 'tab-a',
    filename: 'a.py',
    language: 'python',
    content: 'print("a")',
    kind: 'file',
    problemId: null,
    cursorPosition: null,
    scrollTop: 0,
    position: 0,
    status: 'open',
    revision: 1,
    updatedAt: '2026-07-14T00:00:00.000Z',
    viewUpdatedAt: '2026-07-14T00:00:00.000Z',
    closedAt: null,
    deletedAt: null,
    ...overrides,
  }
}

function workspace(overrides: Partial<EditorWorkspaceRecord> = {}): EditorWorkspaceRecord {
  return {
    workspaceId: 'default',
    tabs: [],
    activeTabId: null,
    recentlyClosedTabs: [],
    generation: 0,
    legacyStorageVersion: EDITOR_STORAGE_VERSION,
    ...overrides,
  }
}

function tab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 'tab-a',
    filename: 'a.py',
    language: 'python',
    content: 'print("a")',
    kind: 'file',
    ...overrides,
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('editor workspace SQLite synchronization', () => {
  let remoteListener: ((event: EditorWorkspaceChangedEvent) => void) | null
  let dependencies: EditorWorkspaceSyncDependencies
  let synchronizer: EditorWorkspaceSynchronizer
  let storageValues: Map<string, string>

  beforeEach(() => {
    vi.useFakeTimers()
    storageValues = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storageValues.set(key, value)),
        removeItem: vi.fn((key: string) => storageValues.delete(key)),
        get length() {
          return storageValues.size
        },
        key: vi.fn((index: number) => [...storageValues.keys()][index] ?? null),
      },
    })
    remoteListener = null
    dependencies = {
      load: vi.fn(async () => workspace()),
      migrateLegacy: vi.fn(async (input) => ({
        status: 'migrated',
        recoveredTabIds: [],
        recoveredTabMappings: {},
        workspace: workspace({
          tabs: input.tabs
            .filter((item) => item.status === 'open')
            .map((item) =>
              record({
                id: item.id,
                filename: item.filename,
                language: item.language,
                content: item.content,
                kind: item.kind ?? 'file',
                problemId: item.problemId ?? null,
                cursorPosition: item.cursorPosition,
                scrollTop: item.scrollTop,
                position: item.position,
              }),
            ),
          activeTabId: input.activeTabId,
          recentlyClosedTabs: input.tabs
            .filter((item) => item.status === 'closed')
            .map((item) =>
              record({
                id: item.id,
                filename: item.filename,
                language: item.language,
                content: item.content,
                kind: item.kind ?? 'file',
                problemId: item.problemId ?? null,
                cursorPosition: item.cursorPosition,
                scrollTop: item.scrollTop,
                position: item.position,
                status: 'closed',
              }),
            ),
          generation: 1,
          legacyStorageVersion: input.storageVersion,
        }),
      })),
      save: vi.fn(async (input) => ({
        status: 'saved',
        applied: true,
        generation: 1,
        tab: record({
          id: input.id,
          filename: input.filename,
          language: input.language,
          content: input.content,
          kind: input.kind ?? 'file',
          problemId: input.problemId ?? null,
          position: input.position,
          revision: input.baseRevision + 1,
        }),
      })),
      updateViewState: vi.fn(async (input) => ({
        status: 'saved',
        applied: true,
        generation: 1,
        viewState: {
          workspaceId: 'default',
          id: input.id,
          cursorPosition: input.cursorPosition,
          scrollTop: input.scrollTop,
          status: 'open',
          revision: 1,
          viewUpdatedAt: '2026-07-14T00:00:01.000Z',
        },
      })),
      close: vi.fn(async (input) => ({
        status: 'saved',
        applied: true,
        generation: 2,
        tab: record({ id: input.id, status: 'closed', revision: input.baseRevision + 1 }),
      })),
      reopen: vi.fn(async (input) => ({
        status: 'saved',
        applied: true,
        generation: 2,
        tab: record({ id: input.id, status: 'open', revision: input.baseRevision + 1 }),
      })),
      setActive: vi.fn(async (activeTabId) => ({ activeTabId, generation: 1 })),
      onChanged: vi.fn((callback) => {
        remoteListener = callback
        return vi.fn()
      }),
    }
    useEditorStore.setState({
      tabs: [tab()],
      activeTabId: 'tab-a',
      cursorPosition: null,
      scrollTop: 0,
      hydrated: true,
      dirty: false,
      persistenceError: null,
      lastPersistedAt: null,
      recentlyClosedTabs: [],
      databaseStatus: 'idle',
      databaseError: null,
      hydrationEpoch: 0,
      restoreStatus: 'restored',
      restoreMessage: null,
    })
    synchronizer = new EditorWorkspaceSynchronizer(dependencies)
  })

  afterEach(() => {
    synchronizer.stop()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('migrates local open and closed tabs into an empty SQLite workspace', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(workspace({ legacyStorageVersion: 0 }))
    useEditorStore.setState({
      tabs: [tab(), tab({ id: 'tab-b', filename: 'b.js', language: 'javascript' })],
      activeTabId: 'tab-b',
      recentlyClosedTabs: [tab({ id: 'tab-closed', content: 'recoverable' })],
      lastPersistedAt: Date.parse('2026-07-14T00:00:02.000Z'),
    })

    await synchronizer.start()

    expect(dependencies.migrateLegacy).toHaveBeenCalledWith(
      expect.objectContaining({
        storageVersion: EDITOR_STORAGE_VERSION,
        activeTabId: 'tab-b',
        tabs: expect.arrayContaining([
          expect.objectContaining({ id: 'tab-a', status: 'open' }),
          expect.objectContaining({ id: 'tab-b', status: 'open' }),
          expect.objectContaining({ id: 'tab-closed', status: 'closed' }),
        ]),
      }),
    )
    expect(dependencies.save).not.toHaveBeenCalled()
    expect(dependencies.close).not.toHaveBeenCalled()
    expect(dependencies.setActive).toHaveBeenCalledWith('tab-b', 'default')
    expect(useEditorStore.getState().databaseStatus).toBe('synced')
  })

  it('keeps a newer SQLite viewport over an older window recovery', async () => {
    const recoveryKey = `${EDITOR_VIEW_RECOVERY_KEY_PREFIX}previous-window`
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 1,
        entries: {
          'tab-a': {
            cursorPosition: { lineNumber: 2, column: 2 },
            scrollTop: 120,
            updatedAt: Date.parse('2026-07-14T00:00:01.000Z'),
          },
        },
      }),
    )
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [
          record({
            cursorPosition: { lineNumber: 20, column: 5 },
            scrollTop: 900,
            viewUpdatedAt: '2026-07-14T00:00:05.000Z',
          }),
        ],
        activeTabId: 'tab-a',
      }),
    )
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      recentlyClosedTabs: [],
      lastPersistedAt: null,
      dirty: false,
    })

    await synchronizer.start()

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      id: 'tab-a',
      cursorPosition: { lineNumber: 20, column: 5 },
      scrollTop: 900,
      viewUpdatedAt: '2026-07-14T00:00:05.000Z',
    })
    expect(dependencies.updateViewState).not.toHaveBeenCalled()
    expect(storageValues.has(recoveryKey)).toBe(false)
  })

  it('replays a newer view recovery onto SQLite-only exercise topology', async () => {
    const exerciseId = 'exercise-db-only'
    const recoveryKey = `${EDITOR_VIEW_RECOVERY_KEY_PREFIX}crashed-window`
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 1,
        entries: {
          [exerciseId]: {
            cursorPosition: { lineNumber: 12, column: 7 },
            scrollTop: 720,
            updatedAt: Date.parse('2026-07-14T00:00:05.000Z'),
          },
        },
      }),
    )
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [
          record({
            id: exerciseId,
            filename: 'practice.py',
            content: '',
            kind: 'exercise',
            problemId: 'db-only',
            cursorPosition: { lineNumber: 1, column: 1 },
            scrollTop: 0,
            viewUpdatedAt: '2026-07-14T00:00:01.000Z',
          }),
        ],
        activeTabId: exerciseId,
      }),
    )
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      recentlyClosedTabs: [],
      lastPersistedAt: null,
      dirty: false,
    })

    await synchronizer.start()

    expect(dependencies.updateViewState).toHaveBeenCalledWith(
      expect.objectContaining({
        id: exerciseId,
        cursorPosition: { lineNumber: 12, column: 7 },
        scrollTop: 720,
      }),
    )
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      id: exerciseId,
      kind: 'exercise',
      content: '',
      cursorPosition: { lineNumber: 12, column: 7 },
      scrollTop: 720,
    })
    expect(storageValues.has(recoveryKey)).toBe(false)
  })

  it('upgrades marker v2 in place without sending stale local topology', async () => {
    const remote = workspace({
      tabs: [record({ content: 'durable database content' })],
      activeTabId: 'tab-a',
      generation: 4,
      legacyStorageVersion: 2,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(remote)
    vi.mocked(dependencies.migrateLegacy).mockResolvedValueOnce({
      status: 'migrated',
      recoveredTabIds: [],
      recoveredTabMappings: {},
      workspace: { ...remote, generation: 5, legacyStorageVersion: EDITOR_STORAGE_VERSION },
    })
    useEditorStore.setState({
      tabs: [tab({ content: 'stale local content' })],
      activeTabId: 'tab-a',
      lastPersistedAt: Date.parse('2026-07-13T00:00:00.000Z'),
    })

    await synchronizer.start()

    expect(dependencies.migrateLegacy).toHaveBeenCalledWith(
      expect.objectContaining({
        storageVersion: EDITOR_STORAGE_VERSION,
        activeTabId: null,
        tabs: [],
      }),
    )
    expect(useEditorStore.getState().tabs[0].content).toBe('durable database content')
  })

  it('replays an explicit crash-recovery entry while upgrading an existing workspace marker', async () => {
    const remote = workspace({
      tabs: [record({ content: 'older durable content', revision: 3 })],
      activeTabId: 'tab-a',
      generation: 4,
      legacyStorageVersion: 3,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(remote)
    vi.mocked(dependencies.migrateLegacy).mockResolvedValueOnce({
      status: 'migrated',
      recoveredTabIds: [],
      recoveredTabMappings: {},
      workspace: { ...remote, generation: 5, legacyStorageVersion: EDITOR_STORAGE_VERSION },
    })
    useEditorStore.setState({
      tabs: [
        tab({
          content: 'newer recovered content',
          revision: 3,
          recoverySourceKeys: [`${EDITOR_RECOVERY_KEY_PREFIX}upgrade-window`],
        }),
      ],
      activeTabId: 'tab-a',
      lastPersistedAt: Date.parse('2026-07-13T00:00:00.000Z'),
      restoreStatus: 'recovered',
    })

    await synchronizer.start()

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tab-a',
        content: 'newer recovered content',
        baseRevision: 3,
      }),
    )
    expect(useEditorStore.getState().tabs[0].content).toBe('newer recovered content')
    expect(useEditorStore.getState().databaseStatus).toBe('synced')
  })

  it('replays an upgrade snapshot only when SQLite remains at its recorded revision', async () => {
    const remote = workspace({
      tabs: [record({ content: 'recorded base', revision: 3 })],
      activeTabId: 'tab-a',
      generation: 4,
      legacyStorageVersion: 3,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(remote)
    vi.mocked(dependencies.migrateLegacy).mockResolvedValueOnce({
      status: 'migrated',
      recoveredTabIds: [],
      recoveredTabMappings: {},
      workspace: { ...remote, generation: 5, legacyStorageVersion: EDITOR_STORAGE_VERSION },
    })
    useEditorStore.setState({
      tabs: [tab({ content: 'snapshot edit without a recovery log', revision: 3 })],
      lastPersistedAt: Date.parse('2026-07-13T00:00:00.000Z'),
    })

    await synchronizer.start()

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tab-a',
        content: 'snapshot edit without a recovery log',
        baseRevision: 3,
      }),
    )
    expect(useEditorStore.getState().tabs[0].content).toBe('snapshot edit without a recovery log')
  })

  it('keeps an upgrade recovery conflict when SQLite advanced past its base revision', async () => {
    const remote = workspace({
      tabs: [record({ content: 'newer database content', revision: 4 })],
      activeTabId: 'tab-a',
      generation: 4,
      legacyStorageVersion: 3,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(remote)
    vi.mocked(dependencies.migrateLegacy).mockResolvedValueOnce({
      status: 'migrated',
      recoveredTabIds: [],
      recoveredTabMappings: {},
      workspace: { ...remote, generation: 5, legacyStorageVersion: EDITOR_STORAGE_VERSION },
    })
    useEditorStore.setState({
      tabs: [
        tab({
          content: 'valuable recovered content',
          revision: 3,
          recoverySourceKeys: [`${EDITOR_RECOVERY_KEY_PREFIX}upgrade-conflict`],
        }),
      ],
      lastPersistedAt: Date.parse('2026-07-13T00:00:00.000Z'),
      restoreStatus: 'recovered',
    })

    await synchronizer.start()

    expect(dependencies.save).not.toHaveBeenCalled()
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: 'valuable recovered content',
      syncConflict: true,
    })
    expect(useEditorStore.getState().databaseStatus).toBe('conflict')
  })

  it('hydrates from SQLite when no local snapshot exists', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record(), record({ id: 'tab-b', filename: 'b.py', position: 1 })],
        activeTabId: 'tab-b',
      }),
    )

    await synchronizer.start()

    expect(useEditorStore.getState().tabs.map((item) => item.id)).toEqual(['tab-a', 'tab-b'])
    expect(useEditorStore.getState().activeTabId).toBe('tab-b')
    expect(dependencies.save).not.toHaveBeenCalled()
  })

  it('keeps a corrupt local snapshot degraded when SQLite can only restore known tabs', async () => {
    useEditorStore.setState({
      restoreStatus: 'degraded',
      restoreMessage: '工作区快照已损坏，原始数据已备份；恢复失败，已打开默认工作区',
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record({ content: 'restored from SQLite' })], activeTabId: 'tab-a' }),
    )

    await synchronizer.start()

    expect(useEditorStore.getState()).toMatchObject({
      restoreStatus: 'degraded',
      restoreMessage: expect.stringContaining('已从 SQLite 加载可用工作区数据'),
    })
    expect(useEditorStore.getState().restoreMessage).toContain(
      '无法确认损坏记录中是否还有未同步内容',
    )
    expect(useEditorStore.getState().restoreMessage).toContain('原始数据已备份')
    expect(useEditorStore.getState().restoreMessage).not.toContain('已打开默认工作区')
    expect(useEditorStore.getState().restoreMessage).not.toContain('恢复完整工作区')
    expect(useEditorStore.getState().tabs[0].content).toBe('restored from SQLite')
  })

  it('saves an edit made during initial load when its known revision still matches SQLite', async () => {
    const pendingLoad = deferred<EditorWorkspaceRecord>()
    vi.mocked(dependencies.load).mockReturnValueOnce(pendingLoad.promise)
    useEditorStore.setState({
      tabs: [tab({ content: 'shared revision one', revision: 1 })],
      lastPersistedAt: 1,
    })

    const started = synchronizer.start()
    useEditorStore.getState().updateContent('tab-a', 'edited during deferred load')
    pendingLoad.resolve(
      workspace({
        tabs: [record({ content: 'shared revision one', revision: 1 })],
        activeTabId: 'tab-a',
      }),
    )
    await started

    expect(useEditorStore.getState().tabs[0].content).toBe('edited during deferred load')
    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tab-a',
        kind: 'file',
        content: 'edited during deferred load',
        baseRevision: 1,
      }),
    )
  })

  it('keeps a pending-load content edit as a conflict when SQLite already advanced', async () => {
    const pendingLoad = deferred<EditorWorkspaceRecord>()
    vi.mocked(dependencies.load).mockReturnValueOnce(pendingLoad.promise)
    useEditorStore.setState({
      tabs: [tab({ content: 'shared revision one', revision: 1 })],
      lastPersistedAt: 1,
    })

    const started = synchronizer.start()
    useEditorStore.getState().updateContent('tab-a', 'local edit during deferred load')
    pendingLoad.resolve(
      workspace({
        tabs: [record({ content: 'remote revision two', revision: 2 })],
        activeTabId: 'tab-a',
        generation: 2,
      }),
    )
    await started

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: 'local edit during deferred load',
      revision: 1,
      syncConflict: true,
    })
    expect(synchronizer.getConflict()).toMatchObject({ tabId: 'tab-a', count: 1 })
    expect(dependencies.save).not.toHaveBeenCalled()
  })

  it('accepts newer SQLite content when only the view changed during initial load', async () => {
    const pendingLoad = deferred<EditorWorkspaceRecord>()
    vi.mocked(dependencies.load).mockReturnValueOnce(pendingLoad.promise)
    useEditorStore.setState({
      tabs: [
        tab({
          content: 'stale local revision one',
          revision: 1,
          viewUpdatedAt: '2026-07-14T00:00:00.000Z',
        }),
      ],
      lastPersistedAt: 1,
    })
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'))

    const started = synchronizer.start()
    useEditorStore.getState().updateCursorPosition('tab-a', 8, 3)
    useEditorStore.getState().updateScrollTop('tab-a', 480)
    pendingLoad.resolve(
      workspace({
        tabs: [
          record({
            content: 'newer remote revision two',
            revision: 2,
            cursorPosition: { lineNumber: 20, column: 5 },
            scrollTop: 900,
            viewUpdatedAt: '2026-07-14T00:00:02.000Z',
          }),
        ],
        activeTabId: 'tab-a',
        generation: 2,
      }),
    )
    await started

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: 'newer remote revision two',
      revision: 2,
      cursorPosition: { lineNumber: 8, column: 3 },
      scrollTop: 480,
    })
    expect(dependencies.save).not.toHaveBeenCalled()
    expect(dependencies.updateViewState).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tab-a',
        cursorPosition: { lineNumber: 8, column: 3 },
        scrollTop: 480,
      }),
    )
    expect(synchronizer.getConflict()).toBeNull()
  })

  it('does not replay stale topology over a newer SQLite revision during initial load', async () => {
    const pendingLoad = deferred<EditorWorkspaceRecord>()
    vi.mocked(dependencies.load).mockReturnValueOnce(pendingLoad.promise)
    useEditorStore.setState({
      tabs: [tab({ content: 'shared revision one', revision: 1 })],
      lastPersistedAt: 1,
    })

    const started = synchronizer.start()
    useEditorStore.getState().closeTab('tab-a')
    pendingLoad.resolve(
      workspace({
        tabs: [record({ content: 'remote revision two', revision: 2 })],
        activeTabId: 'tab-a',
        generation: 2,
      }),
    )
    await started

    expect(useEditorStore.getState().tabs).toHaveLength(0)
    expect(useEditorStore.getState().recentlyClosedTabs[0]).toMatchObject({
      id: 'tab-a',
      content: 'shared revision one',
      revision: 1,
      syncConflict: true,
    })
    expect(synchronizer.getConflict()).toMatchObject({ tabId: 'tab-a', count: 1 })
    expect(dependencies.save).not.toHaveBeenCalled()
    expect(dependencies.close).not.toHaveBeenCalled()
  })

  it('keeps a recovery conflict registered when it is edited during the initial SQLite load', async () => {
    const pendingLoad = deferred<EditorWorkspaceRecord>()
    const recoveredId = 'recovered-tab-a-pending-load'
    const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}pending-load`
    vi.mocked(dependencies.load).mockReturnValueOnce(pendingLoad.promise)
    useEditorStore.setState({
      tabs: [
        tab({
          id: recoveredId,
          filename: 'a.recovered.py',
          content: 'recovered before load',
          syncConflict: true,
          localOnly: true,
          recoverySourceKeys: [recoveryKey],
          recoveryOriginalId: 'tab-a',
        }),
      ],
      activeTabId: recoveredId,
      lastPersistedAt: 1,
      dirty: true,
    })

    const started = synchronizer.start()
    useEditorStore.getState().updateContent(recoveredId, 'edited while SQLite was loading')
    pendingLoad.resolve(workspace({ generation: 1 }))
    await started

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: recoveredId,
        content: 'edited while SQLite was loading',
      }),
    )
    expect(synchronizer.getConflict()).toMatchObject({ tabId: recoveredId, count: 1 })
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      id: recoveredId,
      content: 'edited while SQLite was loading',
      syncConflict: true,
      recoverySourceKeys: [recoveryKey],
    })
    expect(useEditorStore.getState().databaseStatus).toBe('conflict')
  })

  it('debounces edits and saves the latest content from the loaded revision', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'first')
    useEditorStore.getState().updateContent('tab-a', 'latest')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(dependencies.save).toHaveBeenCalledTimes(1))

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-a', content: 'latest', baseRevision: 1 }),
    )
    expect(useEditorStore.getState().tabs[0].content).toBe('latest')
    expect(useEditorStore.getState().tabs[0].revision).toBe(2)
  })

  it('flushes pending content immediately for the window close handshake', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'close-safe content')

    await expect(synchronizer.flush()).resolves.toBe(true)
    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-a', content: 'close-safe content', baseRevision: 1 }),
    )
  })

  it('still flushes SQLite when local recovery storage is unavailable', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    await synchronizer.start()
    vi.mocked(window.localStorage.setItem).mockImplementation(() => {
      throw new Error('quota unavailable')
    })

    useEditorStore.getState().updateContent('tab-a', 'database can still save this')

    await expect(synchronizer.flush()).resolves.toBe(true)
    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'database can still save this' }),
    )
  })

  it('keeps a newer recovery entry when an older SQLite save finishes later', async () => {
    const pendingSave = deferred<Awaited<ReturnType<EditorWorkspaceSyncDependencies['save']>>>()
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockReturnValueOnce(pendingSave.promise)
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'save request A')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(dependencies.save).toHaveBeenCalledTimes(1))

    useEditorStore.getState().updateContent('tab-a', 'newer edit B')
    pendingSave.resolve({
      status: 'saved',
      applied: true,
      generation: 1,
      tab: record({ content: 'save request A', revision: 2 }),
    })
    await vi.waitFor(() => expect(useEditorStore.getState().tabs[0].revision).toBe(2))

    const recoveryEntries = [...storageValues.entries()].filter(([key]) =>
      key.startsWith(EDITOR_RECOVERY_KEY_PREFIX),
    )
    expect(recoveryEntries.some(([, value]) => value.includes('newer edit B'))).toBe(true)

    vi.clearAllTimers()
    useEditorStore.setState({
      tabs: [tab()],
      activeTabId: 'tab-a',
      hydrated: false,
      dirty: false,
      lastPersistedAt: null,
      recentlyClosedTabs: [],
    })
    useEditorStore.getState().restoreTabs()

    expect(useEditorStore.getState().tabs[0].content).toBe('newer edit B')
  })

  it('clears a matching view recovery only after SQLite accepts that viewport', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    await synchronizer.start()

    useEditorStore.getState().updateCursorPosition('tab-a', 6, 4)
    useEditorStore.getState().updateScrollTop('tab-a', 360)
    expect(
      [...storageValues.keys()].some((key) => key.startsWith(EDITOR_VIEW_RECOVERY_KEY_PREFIX)),
    ).toBe(true)

    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(dependencies.updateViewState).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(
        [...storageValues.keys()].some((key) => key.startsWith(EDITOR_VIEW_RECOVERY_KEY_PREFIX)),
      ).toBe(false),
    )
    expect(dependencies.updateViewState).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tab-a',
        cursorPosition: { lineNumber: 6, column: 4 },
        scrollTop: 360,
      }),
    )
  })

  it('keeps and restores a newer viewport when an older SQLite view save finishes later', async () => {
    const pendingView =
      deferred<Awaited<ReturnType<EditorWorkspaceSyncDependencies['updateViewState']>>>()
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.updateViewState).mockReturnValueOnce(pendingView.promise)
    await synchronizer.start()

    useEditorStore.getState().updateCursorPosition('tab-a', 4, 2)
    useEditorStore.getState().updateScrollTop('tab-a', 180)
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(dependencies.updateViewState).toHaveBeenCalledTimes(1))

    useEditorStore.getState().updateCursorPosition('tab-a', 11, 7)
    useEditorStore.getState().updateScrollTop('tab-a', 720)
    pendingView.resolve({
      status: 'saved',
      applied: true,
      generation: 1,
      viewState: {
        workspaceId: 'default',
        id: 'tab-a',
        cursorPosition: { lineNumber: 4, column: 2 },
        scrollTop: 180,
        status: 'open',
        revision: 1,
        viewUpdatedAt: '2026-07-14T00:00:02.000Z',
      },
    })
    await vi.waitFor(() =>
      expect(useEditorStore.getState().tabs[0].viewUpdatedAt).toBe('2026-07-14T00:00:02.000Z'),
    )

    const recoveryEntry = [...storageValues.entries()]
      .filter(([key]) => key.startsWith(EDITOR_VIEW_RECOVERY_KEY_PREFIX))
      .map(([, value]) => JSON.parse(value) as { entries: Record<string, EditorTab> })
      .find((snapshot) => snapshot.entries['tab-a'])?.entries['tab-a']
    expect(recoveryEntry).toMatchObject({
      cursorPosition: { lineNumber: 11, column: 7 },
      scrollTop: 720,
    })

    vi.clearAllTimers()
    useEditorStore.setState({
      tabs: [tab()],
      activeTabId: 'tab-a',
      hydrated: false,
      dirty: false,
      lastPersistedAt: null,
      recentlyClosedTabs: [],
    })
    useEditorStore.getState().restoreTabs()

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      cursorPosition: { lineNumber: 11, column: 7 },
      scrollTop: 720,
    })
  })

  it('keeps local code and marks a visible degraded state when SQLite rejects a save', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockRejectedValue(new Error('database unavailable'))
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'valuable local edit')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('degraded'))

    expect(useEditorStore.getState().tabs[0].content).toBe('valuable local edit')
    expect(useEditorStore.getState().databaseError).toContain('database unavailable')
  })

  it('preserves local content and marks a conflict for stale revisions', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockResolvedValueOnce({
      status: 'conflict',
      generation: 2,
      current: record({ content: 'other window', revision: 2 }),
    })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'my unsaved code')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    expect(useEditorStore.getState().tabs[0].content).toBe('my unsaved code')
    expect(useEditorStore.getState().databaseError).toContain('本地内容已保留')
  })

  it('adopts the database version only after an explicit conflict choice', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockResolvedValueOnce({
      status: 'conflict',
      generation: 1,
      current: record({ content: 'database version', revision: 2 }),
    })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'local version')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    await synchronizer.resolveConflict('use-database', 'tab-a')

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      id: 'tab-a',
      content: 'database version',
      revision: 2,
    })
    expect(useEditorStore.getState().databaseStatus).toBe('synced')
  })

  it('writes the preserved local version from the current database revision', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockResolvedValueOnce({
      status: 'conflict',
      generation: 1,
      current: record({ content: 'database version', revision: 2 }),
    })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'keep this local version')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    expect(await synchronizer.resolveConflict('keep-local', 'tab-a')).toBe(true)

    expect(dependencies.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'tab-a',
        content: 'keep this local version',
        baseRevision: 2,
      }),
    )
    expect(useEditorStore.getState().tabs[0].content).toBe('keep this local version')
    expect(useEditorStore.getState().databaseStatus).toBe('synced')
  })

  it('keeps a local copy before adopting the database conflict version', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockResolvedValueOnce({
      status: 'conflict',
      generation: 1,
      current: record({ content: 'database version', revision: 2 }),
    })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'valuable local version')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    expect(await synchronizer.resolveConflict('save-copy', 'tab-a')).toBe(true)

    expect(useEditorStore.getState().tabs.find((item) => item.id === 'tab-a')?.content).toBe(
      'database version',
    )
    const copy = useEditorStore
      .getState()
      .tabs.find((item) => item.id.startsWith('recovered-tab-a-'))
    expect(copy).toMatchObject({ content: 'valuable local version', kind: 'file' })
    expect(copy?.filename).toContain('.local-copy.')
    expect(useEditorStore.getState().activeTabId).toBe(copy?.id)
  })

  it('does not let a remote event overwrite local content after a save conflict', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockResolvedValueOnce({
      status: 'conflict',
      generation: 1,
      current: record({ content: 'database conflict content', revision: 2 }),
    })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'local content after conflict')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 1,
      tab: record({ content: 'later remote content', revision: 3 }),
    })

    expect(useEditorStore.getState().tabs[0].content).toBe('local content after conflict')
    expect(useEditorStore.getState().databaseStatus).toBe('conflict')
  })

  it('does not let a remote event overwrite local content after a save rejection', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockRejectedValue(new Error('database unavailable'))
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'local content after rejection')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('degraded'))

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 1,
      tab: record({ content: 'later remote content', revision: 2 }),
    })

    expect(useEditorStore.getState().tabs[0].content).toBe('local content after rejection')
    expect(useEditorStore.getState().databaseStatus).toBe('conflict')
  })

  it('retries a lost save response with the same mutation id', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save)
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        status: 'saved',
        applied: false,
        generation: 1,
        tab: record({ content: 'saved exactly once', revision: 2 }),
      })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'saved exactly once')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(dependencies.save).toHaveBeenCalledTimes(2))

    const [firstInput] = vi.mocked(dependencies.save).mock.calls[0]
    const [retryInput] = vi.mocked(dependencies.save).mock.calls[1]
    expect(retryInput).toEqual(firstInput)
    expect(retryInput.mutationId).toBe(firstInput.mutationId)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('synced'))
  })

  it('keeps mutation ids bounded for valid 200-character tab ids', async () => {
    const longId = `tab-${'x'.repeat(196)}`
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record({ id: longId })], activeTabId: longId }),
    )
    await synchronizer.start()

    useEditorStore.getState().updateContent(longId, 'long id still persists')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() =>
      expect(dependencies.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: longId, content: 'long id still persists' }),
      ),
    )

    const input = vi
      .mocked(dependencies.save)
      .mock.calls.map(([value]) => value)
      .find((value) => value.id === longId && value.content === 'long id still persists')
    expect(input?.mutationId.length).toBeLessThanOrEqual(200)
    expect(input?.mutationId).not.toContain(longId)
  })

  it('saves before closing and uses the returned revision for the close mutation', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'edited before close')
    useEditorStore.getState().closeTab('tab-a')
    await vi.waitFor(() => expect(dependencies.close).toHaveBeenCalledTimes(1))

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-a', content: 'edited before close', baseRevision: 1 }),
    )
    expect(dependencies.close).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-a', baseRevision: 2 }),
    )
  })

  it('keeps a requested tab open until the durable close succeeds', async () => {
    const pendingClose = deferred<Awaited<ReturnType<EditorWorkspaceSyncDependencies['close']>>>()
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.close).mockReturnValueOnce(pendingClose.promise)
    await synchronizer.start()

    const closing = synchronizer.requestClose('tab-a')
    await vi.waitFor(() => expect(dependencies.close).toHaveBeenCalledTimes(1))
    expect(useEditorStore.getState().tabs.map((item) => item.id)).toContain('tab-a')

    pendingClose.resolve({
      status: 'saved',
      applied: true,
      generation: 1,
      tab: record({ status: 'closed', revision: 2 }),
    })
    expect(await closing).toBe(true)

    expect(useEditorStore.getState().tabs.map((item) => item.id)).not.toContain('tab-a')
    expect(useEditorStore.getState().recentlyClosedTabs.map((item) => item.id)).toContain('tab-a')
  })

  it('never closes a tab when the preceding content save conflicts', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.save).mockResolvedValueOnce({
      status: 'conflict',
      generation: 2,
      current: record({ revision: 2, content: 'other window' }),
    })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'local edit before close')
    useEditorStore.getState().closeTab('tab-a')
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    expect(dependencies.close).not.toHaveBeenCalled()
    expect(useEditorStore.getState().tabs.map((item) => item.id)).toContain('tab-a')
    expect(useEditorStore.getState().recentlyClosedTabs.map((item) => item.id)).not.toContain(
      'tab-a',
    )
  })

  it('restores an optimistically closed tab when the close CAS conflicts', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.close).mockResolvedValueOnce({
      status: 'conflict',
      generation: 1,
      current: record({ content: 'other window', revision: 2 }),
    })
    await synchronizer.start()

    useEditorStore.getState().closeTab('tab-a')
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    expect(dependencies.save).not.toHaveBeenCalled()
    expect(dependencies.close).toHaveBeenCalledTimes(1)
    expect(useEditorStore.getState().tabs.map((item) => item.id)).toContain('tab-a')
    expect(useEditorStore.getState().recentlyClosedTabs.map((item) => item.id)).not.toContain(
      'tab-a',
    )
  })

  it('restores an optimistically closed tab when the close request is rejected', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.close).mockRejectedValue(new Error('close unavailable'))
    await synchronizer.start()

    useEditorStore.getState().closeTab('tab-a')
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('degraded'))

    expect(dependencies.close).toHaveBeenCalledTimes(2)
    expect(useEditorStore.getState().tabs.map((item) => item.id)).toContain('tab-a')
    expect(useEditorStore.getState().recentlyClosedTabs.map((item) => item.id)).not.toContain(
      'tab-a',
    )
  })

  it('allows an explicitly degraded local-only close without pretending SQLite changed', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    vi.mocked(dependencies.close).mockRejectedValue(new Error('close unavailable'))
    await synchronizer.start()

    expect(await synchronizer.requestClose('tab-a')).toBe(false)
    expect(useEditorStore.getState().tabs.map((item) => item.id)).toContain('tab-a')

    await synchronizer.closeLocally('tab-a')

    expect(useEditorStore.getState().tabs.map((item) => item.id)).not.toContain('tab-a')
    expect(useEditorStore.getState().recentlyClosedTabs.map((item) => item.id)).toContain('tab-a')
    expect(useEditorStore.getState()).toMatchObject({
      databaseStatus: 'degraded',
      databaseError: expect.stringContaining('仅在本地关闭'),
    })
  })

  it('reports pending persistence per tab instead of using another tab dirty flag', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record(), record({ id: 'tab-b', filename: 'b.py', position: 1 })],
        activeTabId: 'tab-a',
      }),
    )
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'pending local edit')

    expect(synchronizer.getTabPersistenceState('tab-a').pending).toBe(true)
    expect(synchronizer.getTabPersistenceState('tab-b')).toMatchObject({
      pending: false,
      conflict: false,
      degraded: false,
    })
  })

  it('keeps a content conflict visible after unrelated view and active-tab saves succeed', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record(), record({ id: 'tab-b', filename: 'b.py', position: 1 })],
        activeTabId: 'tab-a',
      }),
    )
    useEditorStore.setState({
      tabs: [tab(), tab({ id: 'tab-b', filename: 'b.py' })],
      activeTabId: 'tab-a',
    })
    vi.mocked(dependencies.save).mockResolvedValueOnce({
      status: 'conflict',
      generation: 1,
      current: record({ content: 'other window', revision: 2 }),
    })
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'local conflict')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))

    useEditorStore.getState().updateCursorPosition('tab-b', 4, 2)
    useEditorStore.getState().setActiveTab('tab-b')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(dependencies.updateViewState).toHaveBeenCalledTimes(1))

    expect(dependencies.setActive).toHaveBeenCalledWith('tab-b', 'default')
    expect(useEditorStore.getState().databaseStatus).toBe('conflict')
    expect(useEditorStore.getState().tabs.find((item) => item.id === 'tab-a')?.content).toBe(
      'local conflict',
    )
  })

  it('keeps a content failure visible after unrelated view and active-tab saves succeed', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record(), record({ id: 'tab-b', filename: 'b.py', position: 1 })],
        activeTabId: 'tab-a',
      }),
    )
    useEditorStore.setState({
      tabs: [tab(), tab({ id: 'tab-b', filename: 'b.py' })],
      activeTabId: 'tab-a',
    })
    vi.mocked(dependencies.save).mockRejectedValue(new Error('database unavailable'))
    await synchronizer.start()

    useEditorStore.getState().updateContent('tab-a', 'local degraded content')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('degraded'))

    useEditorStore.getState().updateCursorPosition('tab-b', 4, 2)
    useEditorStore.getState().setActiveTab('tab-b')
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(dependencies.updateViewState).toHaveBeenCalledTimes(1))

    expect(dependencies.setActive).toHaveBeenCalledWith('tab-b', 'default')
    expect(useEditorStore.getState().databaseStatus).toBe('degraded')
    expect(useEditorStore.getState().databaseError).toContain('database unavailable')
  })

  it('keeps divergent startup versions as explicit conflicts instead of trusting timestamps', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [
          record({
            id: 'tab-a',
            content: 'remote version A',
            revision: 2,
            updatedAt: '2026-07-14T00:00:05Z',
          }),
          record({
            id: 'tab-b',
            content: 'remote version B',
            revision: 2,
            updatedAt: '2026-07-14T00:00:01Z',
          }),
        ],
        activeTabId: 'tab-a',
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({
          id: 'tab-a',
          content: 'local version A',
          revision: 1,
          updatedAt: '2026-07-14T00:00:02Z',
        }),
        tab({
          id: 'tab-b',
          content: 'local version B',
          revision: 1,
          updatedAt: '2026-07-14T00:00:06Z',
        }),
      ],
      lastPersistedAt: 0,
    })

    await synchronizer.start()

    expect(useEditorStore.getState().tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tab-a', content: 'local version A', syncConflict: true }),
        expect.objectContaining({ id: 'tab-b', content: 'local version B', syncConflict: true }),
      ]),
    )
    expect(useEditorStore.getState().databaseStatus).toBe('conflict')
    expect(synchronizer.getConflict()?.count).toBe(2)
    expect(dependencies.save).not.toHaveBeenCalled()
  })

  it('retains divergent recovery provenance through SQLite save and generation reload until resolution', async () => {
    const recoveredId = 'recovered-tab-a-window-a'
    const recoveredContent = 'window A unsaved recovery'
    const primaryContent = 'window B unsaved recovery'
    const windowAKey = `${EDITOR_RECOVERY_KEY_PREFIX}window-a`
    const windowBKey = `${EDITOR_RECOVERY_KEY_PREFIX}window-b`
    const pendingRecoveredSave =
      deferred<Awaited<ReturnType<EditorWorkspaceSyncDependencies['save']>>>()
    storageValues.set(
      windowAKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: recoveredContent,
              kind: 'file',
              revision: 1,
            },
            updatedAt: 10,
          },
        },
      }),
    )
    storageValues.set(
      windowBKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: primaryContent,
              kind: 'file',
              revision: 1,
            },
            updatedAt: 20,
          },
        },
      }),
    )
    vi.mocked(dependencies.load)
      .mockResolvedValueOnce(
        workspace({
          tabs: [record({ content: 'database base', revision: 1 })],
          activeTabId: 'tab-a',
          generation: 1,
        }),
      )
      .mockResolvedValueOnce(
        workspace({
          tabs: [
            record({ content: primaryContent, revision: 2, position: 0 }),
            record({
              id: recoveredId,
              filename: 'a.recovered.py',
              content: recoveredContent,
              revision: 1,
              position: 1,
            }),
          ],
          activeTabId: 'tab-a',
          generation: 5,
        }),
      )
    vi.mocked(dependencies.save).mockImplementation((input) => {
      if (input.id === recoveredId) return pendingRecoveredSave.promise
      return Promise.resolve({
        status: 'conflict' as const,
        generation: 2,
        current: record({
          id: input.id,
          filename: input.filename,
          language: input.language,
          content: input.content,
          kind: input.kind ?? 'file',
          problemId: input.problemId ?? null,
          position: input.position,
          revision: input.baseRevision + 1,
        }),
      })
    })
    useEditorStore.setState({
      tabs: [
        tab({
          content: primaryContent,
          revision: 1,
          recoverySourceKeys: [windowBKey],
        }),
        tab({
          id: recoveredId,
          filename: 'a.recovered.py',
          content: recoveredContent,
          revision: undefined,
          syncConflict: true,
          localOnly: true,
          recoverySourceKeys: [windowAKey],
          recoveryOriginalId: 'tab-a',
        }),
      ],
      activeTabId: 'tab-a',
      lastPersistedAt: 20,
      dirty: true,
    })

    const started = synchronizer.start()
    await vi.waitFor(() =>
      expect(dependencies.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: recoveredId,
          filename: 'a.recovered.py',
          content: recoveredContent,
        }),
      ),
    )
    expect(storageValues.has(windowAKey)).toBe(true)
    expect(useEditorStore.getState().tabs.find((item) => item.id === recoveredId)).toMatchObject({
      syncConflict: true,
      recoverySourceKeys: [windowAKey],
      recoveryOriginalId: 'tab-a',
    })
    pendingRecoveredSave.resolve({
      status: 'saved',
      applied: true,
      generation: 3,
      tab: record({
        id: recoveredId,
        filename: 'a.recovered.py',
        content: recoveredContent,
        revision: 1,
        position: 1,
      }),
    })
    await started

    expect(synchronizer.getConflict()).toMatchObject({ tabId: recoveredId, count: 1 })
    expect(useEditorStore.getState().tabs.find((item) => item.id === 'tab-a')).not.toMatchObject({
      syncConflict: true,
    })
    expect(storageValues.has(windowBKey)).toBe(false)
    expect(useEditorStore.getState().tabs.find((item) => item.id === recoveredId)).toMatchObject({
      syncConflict: true,
      recoverySourceKeys: [windowAKey],
      recoveryOriginalId: 'tab-a',
    })
    expect(storageValues.has(windowAKey)).toBe(true)

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 5,
      tab: record({
        id: recoveredId,
        filename: 'a.recovered.py',
        content: recoveredContent,
        revision: 1,
        position: 1,
      }),
    })
    await vi.waitFor(() => expect(dependencies.load).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(useEditorStore.getState().tabs.find((item) => item.id === recoveredId)).toMatchObject({
        syncConflict: true,
        recoverySourceKeys: [windowAKey],
        recoveryOriginalId: 'tab-a',
      }),
    )
    expect(storageValues.has(windowAKey)).toBe(true)

    expect(await synchronizer.resolveConflict('keep-local', recoveredId)).toBe(true)

    expect(useEditorStore.getState().tabs.find((item) => item.id === recoveredId)).toMatchObject({
      syncConflict: undefined,
      recoverySourceKeys: undefined,
      recoveryOriginalId: undefined,
    })
    expect(storageValues.has(windowAKey)).toBe(false)
  })

  it('clears the original recovery snapshot when an unresolved branch is edited then resolved', async () => {
    const recoveredId = 'recovered-tab-a-edited-before-resolution'
    const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}edited-before-resolution`
    const recoveredContent = 'original recovered branch'
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: recoveredContent,
              kind: 'file',
              revision: 4,
            },
            updatedAt: 10,
          },
        },
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({
          id: recoveredId,
          filename: 'a.recovered.py',
          content: recoveredContent,
          revision: undefined,
          syncConflict: true,
          localOnly: true,
          recoverySourceKeys: [recoveryKey],
          recoveryOriginalId: 'tab-a',
        }),
      ],
      activeTabId: recoveredId,
      lastPersistedAt: 10,
      dirty: true,
    })

    await synchronizer.start()
    expect(storageValues.has(recoveryKey)).toBe(true)

    useEditorStore.getState().updateContent(recoveredId, 'edited recovered branch')
    expect(storageValues.has(recoveryKey)).toBe(true)
    expect(await synchronizer.resolveConflict('keep-local', recoveredId)).toBe(true)

    expect(storageValues.has(recoveryKey)).toBe(false)
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      id: recoveredId,
      content: 'edited recovered branch',
      syncConflict: undefined,
      recoverySourceKeys: undefined,
      recoveryOriginalId: undefined,
    })
    expect(dependencies.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: recoveredId,
        content: 'edited recovered branch',
        baseRevision: 1,
      }),
    )
  })

  it('clears a recovery source after SQLite dynamically turns it into a conflict', async () => {
    const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}dynamic-conflict`
    const recoveredContent = 'recovery revision one'
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: recoveredContent,
              kind: 'file',
              revision: 1,
            },
            updatedAt: 10,
          },
        },
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({
          content: recoveredContent,
          revision: 1,
          localOnly: true,
          recoverySourceKeys: [recoveryKey],
        }),
      ],
      lastPersistedAt: 10,
      dirty: true,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record({ content: 'database revision two', revision: 2 })],
        activeTabId: 'tab-a',
        generation: 2,
      }),
    )

    await synchronizer.start()

    expect(dependencies.save).not.toHaveBeenCalled()
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: recoveredContent,
      syncConflict: true,
      recoverySourceKeys: [recoveryKey],
    })
    useEditorStore.getState().updateContent('tab-a', 'edited after dynamic conflict')

    await expect(synchronizer.resolveConflict('keep-local', 'tab-a')).resolves.toBe(true)

    expect(window.localStorage.removeItem).toHaveBeenCalledWith(recoveryKey)
    expect(storageValues.has(recoveryKey)).toBe(false)
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: 'edited after dynamic conflict',
      syncConflict: undefined,
      recoverySourceKeys: undefined,
    })
    expect(dependencies.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'tab-a',
        content: 'edited after dynamic conflict',
        baseRevision: 2,
      }),
    )
  })

  it('keeps same-boot recovery provenance visibly degraded after a durable save', async () => {
    const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}${createBootScopedRecoverySessionId(
      'other-window',
      getRecoveryBootScope(),
    )}`
    const recoveredContent = 'same-boot recovered edit'
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: recoveredContent,
              kind: 'file',
              revision: 1,
            },
            updatedAt: 10,
          },
        },
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({
          content: recoveredContent,
          revision: 1,
          localOnly: true,
          recoverySourceKeys: [recoveryKey],
        }),
      ],
      lastPersistedAt: 10,
      dirty: true,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record({ content: 'database base', revision: 1 })] }),
    )

    await synchronizer.start()

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({ content: recoveredContent, baseRevision: 1 }),
    )
    expect(storageValues.has(recoveryKey)).toBe(true)
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: recoveredContent,
      localOnly: true,
      recoverySourceKeys: [recoveryKey],
    })
    expect(useEditorStore.getState().tabs[0].syncConflict).toBeUndefined()
    expect(synchronizer.getTabPersistenceState('tab-a')).toMatchObject({
      conflict: false,
      degraded: true,
      error: expect.stringContaining('本地恢复来源清理失败'),
    })
  })

  it('clears an old-boot recovery source when SQLite already has the exact content', async () => {
    const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}previous-boot-exact-match`
    const recoveredContent = 'already durable recovery'
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: recoveredContent,
              kind: 'file',
              revision: 2,
            },
            updatedAt: 10,
          },
        },
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({
          content: recoveredContent,
          revision: 2,
          localOnly: true,
          recoverySourceKeys: [recoveryKey],
        }),
      ],
      lastPersistedAt: 10,
      dirty: true,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record({ content: recoveredContent, revision: 2 })] }),
    )

    await synchronizer.start()

    expect(dependencies.save).not.toHaveBeenCalled()
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(recoveryKey)
    expect(storageValues.has(recoveryKey)).toBe(false)
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: recoveredContent,
      localOnly: undefined,
      recoverySourceKeys: undefined,
      recoveryOriginalId: undefined,
    })
    expect(useEditorStore.getState().databaseStatus).toBe('synced')
  })

  it('keeps recovery provenance visible when explicit conflict cleanup fails', async () => {
    const recoveredId = 'recovered-tab-a-cleanup-failure'
    const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}cleanup-failure`
    const recoveredContent = 'recovery that must remain visible'
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: recoveredContent,
              kind: 'file',
              revision: 4,
            },
            updatedAt: 10,
          },
        },
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({
          id: recoveredId,
          filename: 'a.recovered.py',
          content: recoveredContent,
          revision: undefined,
          syncConflict: true,
          localOnly: true,
          recoverySourceKeys: [recoveryKey],
          recoveryOriginalId: 'tab-a',
        }),
      ],
      activeTabId: recoveredId,
      lastPersistedAt: 10,
      dirty: true,
    })
    await synchronizer.start()
    vi.mocked(window.localStorage.removeItem).mockImplementation((key: string) => {
      if (key === recoveryKey) throw new Error('localStorage remove failed')
      storageValues.delete(key)
    })

    await expect(synchronizer.resolveConflict('keep-local', recoveredId)).resolves.toBe(false)

    expect(window.localStorage.removeItem).toHaveBeenCalledWith(recoveryKey)
    expect(storageValues.has(recoveryKey)).toBe(true)
    expect(synchronizer.getConflict()).toMatchObject({ tabId: recoveredId, count: 1 })
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      id: recoveredId,
      syncConflict: true,
      recoverySourceKeys: [recoveryKey],
      recoveryOriginalId: 'tab-a',
    })
    expect(synchronizer.getTabPersistenceState(recoveredId)).toMatchObject({
      conflict: true,
      degraded: true,
      error: expect.stringContaining('恢复来源清理失败'),
    })
  })

  it('uses the captured recovery source when adopting SQLite after the local tab was evicted', async () => {
    const recoveryKey = `${EDITOR_RECOVERY_KEY_PREFIX}evicted-before-resolution`
    const recoveredContent = 'recovery removed from the recent list'
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 3,
        entries: {
          'tab-a': {
            activeTabId: 'tab-a',
            tab: {
              id: 'tab-a',
              filename: 'a.py',
              language: 'python',
              content: recoveredContent,
              kind: 'file',
              revision: 1,
            },
            updatedAt: 10,
          },
        },
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({
          content: recoveredContent,
          revision: 1,
          syncConflict: true,
          localOnly: true,
          recoverySourceKeys: [recoveryKey],
        }),
      ],
      lastPersistedAt: 10,
      dirty: true,
    })
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record({ content: 'database version to adopt', revision: 2 })],
        activeTabId: 'tab-a',
        generation: 2,
      }),
    )
    await synchronizer.start()
    expect(synchronizer.getConflict()).toMatchObject({ tabId: 'tab-a', count: 1 })
    useEditorStore.setState({ tabs: [], recentlyClosedTabs: [], activeTabId: null })

    await expect(synchronizer.resolveConflict('use-database', 'tab-a')).resolves.toBe(true)

    expect(window.localStorage.removeItem).toHaveBeenCalledWith(recoveryKey)
    expect(storageValues.has(recoveryKey)).toBe(false)
    expect(synchronizer.getConflict()).toBeNull()
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      id: 'tab-a',
      content: 'database version to adopt',
      revision: 2,
    })
  })

  it('keeps a real Store recovery copy conflicted through save and hydration until resolution', async () => {
    const recoveryKey = EDITOR_RECOVERY_KEY
    storageValues.set(
      EDITOR_STORAGE_KEY,
      JSON.stringify({
        version: EDITOR_STORAGE_VERSION,
        activeTabId: 'durable',
        tabs: [
          {
            id: 'durable',
            filename: 'main.py',
            language: 'python',
            content: 'durable revision five',
            kind: 'file',
            revision: 5,
            updatedAt: '2026-07-14T00:00:05.000Z',
            viewUpdatedAt: '2026-07-14T00:00:05.000Z',
          },
        ],
        recentlyClosedTabs: [],
        updatedAt: 20,
      }),
    )
    storageValues.set(
      recoveryKey,
      JSON.stringify({
        version: 3,
        entries: {
          durable: {
            activeTabId: 'durable',
            tab: {
              id: 'durable',
              filename: 'main.py',
              language: 'python',
              content: 'older divergent recovery',
              kind: 'file',
              revision: 4,
            },
            updatedAt: 10,
          },
        },
      }),
    )

    useEditorStore.setState({ hydrated: false })
    useEditorStore.getState().restoreTabs()
    const recovered = useEditorStore
      .getState()
      .tabs.find((item) => item.filename === 'main.recovered.py')
    expect(recovered).toMatchObject({
      content: 'older divergent recovery',
      syncConflict: true,
      recoverySourceKeys: [recoveryKey],
      recoveryOriginalId: 'durable',
    })
    const recoveredId = recovered?.id ?? ''
    const durableRecord = record({
      id: 'durable',
      filename: 'main.py',
      content: 'durable revision five',
      revision: 5,
      updatedAt: '2026-07-14T00:00:05.000Z',
      viewUpdatedAt: '2026-07-14T00:00:05.000Z',
    })
    const recoveredRecord = record({
      id: recoveredId,
      filename: 'main.recovered.py',
      content: 'older divergent recovery',
      revision: 1,
      position: 1,
    })
    vi.mocked(dependencies.load)
      .mockResolvedValueOnce(
        workspace({ tabs: [durableRecord], activeTabId: 'durable', generation: 5 }),
      )
      .mockResolvedValueOnce(
        workspace({
          tabs: [durableRecord, recoveredRecord],
          activeTabId: 'durable',
          generation: 8,
        }),
      )
    vi.mocked(dependencies.save).mockImplementation(async (input) => ({
      status: 'saved',
      applied: true,
      generation: 6,
      tab: record({
        id: input.id,
        filename: input.filename,
        language: input.language,
        content: input.content,
        kind: input.kind ?? 'file',
        problemId: input.problemId ?? null,
        position: input.position,
        revision: input.baseRevision + 1,
      }),
    }))

    await synchronizer.start()

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: recoveredId,
        content: 'older divergent recovery',
        baseRevision: 0,
      }),
    )
    expect(storageValues.has(recoveryKey)).toBe(true)
    expect(useEditorStore.getState().tabs.find((item) => item.id === recoveredId)).toMatchObject({
      syncConflict: true,
      recoverySourceKeys: [recoveryKey],
      recoveryOriginalId: 'durable',
    })

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 8,
      tab: recoveredRecord,
    })
    await vi.waitFor(() => expect(dependencies.load).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(useEditorStore.getState().tabs.find((item) => item.id === recoveredId)).toMatchObject({
        syncConflict: true,
        recoverySourceKeys: [recoveryKey],
        recoveryOriginalId: 'durable',
      }),
    )
    expect(storageValues.has(recoveryKey)).toBe(true)

    expect(await synchronizer.resolveConflict('keep-local', recoveredId)).toBe(true)
    expect(storageValues.has(recoveryKey)).toBe(false)
    expect(useEditorStore.getState().tabs.find((item) => item.id === recoveredId)).toMatchObject({
      syncConflict: undefined,
      recoverySourceKeys: undefined,
      recoveryOriginalId: undefined,
    })
  })

  it('replays a crash-recovery edit when SQLite is still at its recorded base revision', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record({ content: 'database base', revision: 3 })] }),
    )
    useEditorStore.setState({
      tabs: [tab({ content: 'recovered local edit', revision: 3 })],
      lastPersistedAt: 0,
    })

    await synchronizer.start()

    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-a', content: 'recovered local edit', baseRevision: 3 }),
    )
    expect(useEditorStore.getState().databaseStatus).toBe('synced')
  })

  it('applies a remote saved event only when there is no pending local mutation', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a' }),
    )
    await synchronizer.start()

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 1,
      tab: record({ content: 'remote update', revision: 2 }),
    })

    expect(useEditorStore.getState().tabs[0].content).toBe('remote update')
    expect(useEditorStore.getState().tabs[0].revision).toBe(2)
  })

  it('accepts a matching remote save while the same local content is still queued', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a', generation: 1 }),
    )
    await synchronizer.start()

    const content = 'same recovery committed by another renderer'
    useEditorStore.getState().updateContent('tab-a', content)
    expect(
      [...storageValues.entries()].some(
        ([key, value]) => key.startsWith(EDITOR_RECOVERY_KEY_PREFIX) && value.includes(content),
      ),
    ).toBe(true)

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 2,
      tab: record({ content, revision: 2, position: 0 }),
    })

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content,
      revision: 2,
    })
    expect(useEditorStore.getState().tabs[0].syncConflict).toBeUndefined()
    expect(synchronizer.getConflict()).toBeNull()
    expect(useEditorStore.getState().databaseStatus).not.toBe('conflict')
    expect(
      [...storageValues.entries()].some(
        ([key, value]) => key.startsWith(EDITOR_RECOVERY_KEY_PREFIX) && value.includes(content),
      ),
    ).toBe(false)

    await vi.advanceTimersByTimeAsync(500)
    expect(dependencies.save).not.toHaveBeenCalled()
  })

  it('does not turn a remote view-state update into a content conflict while a local view is queued', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({ tabs: [record()], activeTabId: 'tab-a', generation: 1 }),
    )
    await synchronizer.start()

    useEditorStore.getState().updateCursorPosition('tab-a', 8, 3)
    useEditorStore.getState().updateScrollTop('tab-a', 480)
    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'view-state',
      generation: 2,
      viewState: {
        workspaceId: 'default',
        id: 'tab-a',
        cursorPosition: { lineNumber: 20, column: 5 },
        scrollTop: 900,
        status: 'open',
        revision: 1,
        viewUpdatedAt: '2026-07-14T00:00:02.000Z',
      },
    })

    expect(synchronizer.getConflict()).toBeNull()
    expect(useEditorStore.getState().databaseStatus).not.toBe('conflict')
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      cursorPosition: { lineNumber: 8, column: 3 },
      scrollTop: 480,
    })
    expect(useEditorStore.getState().tabs[0].syncConflict).toBeUndefined()

    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() =>
      expect(dependencies.updateViewState).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tab-a',
          cursorPosition: { lineNumber: 8, column: 3 },
          scrollTop: 480,
        }),
      ),
    )
  })

  it.each(['saved', 'reopened'] as const)(
    'accepts remote %s content while only a local view save is pending',
    async (kind) => {
      vi.mocked(dependencies.load).mockResolvedValueOnce(
        workspace({ tabs: [record()], activeTabId: 'tab-a', generation: 1 }),
      )
      await synchronizer.start()

      useEditorStore.getState().updateCursorPosition('tab-a', 8, 3)
      useEditorStore.getState().updateScrollTop('tab-a', 480)
      remoteListener?.({
        sourceClientId: 'other-window',
        workspaceId: 'default',
        kind,
        generation: 2,
        tab: record({
          content: 'remote content committed by another window',
          revision: 2,
          cursorPosition: { lineNumber: 20, column: 5 },
          scrollTop: 900,
          viewUpdatedAt: '2026-07-14T00:00:02.000Z',
        }),
      })

      expect(useEditorStore.getState().tabs[0]).toMatchObject({
        content: 'remote content committed by another window',
        revision: 2,
        cursorPosition: { lineNumber: 8, column: 3 },
        scrollTop: 480,
      })
      expect(useEditorStore.getState().tabs[0].syncConflict).toBeUndefined()
      expect(synchronizer.getConflict()).toBeNull()
      expect(useEditorStore.getState().databaseStatus).not.toBe('conflict')
      expect(dependencies.save).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(500)
      await vi.waitFor(() =>
        expect(dependencies.updateViewState).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'tab-a',
            cursorPosition: { lineNumber: 8, column: 3 },
            scrollTop: 480,
          }),
        ),
      )
      expect(dependencies.save).not.toHaveBeenCalled()
    },
  )

  it.each(['closed', 'deleted'] as const)(
    'accepts a remote %s event while an older local view save is in flight',
    async (kind) => {
      const pendingViewSave =
        deferred<Awaited<ReturnType<EditorWorkspaceSyncDependencies['updateViewState']>>>()
      vi.mocked(dependencies.load).mockResolvedValueOnce(
        workspace({ tabs: [record()], activeTabId: 'tab-a', generation: 1 }),
      )
      vi.mocked(dependencies.updateViewState).mockReturnValueOnce(pendingViewSave.promise)
      await synchronizer.start()

      useEditorStore.getState().updateCursorPosition('tab-a', 8, 3)
      await vi.advanceTimersByTimeAsync(500)
      await vi.waitFor(() => expect(dependencies.updateViewState).toHaveBeenCalledTimes(1))

      remoteListener?.({
        sourceClientId: 'other-window',
        workspaceId: 'default',
        kind,
        generation: 2,
        tab: record({ status: kind, revision: 2 }),
      })

      expect(useEditorStore.getState().tabs.some((item) => item.id === 'tab-a')).toBe(false)
      if (kind === 'closed') {
        expect(useEditorStore.getState().recentlyClosedTabs[0]).toMatchObject({
          id: 'tab-a',
          revision: 2,
        })
      } else {
        expect(useEditorStore.getState().recentlyClosedTabs).toHaveLength(0)
      }
      expect(synchronizer.getConflict()).toBeNull()

      pendingViewSave.resolve({ status: 'conflict', current: null, generation: 2 })
      await vi.waitFor(() =>
        expect(synchronizer.getTabPersistenceState('tab-a').pending).toBe(false),
      )
      expect(synchronizer.getConflict()).toBeNull()
      expect(useEditorStore.getState().tabs.some((item) => item.id === 'tab-a')).toBe(false)
      expect(useEditorStore.getState().databaseStatus).not.toBe('conflict')
    },
  )

  it('applies a remote practice close after cancelling only pending view-state timers', async () => {
    const practiceId = 'exercise-py-add-stable'
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [
          record({
            id: practiceId,
            filename: 'add.py',
            content: '',
            kind: 'exercise',
            problemId: 'py-add',
          }),
        ],
        activeTabId: practiceId,
      }),
    )
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      lastPersistedAt: null,
      dirty: false,
    })
    await synchronizer.start()

    useEditorStore.getState().updateCursorPosition(practiceId, 8, 3)
    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'closed',
      generation: 1,
      tab: record({
        id: practiceId,
        filename: 'add.py',
        content: '',
        kind: 'exercise',
        problemId: 'py-add',
        status: 'closed',
        revision: 2,
      }),
    })

    expect(useEditorStore.getState().tabs.some((item) => item.id === practiceId)).toBe(false)
    expect(useEditorStore.getState().recentlyClosedTabs[0]).toMatchObject({ id: practiceId })
    expect(useEditorStore.getState().databaseStatus).not.toBe('conflict')
    expect(dependencies.updateViewState).not.toHaveBeenCalled()
  })

  it('keeps the remote persisted tab position when applying a saved event', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [
          record({ id: 'tab-a', position: 0 }),
          record({ id: 'tab-b', filename: 'b.py', position: 1 }),
          record({ id: 'tab-c', filename: 'c.py', position: 2 }),
        ],
        activeTabId: 'tab-b',
      }),
    )
    await synchronizer.start()

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 1,
      tab: record({ id: 'tab-a', content: 'remote a', revision: 2, position: 0 }),
    })

    expect(useEditorStore.getState().tabs.map((item) => item.id)).toEqual([
      'tab-a',
      'tab-b',
      'tab-c',
    ])
    expect(useEditorStore.getState().activeTabId).toBe('tab-b')
  })

  it('turns divergent local and remote edits into a conflict during a generation-gap reload', async () => {
    vi.mocked(dependencies.load)
      .mockResolvedValueOnce(
        workspace({
          tabs: [record({ content: 'shared base', revision: 1 })],
          activeTabId: 'tab-a',
          generation: 1,
        }),
      )
      .mockResolvedValueOnce(
        workspace({
          tabs: [
            record({
              content: 'remote committed edit',
              revision: 2,
              updatedAt: '2026-07-14T00:00:04.000Z',
            }),
          ],
          activeTabId: 'tab-a',
          generation: 3,
        }),
      )
    await synchronizer.start()
    useEditorStore.getState().updateContent('tab-a', 'local unsaved edit')

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 3,
      tab: record({ content: 'remote committed edit', revision: 2 }),
    })

    await vi.waitFor(() => expect(useEditorStore.getState().databaseStatus).toBe('conflict'))
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: 'local unsaved edit',
      syncConflict: true,
    })
    expect(dependencies.save).not.toHaveBeenCalled()
  })

  it('does not resurrect a remotely deleted tab when the local copy is unchanged', async () => {
    vi.mocked(dependencies.load)
      .mockResolvedValueOnce(
        workspace({
          tabs: [record({ content: 'shared base', revision: 1 })],
          activeTabId: 'tab-a',
          generation: 1,
        }),
      )
      .mockResolvedValueOnce(workspace({ generation: 3 }))
    await synchronizer.start()

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'deleted',
      generation: 3,
      tab: record({ status: 'deleted', revision: 2 }),
    })

    await vi.waitFor(() => expect(useEditorStore.getState().tabs).toHaveLength(0))
    expect(dependencies.save).not.toHaveBeenCalled()
    expect(useEditorStore.getState().databaseStatus).not.toBe('conflict')
  })

  it('uses the shared v3 identity when preserving legacy exercise content from an event', async () => {
    await synchronizer.start()
    const legacyExercise = record({
      id: 'legacy-exercise',
      filename: 'legacy.py',
      kind: 'exercise',
      problemId: 'exercise-legacy',
      content: 'print("preserve once")',
      revision: 1,
    })

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 2,
      tab: legacyExercise,
    })

    const recoveryId = legacyExerciseRecoveryTabId(legacyExercise)
    expect(useEditorStore.getState().tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: recoveryId,
          filename: legacyExerciseRecoveryFilename('legacy.py'),
          kind: 'file',
          content: 'print("preserve once")',
        }),
      ]),
    )
  })

  it('does not remount the active editor when another tab changes remotely', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record(), record({ id: 'tab-b', filename: 'b.py', position: 1 })],
        activeTabId: 'tab-a',
      }),
    )
    await synchronizer.start()
    const hydrationEpoch = useEditorStore.getState().hydrationEpoch

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 1,
      tab: record({ id: 'tab-b', filename: 'b.py', content: 'remote b', revision: 2, position: 1 }),
    })

    expect(useEditorStore.getState().activeTabId).toBe('tab-a')
    expect(useEditorStore.getState().hydrationEpoch).toBe(hydrationEpoch)
    expect(useEditorStore.getState().tabs.find((item) => item.id === 'tab-b')?.content).toBe(
      'remote b',
    )
  })

  it('ignores a cross-window event older than the loaded workspace generation', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [record({ content: 'generation five' })],
        activeTabId: 'tab-a',
        generation: 5,
      }),
    )
    await synchronizer.start()

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 4,
      tab: record({ content: 'stale generation four', revision: 2 }),
    })

    expect(useEditorStore.getState().tabs[0].content).toBe('generation five')
  })

  it('reloads the workspace when a cross-window generation gap is detected', async () => {
    vi.mocked(dependencies.load)
      .mockResolvedValueOnce(
        workspace({ tabs: [record({ content: 'generation one' })], generation: 1 }),
      )
      .mockResolvedValueOnce(
        workspace({
          tabs: [record({ content: 'authoritative generation three', revision: 3 })],
          generation: 3,
        }),
      )
    await synchronizer.start()

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 3,
      tab: record({ content: 'event payload', revision: 3 }),
    })
    await vi.waitFor(() => expect(dependencies.load).toHaveBeenCalledTimes(2))

    expect(useEditorStore.getState().tabs[0].content).toBe('authoritative generation three')
  })

  it('reloads again when another generation gap arrives while a reload is pending', async () => {
    const pendingReload = deferred<EditorWorkspaceRecord>()
    vi.mocked(dependencies.load)
      .mockResolvedValueOnce(
        workspace({ tabs: [record({ content: 'generation one' })], generation: 1 }),
      )
      .mockReturnValueOnce(pendingReload.promise)
      .mockResolvedValueOnce(
        workspace({
          tabs: [record({ content: 'authoritative generation five', revision: 5 })],
          generation: 5,
        }),
      )
    await synchronizer.start()

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 3,
      tab: record({ content: 'generation three event', revision: 3 }),
    })
    await vi.waitFor(() => expect(dependencies.load).toHaveBeenCalledTimes(2))

    remoteListener?.({
      sourceClientId: 'other-window',
      workspaceId: 'default',
      kind: 'saved',
      generation: 5,
      tab: record({ content: 'generation five event', revision: 5 }),
    })
    pendingReload.resolve(
      workspace({
        tabs: [record({ content: 'authoritative generation three', revision: 3 })],
        generation: 3,
      }),
    )

    await vi.waitFor(() => expect(dependencies.load).toHaveBeenCalledTimes(3))
    await vi.waitFor(() =>
      expect(useEditorStore.getState().tabs[0].content).toBe('authoritative generation five'),
    )
  })
})
