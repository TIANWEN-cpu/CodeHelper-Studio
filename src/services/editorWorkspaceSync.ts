import {
  closeEditorTab,
  DEFAULT_EDITOR_WORKSPACE_ID,
  loadEditorWorkspace,
  migrateLegacyEditorWorkspace,
  onEditorWorkspaceChanged,
  reopenEditorTab,
  saveEditorTab,
  setActiveEditorTab,
  updateEditorTabViewState,
  type EditorTabRecord,
  type EditorWorkspaceChangedEvent,
  type EditorWorkspaceRecord,
} from './editorWorkspaceService'
import {
  backupEditorWorkspaceSnapshot,
  clearEditorTabRecovery,
  EDITOR_STORAGE_VERSION,
  flushPersistTabs,
  useEditorStore,
  type EditorTab,
} from '@/stores/editorStore'

const CONTENT_SAVE_DELAY_MS = 500
const VIEW_SAVE_DELAY_MS = 500

export interface EditorWorkspaceSyncDependencies {
  load: typeof loadEditorWorkspace
  migrateLegacy: typeof migrateLegacyEditorWorkspace
  save: typeof saveEditorTab
  updateViewState: typeof updateEditorTabViewState
  close: typeof closeEditorTab
  reopen: typeof reopenEditorTab
  setActive: typeof setActiveEditorTab
  onChanged: typeof onEditorWorkspaceChanged
}

export type EditorWorkspaceConflictResolution = 'use-database' | 'keep-local' | 'save-copy'

export interface EditorWorkspaceConflict {
  tabId: string
  databaseTab: EditorTab | null
  count: number
}

export interface EditorTabPersistenceState {
  pending: boolean
  conflict: boolean
  degraded: boolean
  error: string | null
}

const defaultDependencies: EditorWorkspaceSyncDependencies = {
  load: loadEditorWorkspace,
  migrateLegacy: migrateLegacyEditorWorkspace,
  save: saveEditorTab,
  updateViewState: updateEditorTabViewState,
  close: closeEditorTab,
  reopen: reopenEditorTab,
  setActive: setActiveEditorTab,
  onChanged: onEditorWorkspaceChanged,
}

function makeClientId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  return random ? `editor-${random}` : `editor-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function canonicalizePersistedEditorTab<T extends { kind: EditorTab['kind']; content: string }>(
  tab: T,
): T {
  return tab.kind === 'exercise' && tab.content !== '' ? { ...tab, content: '' } : tab
}

function hasLegacyExerciseContent(tab: { kind: EditorTab['kind']; content: string }): boolean {
  return tab.kind === 'exercise' && tab.content !== ''
}

function recoveredExerciseFilename(filename: string): string {
  const extensionIndex = filename.lastIndexOf('.')
  return extensionIndex > 0
    ? `${filename.slice(0, extensionIndex)}.exercise-recovered${filename.slice(extensionIndex)}`
    : `${filename}.exercise-recovered`
}

function legacyExerciseRecoveryTab(source: EditorTab | EditorTabRecord): EditorTab | null {
  if (!hasLegacyExerciseContent(source)) return null
  const baseId = source.id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100) || 'exercise'
  const fingerprint = mutationFingerprint({
    id: source.id,
    language: source.language,
    content: source.content,
  }).replace(/:/g, '-')
  return {
    id: `recovered-exercise-${baseId}-${fingerprint}`.slice(0, 200),
    filename: recoveredExerciseFilename(source.filename),
    language: source.language,
    content: source.content,
    kind: 'file',
    ...(source.cursorPosition ? { cursorPosition: source.cursorPosition } : {}),
    scrollTop: source.scrollTop ?? 0,
    ...(source.updatedAt ? { updatedAt: source.updatedAt } : {}),
    ...(source.viewUpdatedAt ? { viewUpdatedAt: source.viewUpdatedAt } : {}),
    localOnly: true,
    recoveryOriginalId: source.id,
  }
}

function collectLegacyExerciseRecoveryTabs(
  sources: Array<EditorTab | EditorTabRecord>,
  existingIds: Iterable<string>,
): EditorTab[] {
  const seen = new Set(existingIds)
  const recovered: EditorTab[] = []
  for (const source of sources) {
    const copy = legacyExerciseRecoveryTab(source)
    if (!copy || seen.has(copy.id)) continue
    seen.add(copy.id)
    recovered.push(copy)
  }
  return recovered
}

function canonicalizeLocalWorkspace(
  state: ReturnType<typeof useEditorStore.getState>,
): ReturnType<typeof useEditorStore.getState> {
  const sources = [...state.tabs, ...state.recentlyClosedTabs]
  const recovered = collectLegacyExerciseRecoveryTabs(
    sources,
    sources.map((tab) => tab.id),
  )
  return {
    ...state,
    tabs: [...state.tabs.map(canonicalizePersistedEditorTab), ...recovered],
    recentlyClosedTabs: state.recentlyClosedTabs.map(canonicalizePersistedEditorTab),
  }
}

function recordToTab(record: EditorTabRecord): EditorTab {
  const canonical = canonicalizePersistedEditorTab(record)
  return {
    id: canonical.id,
    kind: canonical.kind,
    filename: canonical.filename,
    language: canonical.language,
    content: canonical.content,
    ...(canonical.problemId ? { problemId: canonical.problemId } : {}),
    ...(canonical.cursorPosition ? { cursorPosition: canonical.cursorPosition } : {}),
    scrollTop: canonical.scrollTop,
    revision: canonical.revision,
    updatedAt: canonical.updatedAt,
    viewUpdatedAt: canonical.viewUpdatedAt,
  }
}

function sameContent(tab: EditorTab, record: EditorTabRecord): boolean {
  const canonicalTab = canonicalizePersistedEditorTab(tab)
  const canonicalRecord = canonicalizePersistedEditorTab(record)
  return (
    canonicalTab.filename === canonicalRecord.filename &&
    canonicalTab.language === canonicalRecord.language &&
    canonicalTab.content === canonicalRecord.content &&
    (canonicalTab.kind ?? 'file') === canonicalRecord.kind &&
    (canonicalTab.problemId ?? null) === canonicalRecord.problemId
  )
}

function sameViewState(left: EditorTab, right: EditorTab): boolean {
  return (
    left.cursorPosition?.lineNumber === right.cursorPosition?.lineNumber &&
    left.cursorPosition?.column === right.cursorPosition?.column &&
    (left.scrollTop ?? 0) === (right.scrollTop ?? 0)
  )
}

function samePersistedContent(left: EditorTab, right: EditorTab): boolean {
  const canonicalLeft = canonicalizePersistedEditorTab(left)
  const canonicalRight = canonicalizePersistedEditorTab(right)
  return (
    canonicalLeft.filename === canonicalRight.filename &&
    canonicalLeft.language === canonicalRight.language &&
    canonicalLeft.content === canonicalRight.content &&
    (canonicalLeft.kind ?? 'file') === (canonicalRight.kind ?? 'file') &&
    (canonicalLeft.problemId ?? null) === (canonicalRight.problemId ?? null)
  )
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function mutationFingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${text.length}:${first >>> 0}:${second >>> 0}`
}

export class EditorWorkspaceSynchronizer {
  private readonly clientId = makeClientId()
  private mutationSequence = 0
  private started = false
  private stopped = false
  private initializing = false
  private suppressStoreObserver = false
  private ready: Promise<void> | null = null
  private unsubscribeStore: (() => void) | null = null
  private unsubscribeRemote: (() => void) | null = null
  private readonly revisions = new Map<string, number>()
  private readonly statuses = new Map<string, EditorTabRecord['status']>()
  private readonly records = new Map<string, EditorTabRecord>()
  private readonly contentTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly viewTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly queues = new Map<string, Promise<void>>()
  private workspaceQueue: Promise<void> = Promise.resolve()
  private lastGeneration = 0
  private reconciling = false
  private readonly pendingRemoteEvents: EditorWorkspaceChangedEvent[] = []
  private reloadPromise: Promise<void> | null = null
  private reloadRequested = false
  private workspacePendingCount = 0
  private readonly initialTouchedTabIds = new Set<string>()
  private initialActiveTouched = false
  private readonly conflicts = new Map<string, EditorTabRecord | null>()
  private readonly failures = new Map<string, string>()
  private readonly closingTabIds = new Set<string>()
  private readonly closingDirtyTabIds = new Set<string>()
  private readonly closeRequests = new Map<string, Promise<boolean>>()
  private readonly mutationEnvelopes = new Map<
    string,
    { fingerprint: string; mutationId: string }
  >()

