import { create } from 'zustand'
import { normalizeEditorCursorPosition, type EditorCursorPosition } from '@/utils/editorViewState'
import {
  EDITOR_WORKSPACE_STORAGE_VERSION,
  isDraftBackedPracticeTab,
  legacyExerciseRecoveryFilename,
  legacyExerciseRecoveryTabId,
  stableEditorWorkspaceHash,
} from '@/shared/editorWorkspaceContract'
import {
  createBootScopedRecoverySessionId,
  recoveryKeyBootScope,
  recoverySessionBootScope,
} from '@/utils/recoverySession'

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
export const EDITOR_VIEW_RECOVERY_KEY = 'codehelper-editor-workspace-view-recovery-v1'
export const EDITOR_VIEW_RECOVERY_KEY_PREFIX = `${EDITOR_VIEW_RECOVERY_KEY}.session.`
export const LEGACY_EDITOR_RECOVERY_KEY = 'codehelper-editor-workspace-recovery-v1'
export const EDITOR_STORAGE_VERSION = EDITOR_WORKSPACE_STORAGE_VERSION

const PERSIST_DELAY_MS = 500
export const MAX_EDITOR_TABS = 50
const MAX_RECENTLY_CLOSED_TABS = 10
const MAX_FILENAME_LENGTH = 255
const MAX_CONTENT_LENGTH = 5_000_000
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000
const EDITOR_RECOVERY_STORAGE_VERSION = 3
const EDITOR_VIEW_RECOVERY_STORAGE_VERSION = 1

const editorRecoverySessionId = createBootScopedRecoverySessionId()
const editorRecoverySessionKey = `${EDITOR_RECOVERY_KEY_PREFIX}${editorRecoverySessionId}`
const editorRecoveryBootScope = recoverySessionBootScope(editorRecoverySessionId)
const editorViewRecoverySessionKey = `${EDITOR_VIEW_RECOVERY_KEY_PREFIX}${editorRecoverySessionId}`

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

type EditorViewRecoveryEntry = {
  cursorPosition: EditorCursorPosition | null
  scrollTop: number
  updatedAt: number
}

type EditorViewRecoverySnapshot = {
  version: 1
  entries: Record<string, EditorViewRecoveryEntry>
}

type EditorViewRecoveryCandidate = EditorViewRecoveryEntry & {
  id: string
  sourceKey: string
}

export type EditorViewRecoveryClearExpectation = {
  id: string
  sources: Array<{ key: string; fingerprint: string }>
}

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

export function exerciseTabId(exerciseId: string): string {
  const normalized = exerciseId.trim()
  const readable = normalized.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const label = readable.slice(0, 120) || 'unknown'
  return `exercise-${label}-${stableEditorWorkspaceHash(normalized)}`.slice(0, 200)
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
  return isDraftBackedPracticeTab(tab) && tab.content ? { ...tab, content: '' } : tab
}

function normalizeTab(value: unknown): EditorTab | null {
  const parsed = parseTab(value)
  return parsed ? canonicalizeTab(parsed) : null
}

function recoveredExerciseTab(tab: EditorTab): EditorTab | null {
  if (!isDraftBackedPracticeTab(tab) || !tab.content) return null
  return {
    id: legacyExerciseRecoveryTabId(tab),
    filename: legacyExerciseRecoveryFilename(tab.filename),
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
    if (seen.has(recovered.id)) continue
    if (result.length >= maxTabs) {
      const topologyIndex = result.findIndex(
        (tab) => isDraftBackedPracticeTab(tab) && tab.id === recovered.recoveryOriginalId,
      )
      if (topologyIndex < 0) continue
      seen.delete(result[topologyIndex].id)
      result[topologyIndex] = recovered
      seen.add(recovered.id)
      continue
    }
    seen.add(recovered.id)
    result.push(recovered)
  }
  return result
}

function normalizeTabs(value: unknown, maxTabs = MAX_EDITOR_TABS): EditorTab[] {
  const normalized = normalizePersistedTabs(value, maxTabs)
  return appendRecoveredFiles(normalized.tabs, normalized.recoveredFiles, maxTabs)
}

function recoveryCopyFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return `${filename}.recovered`.slice(0, MAX_FILENAME_LENGTH)
  return `${filename.slice(0, dot)}.recovered${filename.slice(dot)}`.slice(0, MAX_FILENAME_LENGTH)
}

