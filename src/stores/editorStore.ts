import { create } from 'zustand'
import { normalizeEditorCursorPosition, type EditorCursorPosition } from '@/utils/editorViewState'

export type EditorTabKind = 'file' | 'problem' | 'exercise'

export type EditorTab = {
  id: string
  filename: string
  language: string
  content: string
  kind: EditorTabKind
  problemId?: string
  cursorPosition?: EditorCursorPosition
  scrollTop?: number
  revision?: number
  updatedAt?: string
  viewUpdatedAt?: string
  syncConflict?: boolean
  localOnly?: boolean
  recoverySourceKeys?: string[]
  recoveryOriginalId?: string
}

export type EditorDatabaseStatus = 'idle' | 'syncing' | 'synced' | 'degraded' | 'conflict'
export type EditorRestoreStatus = 'idle' | 'empty' | 'restored' | 'recovered' | 'degraded'

export const EDITOR_STORAGE_KEY = 'codehelper-editor-workspace'
export const LEGACY_EDITOR_STORAGE_KEY = 'codehelper-editor-tabs'
export const EDITOR_RECOVERY_KEY = 'codehelper-editor-workspace-recovery-v2'
export const EDITOR_RECOVERY_KEY_PREFIX = `${EDITOR_RECOVERY_KEY}.session.`
export const LEGACY_EDITOR_RECOVERY_KEY = 'codehelper-editor-workspace-recovery-v1'
export const EDITOR_STORAGE_VERSION = 3

const PERSIST_DELAY_MS = 500
export const MAX_EDITOR_TABS = 50
const MAX_RECENTLY_CLOSED_TABS = 10
const MAX_FILENAME_LENGTH = 255
const MAX_CONTENT_LENGTH = 5_000_000
const EDITOR_RECOVERY_STORAGE_VERSION = 3

const editorRecoverySessionId =
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
const editorRecoverySessionKey = `${EDITOR_RECOVERY_KEY_PREFIX}${editorRecoverySessionId}`

export type EditorWorkspaceSnapshot = {
  version: number
  tabs: EditorTab[]
  activeTabId: string | null
  recentlyClosedTabs: EditorTab[]
  updatedAt: number
}

type LoadedEditorWorkspaceSnapshot = EditorWorkspaceSnapshot & { recovered: boolean }

type EditorSnapshotReadResult = {
  snapshot: LoadedEditorWorkspaceSnapshot | null
  warning: string | null
}

type EditorRecoveryEntry = {
  tab: EditorTab
  activeTabId: string | null
  updatedAt: number
  sourceKey?: string
}

type EditorRecoverySnapshot = {
  version: 2 | 3
  entries: Record<string, EditorRecoveryEntry>
}

type LegacyEditorRecoverySnapshot = EditorRecoveryEntry & { version: 1 }

export type EditorStore = {
  tabs: EditorTab[]
  activeTabId: string | null
  cursorPosition: { line: number; column: number } | null
  scrollTop: number
  addTab: (tab: EditorTab) => void
  closeTab: (id: string) => void
  reopenTab: (id: string) => boolean
  setActiveTab: (id: string | null) => void
  updateTab: (id: string, patch: Partial<EditorTab>) => void
  updateContent: (id: string, content: string) => void
  setCursorPosition: (position: { line: number; column: number } | null) => void
  setScrollTop: (scrollTop: number) => void
  updateCursorPosition: (id: string, lineNumber: number, column: number) => void
  updateScrollTop: (id: string, scrollTop: number) => void
  restoreTabs: (tabs?: EditorTab[], activeTabId?: string | null) => void
  hydrated: boolean
  dirty: boolean
  persistenceError: string | null
  lastPersistedAt: number | null
  recentlyClosedTabs: EditorTab[]
  reopenLastClosed: () => void
  databaseStatus: EditorDatabaseStatus
  databaseError: string | null
  hydrationEpoch: number
  restoreStatus: EditorRestoreStatus
  restoreMessage: string | null
}

export const WELCOME_TAB_CONTENT = '# Welcome\nprint("hello")\n'