  constructor(
    private readonly dependencies: EditorWorkspaceSyncDependencies = defaultDependencies,
  ) {}

  start(): Promise<void> {
    if (this.ready) return this.ready
    this.started = true
    this.ready = this.initialize()
    return this.ready
  }

  stop(): void {
    this.stopped = true
    this.unsubscribeStore?.()
    this.unsubscribeRemote?.()
    this.unsubscribeStore = null
    this.unsubscribeRemote = null
    for (const timer of this.contentTimers.values()) clearTimeout(timer)
    for (const timer of this.viewTimers.values()) clearTimeout(timer)
    this.contentTimers.clear()
    this.viewTimers.clear()
  }

  async flush(): Promise<boolean> {
    await this.start()
    if (this.stopped) return false

    for (const id of [...this.contentTimers.keys()]) {
      const timer = this.contentTimers.get(id)
      if (timer) clearTimeout(timer)
      this.contentTimers.delete(id)
      const state = useEditorStore.getState()
      const tab = state.tabs.find((item) => item.id === id)
      if (!tab) continue
      const position = state.tabs.findIndex((item) => item.id === id)
      this.markSyncing()
      void this.enqueue(id, `content:${id}`, async () => {
        await this.persistOpenTab(tab, Math.max(0, position))
      })
    }

    for (const id of [...this.viewTimers.keys()]) {
      const timer = this.viewTimers.get(id)
      if (timer) clearTimeout(timer)
      this.viewTimers.delete(id)
      this.markSyncing()
      void this.enqueue(id, `view:${id}`, async () => {
        await this.persistViewState(id)
      })
    }

    for (let pass = 0; pass < 3; pass += 1) {
      await Promise.all([...this.queues.values()].map((pending) => pending.catch(() => undefined)))
      await this.workspaceQueue.catch(() => undefined)
      await this.reloadPromise?.catch(() => undefined)
      if (!this.hasPendingMutations()) break
    }

    flushPersistTabs()
    return !this.hasPendingMutations() && this.conflicts.size === 0 && this.failures.size === 0
  }

  async requestClose(id: string): Promise<boolean> {
    const existing = this.closeRequests.get(id)
    if (existing) return existing
    const request = this.performClose(id)
    this.closeRequests.set(id, request)
    try {
      return await request
    } finally {
      if (this.closeRequests.get(id) === request) this.closeRequests.delete(id)
    }
  }

  private async performClose(id: string): Promise<boolean> {
    await this.start()
    const state = useEditorStore.getState()
    const tab = state.tabs.find((item) => item.id === id)
    if (!tab) return true
    const position = state.tabs.findIndex((item) => item.id === id)
    let closed = false
    this.closingTabIds.add(id)
    this.closingDirtyTabIds.delete(id)
    this.markSyncing()
    this.cancelTabTimers(id)
    try {
      await this.enqueue(id, `close:${id}`, async () => {
        closed = await this.persistLatestAndCloseTab(id, tab, Math.max(0, position))
      })
      if (!closed) return false
      this.withSuppressedObserver(() => useEditorStore.getState().closeTab(id))
      this.scheduleActiveTab(useEditorStore.getState().activeTabId)
      return true
    } finally {
      this.closingTabIds.delete(id)
      const changedWhileClosing = this.closingDirtyTabIds.delete(id)
      if (
        !closed &&
        changedWhileClosing &&
        useEditorStore.getState().tabs.some((item) => item.id === id)
      ) {
        this.scheduleContentSave(id)
        this.scheduleViewSave(id)
      }
    }
  }

  getConflict(): EditorWorkspaceConflict | null {
    const entry = this.conflicts.entries().next().value as
      | [string, EditorTabRecord | null]
      | undefined
    if (!entry) return null
    return {
      tabId: entry[0],
      databaseTab: entry[1] ? recordToTab(entry[1]) : null,
      count: this.conflicts.size,
    }
  }

  getTabPersistenceState(id: string): EditorTabPersistenceState {
    const failure = [...this.failures.entries()].find(([key]) => key.endsWith(`:${id}`))?.[1]
    return {
      pending:
        this.contentTimers.has(id) ||
        this.viewTimers.has(id) ||
        this.queues.has(id) ||
        this.closingTabIds.has(id),
      conflict: this.conflicts.has(id),
      degraded: Boolean(failure),
      error: failure ?? null,
    }
  }