function createRecoveryConflictCopy(
  recovery: EditorRecoveryEntry,
  recoverySourceKeys: string[],
): EditorTab {
  const source = recovery.tab.id.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120) || 'tab'
  const fingerprint = stableEditorWorkspaceHash(
    [
      recovery.tab.id,
      recovery.tab.filename,
      recovery.tab.language,
      recovery.tab.content,
      String(recovery.tab.revision ?? ''),
      String(recovery.tab.cursorPosition?.lineNumber ?? ''),
      String(recovery.tab.cursorPosition?.column ?? ''),
      String(recovery.tab.scrollTop ?? ''),
      String(recovery.updatedAt),
      recoverySourceKeys.join('\u0000'),
    ].join('\u0000'),
  )
  const recoveredUpdatedAt = new Date(recovery.updatedAt)
  return {
    ...recovery.tab,
    id: `recovered-${source}-${fingerprint}`.slice(0, 200),
    filename: recoveryCopyFilename(recovery.tab.filename),
    kind: 'file',
    problemId: undefined,
    revision: undefined,
    ...(Number.isFinite(recoveredUpdatedAt.getTime())
      ? { updatedAt: recoveredUpdatedAt.toISOString() }
      : {}),
    syncConflict: true,
    localOnly: true,
    recoverySourceKeys,
    recoveryOriginalId: recovery.tab.id,
  }
}

function isValidRecoveryTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isFinite(new Date(value).getTime())
  )
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
  if (!parsed || !isValidRecoveryTimestamp(raw.updatedAt)) return []
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

function recoveryCandidateFingerprint(entry: EditorRecoveryEntry): string {
  const tab = entry.tab
  return JSON.stringify([
    tab.filename,
    tab.language,
    tab.content,
    tab.kind,
    tab.problemId ?? null,
    tab.revision ?? null,
  ])
}

function recoveryEntrySourceKeys(entry: EditorRecoveryEntry): string[] {
  return [
    ...new Set([
      ...(entry.tab.recoverySourceKeys ?? []),
      ...(entry.sourceKey ? [entry.sourceKey] : []),
    ]),
  ].sort()
}

/**
 * A renderer session owns its recovery key, but several crashed windows can still
 * contain divergent edits for the same tab id. Keep the newest branch on the
 * original tab and expose every other branch as a normal recovery file.
 */
function preserveDivergentRecoveryCandidates(
  candidates: EditorRecoveryEntry[],
): EditorRecoveryEntry[] {
  const byTabId = new Map<string, EditorRecoveryEntry[]>()
  for (const candidate of candidates) {
    const group = byTabId.get(candidate.tab.id) ?? []
    group.push(candidate)
    byTabId.set(candidate.tab.id, group)
  }

  const preserved: EditorRecoveryEntry[] = []
  for (const candidatesForTab of byTabId.values()) {
    const identicalBranches = new Map<string, EditorRecoveryEntry[]>()
    for (const candidate of candidatesForTab) {
      const fingerprint = recoveryCandidateFingerprint(candidate)
      const group = identicalBranches.get(fingerprint) ?? []
      group.push(candidate)
      identicalBranches.set(fingerprint, group)
    }

    const branches = [...identicalBranches.values()]
      .map((duplicates) => {
        const representative = [...duplicates].sort(
          (left, right) =>
            right.updatedAt - left.updatedAt ||
            (left.sourceKey ?? '').localeCompare(right.sourceKey ?? ''),
        )[0]
        const recoverySourceKeys = [
          ...new Set(duplicates.flatMap((entry) => recoveryEntrySourceKeys(entry))),
        ].sort()
        return {
          ...representative,
          tab: { ...representative.tab, recoverySourceKeys },
        }
      })
      .sort(
        (left, right) =>
          right.updatedAt - left.updatedAt ||
          recoveryCandidateFingerprint(left).localeCompare(recoveryCandidateFingerprint(right)),
      )

    const [primary, ...divergent] = branches
    if (!primary) continue
    preserved.push(primary)
    for (const branch of divergent) {
      const recoverySourceKeys = recoveryEntrySourceKeys(branch)
      const copy = {
        ...createRecoveryConflictCopy(branch, recoverySourceKeys),
        syncConflict: true,
      }
      preserved.push({
        ...branch,
        tab: copy,
      })
    }
  }
  return preserved
}