const welcomeTab: EditorTab = {
  id: 'welcome',
  filename: 'welcome.py',
  language: 'python',
  content: WELCOME_TAB_CONTENT,
  kind: 'file',
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
const protectedStorageKeys = new Set<string>()

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function normalizeEditorTabKind(value: unknown, problemId?: unknown): EditorTabKind {
  if (value === 'problem' || value === 'exercise') return value
  return typeof problemId === 'string' && problemId.trim() ? 'problem' : 'file'
}

function stableEditorIdHash(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`
}

export function exerciseTabId(exerciseId: string): string {
  const normalized = exerciseId.trim()
  const readable = normalized.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const label = readable.slice(0, 120) || 'unknown'
  return `exercise-${label}-${stableEditorIdHash(normalized)}`.slice(0, 200)
}

function parseTab(value: unknown): EditorTab | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<EditorTab>
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (typeof raw.filename !== 'string' || typeof raw.language !== 'string') return null
  if (typeof raw.content !== 'string' || raw.content.length > MAX_CONTENT_LENGTH) return null
  const cursorPosition = normalizeEditorCursorPosition(raw.cursorPosition)
  return {
    id: raw.id.trim().slice(0, 200),
    filename: raw.filename.slice(0, MAX_FILENAME_LENGTH),
    language: raw.language.slice(0, 40),
    content: raw.content,
    kind: normalizeEditorTabKind(raw.kind, raw.problemId),
    ...(typeof raw.problemId === 'string' ? { problemId: raw.problemId.slice(0, 200) } : {}),
    ...(cursorPosition ? { cursorPosition } : {}),
    ...(typeof raw.scrollTop === 'number' && Number.isFinite(raw.scrollTop)
      ? { scrollTop: Math.max(0, raw.scrollTop) }
      : {}),
    ...(Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 1
      ? { revision: Number(raw.revision) }
      : {}),
    ...(typeof raw.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {}),
    ...(typeof raw.viewUpdatedAt === 'string' ? { viewUpdatedAt: raw.viewUpdatedAt } : {}),
    ...(raw.syncConflict === true ? { syncConflict: true } : {}),
    ...(raw.localOnly === true ? { localOnly: true } : {}),
    ...(Array.isArray(raw.recoverySourceKeys)
      ? {
          recoverySourceKeys: raw.recoverySourceKeys
            .filter(
              (key): key is string =>
                typeof key === 'string' &&
                (key === EDITOR_RECOVERY_KEY || key.startsWith(EDITOR_RECOVERY_KEY_PREFIX)),
            )
            .slice(0, 20),
        }
      : {}),
    ...(typeof raw.recoveryOriginalId === 'string' && raw.recoveryOriginalId.trim()
      ? { recoveryOriginalId: raw.recoveryOriginalId.slice(0, 200) }
      : {}),
  }
}

function canonicalizeTab(tab: EditorTab): EditorTab {
  return tab.kind === 'exercise' && tab.content ? { ...tab, content: '' } : tab
}

function normalizeTab(value: unknown): EditorTab | null {
  const parsed = parseTab(value)
  return parsed ? canonicalizeTab(parsed) : null
}

function recoveredExerciseFilename(filename: string): string {
  const normalized = filename.trim() || 'exercise.txt'
  const extensionIndex = normalized.lastIndexOf('.')
  const extension = extensionIndex > 0 ? normalized.slice(extensionIndex) : ''
  const stem = extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized
  const suffix = `.recovered${extension}`
  return `${stem.slice(0, Math.max(1, MAX_FILENAME_LENGTH - suffix.length))}${suffix}`
}

function recoveredExerciseTab(tab: EditorTab): EditorTab | null {
  if (tab.kind !== 'exercise' || !tab.content) return null
  const source = tab.problemId?.trim() || tab.id
  const label = source
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  const fingerprint = stableEditorIdHash(
    [tab.id, tab.problemId ?? '', tab.filename, tab.language, tab.content].join('\u0000'),
  )
  return {
    id: `recovered-exercise-${label || 'unknown'}-${fingerprint}`.slice(0, 200),
    filename: recoveredExerciseFilename(tab.filename),
    language: tab.language,
    content: tab.content,
    kind: 'file',
    ...(tab.cursorPosition ? { cursorPosition: tab.cursorPosition } : {}),
    ...(typeof tab.scrollTop === 'number' ? { scrollTop: tab.scrollTop } : {}),
    ...(tab.updatedAt ? { updatedAt: tab.updatedAt } : {}),
    ...(tab.viewUpdatedAt ? { viewUpdatedAt: tab.viewUpdatedAt } : {}),
    localOnly: true,
    recoveryOriginalId: tab.id,
    ...(tab.recoverySourceKeys ? { recoverySourceKeys: tab.recoverySourceKeys } : {}),
  }
}

interface NormalizedPersistedTabs {
  tabs: EditorTab[]
  recoveredFiles: EditorTab[]
  invalid: boolean
  migrated: boolean
}

function normalizePersistedTabs(
  value: unknown,
  maxTabs = MAX_EDITOR_TABS,
): NormalizedPersistedTabs {
  if (!Array.isArray(value)) return { tabs: [], recoveredFiles: [], invalid: true, migrated: false }
  const seen = new Set<string>()
  const recoveredSeen = new Set<string>()
  const tabs: EditorTab[] = []
  const recoveredFiles: EditorTab[] = []
  let invalid = false
  let migrated = false
  for (const item of value) {
    const parsed = parseTab(item)
    if (!parsed) {
      invalid = true
      continue
    }
    const tab = canonicalizeTab(parsed)
    if (seen.has(tab.id) || tabs.length >= maxTabs) invalid = true
    else {
      seen.add(tab.id)
      tabs.push(tab)
    }
    const recovered = recoveredExerciseTab(parsed)
    if (!recovered) continue
    migrated = true
    if (seen.has(recovered.id) || recoveredSeen.has(recovered.id)) continue
    recoveredSeen.add(recovered.id)
    recoveredFiles.push(recovered)
  }
  return { tabs, recoveredFiles, invalid, migrated }
}

function appendRecoveredFiles(
  tabs: EditorTab[],
  recoveredFiles: EditorTab[],
  maxTabs = MAX_EDITOR_TABS,
): EditorTab[] {
  const result = [...tabs]
  const seen = new Set(result.map((tab) => tab.id))
  for (const recovered of recoveredFiles) {
    if (seen.has(recovered.id) || result.length >= maxTabs) continue
    seen.add(recovered.id)
    result.push(recovered)
  }
  return result
}

function normalizeTabs(value: unknown, maxTabs = MAX_EDITOR_TABS): EditorTab[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tabs: EditorTab[] = []
  for (const item of value) {
    const tab = normalizeTab(item)
    if (!tab || seen.has(tab.id)) continue
    seen.add(tab.id)
    tabs.push(tab)
    if (tabs.length >= maxTabs) break
  }
  return tabs
}

function backupCorruptStorage(key: string, raw: string): boolean {
  const backupKey = `${key}.corrupt.${Date.now()}`
  try {
    window.localStorage.setItem(backupKey, raw)
    protectedStorageKeys.delete(key)
    return true
  } catch {
    protectedStorageKeys.add(key)
    try {
      window.localStorage.setItem(`${backupKey}.partial`, raw.slice(0, 100_000))
    } catch {
      // Best-effort backup only; the editor must still open with a clean tab.
    }
    return false
  }
}

function reportCorruptStorage(warnings: string[], key: string, raw: string, message: string): void {
  warnings.push(
    backupCorruptStorage(key, raw)
      ? `${message}，原始数据已备份`
      : `${message}，完整备份失败；原始存储已锁定以防覆盖`,
  )
}

export function backupEditorWorkspaceSnapshot(): string | null {
  if (!canUseStorage()) return null
  const raw = window.localStorage.getItem(EDITOR_STORAGE_KEY)
  if (!raw) return null
  const backupKey = `${EDITOR_STORAGE_KEY}.migration-backup.${Date.now()}`
  window.localStorage.setItem(backupKey, raw)
  return backupKey
}

function normalizeRecoveryEntries(value: unknown): EditorRecoveryEntry[] {
  if (!value || typeof value !== 'object') return []
  const raw = value as Partial<EditorRecoveryEntry>
  const parsed = parseTab(raw.tab)
  if (!parsed || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return []
  const activeTabId = typeof raw.activeTabId === 'string' ? raw.activeTabId : null
  const entries: EditorRecoveryEntry[] = [
    {
      tab: canonicalizeTab(parsed),
      activeTabId,
      updatedAt: raw.updatedAt,
    },
  ]
  const recovered = recoveredExerciseTab(parsed)
  if (recovered) entries.push({ tab: recovered, activeTabId, updatedAt: raw.updatedAt })
  return entries
}

function recoveryStorageKeys(): string[] {
  if (!canUseStorage()) return []
  const keys = new Set<string>([EDITOR_RECOVERY_KEY, editorRecoverySessionKey])
  const storage = window.localStorage
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(EDITOR_RECOVERY_KEY_PREFIX)) keys.add(key)
    }
  }
  return [...keys]
}

function readRecoveryEntries(
  warnings: string[],
  keys: string[] = recoveryStorageKeys(),
): EditorRecoveryEntry[] {
  if (!canUseStorage()) return []
  const entries = new Map<string, EditorRecoveryEntry>()
  for (const key of keys) {
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Partial<EditorRecoverySnapshot> | null
      if (
        (parsed?.version !== 2 && parsed?.version !== EDITOR_RECOVERY_STORAGE_VERSION) ||
        !parsed.entries ||
        typeof parsed.entries !== 'object'
      ) {
        reportCorruptStorage(warnings, key, raw, '多标签恢复日志格式不受支持')
      } else {
        let invalidEntry = false
        for (const value of Object.values(parsed.entries)) {
          const normalized = normalizeRecoveryEntries(value)
          if (normalized.length === 0) invalidEntry = true
          for (const item of normalized) {
            const entry = { ...item, sourceKey: key }
            const previous = entries.get(entry.tab.id)
            if (!previous || entry.updatedAt > previous.updatedAt) {
              entries.set(entry.tab.id, entry)
            }
          }
        }
        if (invalidEntry) {
          reportCorruptStorage(warnings, key, raw, '多标签恢复日志包含损坏条目')
        }
      }
    } catch {
      reportCorruptStorage(warnings, key, raw, '多标签恢复日志已损坏')
    }
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_EDITOR_RECOVERY_KEY)
  if (!legacyRaw) return [...entries.values()]
  try {
    const parsed = JSON.parse(legacyRaw) as Partial<LegacyEditorRecoverySnapshot> | null
    const normalized = parsed?.version === 1 ? normalizeRecoveryEntries(parsed) : []
    for (const item of normalized) {
      const entry = { ...item, sourceKey: LEGACY_EDITOR_RECOVERY_KEY }
      if (!entries.has(entry.tab.id)) entries.set(entry.tab.id, entry)
    }
    if (normalized.length === 0) {
      reportCorruptStorage(
        warnings,
        LEGACY_EDITOR_RECOVERY_KEY,
        legacyRaw,
        '旧版恢复日志格式不受支持',
      )
    }
  } catch {
    reportCorruptStorage(warnings, LEGACY_EDITOR_RECOVERY_KEY, legacyRaw, '旧版恢复日志已损坏')
  }
  return [...entries.values()]
}

function mergeRecovery(
  snapshot: EditorWorkspaceSnapshot | null,
  recoveries: EditorRecoveryEntry[],
): LoadedEditorWorkspaceSnapshot | null {
  if (recoveries.length === 0) return snapshot ? { ...snapshot, recovered: false } : null
  const tabs = snapshot ? [...snapshot.tabs] : []
  let recentlyClosedTabs = [...(snapshot?.recentlyClosedTabs ?? [])]
  let activeTabId = snapshot?.activeTabId ?? null
  let recovered = false
  for (const recovery of recoveries.sort((left, right) => left.updatedAt - right.updatedAt)) {
    const existingIndex = tabs.findIndex((tab) => tab.id === recovery.tab.id)
    const closedIndex = recentlyClosedTabs.findIndex((tab) => tab.id === recovery.tab.id)
    const durable =
      existingIndex >= 0
        ? tabs[existingIndex]
        : closedIndex >= 0
          ? recentlyClosedTabs[closedIndex]
          : null
    const durableTabUpdatedAt = durable?.updatedAt ? Date.parse(durable.updatedAt) : 0
    const durableUpdatedAt = Math.max(
      snapshot?.updatedAt ?? 0,
      Number.isFinite(durableTabUpdatedAt) ? durableTabUpdatedAt : 0,
    )
    const sameDurableContent =
      durable &&
      durable.filename === recovery.tab.filename &&
      durable.language === recovery.tab.language &&
      durable.content === recovery.tab.content &&
      durable.kind === recovery.tab.kind &&
      (durable.problemId ?? null) === (recovery.tab.problemId ?? null)
    const recoverySourceKeys = recovery.sourceKey ? [recovery.sourceKey] : []
    if (sameDurableContent) {
      const merged = {
        ...durable,
        recoverySourceKeys: [
          ...new Set([...(durable.recoverySourceKeys ?? []), ...recoverySourceKeys]),
        ],
      }
      if (existingIndex >= 0) tabs[existingIndex] = merged
      else if (closedIndex >= 0) recentlyClosedTabs[closedIndex] = merged
      recovered = true
      continue
    }
    if (durableUpdatedAt >= recovery.updatedAt) {
      clearEditorTabRecovery(recovery.tab.id, recoverySourceKeys)
      continue
    }
    const recoveredTab = { ...recovery.tab, recoverySourceKeys }
    if (existingIndex >= 0) tabs[existingIndex] = recoveredTab
    else if (tabs.length < MAX_EDITOR_TABS) tabs.push(recoveredTab)
    else continue
    recentlyClosedTabs = recentlyClosedTabs.filter((tab) => tab.id !== recovery.tab.id)
    if (tabs.some((tab) => tab.id === recovery.activeTabId)) activeTabId = recovery.activeTabId
    else activeTabId = recovery.tab.id
    recovered = true
  }
  if (!recovered) return snapshot ? { ...snapshot, recovered: false } : null
  if (tabs.length === 0) return snapshot ? { ...snapshot, recovered: false } : null
  return {
    version: EDITOR_STORAGE_VERSION,
    tabs,
    activeTabId,
    recentlyClosedTabs,
    updatedAt: snapshot?.updatedAt ?? 0,
    recovered: true,
  }
}

function readSnapshot(): EditorSnapshotReadResult {
  if (!canUseStorage()) return { snapshot: null, warning: null }
  let snapshot: EditorWorkspaceSnapshot | null = null
  let requiresRewrite = false
  const warnings: string[] = []
  const raw = window.localStorage.getItem(EDITOR_STORAGE_KEY)
  try {
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EditorWorkspaceSnapshot>
      const parsedVersion = Number(parsed.version)
      if (parsedVersion === 1 || parsedVersion === 2 || parsedVersion === EDITOR_STORAGE_VERSION) {
        const normalizedOpen = normalizePersistedTabs(parsed.tabs)
        const tabs = appendRecoveredFiles(normalizedOpen.tabs, normalizedOpen.recoveredFiles)
        const hasUsableTabs =
          Array.isArray(parsed.tabs) && (parsed.tabs.length === 0 || tabs.length > 0)
        if (!hasUsableTabs) {
          reportCorruptStorage(warnings, EDITOR_STORAGE_KEY, raw, '工作区快照没有可恢复的有效标签')
        } else {
          if (normalizedOpen.invalid) {
            reportCorruptStorage(
              warnings,
              EDITOR_STORAGE_KEY,
              raw,
              '工作区快照包含重复、超限或损坏标签',
            )
          }
          const supportsRecentlyClosed = parsedVersion >= 2
          const normalizedClosed = supportsRecentlyClosed
            ? normalizePersistedTabs(parsed.recentlyClosedTabs, 10)
            : { tabs: [], recoveredFiles: [], invalid: false, migrated: false }
          const recentlyClosedTabs = appendRecoveredFiles(
            normalizedClosed.tabs,
            normalizedClosed.recoveredFiles,
            10,
          )
          if (
            supportsRecentlyClosed &&
            Array.isArray(parsed.recentlyClosedTabs) &&
            normalizedClosed.invalid
          ) {
            reportCorruptStorage(
              warnings,
              EDITOR_STORAGE_KEY,
              raw,
              '最近关闭列表包含重复、超限或损坏标签',
            )
          }
          const migratedExerciseContent = normalizedOpen.migrated || normalizedClosed.migrated
          if (migratedExerciseContent) {
            try {
              backupEditorWorkspaceSnapshot()
              warnings.push('旧版练习标签代码已备份，并作为普通恢复文件保留')
            } catch {
              protectedStorageKeys.add(EDITOR_STORAGE_KEY)
              warnings.push(
                '旧版练习标签代码已作为恢复文件打开；原始快照备份失败，已停止覆盖原数据',
              )
            }
          }
          requiresRewrite =
            parsedVersion !== EDITOR_STORAGE_VERSION ||
            normalizedOpen.invalid ||
            normalizedClosed.invalid ||
            migratedExerciseContent ||
            parsed.tabs.some(
              (tab) =>
                !tab ||
                typeof tab !== 'object' ||
                !['file', 'problem', 'exercise'].includes(
                  String((tab as Partial<EditorTab>).kind ?? ''),
                ),
            )
          const activeTabId =
            typeof parsed.activeTabId === 'string' &&
            tabs.some((tab) => tab.id === parsed.activeTabId)
              ? parsed.activeTabId
              : (tabs[0]?.id ?? null)
          snapshot = {
            version: EDITOR_STORAGE_VERSION,
            tabs,
            activeTabId,
            recentlyClosedTabs,
            updatedAt:
              parsedVersion >= 2 &&
              typeof parsed.updatedAt === 'number' &&
              Number.isFinite(parsed.updatedAt)
                ? parsed.updatedAt
                : 0,
          }
        }
      } else {
        reportCorruptStorage(warnings, EDITOR_STORAGE_KEY, raw, '工作区快照版本不受支持')
      }
    }
  } catch {
    if (raw) {
      reportCorruptStorage(warnings, EDITOR_STORAGE_KEY, raw, '工作区快照已损坏')
    }
  }

  if (!snapshot) {
    const legacy = window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY)
    if (legacy) {
      try {
        const tabs = normalizeTabs(JSON.parse(legacy))
        if (tabs.length > 0) {
          requiresRewrite = true
          snapshot = {
            version: EDITOR_STORAGE_VERSION,
            tabs,
            activeTabId: tabs[0].id,
            recentlyClosedTabs: [],
            updatedAt: 0,
          }
        } else {
          reportCorruptStorage(
            warnings,
            LEGACY_EDITOR_STORAGE_KEY,
            legacy,
            '旧版标签快照没有可恢复内容',
          )
        }
      } catch {
        reportCorruptStorage(warnings, LEGACY_EDITOR_STORAGE_KEY, legacy, '旧版标签快照已损坏')
      }
    }
  }
  const loaded = mergeRecovery(snapshot, readRecoveryEntries(warnings))
  return {
    snapshot: loaded ? { ...loaded, recovered: loaded.recovered || requiresRewrite } : null,
    warning: warnings.length > 0 ? [...new Set(warnings)].join('；') : null,
  }
}

function writeTabRecovery(id: string): void {
  if (!canUseStorage()) return
  const state = useEditorStore.getState()
  const sourceTab = state.tabs.find((item) => item.id === id)
  if (sourceTab?.kind === 'exercise') {
    clearEditorTabRecovery(id, sourceTab.recoverySourceKeys)
    return
  }
  const tab = normalizeTab(sourceTab)
  if (!tab) {
    useEditorStore.setState({
      persistenceError: '工作区内容超过本地恢复上限，请拆分文件后重试',
    })
    return
  }
  const entries = Object.fromEntries(
    readRecoveryEntries([], [editorRecoverySessionKey]).map((entry) => [entry.tab.id, entry]),
  )
  entries[tab.id] = {
    tab,
    activeTabId: state.activeTabId,
    updatedAt: Math.max(Date.now(), (state.lastPersistedAt ?? 0) + 1),
  }
  const recovery: EditorRecoverySnapshot = {
    version: EDITOR_RECOVERY_STORAGE_VERSION,
    entries,
  }
  if (protectedStorageKeys.has(editorRecoverySessionKey)) {
    useEditorStore.setState({ persistenceError: '恢复日志完整备份失败，已停止覆盖原始数据' })
    return
  }
  try {
    window.localStorage.setItem(editorRecoverySessionKey, JSON.stringify(recovery))
  } catch (error) {
    useEditorStore.setState({
      persistenceError: error instanceof Error ? error.message : '工作区恢复日志写入失败',
    })
  }
}

export function clearEditorTabRecovery(id: string, sourceKeys: string[] = []): void {
  if (!canUseStorage()) return
  for (const key of new Set([editorRecoverySessionKey, ...sourceKeys])) {
    if (protectedStorageKeys.has(key)) continue
    const entries = Object.fromEntries(
      readRecoveryEntries([], [key]).map((entry) => [entry.tab.id, entry]),
    )
    if (protectedStorageKeys.has(key)) continue
    if (!entries[id]) continue
    delete entries[id]
    try {
      if (Object.keys(entries).length === 0) {
        const storage = window.localStorage as Storage & { removeItem?: (key: string) => void }
        if (typeof storage.removeItem === 'function') storage.removeItem(key)
        else storage.setItem(key, '')
      } else {
        const recovery: EditorRecoverySnapshot = {
          version: EDITOR_RECOVERY_STORAGE_VERSION,
          entries,
        }
        window.localStorage.setItem(key, JSON.stringify(recovery))
      }
    } catch {
      // Keeping a stale recovery entry is safer than clearing it after an ambiguous write.
    }
  }
}

export function flushPersistTabs(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!canUseStorage()) return
  if (protectedStorageKeys.has(EDITOR_STORAGE_KEY)) {
    useEditorStore.setState({ persistenceError: '损坏快照完整备份失败，已停止覆盖原始数据' })
    return
  }
  const state = useEditorStore.getState()
  const tabs = normalizeTabs(state.tabs)
  if (tabs.length !== state.tabs.length) {
    useEditorStore.setState({ persistenceError: '工作区内容超过本地保存上限，请拆分文件后重试' })
    return
  }
  const snapshot: EditorWorkspaceSnapshot = {
    version: EDITOR_STORAGE_VERSION,
    tabs,
    activeTabId:
      state.activeTabId && state.tabs.some((tab) => tab.id === state.activeTabId)
        ? state.activeTabId
        : (state.tabs[0]?.id ?? null),
    recentlyClosedTabs: normalizeTabs(state.recentlyClosedTabs).slice(0, 10),
    updatedAt: Math.max(Date.now(), state.lastPersistedAt ?? 0),
  }
  try {
    window.localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(snapshot))
    useEditorStore.setState({
      dirty: false,
      persistenceError: null,
      lastPersistedAt: snapshot.updatedAt,
    })
  } catch (error) {
    useEditorStore.setState({
      persistenceError: error instanceof Error ? error.message : '工作区本地存储写入失败',
    })
  }
}

function schedulePersistTabs(): void {
  if (!canUseStorage()) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(flushPersistTabs, PERSIST_DELAY_MS)
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  tabs: [welcomeTab],
  activeTabId: 'welcome',
  cursorPosition: null,
  scrollTop: 0,
  hydrated: false,
  dirty: false,
  persistenceError: null,
  lastPersistedAt: null,
  recentlyClosedTabs: [],
  databaseStatus: 'idle',
  databaseError: null,
  hydrationEpoch: 0,
  restoreStatus: 'idle',
  restoreMessage: null,
  addTab: (tab) => {
    const parsed = parseTab(tab)
    if (!parsed) return
    const normalized = canonicalizeTab(parsed)
    const recovered = recoveredExerciseTab(parsed)
    set((state) => {
      const replacing = state.tabs.some((item) => item.id === normalized.id)
      const recoveredAlreadyExists = recovered
        ? state.tabs.some((item) => item.id === recovered.id)
        : true
      const requiredSlots = (replacing ? 0 : 1) + (recoveredAlreadyExists ? 0 : 1)
      if (state.tabs.length + requiredSlots > MAX_EDITOR_TABS) {
        return { persistenceError: `工作区最多支持 ${MAX_EDITOR_TABS} 个标签` }
      }
      const tabs = state.tabs.filter(
        (item) => item.id !== normalized.id && (!recovered || item.id !== recovered.id),
      )
      return {
        tabs: [...tabs, normalized, ...(recovered ? [recovered] : [])],
        activeTabId: normalized.id,
        dirty: true,
      }
    })
    if (normalized.kind === 'exercise') clearEditorTabRecovery(normalized.id)
    flushPersistTabs()
  },
  closeTab: (id) => {
    set((state) => {
      const closed = state.tabs.find((tab) => tab.id === id)
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeTabId =
        state.activeTabId === id
          ? (tabs[Math.max(0, state.tabs.findIndex((tab) => tab.id === id) - 1)]?.id ?? null)
          : tabs.some((tab) => tab.id === state.activeTabId)
            ? state.activeTabId
            : (tabs[0]?.id ?? null)
      return {
        tabs,
        activeTabId,
        dirty: Boolean(closed) || state.dirty,
        recentlyClosedTabs: closed
          ? [closed, ...state.recentlyClosedTabs.filter((tab) => tab.id !== closed.id)].slice(
              0,
              MAX_RECENTLY_CLOSED_TABS,
            )
          : state.recentlyClosedTabs,
      }
    })
    flushPersistTabs()
  },
  reopenTab: (id) => {
    let reopened = false
    set((state) => {
      const tab = state.recentlyClosedTabs.find((item) => item.id === id)
      if (!tab) return state
      if (state.tabs.length >= MAX_EDITOR_TABS) {
        return { persistenceError: `工作区最多支持 ${MAX_EDITOR_TABS} 个标签` }
      }
      reopened = true
      return {
        tabs: [...state.tabs.filter((item) => item.id !== tab.id), tab],
        activeTabId: tab.id,
        recentlyClosedTabs: state.recentlyClosedTabs.filter((item) => item.id !== id),
        dirty: true,
      }
    })
    if (reopened) flushPersistTabs()
    return reopened
  },
  reopenLastClosed: () => {
    const id = get().recentlyClosedTabs[0]?.id
    if (id) get().reopenTab(id)
  },
  setActiveTab: (id) => {
    const next = id && get().tabs.some((tab) => tab.id === id) ? id : (get().tabs[0]?.id ?? null)
    set({ activeTabId: next, dirty: true })
    flushPersistTabs()
  },
  updateTab: (id, patch) => {
    const current = get().tabs.find((tab) => tab.id === id)
    if (!current) return
    if (current.kind === 'exercise' && typeof patch.content === 'string' && patch.content !== '') {
      return
    }
    let updated = false
    let nextKind: EditorTabKind | null = null
    set((state) => {
      const target = state.tabs.find((tab) => tab.id === id)
      if (!target) return state
      const parsed = parseTab({
        ...target,
        ...patch,
        id: target.id,
        content: target.kind === 'exercise' ? '' : (patch.content ?? target.content),
        updatedAt: new Date().toISOString(),
      })
      if (!parsed) return state
      const normalized = canonicalizeTab(parsed)
      const recovered = recoveredExerciseTab(parsed)
      const remaining = state.tabs.filter(
        (tab) => tab.id !== id && (!recovered || tab.id !== recovered.id),
      )
      if (recovered && remaining.length + 2 > MAX_EDITOR_TABS) {
        return { persistenceError: `工作区最多支持 ${MAX_EDITOR_TABS} 个标签` }
      }
      const index = state.tabs.findIndex((tab) => tab.id === id)
      remaining.splice(Math.min(index, remaining.length), 0, normalized)
      if (recovered) remaining.push(recovered)
      updated = true
      nextKind = normalized.kind
      return { tabs: remaining, dirty: true }
    })
    if (!updated) return
    if (nextKind === 'exercise') clearEditorTabRecovery(id)
    else writeTabRecovery(id)
    schedulePersistTabs()
  },
  updateContent: (id, content) => {
    if (get().tabs.find((tab) => tab.id === id)?.kind === 'exercise') return
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, content, updatedAt: new Date().toISOString() } : tab,
      ),
      dirty: true,
    }))
    writeTabRecovery(id)
    schedulePersistTabs()
  },
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setScrollTop: (scrollTop) => set({ scrollTop }),
  updateCursorPosition: (id, lineNumber, column) => {
    const cursorPosition = normalizeEditorCursorPosition({ lineNumber, column })
    if (!cursorPosition) return
    const current = get().tabs.find((tab) => tab.id === id)?.cursorPosition
    if (
      !get().tabs.some((tab) => tab.id === id) ||
      (current?.lineNumber === cursorPosition.lineNumber &&
        current.column === cursorPosition.column)
    ) {
      return
    }
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, cursorPosition } : tab)),
      dirty: true,
    }))
    schedulePersistTabs()
  },
  updateScrollTop: (id, scrollTop) => {
    if (!Number.isFinite(scrollTop)) return
    const normalizedScrollTop = Math.max(0, scrollTop)
    const current = get().tabs.find((tab) => tab.id === id)
    if (!current || current.scrollTop === normalizedScrollTop) return
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, scrollTop: normalizedScrollTop } : tab,
      ),
      dirty: true,
    }))
    schedulePersistTabs()
  },
  restoreTabs: (tabs, activeTabId) => {
    if (!tabs && get().hydrated) return
    const readResult: EditorSnapshotReadResult = tabs
      ? {
          snapshot: {
            version: EDITOR_STORAGE_VERSION,
            tabs: normalizeTabs(tabs),
            activeTabId,
            recentlyClosedTabs: [],
            updatedAt: Date.now(),
            recovered: false,
          },
          warning: null,
        }
      : readSnapshot()
    const { snapshot, warning } = readResult
    if (!snapshot) {
      set({
        hydrated: true,
        dirty: false,
        hydrationEpoch: get().hydrationEpoch + 1,
        restoreStatus: warning ? 'degraded' : 'empty',
        restoreMessage: warning ? `${warning}；恢复失败，已打开默认工作区` : null,
      })
      return
    }
    if (snapshot.tabs.length === 0) {
      set({
        tabs: [],
        activeTabId: null,
        hydrated: true,
        dirty: false,
        persistenceError: null,
        lastPersistedAt: snapshot.updatedAt,
        recentlyClosedTabs: snapshot.recentlyClosedTabs,
        hydrationEpoch: get().hydrationEpoch + 1,
        restoreStatus: warning ? 'degraded' : snapshot.recovered ? 'recovered' : 'restored',
        restoreMessage: warning
          ? `${warning}；已使用仍可读取的工作区数据`
          : snapshot.recovered
            ? '已从异常退出恢复最新工作区内容'
            : null,
      })
      return
    }
    const nextActive =
      snapshot.activeTabId && snapshot.tabs.some((tab) => tab.id === snapshot.activeTabId)
        ? snapshot.activeTabId
        : snapshot.tabs[0].id
    set({
      tabs: snapshot.tabs,
      activeTabId: nextActive,
      hydrated: true,
      dirty: false,
      persistenceError: null,
      lastPersistedAt: snapshot.updatedAt,
      recentlyClosedTabs: snapshot.recentlyClosedTabs,
      hydrationEpoch: get().hydrationEpoch + 1,
      restoreStatus: warning ? 'degraded' : snapshot.recovered ? 'recovered' : 'restored',
      restoreMessage: warning
        ? `${warning}；已使用仍可读取的工作区数据`
        : snapshot.recovered
          ? '已从异常退出恢复最新工作区内容'
          : null,
    })
    if (snapshot.recovered) {
      set({ dirty: true })
      schedulePersistTabs()
    }
  },
}))

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushPersistTabs)
  window.addEventListener('beforeunload', flushPersistTabs)
}
