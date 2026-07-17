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
  applyPendingEditorViewRecovery,
  backupEditorWorkspaceSnapshot,
  captureEditorTabViewRecovery,
  clearEditorTabRecovery,
  clearEditorTabViewRecovery,
  EDITOR_STORAGE_VERSION,
  flushPersistTabs,
  useEditorStore,
  type EditorTab,
} from '@/stores/editorStore'
import {
  isDraftBackedPracticeTab,
  legacyExerciseRecoveryFilename,
  legacyExerciseRecoveryTabId,
  stableEditorWorkspaceHash,
} from '@/shared/editorWorkspaceContract'

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

export interface EditorWorkspaceCloseFlushResult {
  durability: 'database' | 'recovery' | 'none'
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

function canonicalizePersistedEditorTab<
  T extends { id: string; kind: EditorTab['kind']; content: string },
>(tab: T): T {
  return isDraftBackedPracticeTab(tab) && tab.content !== '' ? { ...tab, content: '' } : tab
}

function hasLegacyExerciseContent(tab: {
  id: string
  kind: EditorTab['kind']
  content: string
}): boolean {
  return isDraftBackedPracticeTab(tab) && tab.content !== ''
}

function legacyExerciseRecoveryTab(source: EditorTab | EditorTabRecord): EditorTab | null {
  if (!hasLegacyExerciseContent(source)) return null
  return {
    id: legacyExerciseRecoveryTabId(source),
    filename: legacyExerciseRecoveryFilename(source.filename),
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

function hasProtectedLocalIntent(tab: EditorTab): boolean {
  return (
    tab.localOnly === true || tab.syncConflict === true || Boolean(tab.recoverySourceKeys?.length)
  )
}

function hasUnresolvedRecoveryConflict(tab: EditorTab): boolean {
  return tab.syncConflict === true && Boolean(tab.recoverySourceKeys?.length)
}

function databaseAssistedDegradedRestoreMessage(message: string | null): string {
  const terminalSuffixes = ['；恢复失败，已打开默认工作区', '；已使用仍可读取的工作区数据']
  const detail = terminalSuffixes.reduce(
    (current, suffix) => (current.endsWith(suffix) ? current.slice(0, -suffix.length) : current),
    message?.trim() || '本地工作区或恢复日志存在损坏',
  )
  return `${detail}；已从 SQLite 加载可用工作区数据，但无法确认损坏记录中是否还有未同步内容，恢复仍处于降级状态。`
}

function shouldPreferUpgradeRemote(tab: EditorTab, record: EditorTabRecord | undefined): boolean {
  if (hasProtectedLocalIntent(tab)) return false
  return !record || tab.revision === undefined || tab.revision !== record.revision
}

type ReloadMergeDecision =
  | 'continue'
  | 'accept-remote'
  | 'accept-remote-deletion'
  | 'persist-local'
  | 'conflict'

function decideReloadMerge(
  tab: EditorTab,
  localStatus: 'open' | 'closed',
  record: EditorTabRecord | undefined,
  baseRecords?: ReadonlyMap<string, EditorTabRecord>,
): ReloadMergeDecision {
  if (!baseRecords) return 'continue'
  const base = baseRecords.get(tab.id)
  if (!record) {
    if (!base) return 'continue'
    const localChanged = base.status !== localStatus || !sameContent(tab, base)
    return localChanged ? 'conflict' : 'accept-remote-deletion'
  }
  if (record.status === localStatus && sameContent(tab, record)) return 'continue'
  if (!base) return 'conflict'
  const localChanged = base.status !== localStatus || !sameContent(tab, base)
  const remoteChanged = base.status !== record.status || !sameContent(recordToTab(base), record)
  if (localChanged && remoteChanged) return 'conflict'
  if (remoteChanged) return 'accept-remote'
  if (localChanged) return 'persist-local'
  return 'continue'
}

function sameViewState(
  left: { cursorPosition?: EditorTab['cursorPosition'] | null; scrollTop?: number },
  right: { cursorPosition?: EditorTab['cursorPosition'] | null; scrollTop?: number },
): boolean {
  return (
    left.cursorPosition?.lineNumber === right.cursorPosition?.lineNumber &&
    left.cursorPosition?.column === right.cursorPosition?.column &&
    (left.scrollTop ?? 0) === (right.scrollTop ?? 0)
  )
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

type EditorViewMergeDecision = 'same' | 'local' | 'remote'

type EditorTabQueueIntent = 'content' | 'view' | 'topology'

function decideEditorViewMerge(tab: EditorTab, record: EditorTabRecord): EditorViewMergeDecision {
  if (sameViewState(tab, record)) return 'same'
  return timestamp(tab.viewUpdatedAt) > timestamp(record.viewUpdatedAt) ? 'local' : 'remote'
}

function applyRemoteView(tab: EditorTab, record: EditorTabRecord): EditorTab {
  return {
    ...tab,
    cursorPosition: record.cursorPosition ?? undefined,
    scrollTop: record.scrollTop,
    viewUpdatedAt: record.viewUpdatedAt,
  }
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
  private readonly initialContentTouchedTabIds = new Set<string>()
  private readonly initialViewTouchedTabIds = new Set<string>()
  private readonly initialTopologyTouchedTabIds = new Set<string>()
  private initialActiveTouched = false
  private readonly conflicts = new Map<string, EditorTabRecord | null>()
  private readonly recoveryConflictSnapshots = new Map<string, EditorTab>()
  private readonly failures = new Map<string, string>()
  private readonly closingTabIds = new Set<string>()
  private readonly closingDirtyTabIds = new Set<string>()
  private readonly closeRequests = new Map<string, Promise<boolean>>()
  private readonly mutationEnvelopes = new Map<
    string,
    { fingerprint: string; mutationId: string }
  >()
  private readonly queuedMutationCounts = new Map<string, Record<EditorTabQueueIntent, number>>()
  private readonly contentPersistCounts = new Map<string, number>()
  private readonly viewMutationEpochs = new Map<string, number>()

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
    const state = useEditorStore.getState()
    const local =
      state.tabs.find((tab) => tab.id === id) ??
      state.recentlyClosedTabs.find((tab) => tab.id === id)
    if (resolution === 'use-database') {
      const recoveryLocal = local ?? this.recoveryConflictSnapshots.get(id)
      if (recoveryLocal && !this.clearRecoveryForTab(recoveryLocal, true)) {
        this.markRecoveryCleanupFailure(id)
        return false
      }
      this.applyDatabaseConflictResolution(id, databaseRecord ?? null)
      return true
    }
    if (!local) return false

    if (resolution === 'save-copy') {
      const copy = this.createConflictCopy(local)
      this.withSuppressedObserver(() => useEditorStore.getState().addTab(copy))
      try {
        const copyState = useEditorStore.getState()
        const saved = await this.persistOpenTab(
          copy,
          Math.max(
            0,
            copyState.tabs.findIndex((tab) => tab.id === copy.id),
          ),
          true,
        )
        if (!saved) return false
      } catch (error) {
        this.markFailure(error, `content:${copy.id}`)
        return false
      }
      if (!this.clearRecoveryForTab(local, true)) {
        this.markRecoveryCleanupFailure(id)
        return false
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
      if (!this.clearRecoveryForTab(currentLocal, true)) {
        this.markRecoveryCleanupFailure(id)
        return false
      }
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

  private rememberRecoveryConflict(tab: EditorTab): void {
    if (!tab.recoverySourceKeys?.length || this.recoveryConflictSnapshots.has(tab.id)) return
    this.recoveryConflictSnapshots.set(tab.id, {
      ...tab,
      ...(tab.cursorPosition ? { cursorPosition: { ...tab.cursorPosition } } : {}),
      recoverySourceKeys: [...(tab.recoverySourceKeys ?? [])],
    })
  }

  private captureRecoveryConflictSnapshots(): void {
    const state = useEditorStore.getState()
    for (const tab of [...state.tabs, ...state.recentlyClosedTabs]) {
      this.rememberRecoveryConflict(tab)
    }
  }

  private hasInitialContentIntent(id: string): boolean {
    return this.initialContentTouchedTabIds.has(id) || this.initialTopologyTouchedTabIds.has(id)
  }

  private hasInitialViewIntent(id: string): boolean {
    return this.initialViewTouchedTabIds.has(id)
  }

  private hasInitialTabIntent(id: string): boolean {
    return this.hasInitialContentIntent(id) || this.hasInitialViewIntent(id)
  }

  private consumeInitialTabIntent(id: string): void {
    this.initialContentTouchedTabIds.delete(id)
    this.initialViewTouchedTabIds.delete(id)
    this.initialTopologyTouchedTabIds.delete(id)
  }

  private async initialize(): Promise<void> {
    this.setDatabaseState('syncing', null)
    this.initializing = true
    this.reconciling = true
    this.captureRecoveryConflictSnapshots()
    this.subscribeRemote()
    this.subscribeStore()
    try {
      let remote = await this.dependencies.load(DEFAULT_EDITOR_WORKSPACE_ID)
      if (this.stopped) return
      const loadedStorageVersion = remote.legacyStorageVersion
      const upgradedExistingWorkspace =
        loadedStorageVersion > 0 && loadedStorageVersion < EDITOR_STORAGE_VERSION
      this.seedRemote(remote)
      // Import the full local snapshot only into an uninitialized SQLite workspace.
      // Marker v1/v2 workspaces still run the repository's in-place v3 data upgrade,
      // but receive no local topology payload so stale snapshots cannot replace SQLite.
      if (remote.legacyStorageVersion < EDITOR_STORAGE_VERSION) {
        const local = canonicalizeLocalWorkspace(useEditorStore.getState())
        const hasLocalSnapshot = local.lastPersistedAt !== null || local.dirty
        const shouldImportLocalSnapshot = remote.legacyStorageVersion === 0 && hasLocalSnapshot
        if (shouldImportLocalSnapshot) backupEditorWorkspaceSnapshot()
        const migrationPayload = {
          workspaceId: DEFAULT_EDITOR_WORKSPACE_ID,
          storageVersion: EDITOR_STORAGE_VERSION,
          activeTabId: shouldImportLocalSnapshot ? local.activeTabId : null,
          tabs: shouldImportLocalSnapshot
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
      await this.reconcileInitialWorkspace(remote, undefined, upgradedExistingWorkspace)
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
      for (const touched of [
        this.initialContentTouchedTabIds,
        this.initialViewTouchedTabIds,
        this.initialTopologyTouchedTabIds,
      ]) {
        if (touched.delete(sourceId)) touched.add(recoveredId)
      }
      const conflictSnapshot = this.recoveryConflictSnapshots.get(sourceId)
      if (conflictSnapshot) {
        this.recoveryConflictSnapshots.delete(sourceId)
        this.recoveryConflictSnapshots.set(recoveredId, { ...conflictSnapshot, id: recoveredId })
      }
    }
    flushPersistTabs()
  }

  private async reconcileInitialWorkspace(
    remote: EditorWorkspaceRecord,
    baseRecords?: ReadonlyMap<string, EditorTabRecord>,
    preferRemoteSnapshot = false,
  ): Promise<void> {
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
      const hydrated = useEditorStore.getState()
      for (const record of remote.tabs) {
        const tab = hydrated.tabs.find((item) => item.id === record.id)
        if (!tab || !sameContent(tab, record)) continue
        if (sameViewState(tab, record)) {
          clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
          continue
        }
        if (decideEditorViewMerge(tab, record) === 'local') await this.persistViewState(tab.id)
      }
      return
    }

    const remoteById = new Map(
      [...remote.tabs, ...remote.recentlyClosedTabs].map((record) => [record.id, record]),
    )
    const desiredOpen: EditorTab[] = []
    const desiredClosed: EditorTab[] = []
    const initialTasks: Array<() => Promise<void>> = []
    const scheduledViewSaveIds = new Set<string>()
    const seen = new Set<string>()

    local.tabs.forEach((tab, position) => {
      const record = remoteById.get(tab.id)
      seen.add(tab.id)
      if (tab.syncConflict) {
        this.rememberRecoveryConflict(tab)
        this.consumeInitialTabIntent(tab.id)
        const recordMatches = record?.status === 'open' && sameContent(tab, record)
        desiredOpen.push({
          ...tab,
          ...(record ? { revision: record.revision } : {}),
          ...(recordMatches ? { updatedAt: record.updatedAt } : {}),
        })
        this.conflicts.set(tab.id, record ?? null)
        const canPersistRecoveryConflict =
          hasUnresolvedRecoveryConflict(tab) &&
          (!record ||
            (record.status === 'open' &&
              tab.revision !== undefined &&
              tab.revision === record.revision &&
              !recordMatches))
        if (canPersistRecoveryConflict) {
          initialTasks.push(async () => {
            const currentState = useEditorStore.getState()
            const current = currentState.tabs.find((item) => item.id === tab.id) ?? tab
            await this.persistOpenTab(
              current,
              Math.max(
                0,
                currentState.tabs.findIndex((item) => item.id === tab.id),
              ),
              true,
            )
          })
        }
        return
      }
      const touchedDuringInitialLoad = baseRecords === undefined && this.hasInitialTabIntent(tab.id)
      const hasInitialContentIntent =
        touchedDuringInitialLoad &&
        (this.hasInitialContentIntent(tab.id) || hasProtectedLocalIntent(tab))
      const hasInitialViewIntent = touchedDuringInitialLoad && this.hasInitialViewIntent(tab.id)
      if (touchedDuringInitialLoad && record?.status === 'open' && sameContent(tab, record)) {
        this.consumeInitialTabIntent(tab.id)
      } else if (touchedDuringInitialLoad && !hasInitialContentIntent) {
        this.consumeInitialTabIntent(tab.id)
        if (!record) {
          if (tab.revision !== undefined) {
            desiredOpen.push({ ...tab, syncConflict: true })
            this.conflicts.set(tab.id, null)
            return
          }
          desiredOpen.push(tab)
          initialTasks.push(async () => {
            const saved = await this.persistCurrentOpenTab(tab.id, tab, position)
            if (saved && hasInitialViewIntent) await this.persistViewState(tab.id)
          })
          return
        }
        if (record.status !== 'open') {
          desiredClosed.push(recordToTab(record))
          clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
          return
        }
        const viewDecision = decideEditorViewMerge(tab, record)
        const remoteTab = recordToTab(record)
        desiredOpen.push(
          viewDecision === 'local'
            ? {
                ...remoteTab,
                cursorPosition: tab.cursorPosition,
                scrollTop: tab.scrollTop,
                viewUpdatedAt: tab.viewUpdatedAt,
              }
            : remoteTab,
        )
        if (viewDecision === 'local') {
          scheduledViewSaveIds.add(tab.id)
          initialTasks.push(() => this.persistViewState(tab.id))
        } else {
          clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
        }
        return
      } else if (touchedDuringInitialLoad) {
        this.consumeInitialTabIntent(tab.id)
        const canPersistAtKnownRevision =
          (!record && tab.revision === undefined) ||
          (record !== undefined && tab.revision !== undefined && tab.revision === record.revision)
        if (!canPersistAtKnownRevision) {
          desiredOpen.push({ ...tab, syncConflict: true })
          this.conflicts.set(tab.id, record ?? null)
          return
        }
        const viewDecision = record ? decideEditorViewMerge(tab, record) : 'local'
        const touchedTab =
          record && viewDecision === 'remote'
            ? applyRemoteView({ ...tab, revision: record.revision }, record)
            : record
              ? { ...tab, revision: record.revision }
              : tab
        desiredOpen.push(touchedTab)
        if (record && viewDecision !== 'local') {
          clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
        }
        if (hasInitialViewIntent && viewDecision === 'local') {
          scheduledViewSaveIds.add(tab.id)
        }
        initialTasks.push(async () => {
          const saved = await this.persistCurrentOpenTab(tab.id, tab, position)
          if (saved && hasInitialViewIntent && viewDecision === 'local') {
            await this.persistViewState(tab.id)
          }
        })
        return
      }
      if (preferRemoteSnapshot && shouldPreferUpgradeRemote(tab, record)) {
        if (record?.status === 'open') desiredOpen.push(recordToTab(record))
        else if (record?.status === 'closed') desiredClosed.push(recordToTab(record))
        return
      }
      const reloadDecision = decideReloadMerge(tab, 'open', record, baseRecords)
      if (reloadDecision === 'conflict') {
        desiredOpen.push({
          ...tab,
          syncConflict: true,
          ...(record ? { revision: record.revision } : {}),
        })
        this.conflicts.set(tab.id, record ?? null)
        return
      }
      if (reloadDecision === 'accept-remote-deletion') return
      if (reloadDecision === 'accept-remote' && record) {
        if (record.status === 'open') desiredOpen.push(recordToTab(record))
        else desiredClosed.push(recordToTab(record))
        return
      }
      if (reloadDecision === 'persist-local' && record) {
        desiredOpen.push({ ...tab, revision: record.revision })
        initialTasks.push(async () => {
          await this.persistCurrentOpenTab(tab.id, tab, position)
        })
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
        const viewDecision = decideEditorViewMerge(tab, record)
        const recoveryCleared = this.clearRecoveryForTab(tab)
        const reconciled = {
          ...tab,
          syncConflict: undefined,
          localOnly: recoveryCleared ? undefined : tab.localOnly,
          recoverySourceKeys: recoveryCleared ? undefined : tab.recoverySourceKeys,
          recoveryOriginalId: recoveryCleared ? undefined : tab.recoveryOriginalId,
          revision: record.revision,
          updatedAt: record.updatedAt,
          ...(viewDecision === 'local' ? {} : { viewUpdatedAt: record.viewUpdatedAt }),
        }
        desiredOpen.push(
          viewDecision === 'remote' ? applyRemoteView(reconciled, record) : reconciled,
        )
        if (viewDecision !== 'local') {
          clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
        }
        if (record.position !== position || viewDecision === 'local') {
          if (viewDecision === 'local') scheduledViewSaveIds.add(tab.id)
          initialTasks.push(async () => {
            const saved = await this.persistCurrentOpenTab(tab.id, tab, position)
            if (saved && viewDecision === 'local') await this.persistViewState(tab.id)
          })
        }
        return
      }
      if (
        tab.revision === undefined ||
        tab.revision !== record.revision ||
        record.status !== 'open'
      ) {
        desiredOpen.push({ ...tab, syncConflict: true })
        this.conflicts.set(tab.id, record)
        return
      }
      desiredOpen.push({ ...tab, revision: record.revision })
      initialTasks.push(async () => {
        await this.persistCurrentOpenTab(tab.id, tab, position)
      })
    })

    local.recentlyClosedTabs.forEach((tab) => {
      const record = remoteById.get(tab.id)
      if (seen.has(tab.id)) return
      seen.add(tab.id)
      if (tab.syncConflict) {
        this.rememberRecoveryConflict(tab)
        this.consumeInitialTabIntent(tab.id)
        const recordMatches = record?.status === 'closed' && sameContent(tab, record)
        desiredClosed.push({
          ...tab,
          ...(record ? { revision: record.revision } : {}),
          ...(recordMatches ? { updatedAt: record.updatedAt } : {}),
        })
        this.conflicts.set(tab.id, record ?? null)
        return
      }
      const touchedDuringInitialLoad = baseRecords === undefined && this.hasInitialTabIntent(tab.id)
      const hasInitialContentIntent =
        touchedDuringInitialLoad &&
        (this.hasInitialContentIntent(tab.id) || hasProtectedLocalIntent(tab))
      if (touchedDuringInitialLoad && record?.status === 'closed' && sameContent(tab, record)) {
        this.consumeInitialTabIntent(tab.id)
      } else if (touchedDuringInitialLoad && !hasInitialContentIntent) {
        this.consumeInitialTabIntent(tab.id)
        if (!record) {
          if (tab.revision !== undefined) {
            desiredClosed.push({ ...tab, syncConflict: true })
            this.conflicts.set(tab.id, null)
            return
          }
          desiredClosed.push(tab)
          initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
          return
        }
        if (record.status === 'open') desiredOpen.push(recordToTab(record))
        else desiredClosed.push(recordToTab(record))
        clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
        return
      } else if (touchedDuringInitialLoad) {
        this.consumeInitialTabIntent(tab.id)
        const canPersistAtKnownRevision =
          (!record && tab.revision === undefined) ||
          (record !== undefined && tab.revision !== undefined && tab.revision === record.revision)
        if (!canPersistAtKnownRevision) {
          desiredClosed.push({ ...tab, syncConflict: true })
          this.conflicts.set(tab.id, record ?? null)
          return
        }
        desiredClosed.push(record ? { ...tab, revision: record.revision } : tab)
        initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
        return
      }
      if (preferRemoteSnapshot && shouldPreferUpgradeRemote(tab, record)) {
        if (record?.status === 'open') desiredOpen.push(recordToTab(record))
        else if (record?.status === 'closed') desiredClosed.push(recordToTab(record))
        return
      }
      const reloadDecision = decideReloadMerge(tab, 'closed', record, baseRecords)
      if (reloadDecision === 'conflict') {
        desiredClosed.push({
          ...tab,
          syncConflict: true,
          ...(record ? { revision: record.revision } : {}),
        })
        this.conflicts.set(tab.id, record ?? null)
        return
      }
      if (reloadDecision === 'accept-remote-deletion') return
      if (reloadDecision === 'accept-remote' && record) {
        if (record.status === 'open') desiredOpen.push(recordToTab(record))
        else desiredClosed.push(recordToTab(record))
        return
      }
      if (reloadDecision === 'persist-local' && record) {
        desiredClosed.push({ ...tab, revision: record.revision })
        initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
        return
      }
      if (!record) {
        desiredClosed.push(tab)
        initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
        return
      }
      if (record.status === 'closed' && sameContent(tab, record)) {
        const recoveryCleared = this.clearRecoveryForTab(tab)
        desiredClosed.push({
          ...tab,
          syncConflict: undefined,
          localOnly: recoveryCleared ? undefined : tab.localOnly,
          recoverySourceKeys: recoveryCleared ? undefined : tab.recoverySourceKeys,
          recoveryOriginalId: recoveryCleared ? undefined : tab.recoveryOriginalId,
          revision: record.revision,
          updatedAt: record.updatedAt,
        })
        return
      }
      if (
        tab.revision === undefined ||
        tab.revision !== record.revision ||
        record.status !== 'closed'
      ) {
        desiredClosed.push({ ...tab, syncConflict: true })
        this.conflicts.set(tab.id, record)
        return
      }
      desiredClosed.push({ ...tab, revision: record.revision })
      initialTasks.push(() => this.persistCurrentClosedTab(tab.id, tab))
    })

    for (const record of remote.tabs) {
      if (!seen.has(record.id)) desiredOpen.push(recordToTab(record))
    }
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

    const pendingViews = applyPendingEditorViewRecovery(desiredOpen, desiredClosed)
    const reconcileView = (tab: EditorTab, status: 'open' | 'closed'): EditorTab => {
      const record = remoteById.get(tab.id)
      if (!record || record.status !== status) return tab
      const decision = decideEditorViewMerge(tab, record)
      if (decision === 'local') {
        if (
          status === 'open' &&
          !tab.syncConflict &&
          !this.conflicts.has(tab.id) &&
          !scheduledViewSaveIds.has(tab.id)
        ) {
          scheduledViewSaveIds.add(tab.id)
          initialTasks.push(() => this.persistViewState(tab.id))
        }
        return tab
      }
      clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
      return decision === 'remote'
        ? applyRemoteView(tab, record)
        : { ...tab, viewUpdatedAt: record.viewUpdatedAt }
    }
    const reconciledOpen = pendingViews.tabs.map((tab) => reconcileView(tab, 'open'))
    const reconciledClosed = pendingViews.recentlyClosedTabs.map((tab) =>
      reconcileView(tab, 'closed'),
    )

    const preferredActive =
      (this.initialActiveTouched ||
        (!preferRemoteSnapshot && (local.lastPersistedAt !== null || local.dirty))) &&
      reconciledOpen.some((tab) => tab.id === local.activeTabId)
        ? local.activeTabId
        : remote.activeTabId
    this.replaceStoreWorkspace(
      reconciledOpen,
      reconciledClosed,
      preferredActive,
      remoteById.size > 0,
    )

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
    const viewRecovered = applyPendingEditorViewRecovery(
      [...remote.tabs.map(recordToTab), ...recovered],
      remote.recentlyClosedTabs.map(recordToTab),
    )
    this.replaceStoreWorkspace(
      viewRecovered.tabs,
      viewRecovered.recentlyClosedTabs,
      remote.activeTabId,
      remoteSources.length > 0,
    )
    flushPersistTabs()
    return recovered
  }

  private replaceStoreWorkspace(
    tabs: EditorTab[],
    recentlyClosedTabs: EditorTab[],
    activeTabId: string | null,
    loadedDatabaseWorkspace = false,
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
    const databaseAssistedDegradedRestore =
      currentState.restoreStatus === 'degraded' && loadedDatabaseWorkspace
    this.withSuppressedObserver(() => {
      useEditorStore.setState({
        tabs,
        activeTabId: nextActive,
        recentlyClosedTabs: recentlyClosedTabs.slice(0, 10),
        hydrated: true,
        dirty: false,
        persistenceError: null,
        ...(databaseAssistedDegradedRestore
          ? {
              restoreStatus: 'degraded' as const,
              restoreMessage: databaseAssistedDegradedRestoreMessage(currentState.restoreMessage),
            }
          : {}),
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
      if (before) this.rememberRecoveryConflict(before)
      if (!current || !before || changedLocation) this.initialTopologyTouchedTabIds.add(id)
      if (!current || !before || !samePersistedContent(current, before)) {
        this.initialContentTouchedTabIds.add(id)
      }
      if (current && before && !sameViewState(current, before)) {
        this.initialViewTouchedTabIds.add(id)
      }
    }
    if (state.activeTabId !== previous.activeTabId) this.initialActiveTouched = true
  }

  private scheduleBufferedInitialChanges(): void {
    const state = useEditorStore.getState()
    const touchedIds = new Set([
      ...this.initialContentTouchedTabIds,
      ...this.initialViewTouchedTabIds,
      ...this.initialTopologyTouchedTabIds,
    ])
    for (const id of touchedIds) {
      const openTab = state.tabs.find((tab) => tab.id === id)
      if (openTab) {
        if (this.hasInitialContentIntent(id)) this.scheduleContentSave(id)
        if (this.hasInitialViewIntent(id)) this.scheduleViewSave(id)
        continue
      }
      const closedTab = state.recentlyClosedTabs.find((tab) => tab.id === id)
      if (closedTab && this.hasInitialContentIntent(id)) {
        this.scheduleClose(closedTab, this.records.get(id)?.position ?? 0)
      }
    }
    if (this.initialActiveTouched) this.scheduleActiveTab(state.activeTabId)
    this.initialContentTouchedTabIds.clear()
    this.initialViewTouchedTabIds.clear()
    this.initialTopologyTouchedTabIds.clear()
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
    const count = (this.contentPersistCounts.get(tab.id) ?? 0) + 1
    this.contentPersistCounts.set(tab.id, count)
    try {
      return await this.persistOpenTabMutation(tab, position, allowConflict)
    } finally {
      const remaining = Math.max(0, (this.contentPersistCounts.get(tab.id) ?? 1) - 1)
      if (remaining === 0) this.contentPersistCounts.delete(tab.id)
      else this.contentPersistCounts.set(tab.id, remaining)
      this.markSyncedIfIdle()
    }
  }

  private async persistOpenTabMutation(
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
      if (
        result.current?.status === 'open' &&
        sameContent(persistedTab, result.current) &&
        result.current.position === position
      ) {
        this.clearFailure(`content:${persistedTab.id}`)
        this.clearRecoveryForTab(persistedTab)
        this.acceptGeneration(result.generation)
        this.acceptRecord(result.current)
        this.applyRecordMetadata(result.current)
        this.markSyncedIfIdle()
        return true
      }
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
    const viewRecoveryExpectation = captureEditorTabViewRecovery(id)
    const viewMutationEpoch = this.viewMutationEpochs.get(id) ?? 0
    const result = await this.invokeIdempotentMutation('view', id, payload, (mutationId) =>
      this.dependencies.updateViewState({ ...payload, mutationId }),
    )
    if ((this.viewMutationEpochs.get(id) ?? 0) !== viewMutationEpoch) {
      this.markSyncedIfIdle()
      return
    }
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
    const latest = useEditorStore.getState().tabs.find((item) => item.id === id)
    if (latest && sameViewState(latest, payload) && sameViewState(result.viewState, payload)) {
      clearEditorTabViewRecovery(viewRecoveryExpectation)
    }
    this.markSyncedIfIdle()
  }

  private async persistActiveTab(activeTabId: string | null): Promise<void> {
    const result = await this.dependencies.setActive(activeTabId, DEFAULT_EDITOR_WORKSPACE_ID)
    this.clearFailure('active-tab')
    this.acceptGeneration(result.generation)
    this.markSyncedIfIdle()
  }

  private queueIntent(failureKey: string): EditorTabQueueIntent {
    if (failureKey.startsWith('view:')) return 'view'
    if (failureKey.startsWith('close:')) return 'topology'
    return 'content'
  }

  private incrementQueuedMutation(id: string, intent: EditorTabQueueIntent): void {
    const counts = this.queuedMutationCounts.get(id) ?? { content: 0, view: 0, topology: 0 }
    counts[intent] += 1
    this.queuedMutationCounts.set(id, counts)
  }

  private decrementQueuedMutation(id: string, intent: EditorTabQueueIntent): void {
    const counts = this.queuedMutationCounts.get(id)
    if (!counts) return
    counts[intent] = Math.max(0, counts[intent] - 1)
    if (counts.content === 0 && counts.view === 0 && counts.topology === 0) {
      this.queuedMutationCounts.delete(id)
    }
  }

  private hasPendingContentMutation(id: string): boolean {
    const counts = this.queuedMutationCounts.get(id)
    return (
      this.contentTimers.has(id) ||
      (this.contentPersistCounts.get(id) ?? 0) > 0 ||
      Boolean(counts && (counts.content > 0 || counts.topology > 0))
    )
  }

  private hasPendingViewMutation(id: string): boolean {
    const counts = this.queuedMutationCounts.get(id)
    return this.viewTimers.has(id) || Boolean(counts && counts.view > 0)
  }

  private invalidatePendingViewMutation(id: string): void {
    this.viewMutationEpochs.set(id, (this.viewMutationEpochs.get(id) ?? 0) + 1)
  }

  private enqueue(id: string, failureKey: string, task: () => Promise<void>): Promise<void> {
    const intent = this.queueIntent(failureKey)
    this.incrementQueuedMutation(id, intent)
    const previous = this.queues.get(id) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(task)
      .catch((error) => this.markFailure(error, failureKey))
    this.queues.set(id, next)
    void next.finally(() => {
      this.decrementQueuedMutation(id, intent)
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
    this.recoveryConflictSnapshots.delete(id)
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
      this.contentPersistCounts.size > 0 ||
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
    const applyMetadata = (tab: EditorTab): EditorTab => {
      if (tab.id !== record.id) return tab
      const preserveRecoveryProvenance =
        hasUnresolvedRecoveryConflict(tab) || Boolean(tab.recoverySourceKeys?.length)
      return {
        ...tab,
        revision: record.revision,
        updatedAt: record.updatedAt,
        viewUpdatedAt: record.viewUpdatedAt,
        localOnly: preserveRecoveryProvenance ? tab.localOnly : undefined,
        recoverySourceKeys: preserveRecoveryProvenance ? tab.recoverySourceKeys : undefined,
        recoveryOriginalId: preserveRecoveryProvenance ? tab.recoveryOriginalId : undefined,
      }
    }
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => ({
        tabs: state.tabs.map(applyMetadata),
        recentlyClosedTabs: state.recentlyClosedTabs.map(applyMetadata),
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
    if (event.kind === 'view-state') {
      if (this.conflicts.has(id) || this.hasFailureForTab(id)) return
      const record = this.records.get(id)
      if (!record) return
      const updated: EditorTabRecord = {
        ...record,
        cursorPosition: event.viewState.cursorPosition,
        scrollTop: event.viewState.scrollTop,
        viewUpdatedAt: event.viewState.viewUpdatedAt,
      }
      this.acceptRecord(updated)
      if (this.viewTimers.has(id) || this.queues.has(id)) {
        this.markSyncedIfIdle()
        return
      }
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
      this.markSyncedIfIdle()
      return
    }
    const currentState = useEditorStore.getState()
    const currentOpenTab = currentState.tabs.find((tab) => tab.id === id)
    const currentPosition = currentState.tabs.findIndex((tab) => tab.id === id)
    const hasPendingContentMutation = this.hasPendingContentMutation(id)
    const hasPendingViewMutation = this.hasPendingViewMutation(id)
    const matchingPendingRemoteSave =
      hasPendingContentMutation &&
      !this.conflicts.has(id) &&
      !this.hasFailureForTab(id) &&
      (event.kind === 'saved' || event.kind === 'reopened') &&
      eventTab?.status === 'open' &&
      currentOpenTab !== undefined &&
      sameContent(currentOpenTab, eventTab) &&
      eventTab.position === currentPosition
    if (matchingPendingRemoteSave) {
      const pendingContent = this.contentTimers.get(id)
      if (pendingContent) clearTimeout(pendingContent)
      this.contentTimers.delete(id)
      this.clearRecoveryForTab(currentOpenTab)
      this.clearFailure(`content:${id}`)
      this.acceptRecord(eventTab)
      this.applyRecordMetadata(eventTab)
      flushPersistTabs()
      this.markSyncedIfIdle()
      return
    }
    const canApplyRemoteAlongsidePendingView =
      !hasPendingContentMutation &&
      hasPendingViewMutation &&
      !this.conflicts.has(id) &&
      !this.hasFailureForTab(id) &&
      (event.kind === 'saved' || event.kind === 'reopened') &&
      eventTab?.status === 'open' &&
      currentOpenTab !== undefined &&
      !hasProtectedLocalIntent(currentOpenTab)
    if (canApplyRemoteAlongsidePendingView) {
      const recoveryCleared = this.clearRecoveryForTab(currentOpenTab)
      this.acceptRecord(eventTab)
      this.withSuppressedObserver(() => {
        useEditorStore.setState((state) => {
          const withoutOpen = state.tabs.filter((tab) => tab.id !== id)
          const withoutClosed = state.recentlyClosedTabs.filter((tab) => tab.id !== id)
          const tabs = [...withoutOpen]
          const position = Math.min(Math.max(0, eventTab.position), tabs.length)
          tabs.splice(position, 0, {
            ...recordToTab(eventTab),
            cursorPosition: currentOpenTab.cursorPosition,
            scrollTop: currentOpenTab.scrollTop,
            viewUpdatedAt: currentOpenTab.viewUpdatedAt,
            localOnly: recoveryCleared ? undefined : currentOpenTab.localOnly,
            recoverySourceKeys: recoveryCleared ? undefined : currentOpenTab.recoverySourceKeys,
            recoveryOriginalId: recoveryCleared ? undefined : currentOpenTab.recoveryOriginalId,
          })
          return {
            tabs,
            recentlyClosedTabs: withoutClosed,
            activeTabId: state.activeTabId ?? eventTab.id,
            hydrationEpoch:
              state.activeTabId === id &&
              !isDraftBackedPracticeTab(eventTab) &&
              !sameContent(currentOpenTab, eventTab)
                ? state.hydrationEpoch + 1
                : state.hydrationEpoch,
          }
        })
      })
      flushPersistTabs()
      this.markSyncedIfIdle()
      return
    }
    const canApplyRemoteTopologyAlongsidePendingView =
      !hasPendingContentMutation &&
      hasPendingViewMutation &&
      !this.conflicts.has(id) &&
      !this.hasFailureForTab(id) &&
      (event.kind === 'closed' || event.kind === 'deleted') &&
      eventTab !== null &&
      currentOpenTab !== undefined &&
      !hasProtectedLocalIntent(currentOpenTab)
    if (canApplyRemoteTopologyAlongsidePendingView) {
      this.invalidatePendingViewMutation(id)
      this.cancelTabTimers(id)
    }
    if (
      this.hasPendingContentMutation(id) ||
      (this.hasPendingViewMutation(id) && !canApplyRemoteTopologyAlongsidePendingView) ||
      this.conflicts.has(id) ||
      this.hasFailureForTab(id)
    ) {
      this.markConflict(id, eventTab)
      return
    }

    if (!eventTab) return
    this.acceptRecord(eventTab)
    this.withSuppressedObserver(() => {
      useEditorStore.setState((state) => {
        const withoutOpen = state.tabs.filter((tab) => tab.id !== id)
        const withoutClosed = state.recentlyClosedTabs.filter((tab) => tab.id !== id)
        if (event.kind === 'saved' || event.kind === 'reopened') {
          const tabs = [...withoutOpen]
          const position = Math.min(Math.max(0, eventTab.position), tabs.length)
          tabs.splice(position, 0, recordToTab(eventTab))
          return {
            tabs,
            recentlyClosedTabs: withoutClosed,
            activeTabId: state.activeTabId ?? event.tab.id,
            hydrationEpoch:
              state.activeTabId === id && !isDraftBackedPracticeTab(eventTab)
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
              state.activeTabId === id && !isDraftBackedPracticeTab(eventTab)
                ? state.hydrationEpoch + 1
                : state.hydrationEpoch,
          }
        }
        return {
          tabs: withoutOpen,
          recentlyClosedTabs: withoutClosed,
          activeTabId: state.activeTabId === id ? (withoutOpen[0]?.id ?? null) : state.activeTabId,
          hydrationEpoch:
            state.activeTabId === id && !isDraftBackedPracticeTab(eventTab)
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
        const baseRecords = new Map(this.records)
        const remote = await this.dependencies.load(DEFAULT_EDITOR_WORKSPACE_ID)
        if (this.stopped) return
        this.reconciling = true
        this.replaceRemote(remote)
        await this.reconcileInitialWorkspace(remote, baseRecords)
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
    const localState = useEditorStore.getState()
    const local =
      localState.tabs.find((tab) => tab.id === id) ??
      localState.recentlyClosedTabs.find((tab) => tab.id === id)
    if (local) this.rememberRecoveryConflict(local)
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
          tab.id === id
            ? {
                ...tab,
                syncConflict: undefined,
                localOnly: undefined,
                recoverySourceKeys: undefined,
                recoveryOriginalId: undefined,
              }
            : tab,
        ),
        recentlyClosedTabs: state.recentlyClosedTabs.map((tab) =>
          tab.id === id
            ? {
                ...tab,
                syncConflict: undefined,
                localOnly: undefined,
                recoverySourceKeys: undefined,
                recoveryOriginalId: undefined,
              }
            : tab,
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

  private markRecoveryCleanupFailure(id: string): void {
    this.markFailure(
      new Error('冲突版本已安全保留，但恢复来源清理失败；冲突仍未解决，请重试'),
      `recovery-cleanup:${id}`,
    )
  }

  private clearRecoveryForTab(tab: EditorTab, resolvingConflict = false): boolean {
    const state = useEditorStore.getState()
    const current =
      state.tabs.find((item) => item.id === tab.id) ??
      state.recentlyClosedTabs.find((item) => item.id === tab.id)
    if (current && !samePersistedContent(current, tab)) return false
    const recoveryTab = current ?? tab
    if (!resolvingConflict && hasUnresolvedRecoveryConflict(recoveryTab)) return false
    const recoveryConflictSnapshot = resolvingConflict
      ? this.recoveryConflictSnapshots.get(recoveryTab.id)
      : undefined
    const expectedTab = resolvingConflict ? { ...recoveryTab, revision: undefined } : recoveryTab
    let recoveryCleared = true
    if (resolvingConflict) {
      recoveryCleared = clearEditorTabRecovery(recoveryTab.id, [], expectedTab) && recoveryCleared
      const expectedSourceTab = {
        ...(recoveryConflictSnapshot ?? recoveryTab),
        revision: undefined,
      }
      recoveryCleared =
        clearEditorTabRecovery(recoveryTab.id, recoveryTab.recoverySourceKeys, expectedSourceTab) &&
        recoveryCleared
      if (recoveryTab.recoveryOriginalId && recoveryTab.recoveryOriginalId !== recoveryTab.id) {
        recoveryCleared =
          clearEditorTabRecovery(
            recoveryTab.recoveryOriginalId,
            recoveryTab.recoverySourceKeys,
            expectedSourceTab,
          ) && recoveryCleared
      }
      if (recoveryCleared) this.recoveryConflictSnapshots.delete(recoveryTab.id)
    } else {
      recoveryCleared = clearEditorTabRecovery(
        recoveryTab.id,
        recoveryTab.recoverySourceKeys,
        expectedTab,
      )
    }
    const record = this.records.get(tab.id)
    if (
      current &&
      record &&
      samePersistedContent(current, record) &&
      sameViewState(current, record)
    ) {
      clearEditorTabViewRecovery(captureEditorTabViewRecovery(tab.id))
    }
    if (
      !resolvingConflict &&
      recoveryTab.recoveryOriginalId &&
      recoveryTab.recoveryOriginalId !== recoveryTab.id
    ) {
      recoveryCleared =
        clearEditorTabRecovery(
          recoveryTab.recoveryOriginalId,
          recoveryTab.recoverySourceKeys,
          expectedTab,
        ) && recoveryCleared
    }
    if (!resolvingConflict) {
      const failureKey = `recovery-cleanup:${recoveryTab.id}`
      if (recoveryCleared) {
        this.recoveryConflictSnapshots.delete(recoveryTab.id)
        this.clearFailure(failureKey)
        this.withSuppressedObserver(() => {
          const clearProvenance = (item: EditorTab): EditorTab =>
            item.id === recoveryTab.id
              ? {
                  ...item,
                  localOnly: undefined,
                  recoverySourceKeys: undefined,
                  recoveryOriginalId: undefined,
                }
              : item
          useEditorStore.setState((latest) => ({
            tabs: latest.tabs.map(clearProvenance),
            recentlyClosedTabs: latest.recentlyClosedTabs.map(clearProvenance),
          }))
        })
      } else {
        this.markFailure(
          new Error('SQLite 内容已保存，但本地恢复来源清理失败；恢复记录已保留并将继续重试'),
          failureKey,
        )
      }
    }
    return recoveryCleared
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
    const kindLabel = kind.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 32) || 'mutation'
    const idHash = stableEditorWorkspaceHash(id)
    return `${this.clientId.slice(0, 96)}:${kindLabel}:${idHash}:${this.mutationSequence}`.slice(
      0,
      200,
    )
  }
}

let singleton: EditorWorkspaceSynchronizer | null = null

export function ensureEditorWorkspaceSync(): Promise<void> {
  singleton ??= new EditorWorkspaceSynchronizer()
  return singleton.start()
}

export async function flushEditorWorkspaceForClose(): Promise<EditorWorkspaceCloseFlushResult> {
  const state = useEditorStore.getState()
  if (!state.hydrated && !state.dirty && !singleton) {
    return { durability: 'database', error: null }
  }
  flushPersistTabs()
  const afterRecovery = useEditorStore.getState()
  const localRecoveryReady = afterRecovery.persistenceError === null
  const databaseReady = singleton ? await singleton.flush() : false
  if (databaseReady) return { durability: 'database', error: null }
  const afterDatabase = useEditorStore.getState()
  if (localRecoveryReady) {
    return {
      durability: 'recovery',
      error: afterDatabase.databaseError ?? 'SQLite 同步未完成，最新内容仅保存在本地恢复区',
    }
  }
  return {
    durability: 'none',
    error:
      afterDatabase.persistenceError ??
      afterDatabase.databaseError ??
      '编辑器工作区未能写入 SQLite 或本地恢复区',
  }
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