  async closeLocally(id: string): Promise<void> {
    await this.start()
    const tab = useEditorStore.getState().tabs.find((item) => item.id === id)
    if (!tab) return
    this.cancelTabTimers(id)
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => ({
        tabs: state.tabs.map((item) =>
          item.id === id ? { ...item, localOnly: true, updatedAt: new Date().toISOString() } : item,
        ),
        dirty: true,
      }))
      useEditorStore.getState().closeTab(id)
    })
    this.clearFailuresForTab(id)
    this.failures.set(`local-close:${id}`, `标签 ${tab.filename} 仅在本地关闭，SQLite 仍保留原状态`)
    this.refreshDatabaseState()
    this.scheduleActiveTab(useEditorStore.getState().activeTabId)
  }

  async resolveConflict(
    resolution: EditorWorkspaceConflictResolution,
    requestedId?: string,
  ): Promise<boolean> {
    await this.start()
    const conflict = requestedId
      ? ([requestedId, this.conflicts.get(requestedId)] as const)
      : (this.conflicts.entries().next().value as [string, EditorTabRecord | null] | undefined)
    if (!conflict || !this.conflicts.has(conflict[0])) return true
    const [id, databaseRecord] = conflict
    if (resolution === 'use-database') {
      this.applyDatabaseConflictResolution(id, databaseRecord ?? null)
      return true
    }

    const state = useEditorStore.getState()
    const local =
      state.tabs.find((tab) => tab.id === id) ??
      state.recentlyClosedTabs.find((tab) => tab.id === id)
    if (!local) return false

    if (resolution === 'save-copy') {
      const copy = this.createConflictCopy(local)
      this.withSuppressedObserver(() => useEditorStore.getState().addTab(copy))
      try {
        const copyState = useEditorStore.getState()
        await this.persistOpenTab(
          copy,
          Math.max(
            0,
            copyState.tabs.findIndex((tab) => tab.id === copy.id),
          ),
          true,
        )
      } catch (error) {
        this.markFailure(error, `content:${copy.id}`)
      }
      this.applyDatabaseConflictResolution(id, databaseRecord ?? null)
      this.withSuppressedObserver(() => useEditorStore.getState().setActiveTab(copy.id))
      flushPersistTabs()
      return true
    }

    if (!state.tabs.some((tab) => tab.id === id)) {
      this.withSuppressedObserver(() => {
        useEditorStore.setState((current) => ({
          tabs: [...current.tabs, local],
          activeTabId: id,
          recentlyClosedTabs: current.recentlyClosedTabs.filter((tab) => tab.id !== id),
          dirty: true,
          hydrationEpoch: current.hydrationEpoch + 1,
        }))
      })
    }
    try {
      const current = useEditorStore.getState()
      const currentLocal = current.tabs.find((tab) => tab.id === id) ?? local
      const saved = await this.persistOpenTab(
        currentLocal,
        Math.max(
          0,
          current.tabs.findIndex((tab) => tab.id === id),
        ),
        true,
      )
      if (!saved) return false
      this.conflicts.delete(id)
      this.clearConflictFlag(id)
      this.clearFailuresForTab(id)
      flushPersistTabs()
      this.refreshDatabaseState()
      return true
    } catch (error) {
      this.markFailure(error, `content:${id}`)
      return false
    }
  }

  private async initialize(): Promise<void> {
    this.setDatabaseState('syncing', null)
    this.initializing = true
    this.reconciling = true
    this.subscribeRemote()
    this.subscribeStore()
    try {
      let remote = await this.dependencies.load(DEFAULT_EDITOR_WORKSPACE_ID)
      if (this.stopped) return
      this.seedRemote(remote)
      // Only import localStorage into an uninitialized SQLite workspace.
      // Already-versioned workspaces (v1/v2/v3) reconcile in place so a version
      // bump never replaces durable remote tabs with an empty or stale local payload.
      if (remote.legacyStorageVersion === 0) {
        const local = canonicalizeLocalWorkspace(useEditorStore.getState())
        const hasLocalSnapshot = local.lastPersistedAt !== null || local.dirty
        if (hasLocalSnapshot) backupEditorWorkspaceSnapshot()
        const migrationPayload = {
          workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
          storageVersion: EDITOR_STORAGE_VERSION,
          activeTabId: hasLocalSnapshot ? local.activeTabId : null,
          tabs: hasLocalSnapshot
            ? [
                ...local.tabs.map((tab, position) => ({
                  id: tab.id,
                  filename: tab.filename,
                  language: tab.language,
                  content: tab.content,
                  kind: tab.kind ?? 'file',
                  problemId: tab.problemId ?? null,
                  cursorPosition: tab.cursorPosition ?? null,
                  scrollTop: tab.scrollTop ?? 0,
                  position,
                  status: 'open' as const,
                })),
                ...local.recentlyClosedTabs.map((tab, position) => ({
                  id: tab.id,
                  filename: tab.filename,
                  language: tab.language,
                  content: tab.content,
                  kind: tab.kind ?? 'file',
                  problemId: tab.problemId ?? null,
                  cursorPosition: tab.cursorPosition ?? null,
                  scrollTop: tab.scrollTop ?? 0,
                  position,
                  status: 'closed' as const,
                })),
              ]
            : [],
          clientId: this.clientId,
        }
        const migration = await this.invokeIdempotentMutation(
          'migrate',
          'workspace',
          migrationPayload,
          (mutationId) => this.dependencies.migrateLegacy({ ...migrationPayload, mutationId }),
        )
        remote = migration.workspace
        this.remapRecoveredMigrationTabs(migration.recoveredTabMappings, remote)
        this.replaceRemote(remote)
      }
      await this.reconcileInitialWorkspace(remote)
      this.clearFailure('initialize')
      this.initializing = false
      this.scheduleBufferedInitialChanges()
      this.reconciling = false
      this.drainRemoteEvents()
      this.markSyncedIfIdle()
    } catch (error) {
      this.initializing = false
      this.reconciling = false
      this.markFailure(error, 'initialize')
    } finally {
      if (!this.stopped) this.subscribeStore()
    }
  }

  private seedRemote(remote: EditorWorkspaceRecord): void {
    this.lastGeneration = Math.max(this.lastGeneration, remote.generation)
    for (const record of [...remote.tabs, ...remote.recentlyClosedTabs]) {
      const canonical = canonicalizePersistedEditorTab(record)
      this.records.set(canonical.id, canonical)
      this.revisions.set(canonical.id, canonical.revision)
      this.statuses.set(canonical.id, canonical.status)
    }
  }

  private replaceRemote(remote: EditorWorkspaceRecord): void {
    this.records.clear()
    this.revisions.clear()
    this.statuses.clear()
    this.seedRemote(remote)
  }

  private remapRecoveredMigrationTabs(
    mappings: Record<string, string>,
    remote: EditorWorkspaceRecord,
  ): void {
    if (Object.keys(mappings).length === 0) return
    const remoteById = new Map(
      [...remote.tabs, ...remote.recentlyClosedTabs].map((record) => [record.id, record]),
    )
    const remap = (tab: EditorTab): EditorTab => {
      const recoveredId = mappings[tab.id]
      if (!recoveredId) return tab
      const recovered = remoteById.get(recoveredId)
      return {
        ...tab,
        id: recoveredId,
        filename: recovered?.filename ?? tab.filename,
        revision: recovered?.revision,
        updatedAt: tab.updatedAt ?? recovered?.updatedAt,
        viewUpdatedAt: tab.viewUpdatedAt ?? recovered?.viewUpdatedAt,
        syncConflict: undefined,
        localOnly: undefined,
        recoveryOriginalId: tab.id,
      }
    }
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => ({
        tabs: state.tabs.map(remap),
        recentlyClosedTabs: state.recentlyClosedTabs.map(remap),
        activeTabId: state.activeTabId ? (mappings[state.activeTabId] ?? state.activeTabId) : null,
        dirty: true,
      }))
    })
    for (const [sourceId, recoveredId] of Object.entries(mappings)) {
      if (this.initialTouchedTabIds.delete(sourceId)) this.initialTouchedTabIds.add(recoveredId)
    }
    flushPersistTabs()
  }

  private async reconcileInitialWorkspace(remote: EditorWorkspaceRecord): Promise<void> {
    const local = canonicalizeLocalWorkspace(useEditorStore.getState())
    const hasLocalSnapshot = local.lastPersistedAt !== null || local.dirty
    if (!hasLocalSnapshot && (remote.tabs.length > 0 || remote.recentlyClosedTabs.length > 0)) {
      const recovered = this.applyRemoteWorkspace(remote)
      for (const copy of recovered) {
        const state = useEditorStore.getState()
        await this.persistOpenTab(
          copy,
          Math.max(
            0,
            state.tabs.findIndex((tab) => tab.id === copy.id),
          ),
        )
      }
      return
    }

    const remoteById = new Map(
      [...remote.tabs, ...remote.recentlyClosedTabs].map((record) => [record.id, record]),
    )
    const desiredOpen: EditorTab[] = []
    const desiredClosed: EditorTab[] = []
    const initialTasks: Array<() => Promise<void>> = []
    const seen = new Set<string>()

    local.tabs.forEach((tab, position) => {
      const record = remoteById.get(tab.id)
      const touchedDuringInitialization = this.initialTouchedTabIds.has(tab.id)
      const hasProtectedLocalIntent =
        tab.localOnly === true ||
        Boolean(tab.recoverySourceKeys?.length) ||
        this.hasFailureForTab(tab.id)
      const localUpdatedAt = record ? timestamp(tab.updatedAt) : 0
      const remoteUpdatedAt = record ? timestamp(record.updatedAt) : 0
      const shouldPersistLocal =
        touchedDuringInitialization || (localUpdatedAt > 0 && localUpdatedAt > remoteUpdatedAt)
      seen.add(tab.id)
      if (tab.syncConflict) {
        if (record?.status === 'open' && sameContent(tab, record)) {
          desiredOpen.push({
            ...tab,
            syncConflict: undefined,
            localOnly: undefined,
            revision: record.revision,
            updatedAt: record.updatedAt,
          })
        } else {
          desiredOpen.push({
            ...tab,
            ...(record ? { revision: record.revision } : {}),
          })
          this.conflicts.set(tab.id, record ?? null)
        }
        return
      }
      if (!record) {
        desiredOpen.push(tab)
        initialTasks.push(async () => {
          await this.persistCurrentOpenTab(tab.id, tab, position)
        })
        return
      }
      if (record.status === 'open' && sameContent(tab, record)) {
        desiredOpen.push({
          ...tab,
          syncConflict: undefined,
          localOnly: undefined,
          revision: record.revision,
          updatedAt: record.updatedAt,
        })
        if (
          record.position !== position ||
          tab.cursorPosition?.lineNumber !== record.cursorPosition?.lineNumber ||
          tab.cursorPosition?.column !== record.cursorPosition?.column ||
          (tab.scrollTop ?? 0) !== record.scrollTop
        ) {
          initialTasks.push(async () => {
            const saved = await this.persistCurrentOpenTab(tab.id, tab, position)
            if (saved) await this.persistViewState(tab.id)
          })
        }
        return
      }
      if (tab.revision === undefined || tab.revision !== record.revision) {
        if (shouldPersistLocal) {
          desiredOpen.push({ ...tab, revision: record.revision })
          initialTasks.push(async () => {
            await this.persistCurrentOpenTab(tab.id, tab, position)
          })
        } else if (hasProtectedLocalIntent) {
          desiredOpen.push({ ...tab, syncConflict: true })
          this.conflicts.set(tab.id, record)
        } else if (record.status === 'open') desiredOpen.push(recordToTab(record))
        else desiredClosed.push(recordToTab(record))
        return
      }
      if (shouldPersistLocal) {
        desiredOpen.push({ ...tab, revision: record.revision })
        initialTasks.push(async () => {
          await this.persistCurrentOpenTab(tab.id, tab, position)
        })
      } else if (remoteUpdatedAt > localUpdatedAt && !hasProtectedLocalIntent) {
        if (record.status === 'open') desiredOpen.push(recordToTab(record))
        else desiredClosed.push(recordToTab(record))
      } else {
        desiredOpen.push({ ...tab, syncConflict: true })
        this.conflicts.set(tab.id, record)
      }
    })

    for (const record of remote.tabs) {
      if (!seen.has(record.id)) desiredOpen.push(recordToTab(record))
    }

    local.recentlyClosedTabs.forEach((tab) => {
      const record = remoteById.get(tab.id)
      const touchedDuringInitialization = this.initialTouchedTabIds.has(tab.id)
      const hasProtectedLocalIntent =
        tab.localOnly === true ||
        Boolean(tab.recoverySourceKeys?.length) ||
        this.hasFailureForTab(tab.id)
      const localUpdatedAt = record ? timestamp(tab.updatedAt) : 0
      const remoteUpdatedAt = record ? timestamp(record.updatedAt) : 0
      const shouldPersistLocal =
        touchedDuringInitialization || (localUpdatedAt > 0 && localUpdatedAt > remoteUpdatedAt)
      if (seen.has(tab.id)) return
      seen.add(tab.id)
      if (tab.syncConflict) {
        if (record?.status === 'closed' && sameContent(tab, record)) {
          desiredClosed.push({
            ...tab,
            syncConflict: undefined,
            localOnly: undefined,
            revision: record.revision,
            updatedAt: record.updatedAt,
          })
        } else {
          desiredClosed.push({
            ...tab,
            ...(record ? { revision: record.revision } : {}),
          })
          this.conflicts.set(tab.id, record ?? null)
        }
        return
      }
      if (!record) {
        desiredClosed.push(tab)
        initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
        return
      }
      if (record.status === 'closed' && sameContent(tab, record)) {
        desiredClosed.push({
          ...tab,
          syncConflict: undefined,
          localOnly: undefined,
          revision: record.revision,
          updatedAt: record.updatedAt,
        })
        return
      }
      if (tab.revision === undefined || tab.revision !== record.revision) {
        if (shouldPersistLocal) {
          desiredClosed.push({ ...tab, revision: record.revision })
          initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
        } else if (hasProtectedLocalIntent) {
          desiredClosed.push({ ...tab, syncConflict: true })
          this.conflicts.set(tab.id, record)
        } else if (record.status === 'open') desiredOpen.push(recordToTab(record))
        else desiredClosed.push(recordToTab(record))
        return
      }
      if (shouldPersistLocal) {
        desiredClosed.push({ ...tab, revision: record.revision })
        initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
      } else if (remoteUpdatedAt > localUpdatedAt && !hasProtectedLocalIntent) {
        if (record.status === 'open') desiredOpen.push(recordToTab(record))
        else desiredClosed.push(recordToTab(record))
      } else {
        desiredClosed.push({ ...tab, syncConflict: true })
        this.conflicts.set(tab.id, record)
      }
    })

    for (const record of remote.recentlyClosedTabs) {
      if (!seen.has(record.id)) desiredClosed.push(recordToTab(record))
    }

    const remoteSources = [...remote.tabs, ...remote.recentlyClosedTabs]
    const recoveredRemoteTabs = collectLegacyExerciseRecoveryTabs(remoteSources, [
      ...remoteSources.map((record) => record.id),
      ...desiredOpen.map((tab) => tab.id),
      ...desiredClosed.map((tab) => tab.id),
    ])
    for (const copy of recoveredRemoteTabs) {
      if (seen.has(copy.id)) continue
      seen.add(copy.id)
      desiredOpen.push(copy)
      initialTasks.push(async () => {
        await this.persistCurrentOpenTab(copy.id, copy, desiredOpen.indexOf(copy))
      })
    }

    const preferredActive =
      (this.initialActiveTouched || local.lastPersistedAt !== null || local.dirty) &&
      desiredOpen.some((tab) => tab.id === local.activeTabId)
        ? local.activeTabId
        : remote.activeTabId
    this.replaceStoreWorkspace(desiredOpen, desiredClosed, preferredActive)

    for (const task of initialTasks) {
      if (this.stopped) return
      await task()
    }
    await this.persistActiveTab(useEditorStore.getState().activeTabId)
    flushPersistTabs()
  }

  private applyRemoteWorkspace(remote: EditorWorkspaceRecord): EditorTab[] {
    const remoteSources = [...remote.tabs, ...remote.recentlyClosedTabs]
    const recovered = collectLegacyExerciseRecoveryTabs(
      remoteSources,
      remoteSources.map((record) => record.id),
    )
    this.replaceStoreWorkspace(
      [...remote.tabs.map(recordToTab), ...recovered],
      remote.recentlyClosedTabs.map(recordToTab),
      remote.activeTabId,
    )
    flushPersistTabs()
    return recovered
  }

  private replaceStoreWorkspace(
    tabs: EditorTab[],
    recentlyClosedTabs: EditorTab[],
    activeTabId: string | null,
  ): void {
    const currentState = useEditorStore.getState()
    const nextActive =
      activeTabId && tabs.some((tab) => tab.id === activeTabId)
        ? activeTabId
        : (tabs[0]?.id ?? null)
    const currentActiveTab = currentState.tabs.find((tab) => tab.id === currentState.activeTabId)
    const nextActiveTab = tabs.find((tab) => tab.id === nextActive)
    const shouldRehydrateActive =
      !currentState.hydrated ||
      (currentState.activeTabId === nextActive &&
        Boolean(
          currentActiveTab &&
          nextActiveTab &&
          (!samePersistedContent(currentActiveTab, nextActiveTab) ||
            !sameViewState(currentActiveTab, nextActiveTab)),
        ))
    this.withSuppressedObserver(() => {
      useEditorStore.setState({
        tabs,
        activeTabId: nextActive,
        recentlyClosedTabs: recentlyClosedTabs.slice(0, 10),
        hydrated: true,
        dirty: false,
        persistenceError: null,
        hydrationEpoch: shouldRehydrateActive
          ? currentState.hydrationEpoch + 1
          : currentState.hydrationEpoch,
      })
    })
  }

  private subscribeStore(): void {
    if (this.unsubscribeStore || !this.started) return
    this.unsubscribeStore = useEditorStore.subscribe((state, previous) => {
      if (this.suppressStoreObserver || this.stopped) return
      this.observeStoreChange(state, previous)
    })
  }

  private subscribeRemote(): void {
    if (this.unsubscribeRemote || this.stopped) return
    try {
      this.unsubscribeRemote = this.dependencies.onChanged((event) => this.applyRemoteEvent(event))
    } catch (error) {
      this.markFailure(error, 'remote-subscription')
    }
  }

  private observeStoreChange(
    state: ReturnType<typeof useEditorStore.getState>,
    previous: ReturnType<typeof useEditorStore.getState>,
  ): void {
    if (this.initializing) {
      this.captureInitialStoreChange(state, previous)
      return
    }
    const currentById = new Map(state.tabs.map((tab) => [tab.id, tab]))
    const previousById = new Map(previous.tabs.map((tab) => [tab.id, tab]))
    const previousClosed = new Map(previous.recentlyClosedTabs.map((tab) => [tab.id, tab]))

    previous.tabs.forEach((tab, position) => {
      if (currentById.has(tab.id)) return
      const closed = state.recentlyClosedTabs.find((item) => item.id === tab.id)
      if (closed) this.scheduleClose(closed, position)
    })

    state.tabs.forEach((tab, position) => {
      const previousTab = previousById.get(tab.id)
      if (!previousTab) {
        if (previousClosed.has(tab.id)) this.scheduleReopen(tab, position)
        else this.scheduleContentSave(tab.id)
        return
      }
      const contentChanged = !samePersistedContent(tab, previousTab)
      const viewChanged = !sameViewState(tab, previousTab)
      if (this.closingTabIds.has(tab.id) && (contentChanged || viewChanged)) {
        this.closingDirtyTabIds.add(tab.id)
        this.markSyncing()
        return
      }
      if (contentChanged) this.scheduleContentSave(tab.id)
      if (viewChanged) this.scheduleViewSave(tab.id)
    })

    if (state.activeTabId !== previous.activeTabId) this.scheduleActiveTab(state.activeTabId)
  }

  private captureInitialStoreChange(
    state: ReturnType<typeof useEditorStore.getState>,
    previous: ReturnType<typeof useEditorStore.getState>,
  ): void {
    const currentTabs = new Map([
      ...state.tabs.map((tab) => [tab.id, tab] as const),
      ...state.recentlyClosedTabs.map((tab) => [tab.id, tab] as const),
    ])
    const previousTabs = new Map([
      ...previous.tabs.map((tab) => [tab.id, tab] as const),
      ...previous.recentlyClosedTabs.map((tab) => [tab.id, tab] as const),
    ])
    for (const id of new Set([...currentTabs.keys(), ...previousTabs.keys()])) {
      const current = currentTabs.get(id)
      const before = previousTabs.get(id)
      const changedLocation =
        state.tabs.some((tab) => tab.id === id) !== previous.tabs.some((tab) => tab.id === id)
      if (
        !current ||
        !before ||
        changedLocation ||
        !samePersistedContent(current, before) ||
        !sameViewState(current, before)
      ) {
        this.initialTouchedTabIds.add(id)
      }
    }
    if (state.activeTabId !== previous.activeTabId) this.initialActiveTouched = true
  }

  private scheduleBufferedInitialChanges(): void {
    const state = useEditorStore.getState()
    for (const id of this.initialTouchedTabIds) {
      const openTab = state.tabs.find((tab) => tab.id === id)
      if (openTab) {
        this.scheduleContentSave(id)
        this.scheduleViewSave(id)
        continue
      }
      const closedTab = state.recentlyClosedTabs.find((tab) => tab.id === id)
      if (closedTab) this.scheduleClose(closedTab, this.records.get(id)?.position ?? 0)
    }
    if (this.initialActiveTouched) this.scheduleActiveTab(state.activeTabId)
    this.initialTouchedTabIds.clear()
    this.initialActiveTouched = false
  }

  private scheduleContentSave(id: string): void {
    this.markSyncing()
    const existing = this.contentTimers.get(id)
    if (existing) clearTimeout(existing)
    this.contentTimers.set(
      id,
      setTimeout(() => {
        this.contentTimers.delete(id)
        const state = useEditorStore.getState()
        const tab = state.tabs.find((item) => item.id === id)
        if (!tab) return
        const position = state.tabs.findIndex((item) => item.id === id)
        void this.enqueue(id, `content:${id}`, async () => {
          await this.persistOpenTab(tab, Math.max(0, position))
        })
      }, CONTENT_SAVE_DELAY_MS),
    )
  }

  private scheduleViewSave(id: string): void {
    this.markSyncing()
    const existing = this.viewTimers.get(id)
    if (existing) clearTimeout(existing)
    this.viewTimers.set(
      id,
      setTimeout(() => {
        this.viewTimers.delete(id)
        void this.enqueue(id, `view:${id}`, () => this.persistViewState(id))
      }, VIEW_SAVE_DELAY_MS),
    )
  }

  private scheduleClose(tab: EditorTab, position: number): void {
    this.markSyncing()
    this.cancelTabTimers(tab.id)
    void this.enqueue(tab.id, `close:${tab.id}`, async () => {
      try {
        const closed = await this.persistAndCloseTab(tab, Math.max(0, position))
        if (!closed) this.restoreOptimisticallyClosedTab(tab, position)
      } catch (error) {
        this.restoreOptimisticallyClosedTab(tab, position)
        throw error
      }
    })
  }

  private async persistAndCloseTab(tab: EditorTab, position: number): Promise<boolean> {
    const saved = await this.persistOpenTab(tab, position)
    if (!saved) return false
    if (this.statuses.get(tab.id) !== 'open') return true
    const revision = this.revisions.get(tab.id)
    if (!revision) return false
    const payload = {
      workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
      id: tab.id,
      baseRevision: revision,
      clientId: this.clientId,
    }
    const result = await this.invokeIdempotentMutation('close', tab.id, payload, (mutationId) =>
      this.dependencies.close({ ...payload, mutationId }),
    )
    if (result.status === 'conflict') {
      this.markConflict(tab.id, result.current)
      this.acceptGeneration(result.generation)
      return false
    }
    this.clearFailure(`close:${tab.id}`)
    this.acceptGeneration(result.generation)
    this.acceptRecord(result.tab)
    this.applyRecordMetadata(result.tab)
    this.markSyncedIfIdle()
    return true
  }

  private async persistLatestAndCloseTab(
    id: string,
    fallback: EditorTab,
    fallbackPosition: number,
  ): Promise<boolean> {
    while (!this.stopped) {
      this.closingDirtyTabIds.delete(id)
      const state = useEditorStore.getState()
      const current = state.tabs.find((tab) => tab.id === id) ?? fallback
      const position = state.tabs.findIndex((tab) => tab.id === id)
      const resolvedPosition = position >= 0 ? position : fallbackPosition
      const saved = await this.persistOpenTab(current, resolvedPosition)
      if (!saved) return false
      await this.persistViewState(id)
      if (this.conflicts.has(id)) return false
      if (this.closingDirtyTabIds.has(id)) continue
      const closed = await this.persistAndCloseTab(
        useEditorStore.getState().tabs.find((tab) => tab.id === id) ?? current,
        resolvedPosition,
      )
      if (!closed) return false
      if (!this.closingDirtyTabIds.has(id)) return true
    }
    return false
  }

  private scheduleReopen(tab: EditorTab, position: number): void {
    this.markSyncing()
    void this.enqueue(tab.id, `content:${tab.id}`, async () => {
      if (this.statuses.get(tab.id) === 'closed') {
        const revision = this.revisions.get(tab.id)
        if (!revision) return
        const payload = {
          workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
          id: tab.id,
          baseRevision: revision,
          clientId: this.clientId,
        }
        const result = await this.invokeIdempotentMutation(
          'reopen',
          tab.id,
          payload,
          (mutationId) => this.dependencies.reopen({ ...payload, mutationId }),
        )
        if (result.status === 'conflict') {
          this.markConflict(tab.id, result.current)
          this.acceptGeneration(result.generation)
          return
        }
        this.clearFailure(`content:${tab.id}`)
        this.acceptGeneration(result.generation)
        this.acceptRecord(result.tab)
        this.applyRecordMetadata(result.tab)
      }
      await this.persistOpenTab(tab, position)
    })
  }

  private scheduleActiveTab(activeTabId: string | null): void {
    this.markSyncing()
    this.workspacePendingCount += 1
    this.workspaceQueue = this.workspaceQueue
      .catch(() => undefined)
      .then(async () => {
        const pending = activeTabId ? this.queues.get(activeTabId) : null
        if (pending) await pending.catch(() => undefined)
        await this.persistActiveTab(activeTabId)
      })
      .catch((error) => this.markFailure(error, 'active-tab'))
      .finally(() => {
        this.workspacePendingCount = Math.max(0, this.workspacePendingCount - 1)
        this.markSyncedIfIdle()
      })
  }

  private async persistOpenTab(
    tab: EditorTab,
    position: number,
    allowConflict = false,
  ): Promise<boolean> {
    const persistedTab = canonicalizePersistedEditorTab(tab)
    if (this.stopped) return false
    if (this.conflicts.has(persistedTab.id) && !allowConflict) return false
    if (this.statuses.get(persistedTab.id) === 'closed') {
      const revision = this.revisions.get(persistedTab.id)
      if (revision) {
        const reopenPayload = {
          workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
          id: persistedTab.id,
          baseRevision: revision,
          clientId: this.clientId,
        }
        const reopened = await this.invokeIdempotentMutation(
          'reopen',
          persistedTab.id,
          reopenPayload,
          (mutationId) => this.dependencies.reopen({ ...reopenPayload, mutationId }),
        )
        if (reopened.status === 'conflict') {
          this.markConflict(persistedTab.id, reopened.current)
          this.acceptGeneration(reopened.generation)
          return false
        }
        this.clearFailure(`content:${persistedTab.id}`)
        this.acceptGeneration(reopened.generation)
        this.acceptRecord(reopened.tab)
      }
    }
    const current = this.records.get(persistedTab.id)
    if (
      current?.status === 'open' &&
      sameContent(persistedTab, current) &&
      current.position === position
    ) {
      this.clearFailure(`content:${persistedTab.id}`)
      this.clearRecoveryForTab(persistedTab)
      this.applyRecordMetadata(current)
      this.markSyncedIfIdle()
      return true
    }
    const payload = {
      workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
      id: persistedTab.id,
      filename: persistedTab.filename,
      language: persistedTab.language,
      content: persistedTab.content,
      kind: persistedTab.kind ?? 'file',
      problemId: persistedTab.problemId ?? null,
      position,
      baseRevision: this.revisions.get(persistedTab.id) ?? 0,
      clientId: this.clientId,
    }
    const result = await this.invokeIdempotentMutation(
      'save',
      persistedTab.id,
      payload,
      (mutationId) => this.dependencies.save({ ...payload, mutationId }),
    )
    if (result.status === 'conflict') {
      this.markConflict(persistedTab.id, result.current)
      this.acceptGeneration(result.generation)
      return false
    }
    this.clearFailure(`content:${persistedTab.id}`)
    this.clearRecoveryForTab(persistedTab)
    this.acceptGeneration(result.generation)
    this.acceptRecord(result.tab)
    this.applyRecordMetadata(result.tab)
    this.markSyncedIfIdle()
    return true
  }

  private async persistCurrentOpenTab(
    id: string,
    fallback: EditorTab,
    fallbackPosition: number,
  ): Promise<boolean> {
    const state = useEditorStore.getState()
    const current = state.tabs.find((tab) => tab.id === id) ?? fallback
    const currentPosition = state.tabs.findIndex((tab) => tab.id === id)
    return this.persistOpenTab(current, currentPosition >= 0 ? currentPosition : fallbackPosition)
  }

  private async persistCurrentClosedTab(id: string, fallback: EditorTab): Promise<void> {
    const current =
      useEditorStore.getState().recentlyClosedTabs.find((tab) => tab.id === id) ?? fallback
    await this.persistClosedTab(current)
  }

  private async persistClosedTab(tab: EditorTab): Promise<void> {
    const existing = this.records.get(tab.id)
    if (existing?.status === 'closed' && sameContent(tab, existing)) {
      this.clearRecoveryForTab(tab)
      this.applyRecordMetadata(existing)
      return
    }
    const saved = await this.persistOpenTab(tab, 0)
    if (!saved) return
    if (this.statuses.get(tab.id) !== 'open') return
    const revision = this.revisions.get(tab.id)
    if (!revision) return
    const payload = {
      workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
      id: tab.id,
      baseRevision: revision,
      clientId: this.clientId,
    }
    const result = await this.invokeIdempotentMutation('close', tab.id, payload, (mutationId) =>
      this.dependencies.close({ ...payload, mutationId }),
    )
    if (result.status === 'conflict') {
      this.markConflict(tab.id, result.current)
      this.acceptGeneration(result.generation)
      return
    }
    this.clearFailure(`close:${tab.id}`)
    this.acceptGeneration(result.generation)
    this.acceptRecord(result.tab)
    this.applyRecordMetadata(result.tab)
    this.markSyncedIfIdle()
  }

  private async persistViewState(id: string): Promise<void> {
    if (this.conflicts.has(id)) return
    const pendingContent = this.contentTimers.get(id)
    if (pendingContent) {
      clearTimeout(pendingContent)
      this.contentTimers.delete(id)
      const state = useEditorStore.getState()
      const tab = state.tabs.find((item) => item.id === id)
      if (tab) {
        const saved = await this.persistOpenTab(
          tab,
          state.tabs.findIndex((item) => item.id === id),
        )
        if (!saved) return
      }
    }
    if (this.statuses.get(id) !== 'open') return
    const tab = useEditorStore.getState().tabs.find((item) => item.id === id)
    if (!tab) return
    const payload = {
      workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
      id,
      cursorPosition: tab.cursorPosition ?? null,
      scrollTop: tab.scrollTop ?? 0,
      clientId: this.clientId,
    }
    const result = await this.invokeIdempotentMutation('view', id, payload, (mutationId) =>
      this.dependencies.updateViewState({ ...payload, mutationId }),
    )
    if (result.status === 'conflict') {
      this.markConflict(id, this.records.get(id) ?? null)
      this.acceptGeneration(result.generation)
      return
    }
    this.clearFailure(`view:${id}`)
    this.acceptGeneration(result.generation)
    const record = this.records.get(id)
    if (record) {
      const updated: EditorTabRecord = {
        ...record,
        cursorPosition: result.viewState.cursorPosition,
        scrollTop: result.viewState.scrollTop,
        viewUpdatedAt: result.viewState.viewUpdatedAt,
      }
      this.acceptRecord(updated)
      this.applyRecordMetadata(updated)
    }
    this.markSyncedIfIdle()
  }

  private async persistActiveTab(activeTabId: string | null): Promise<void> {
    const result = await this.dependencies.setActive(activeTabId, DEFAULT_EDITOR_WORKSPACE_ID)
    this.clearFailure('active-tab')
    this.acceptGeneration(result.generation)
    this.markSyncedIfIdle()
  }

  private enqueue(id: string, failureKey: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(id) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(task)
      .catch((error) => this.markFailure(error, failureKey))
    this.queues.set(id, next)
    void next.finally(() => {
      if (this.queues.get(id) === next) this.queues.delete(id)
      this.markSyncedIfIdle()
    })
    return next
  }

  private cancelTabTimers(id: string): void {
    const contentTimer = this.contentTimers.get(id)
    if (contentTimer) clearTimeout(contentTimer)
    this.contentTimers.delete(id)
    const viewTimer = this.viewTimers.get(id)
    if (viewTimer) clearTimeout(viewTimer)
    this.viewTimers.delete(id)
  }

  private restoreOptimisticallyClosedTab(tab: EditorTab, position: number): void {
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => {
        if (state.tabs.some((item) => item.id === tab.id)) return state
        const recovered = state.recentlyClosedTabs.find((item) => item.id === tab.id) ?? tab
        const tabs = [...state.tabs]
        tabs.splice(Math.min(Math.max(0, position), tabs.length), 0, recovered)
        return {
          tabs,
          activeTabId: recovered.id,
          recentlyClosedTabs: state.recentlyClosedTabs.filter((item) => item.id !== recovered.id),
          dirty: true,
          hydrationEpoch: state.hydrationEpoch + 1,
        }
      })
    })
    flushPersistTabs()
  }

  private createConflictCopy(tab: EditorTab): EditorTab {
    this.mutationSequence += 1
    const suffix = `${Date.now()}-${this.mutationSequence}`
    const baseId = tab.id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120) || 'tab'
    const extensionIndex = tab.filename.lastIndexOf('.')
    const filename =
      extensionIndex > 0
        ? `${tab.filename.slice(0, extensionIndex)}.local-copy${tab.filename.slice(extensionIndex)}`
        : `${tab.filename}.local-copy`
    return {
      ...tab,
      id: `recovered-${baseId}-${suffix}`.slice(0, 200),
      filename,
      revision: undefined,
      updatedAt: new Date().toISOString(),
      viewUpdatedAt: undefined,
      syncConflict: undefined,
      localOnly: undefined,
    }
  }

  private applyDatabaseConflictResolution(
    id: string,
    databaseRecord: EditorTabRecord | null,
  ): void {
    if (databaseRecord) {
      this.preserveLegacyExerciseContent(databaseRecord)
      this.acceptRecord(databaseRecord)
    } else {
      this.records.delete(id)
      this.revisions.delete(id)
      this.statuses.delete(id)
    }
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => {
        const tabs = state.tabs.filter((tab) => tab.id !== id)
        const recentlyClosedTabs = state.recentlyClosedTabs.filter((tab) => tab.id !== id)
        if (databaseRecord?.status === 'open') {
          const position = Math.min(Math.max(0, databaseRecord.position), tabs.length)
          tabs.splice(position, 0, recordToTab(databaseRecord))
        } else if (databaseRecord?.status === 'closed') {
          recentlyClosedTabs.unshift(recordToTab(databaseRecord))
        }
        const activeTabId =
          state.activeTabId === id
            ? databaseRecord?.status === 'open'
              ? id
              : (tabs[0]?.id ?? null)
            : state.activeTabId && tabs.some((tab) => tab.id === state.activeTabId)
              ? state.activeTabId
              : (tabs[0]?.id ?? null)
        return {
          tabs,
          activeTabId,
          recentlyClosedTabs: recentlyClosedTabs.slice(0, 10),
          dirty: true,
          hydrationEpoch:
            state.activeTabId === id ? state.hydrationEpoch + 1 : state.hydrationEpoch,
        }
      })
    })
    this.conflicts.delete(id)
    this.clearFailuresForTab(id)
    flushPersistTabs()
    this.refreshDatabaseState()
  }

  private hasPendingMutations(): boolean {
    return (
      this.contentTimers.size > 0 ||
      this.viewTimers.size > 0 ||
      this.queues.size > 0 ||
      this.workspacePendingCount > 0 ||
      this.reloadPromise !== null
    )
  }

  private markSyncedIfIdle(): void {
    if (!this.reconciling && !this.hasPendingMutations()) this.refreshDatabaseState()
  }

  private acceptRecord(record: EditorTabRecord): void {
    const canonical = canonicalizePersistedEditorTab(record)
    this.records.set(canonical.id, canonical)
    this.revisions.set(canonical.id, canonical.revision)
    this.statuses.set(canonical.id, canonical.status)
  }

  private preserveLegacyExerciseContent(source: EditorTab | EditorTabRecord): void {
    const copy = legacyExerciseRecoveryTab(source)
    if (!copy || this.records.has(copy.id)) return
    const state = useEditorStore.getState()
    if (
      state.tabs.some((tab) => tab.id === copy.id) ||
      state.recentlyClosedTabs.some((tab) => tab.id === copy.id)
    ) {
      return
    }
    this.withSuppressedObserver(() => {
      useEditorStore.setState((current) => ({
        tabs: [...current.tabs, copy],
        dirty: true,
      }))
    })
    flushPersistTabs()
    this.scheduleContentSave(copy.id)
  }

  private applyRecordMetadata(record: EditorTabRecord): void {
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === record.id
            ? {
                ...tab,
                revision: record.revision,
                updatedAt: record.updatedAt,
                viewUpdatedAt: record.viewUpdatedAt,
                localOnly: undefined,
                recoverySourceKeys: undefined,
                recoveryOriginalId: undefined,
              }
            : tab,
        ),
        recentlyClosedTabs: state.recentlyClosedTabs.map((tab) =>
          tab.id === record.id
            ? {
                ...tab,
                revision: record.revision,
                updatedAt: record.updatedAt,
                viewUpdatedAt: record.viewUpdatedAt,
                localOnly: undefined,
                recoverySourceKeys: undefined,
                recoveryOriginalId: undefined,
              }
            : tab,
        ),
      }))
    })
  }

  private applyRemoteEvent(event: EditorWorkspaceChangedEvent): void {
    if (this.reconciling) {
      this.pendingRemoteEvents.push(event)
      return
    }
    if (
      this.stopped ||
      event.workspaceId !== DEFAULT_EDITOR_WORKSPACE_ID ||
      event.sourceClientId === this.clientId ||
      event.generation <= this.lastGeneration
    ) {
      return
    }
    if (event.generation > this.lastGeneration + 1) {
      this.pendingRemoteEvents.push(event)
      void this.reloadAfterGenerationGap()
      return
    }
    this.lastGeneration = event.generation
    const id = event.kind === 'view-state' ? event.viewState.id : event.tab.id
    if (event.kind !== 'view-state') this.preserveLegacyExerciseContent(event.tab)
    const eventTab = event.kind === 'view-state' ? null : canonicalizePersistedEditorTab(event.tab)
    if (
      this.contentTimers.has(id) ||
      this.viewTimers.has(id) ||
      this.queues.has(id) ||
      this.conflicts.has(id) ||
      this.hasFailureForTab(id)
    ) {
      this.markConflict(id, event.kind === 'view-state' ? (this.records.get(id) ?? null) : eventTab)
      return
    }

    if (event.kind === 'view-state') {
      const record = this.records.get(id)
      if (!record) return
      const updated: EditorTabRecord = {
        ...record,
        cursorPosition: event.viewState.cursorPosition,
        scrollTop: event.viewState.scrollTop,
        viewUpdatedAt: event.viewState.viewUpdatedAt,
      }
      this.acceptRecord(updated)
      this.withSuppressedObserver(() => {
        useEditorStore.setState((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  cursorPosition: updated.cursorPosition ?? undefined,
                  scrollTop: updated.scrollTop,
                  viewUpdatedAt: updated.viewUpdatedAt,
                }
              : tab,
          ),
        }))
      })
      flushPersistTabs()
      return
    }

    if (!eventTab) return
    this.acceptRecord(eventTab)
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => {
        const withoutOpen = state.tabs.filter((tab) => tab.id !== id)
        const withoutClosed = state.recentlyClosedTabs.filter((tab) => tab.id !== id)
        if (event.kind === 'saved' || event.kind === 'reopened') {
          const tabs = [...withoutOpen, recordToTab(eventTab)]
          return {
            tabs,
            recentlyClosedTabs: withoutClosed,
            activeTabId: state.activeTabId ?? event.tab.id,
            hydrationEpoch:
              state.activeTabId === id && eventTab.kind !== 'exercise'
                ? state.hydrationEpoch + 1
                : state.hydrationEpoch,
          }
        }
        if (event.kind === 'closed') {
          const activeTabId =
            state.activeTabId === id ? (withoutOpen[0]?.id ?? null) : state.activeTabId
          return {
            tabs: withoutOpen,
            recentlyClosedTabs: [recordToTab(eventTab), ...withoutClosed].slice(0, 10),
            activeTabId,
            hydrationEpoch:
              state.activeTabId === id && eventTab.kind !== 'exercise'
                ? state.hydrationEpoch + 1
                : state.hydrationEpoch,
          }
        }
        return {
          tabs: withoutOpen,
          recentlyClosedTabs: withoutClosed,
          activeTabId: state.activeTabId === id ? (withoutOpen[0]?.id ?? null) : state.activeTabId,
          hydrationEpoch:
            state.activeTabId === id && eventTab.kind !== 'exercise'
              ? state.hydrationEpoch + 1
              : state.hydrationEpoch,
        }
      })
    })
    flushPersistTabs()
    this.markSyncedIfIdle()
  }

  private drainRemoteEvents(): void {
    const events = this.pendingRemoteEvents
      .splice(0)
      .sort((left, right) => left.generation - right.generation)
    for (const event of events) this.applyRemoteEvent(event)
  }

  private reloadAfterGenerationGap(): Promise<void> {
    if (this.reloadPromise) {
      this.reloadRequested = true
      return this.reloadPromise
    }
    this.markSyncing()
    this.reconciling = true
    this.reloadPromise = (async () => {
      do {
        this.reloadRequested = false
        const remote = await this.dependencies.load(DEFAULT_EDITOR_WORKSPACE_ID)
        if (this.stopped) return
        this.reconciling = true
        this.replaceRemote(remote)
        await this.reconcileInitialWorkspace(remote)
        this.reconciling = false
        this.drainRemoteEvents()
      } while (this.reloadRequested && !this.stopped)
      this.clearFailure('reload')
      if (!this.hasPendingMutations()) this.refreshDatabaseState()
    })()
      .catch((error) => {
        this.reconciling = false
        this.markFailure(error, 'reload')
      })
      .finally(() => {
        this.reloadPromise = null
        this.markSyncedIfIdle()
      })
    return this.reloadPromise
  }

  private acceptGeneration(generation: number): void {
    if (generation <= this.lastGeneration) return
    if (generation === this.lastGeneration + 1) {
      this.lastGeneration = generation
      return
    }
    void this.reloadAfterGenerationGap()
  }

  private markConflict(id: string, current: EditorTabRecord | null): void {
    if (current) {
      this.preserveLegacyExerciseContent(current)
      this.acceptRecord(current)
    } else {
      this.records.delete(id)
      this.revisions.delete(id)
      this.statuses.delete(id)
    }
    this.conflicts.set(id, current)
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => ({
        tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, syncConflict: true } : tab)),
        recentlyClosedTabs: state.recentlyClosedTabs.map((tab) =>
          tab.id === id ? { ...tab, syncConflict: true } : tab,
        ),
        dirty: true,
      }))
    })
    flushPersistTabs()
    this.refreshDatabaseState()
  }

  private clearConflictFlag(id: string): void {
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === id ? { ...tab, syncConflict: undefined, localOnly: undefined } : tab,
        ),
        recentlyClosedTabs: state.recentlyClosedTabs.map((tab) =>
          tab.id === id ? { ...tab, syncConflict: undefined, localOnly: undefined } : tab,
        ),
      }))
    })
  }

  private markFailure(error: unknown, key: string): void {
    const message = error instanceof Error ? error.message : 'SQLite 工作区同步失败'
    this.failures.set(key, message)
    this.refreshDatabaseState()
  }

  private clearFailure(key: string): void {
    if (!this.failures.delete(key)) return
    this.refreshDatabaseState()
  }

  private hasFailureForTab(id: string): boolean {
    for (const key of this.failures.keys()) {
      if (key.endsWith(`:${id}`)) return true
    }
    return false
  }

  private clearFailuresForTab(id: string): void {
    for (const key of [...this.failures.keys()]) {
      if (key.endsWith(`:${id}`)) this.failures.delete(key)
    }
  }

  private clearRecoveryForTab(tab: EditorTab): void {
    const state = useEditorStore.getState()
    const current =
      state.tabs.find((item) => item.id === tab.id) ??
      state.recentlyClosedTabs.find((item) => item.id === tab.id)
    if (current && !samePersistedContent(current, tab)) return
    clearEditorTabRecovery(tab.id, tab.recoverySourceKeys)
    if (tab.recoveryOriginalId && tab.recoveryOriginalId !== tab.id) {
      clearEditorTabRecovery(tab.recoveryOriginalId, tab.recoverySourceKeys)
    }
  }

  private markSyncing(): void {
    if (this.conflicts.size > 0 || this.failures.size > 0) {
      this.refreshDatabaseState()
      return
    }
    this.setDatabaseState('syncing', null)
  }

  private refreshDatabaseState(): void {
    const conflictId = this.conflicts.keys().next().value as string | undefined
    if (conflictId) {
      this.setDatabaseState(
        'conflict',
        `标签 ${conflictId} 的数据库版本已变化；本地内容已保留，请明确选择恢复方式`,
      )
      return
    }
    const failure = this.failures.values().next().value as string | undefined
    if (failure) {
      this.setDatabaseState('degraded', failure)
      return
    }
    this.setDatabaseState(
      this.hasPendingMutations() || this.reconciling ? 'syncing' : 'synced',
      null,
    )
  }

  private setDatabaseState(
    databaseStatus: ReturnType<typeof useEditorStore.getState>['databaseStatus'],
    databaseError: string | null,
  ): void {
    this.withSuppressedObserver(() => {
      useEditorStore.setState({ databaseStatus, databaseError })
    })
  }

  private withSuppressedObserver(action: () => void): void {
    const previous = this.suppressStoreObserver
    this.suppressStoreObserver = true
    try {
      action()
    } finally {
      this.suppressStoreObserver = previous
    }
  }

  private async invokeIdempotentMutation<T>(
    kind: string,
    id: string,
    payload: unknown,
    invoke: (mutationId: string) => Promise<T>,
  ): Promise<T> {
    const key = `${kind}:${id}`
    const fingerprint = mutationFingerprint(payload)
    const previous = this.mutationEnvelopes.get(key)
    const mutationId =
      previous?.fingerprint === fingerprint ? previous.mutationId : this.nextMutationId(kind, id)
    this.mutationEnvelopes.set(key, { fingerprint, mutationId })
    try {
      const result = await invoke(mutationId)
      this.mutationEnvelopes.delete(key)
      return result
    } catch {
      const result = await invoke(mutationId)
      this.mutationEnvelopes.delete(key)
      return result
    }
  }

  private nextMutationId(kind: string, id: string): string {
    this.mutationSequence += 1
    return `${this.clientId}:${kind}:${id}:${this.mutationSequence}`
  }
}

