import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EditorWorkspaceSynchronizer,
  type EditorWorkspaceSyncDependencies,
} from '../src/services/editorWorkspaceSync'
import {
  EDITOR_RECOVERY_KEY_PREFIX,
  useEditorStore,
  type EditorTab,
} from '../src/stores/editorStore'
import type {
  EditorTabRecord,
  EditorWorkspaceChangedEvent,
  EditorWorkspaceRecord,
} from '../src/services/editorWorkspaceService'

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
    legacyStorageVersion: 2,
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
        storageVersion: 3,
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

  it('preserves edits made while the initial SQLite load is still pending', async () => {
    const pendingLoad = deferred<EditorWorkspaceRecord>()
    vi.mocked(dependencies.load).mockReturnValueOnce(pendingLoad.promise)

    const started = synchronizer.start()
    useEditorStore.getState().updateContent('tab-a', 'edited during deferred load')
    pendingLoad.resolve(
      workspace({
        tabs: [record({ content: 'stale database content' })],
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

  it('chooses newer content independently for each tab during startup reconciliation', async () => {
    vi.mocked(dependencies.load).mockResolvedValueOnce(
      workspace({
        tabs: [
          record({ id: 'tab-a', content: 'remote newer A', updatedAt: '2026-07-14T00:00:05Z' }),
          record({ id: 'tab-b', content: 'remote older B', updatedAt: '2026-07-14T00:00:01Z' }),
        ],
        activeTabId: 'tab-a',
      }),
    )
    useEditorStore.setState({
      tabs: [
        tab({ id: 'tab-a', content: 'local older A', updatedAt: '2026-07-14T00:00:02Z' }),
        tab({ id: 'tab-b', content: 'local newer B', updatedAt: '2026-07-14T00:00:06Z' }),
      ],
      lastPersistedAt: 0,
    })

    await synchronizer.start()

    expect(useEditorStore.getState().tabs.find((item) => item.id === 'tab-a')?.content).toBe(
      'remote newer A',
    )
    expect(useEditorStore.getState().tabs.find((item) => item.id === 'tab-b')?.content).toBe(
      'local newer B',
    )
    expect(dependencies.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-b', content: 'local newer B' }),
    )
    expect(dependencies.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tab-a', content: 'local older A' }),
    )
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