function recoveryStorageKeys(): string[] {
  if (!canUseStorage()) return []
  const keys = new Set<string>([EDITOR_RECOVERY_KEY, editorRecoverySessionKey])
  const storage = window.localStorage
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(EDITOR_RECOVERY_KEY_PREFIX) && !key.includes('.corrupt.')) keys.add(key)
    }
  }
  return [...keys]
}

function readRecoveryEntries(warnings: string[], keys?: string[]): EditorRecoveryEntry[] {
  if (!canUseStorage()) return []
  const selectedKeys = keys ?? recoveryStorageKeys()
  const includeLegacy = keys === undefined || selectedKeys.includes(LEGACY_EDITOR_RECOVERY_KEY)
  const entries: EditorRecoveryEntry[] = []
  for (const key of selectedKeys) {
    if (key === LEGACY_EDITOR_RECOVERY_KEY) continue
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Partial<EditorRecoverySnapshot> | null
      if (
        (parsed?.version !== 2 && parsed?.version !== EDITOR_RECOVERY_STORAGE_VERSION) ||
        !parsed.entries ||
        typeof parsed.entries !== 'object' ||
        Array.isArray(parsed.entries)
      ) {
        reportCorruptStorage(warnings, key, raw, '多标签恢复日志格式不受支持')
      } else {
        let invalidEntry = false
        for (const value of Object.values(parsed.entries)) {
          const normalized = normalizeRecoveryEntries(value)
          if (normalized.length === 0) invalidEntry = true
          for (const item of normalized) {
            entries.push({ ...item, sourceKey: key })
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

  if (!includeLegacy) return preserveDivergentRecoveryCandidates(entries)
  const legacyRaw = window.localStorage.getItem(LEGACY_EDITOR_RECOVERY_KEY)
  if (!legacyRaw) return preserveDivergentRecoveryCandidates(entries)
  try {
    const parsed = JSON.parse(legacyRaw) as Partial<LegacyEditorRecoverySnapshot> | null
    const normalized = parsed?.version === 1 ? normalizeRecoveryEntries(parsed) : []
    for (const item of normalized) {
      entries.push({ ...item, sourceKey: LEGACY_EDITOR_RECOVERY_KEY })
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
  return preserveDivergentRecoveryCandidates(entries)
}

function viewRecoveryEntryFingerprint(entry: EditorViewRecoveryEntry): string {
  return JSON.stringify([
    entry.cursorPosition?.lineNumber ?? null,
    entry.cursorPosition?.column ?? null,
    entry.scrollTop,
    entry.updatedAt,
  ])
}

function readEditorViewRecoverySnapshot(
  key: string,
  warnings: string[],
): EditorViewRecoverySnapshot | null {
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<EditorViewRecoverySnapshot> | null
    if (
      parsed?.version !== EDITOR_VIEW_RECOVERY_STORAGE_VERSION ||
      !parsed.entries ||
      typeof parsed.entries !== 'object' ||
      Array.isArray(parsed.entries)
    ) {
      reportCorruptStorage(warnings, key, raw, '编辑器视图恢复日志格式不受支持')
      return null
    }
    const entries: Record<string, EditorViewRecoveryEntry> = {}
    let invalidEntry = false
    for (const [id, value] of Object.entries(parsed.entries)) {
      if (!id.trim() || id.length > 200 || !value || typeof value !== 'object') {
        invalidEntry = true
        continue
      }
      const candidate = value as Partial<EditorViewRecoveryEntry>
      const cursorPosition = normalizeEditorCursorPosition(candidate.cursorPosition)
      if (
        (candidate.cursorPosition !== null && !cursorPosition) ||
        typeof candidate.scrollTop !== 'number' ||
        !Number.isFinite(candidate.scrollTop) ||
        candidate.scrollTop < 0 ||
        typeof candidate.updatedAt !== 'number' ||
        !Number.isFinite(candidate.updatedAt) ||
        Math.abs(candidate.updatedAt) > MAX_DATE_TIMESTAMP
      ) {
        invalidEntry = true
        continue
      }
      entries[id] = {
        cursorPosition,
        scrollTop: candidate.scrollTop,
        updatedAt: candidate.updatedAt,
      }
    }
    if (invalidEntry) {
      reportCorruptStorage(warnings, key, raw, '编辑器视图恢复日志包含损坏条目')
    }
    return { version: EDITOR_VIEW_RECOVERY_STORAGE_VERSION, entries }
  } catch {
    reportCorruptStorage(warnings, key, raw, '编辑器视图恢复日志已损坏')
    return null
  }
}

function editorViewRecoveryStorageKeys(): string[] {
  if (!canUseStorage()) return []
  const keys = new Set<string>([editorViewRecoverySessionKey])
  const storage = window.localStorage
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(EDITOR_VIEW_RECOVERY_KEY_PREFIX) && !key.includes('.corrupt.')) {
        keys.add(key)
      }
    }
  }
  return [...keys]
}

function readEditorViewRecoveryEntries(warnings: string[]): EditorViewRecoveryCandidate[] {
  if (!canUseStorage()) return []
  const candidates: EditorViewRecoveryCandidate[] = []
  for (const key of editorViewRecoveryStorageKeys()) {
    const snapshot = readEditorViewRecoverySnapshot(key, warnings)
    if (!snapshot) continue
    for (const [id, entry] of Object.entries(snapshot.entries)) {
      candidates.push({ ...entry, id, sourceKey: key })
    }
  }
  return candidates
}

function mergeEditorViewRecovery(
  snapshot: LoadedEditorWorkspaceSnapshot | null,
  candidates: EditorViewRecoveryCandidate[],
): LoadedEditorWorkspaceSnapshot | null {
  if (!snapshot || candidates.length === 0) return snapshot
  const newestByTab = new Map<string, EditorViewRecoveryCandidate>()
  for (const candidate of candidates) {
    const current = newestByTab.get(candidate.id)
    if (
      !current ||
      candidate.updatedAt > current.updatedAt ||
      (candidate.updatedAt === current.updatedAt &&
        candidate.sourceKey.localeCompare(current.sourceKey) > 0)
    ) {
      newestByTab.set(candidate.id, candidate)
    }
  }
  let recovered = snapshot.recovered
  const apply = (tab: EditorTab): EditorTab => {
    const candidate = newestByTab.get(tab.id)
    if (!candidate) return tab
    const durableViewUpdatedAt = tab.viewUpdatedAt ? Date.parse(tab.viewUpdatedAt) : Number.NaN
    if (Number.isFinite(durableViewUpdatedAt) && durableViewUpdatedAt >= candidate.updatedAt) {
      return tab
    }
    const sameCursor =
      tab.cursorPosition?.lineNumber === candidate.cursorPosition?.lineNumber &&
      tab.cursorPosition?.column === candidate.cursorPosition?.column
    const sameScroll = (tab.scrollTop ?? 0) === candidate.scrollTop
    if (!sameCursor || !sameScroll) recovered = true
    return {
      ...tab,
      cursorPosition: candidate.cursorPosition ?? undefined,
      scrollTop: candidate.scrollTop,
      viewUpdatedAt: new Date(candidate.updatedAt).toISOString(),
    }
  }
  return {
    ...snapshot,
    tabs: snapshot.tabs.map(apply),
    recentlyClosedTabs: snapshot.recentlyClosedTabs.map(apply),
    recovered,
  }
}

export function applyPendingEditorViewRecovery(
  tabs: EditorTab[],
  recentlyClosedTabs: EditorTab[] = [],
): { tabs: EditorTab[]; recentlyClosedTabs: EditorTab[]; recovered: boolean } {
  if (!canUseStorage()) return { tabs, recentlyClosedTabs, recovered: false }
  const merged = mergeEditorViewRecovery(
    {
      version: EDITOR_STORAGE_VERSION,
      tabs,
      activeTabId: tabs[0]?.id ?? null,
      recentlyClosedTabs,
      updatedAt: 0,
      recovered: false,
    },
    readEditorViewRecoveryEntries([]),
  )
  return merged
    ? {
        tabs: merged.tabs,
        recentlyClosedTabs: merged.recentlyClosedTabs,
        recovered: merged.recovered,
      }
    : { tabs, recentlyClosedTabs, recovered: false }
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
    const durableRevision =
      durable && Number.isSafeInteger(durable.revision) ? Number(durable.revision) : null
    const recoveryRevision = Number.isSafeInteger(recovery.tab.revision)
      ? Number(recovery.tab.revision)
      : null
    const sameDurableContent =
      durable &&
      durable.filename === recovery.tab.filename &&
      durable.language === recovery.tab.language &&
      durable.content === recovery.tab.content &&
      durable.kind === recovery.tab.kind &&
      (durable.problemId ?? null) === (recovery.tab.problemId ?? null)
    const recoverySourceKeys = recoveryEntrySourceKeys(recovery)
    if (sameDurableContent) {
      const merged = {
        ...durable,
        ...(durable.syncConflict === true || recovery.tab.syncConflict === true
          ? { syncConflict: true }
          : {}),
        recoverySourceKeys: [
          ...new Set([...(durable.recoverySourceKeys ?? []), ...recoverySourceKeys]),
        ],
      }
      if (existingIndex >= 0) tabs[existingIndex] = merged
      else if (closedIndex >= 0) recentlyClosedTabs[closedIndex] = merged
      recovered = true
      continue
    }
    const durableSupersedesRecovery =
      durable !== null &&
      (durableRevision !== null && recoveryRevision !== null
        ? durableRevision > recoveryRevision
        : Number.isFinite(durableTabUpdatedAt) && durableTabUpdatedAt >= recovery.updatedAt)
    if (durableSupersedesRecovery) {
      const recoveredCopy = createRecoveryConflictCopy(recovery, recoverySourceKeys)
      const copyIndex = tabs.findIndex((tab) => tab.id === recoveredCopy.id)
      if (copyIndex >= 0) {
        tabs[copyIndex] = {
          ...tabs[copyIndex],
          recoverySourceKeys: [
            ...new Set([...(tabs[copyIndex].recoverySourceKeys ?? []), ...recoverySourceKeys]),
          ],
        }
      } else {
        tabs.push(recoveredCopy)
      }
      recentlyClosedTabs = recentlyClosedTabs.filter((tab) => tab.id !== recoveredCopy.id)
      if (recovery.activeTabId === recovery.tab.id) activeTabId = recoveredCopy.id
      recovered = true
      continue
    }
    const recoveredTab = { ...recovery.tab, recoverySourceKeys }
    if (existingIndex >= 0) tabs[existingIndex] = recoveredTab
    else tabs.push(recoveredTab)
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
      if (
        parsedVersion === 1 ||
        parsedVersion === 2 ||
        parsedVersion === 3 ||
        parsedVersion === EDITOR_STORAGE_VERSION
      ) {
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
          let recentlyClosedTabs = appendRecoveredFiles(
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
          const openById = new Map(tabs.map((tab) => [tab.id, tab]))
          const crossListDuplicates = recentlyClosedTabs.filter((tab) => openById.has(tab.id))
          if (crossListDuplicates.length > 0) {
            reportCorruptStorage(
              warnings,
              EDITOR_STORAGE_KEY,
              raw,
              '打开标签与最近关闭列表包含相同标识，冲突内容已保留为恢复文件',
            )
            const snapshotUpdatedAt =
              typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
                ? parsed.updatedAt
                : 0
            for (const closedTab of crossListDuplicates) {
              const openTab = openById.get(closedTab.id)
              const sameContent =
                openTab &&
                openTab.filename === closedTab.filename &&
                openTab.language === closedTab.language &&
                openTab.content === closedTab.content &&
                openTab.kind === closedTab.kind &&
                (openTab.problemId ?? null) === (closedTab.problemId ?? null)
              if (sameContent) continue
              const parsedUpdatedAt = closedTab.updatedAt ? Date.parse(closedTab.updatedAt) : 0
              const recoveredCopy = createRecoveryConflictCopy(
                {
                  tab: closedTab,
                  activeTabId: null,
                  updatedAt: Number.isFinite(parsedUpdatedAt)
                    ? Math.max(parsedUpdatedAt, snapshotUpdatedAt)
                    : snapshotUpdatedAt,
                },
                [],
              )
              if (!tabs.some((tab) => tab.id === recoveredCopy.id)) tabs.push(recoveredCopy)
            }
            recentlyClosedTabs = recentlyClosedTabs.filter((tab) => !openById.has(tab.id))
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
            crossListDuplicates.length > 0 ||
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
  const loaded = mergeEditorViewRecovery(
    mergeRecovery(snapshot, readRecoveryEntries(warnings)),
    readEditorViewRecoveryEntries(warnings),
  )
  return {
    snapshot: loaded ? { ...loaded, recovered: loaded.recovered || requiresRewrite } : null,
    warning: warnings.length > 0 ? [...new Set(warnings)].join('；') : null,
  }
}

function writeTabRecovery(id: string): void {
  if (!canUseStorage()) return
  const state = useEditorStore.getState()
  const sourceTab = state.tabs.find((item) => item.id === id)
  if (sourceTab && isDraftBackedPracticeTab(sourceTab)) {
    clearEditorTabRecovery(id, sourceTab.recoverySourceKeys, sourceTab)
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

function writeTabViewRecovery(id: string): number | null {
  if (!canUseStorage()) return null
  const state = useEditorStore.getState()
  const tab = state.tabs.find((item) => item.id === id)
  if (!tab) return null
  const existing = readEditorViewRecoverySnapshot(editorViewRecoverySessionKey, [])
  if (protectedStorageKeys.has(editorViewRecoverySessionKey)) {
    useEditorStore.setState({
      persistenceError: '视图恢复日志完整备份失败，已停止覆盖原始数据',
    })
    return null
  }
  const entries = { ...(existing?.entries ?? {}) }
  const previousUpdatedAt = entries[id]?.updatedAt ?? 0
  const previousTabViewUpdatedAt = tab.viewUpdatedAt ? Date.parse(tab.viewUpdatedAt) : Number.NaN
  const lastPersistedAt = state.lastPersistedAt ?? 0
  const updatedAt = Math.min(
    MAX_DATE_TIMESTAMP,
    Math.max(
      Date.now(),
      previousUpdatedAt + 1,
      Number.isFinite(lastPersistedAt) && Math.abs(lastPersistedAt) < MAX_DATE_TIMESTAMP
        ? lastPersistedAt + 1
        : 0,
      Number.isFinite(previousTabViewUpdatedAt) ? previousTabViewUpdatedAt + 1 : 0,
    ),
  )
  entries[id] = {
    cursorPosition: tab.cursorPosition ?? null,
    scrollTop: tab.scrollTop ?? 0,
    updatedAt,
  }
  try {
    window.localStorage.setItem(
      editorViewRecoverySessionKey,
      JSON.stringify({ version: EDITOR_VIEW_RECOVERY_STORAGE_VERSION, entries }),
    )
    return updatedAt
  } catch (error) {
    useEditorStore.setState({
      persistenceError: error instanceof Error ? error.message : '编辑器视图恢复日志写入失败',
    })
    return null
  }
}

function isCurrentBootForeignViewRecoveryKey(key: string): boolean {
  return (
    key !== editorViewRecoverySessionKey &&
    Boolean(editorRecoveryBootScope) &&
    recoveryKeyBootScope(key, EDITOR_VIEW_RECOVERY_KEY_PREFIX) === editorRecoveryBootScope
  )
}

export function captureEditorTabViewRecovery(id: string): EditorViewRecoveryClearExpectation {
  if (!canUseStorage()) return { id, sources: [] }
  const sources: EditorViewRecoveryClearExpectation['sources'] = []
  for (const key of editorViewRecoveryStorageKeys()) {
    if (isCurrentBootForeignViewRecoveryKey(key)) continue
    const entry = readEditorViewRecoverySnapshot(key, [])?.entries[id]
    if (!entry) continue
    sources.push({ key, fingerprint: viewRecoveryEntryFingerprint(entry) })
  }
  return { id, sources }
}

export function clearEditorTabViewRecovery(expectation: EditorViewRecoveryClearExpectation): void {
  if (!canUseStorage()) return
  for (const source of expectation.sources) {
    if (protectedStorageKeys.has(source.key) || isCurrentBootForeignViewRecoveryKey(source.key)) {
      continue
    }
    try {
      const snapshot = readEditorViewRecoverySnapshot(source.key, [])
      const entry = snapshot?.entries[expectation.id]
      if (!snapshot || !entry || viewRecoveryEntryFingerprint(entry) !== source.fingerprint) {
        continue
      }
      const entries = { ...snapshot.entries }
      delete entries[expectation.id]
      if (Object.keys(entries).length === 0) window.localStorage.removeItem(source.key)
      else {
        window.localStorage.setItem(
          source.key,
          JSON.stringify({ version: EDITOR_VIEW_RECOVERY_STORAGE_VERSION, entries }),
        )
      }
    } catch {
      // A changed or unreadable recovery is safer to retain than to clear speculatively.
    }
  }
}

interface EditorRecoveryClearDocument {
  kind: 'multi' | 'legacy'
  parsed: EditorRecoverySnapshot | LegacyEditorRecoverySnapshot
  tab: EditorTab
  fingerprint: string
}

type EditorRecoveryClearReadResult =
  | { status: 'absent' }
  | { status: 'invalid' }
  | { status: 'found'; document: EditorRecoveryClearDocument }

function readEditorRecoveryClearDocument(key: string, id: string): EditorRecoveryClearReadResult {
  const raw = window.localStorage.getItem(key)
  if (!raw) return { status: 'absent' }
  try {
    const parsed = JSON.parse(raw) as
      | Partial<EditorRecoverySnapshot>
      | Partial<LegacyEditorRecoverySnapshot>
      | null
    if (key === LEGACY_EDITOR_RECOVERY_KEY) {
      if (parsed?.version !== 1) return { status: 'invalid' }
      const tab = parseTab((parsed as Partial<LegacyEditorRecoverySnapshot>).tab)
      if (!tab) return { status: 'invalid' }
      if (tab.id !== id) return { status: 'absent' }
      return {
        status: 'found',
        document: {
          kind: 'legacy',
          parsed: parsed as LegacyEditorRecoverySnapshot,
          tab,
          fingerprint: JSON.stringify(parsed),
        },
      }
    }
    if (
      (parsed?.version !== 2 && parsed?.version !== EDITOR_RECOVERY_STORAGE_VERSION) ||
      !('entries' in (parsed ?? {})) ||
      !parsed?.entries ||
      typeof parsed.entries !== 'object' ||
      Array.isArray(parsed.entries)
    ) {
      return { status: 'invalid' }
    }
    const value = parsed.entries[id]
    if (!value) return { status: 'absent' }
    const normalized = normalizeRecoveryEntries(value).find((entry) => entry.tab.id === id)
    const rawTab = parseTab((value as Partial<EditorRecoveryEntry>).tab)
    const tab = rawTab ?? normalized?.tab
    if (!tab) return { status: 'invalid' }
    return {
      status: 'found',
      document: {
        kind: 'multi',
        parsed: parsed as EditorRecoverySnapshot,
        tab,
        fingerprint: JSON.stringify(value),
      },
    }
  } catch {
    return { status: 'invalid' }
  }
}

function editorRecoveryMatchesExpected(tab: EditorTab, expected: EditorTab | undefined): boolean {
  if (!expected) return true
  if (tab.content !== expected.content || tab.language !== expected.language) return false
  if (
    Number.isSafeInteger(expected.revision) &&
    Number(expected.revision) >= 1 &&
    tab.revision !== expected.revision
  ) {
    return false
  }
  return true
}

function writeEditorRecoveryClearDocument(
  key: string,
  document: EditorRecoveryClearDocument,
): void {
  if (document.kind === 'legacy') {
    window.localStorage.removeItem(key)
    return
  }
  const entries = { ...(document.parsed as EditorRecoverySnapshot).entries }
  delete entries[document.tab.id]
  if (Object.keys(entries).length === 0) window.localStorage.removeItem(key)
  else {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...(document.parsed as EditorRecoverySnapshot),
        entries,
      }),
    )
  }
}

export function clearEditorTabRecovery(
  id: string,
  sourceKeys: string[] = [],
  expectedTab?: EditorTab,
): boolean {
  if (!canUseStorage()) return sourceKeys.length === 0
  const expected =
    expectedTab ??
    useEditorStore.getState().tabs.find((tab) => tab.id === id) ??
    useEditorStore.getState().recentlyClosedTabs.find((tab) => tab.id === id)
  let cleared = true
  for (const key of new Set([editorRecoverySessionKey, ...sourceKeys])) {
    if (protectedStorageKeys.has(key)) {
      cleared = false
      continue
    }
    if (
      key !== editorRecoverySessionKey &&
      editorRecoveryBootScope &&
      recoveryKeyBootScope(key, EDITOR_RECOVERY_KEY_PREFIX) === editorRecoveryBootScope
    ) {
      try {
        if (readEditorRecoveryClearDocument(key, id).status !== 'absent') cleared = false
      } catch {
        cleared = false
      }
      continue
    }
    try {
      const initialResult = readEditorRecoveryClearDocument(key, id)
      if (initialResult.status === 'absent') continue
      if (initialResult.status === 'invalid') {
        cleared = false
        continue
      }
      const initial = initialResult.document
      if (!editorRecoveryMatchesExpected(initial.tab, expected)) {
        cleared = false
        continue
      }
      if (key !== editorRecoverySessionKey && !expected) {
        cleared = false
        continue
      }
      const latestResult =
        key === editorRecoverySessionKey ? initialResult : readEditorRecoveryClearDocument(key, id)
      if (latestResult.status === 'absent') continue
      if (latestResult.status === 'invalid') {
        cleared = false
        continue
      }
      const latest = latestResult.document
      if (
        latest.fingerprint !== initial.fingerprint ||
        !editorRecoveryMatchesExpected(latest.tab, expected)
      ) {
        cleared = false
        continue
      }
      writeEditorRecoveryClearDocument(key, latest)
      if (readEditorRecoveryClearDocument(key, id).status !== 'absent') cleared = false
    } catch {
      // Keeping a stale recovery entry is safer than clearing it after an ambiguous write.
      cleared = false
    }
  }
  return cleared
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
    if (isDraftBackedPracticeTab(normalized)) clearEditorTabRecovery(normalized.id, [], normalized)
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
    if (
      isDraftBackedPracticeTab(current) &&
      typeof patch.content === 'string' &&
      patch.content !== ''
    ) {
      return
    }
    let updated = false
    set((state) => {
      const target = state.tabs.find((tab) => tab.id === id)
      if (!target) return state
      const existingRecovery = recoveredExerciseTab(target)
      const parsed = parseTab({
        ...target,
        ...patch,
        id: target.id,
        content: isDraftBackedPracticeTab(target) ? '' : (patch.content ?? target.content),
        updatedAt: new Date().toISOString(),
      })
      if (!parsed) return state
      const normalized = canonicalizeTab(parsed)
      const recovered = existingRecovery ?? recoveredExerciseTab(parsed)
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
      return { tabs: remaining, dirty: true }
    })
    if (!updated) return
    const nextTab = get().tabs.find((tab) => tab.id === id)
    if (nextTab && isDraftBackedPracticeTab(nextTab)) clearEditorTabRecovery(id, [], nextTab)
    else writeTabRecovery(id)
    schedulePersistTabs()
  },
  updateContent: (id, content) => {
    const target = get().tabs.find((tab) => tab.id === id)
    if (target && isDraftBackedPracticeTab(target)) return
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
    const currentTab = get().tabs.find((tab) => tab.id === id)
    const current = currentTab?.cursorPosition
    if (
      !currentTab ||
      (current?.lineNumber === cursorPosition.lineNumber &&
        current.column === cursorPosition.column)
    ) {
      return
    }
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, cursorPosition } : tab)),
      dirty: true,
    }))
    const recoveredAt = writeTabViewRecovery(id)
    const previousViewUpdatedAt = currentTab.viewUpdatedAt
    const previousTimestamp = previousViewUpdatedAt ? Date.parse(previousViewUpdatedAt) : Number.NaN
    const viewUpdatedAt =
      recoveredAt ??
      Math.min(
        MAX_DATE_TIMESTAMP,
        Math.max(Date.now(), Number.isFinite(previousTimestamp) ? previousTimestamp + 1 : 0),
      )
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, viewUpdatedAt: new Date(viewUpdatedAt).toISOString() } : tab,
      ),
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
    const recoveredAt = writeTabViewRecovery(id)
    const previousTimestamp = current.viewUpdatedAt ? Date.parse(current.viewUpdatedAt) : Number.NaN
    const viewUpdatedAt =
      recoveredAt ??
      Math.min(
        MAX_DATE_TIMESTAMP,
        Math.max(Date.now(), Number.isFinite(previousTimestamp) ? previousTimestamp + 1 : 0),
      )
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, viewUpdatedAt: new Date(viewUpdatedAt).toISOString() } : tab,
      ),
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