let singleton: EditorWorkspaceSynchronizer | null = null

export function ensureEditorWorkspaceSync(): Promise<void> {
  singleton ??= new EditorWorkspaceSynchronizer()
  return singleton.start()
}

export async function flushEditorWorkspaceForClose(): Promise<boolean> {
  const state = useEditorStore.getState()
  if (!state.hydrated && !state.dirty && !singleton) return true
  flushPersistTabs()
  const localRecoveryReady = useEditorStore.getState().persistenceError === null
  const databaseReady = singleton ? await singleton.flush() : false
  return localRecoveryReady || databaseReady
}

export function getEditorWorkspaceConflict(): EditorWorkspaceConflict | null {
  return singleton?.getConflict() ?? null
}

export function getEditorTabPersistenceState(id: string): EditorTabPersistenceState {
  return (
    singleton?.getTabPersistenceState(id) ?? {
      pending: false,
      conflict: false,
      degraded: false,
      error: null,
    }
  )
}

export async function requestCloseEditorWorkspaceTab(id: string): Promise<boolean> {
  singleton ??= new EditorWorkspaceSynchronizer()
  return singleton.requestClose(id)
}

export async function closeEditorWorkspaceTabLocally(id: string): Promise<void> {
  singleton ??= new EditorWorkspaceSynchronizer()
  await singleton.closeLocally(id)
}

export async function resolveEditorWorkspaceConflict(
  resolution: EditorWorkspaceConflictResolution,
  id?: string,
): Promise<boolean> {
  singleton ??= new EditorWorkspaceSynchronizer()
  return singleton.resolveConflict(resolution, id)
}

export function resetEditorWorkspaceSyncForTesting(): void {
  singleton?.stop()
  singleton = null
}
