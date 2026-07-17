import type { DraftSnapshot } from './draftAutosave'
import {
  createBootScopedRecoverySessionId,
  recoveryKeyBootScope,
  recoverySessionBootScope,
} from './recoverySession'

/** Legacy v2 shared map. New writes use one map per renderer session. */
export const PRACTICE_DRAFT_RECOVERY_KEY = 'codehelper-practice-draft-recovery-v2'
export const PRACTICE_DRAFT_RECOVERY_KEY_PREFIX = `${PRACTICE_DRAFT_RECOVERY_KEY}.session.`
export const LEGACY_PRACTICE_DRAFT_RECOVERY_KEY = 'codehelper-practice-draft-recovery-v1'
export const MAX_PRACTICE_DRAFT_LENGTH = 100_000
export const MAX_PRACTICE_RECOVERY_ENTRIES = 20
export const MAX_PRACTICE_RECOVERY_TOTAL_LENGTH = 1_000_000

export interface DraftRecoveryEntry extends DraftSnapshot {
  baseRevision: number | null
  localVersion: number
  updatedAt: number
  legacy: boolean
  sourceKey: string
  sourceKeys: string[]
}

interface StoredDraftRecoveryEntry extends DraftSnapshot {
  baseRevision: number
  localVersion: number
  updatedAt: number
}

type DraftRecoveryMap = Record<string, StoredDraftRecoveryEntry>

interface StoredLegacyDraftRecoveryEntry {
  code: string
  updatedAt: number
}

type LegacyDraftRecoveryMap = Record<string, StoredLegacyDraftRecoveryEntry>

export interface DraftRecoveryReadResult {
  entry: DraftRecoveryEntry | null
  candidates: DraftRecoveryEntry[]
  conflict: boolean
  error: string | null
}

interface DraftRecoveryMapReadResult {
  drafts: DraftRecoveryMap
  error: string | null
}

interface LegacyDraftRecoveryMapReadResult {
  drafts: LegacyDraftRecoveryMap
  error: string | null
}

interface LegacyDraftRecoveryReadResult {
  entry: DraftRecoveryEntry | null
  error: string | null
}

export interface DraftRecoveryClearExpectation {
  snapshot: DraftSnapshot
  baseRevision?: number
  localVersion?: number
  sourceKeys?: string[]
}

type StorageProvider = () => Storage | null

function defaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function createSessionId(): string {
  return createBootScopedRecoverySessionId()
}

function stableCorruptRecoveryFingerprint(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x5bd1e995)
    second = (second << 15) | (second >>> 17)
  }
  return `${value.length.toString(36)}-${(first >>> 0).toString(16).padStart(8, '0')}-${(second >>> 0).toString(16).padStart(8, '0')}`
}

function backupCorruptRecovery(target: Storage, key: string, raw: string): string | null {
  const fingerprint = stableCorruptRecoveryFingerprint(`${key}\u0000${raw}`)
  const backupKey = `${key}.corrupt.${fingerprint}`
  try {
    const existing = target.getItem(backupKey)
    if (existing !== null && existing !== raw) return null
    if (existing === null) target.setItem(backupKey, raw)
    return target.getItem(backupKey) === raw ? backupKey : null
  } catch {
    return null
  }
}

function corruptRecoveryError(target: Storage, key: string, raw: string, message: string): string {
  const backupKey = backupCorruptRecovery(target, key, raw)
  return backupKey
    ? `${message}；原始数据已备份到 ${backupKey}，为避免覆盖已停止写入`
    : `${message}；原始数据备份失败，为避免覆盖已停止写入`
}

function readMap(target: Storage, key: string): DraftRecoveryMapReadResult {
  const raw = target.getItem(key)
  if (!raw) return { drafts: {}, error: null }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        drafts: {},
        error: corruptRecoveryError(target, key, raw, '练习草稿恢复区格式无效'),
      }
    }
    const drafts: DraftRecoveryMap = {}
    let invalidEntry = false
    for (const [exerciseId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!exerciseId.trim() || exerciseId.length > 200 || !value || typeof value !== 'object') {
        invalidEntry = true
        continue
      }
      const entry = value as Partial<StoredDraftRecoveryEntry>
      if (
        typeof entry.code !== 'string' ||
        entry.code.length > MAX_PRACTICE_DRAFT_LENGTH ||
        typeof entry.language !== 'string' ||
        !entry.language.trim() ||
        entry.language.length > 40 ||
        !Number.isSafeInteger(entry.baseRevision) ||
        Number(entry.baseRevision) < 0 ||
        !Number.isSafeInteger(entry.localVersion) ||
        Number(entry.localVersion) < 1 ||
        typeof entry.updatedAt !== 'number' ||
        !Number.isFinite(entry.updatedAt)
      ) {
        invalidEntry = true
        continue
      }
      drafts[exerciseId] = {
        code: entry.code,
        language: entry.language,
        baseRevision: Number(entry.baseRevision),
        localVersion: Number(entry.localVersion),
        updatedAt: entry.updatedAt,
      }
    }
    return invalidEntry
      ? {
          drafts,
          error: corruptRecoveryError(target, key, raw, '练习草稿恢复区包含损坏条目'),
        }
      : { drafts, error: null }
  } catch {
    return {
      drafts: {},
      error: corruptRecoveryError(target, key, raw, '练习草稿恢复区 JSON 已损坏'),
    }
  }
}

function listSessionKeys(target: Storage): string[] {
  const keys: string[] = []
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key?.startsWith(PRACTICE_DRAFT_RECOVERY_KEY_PREFIX) && !key.includes('.corrupt.')) {
      keys.push(key)
    }
  }
  return keys.sort()
}

function readLegacyV1Map(target: Storage): LegacyDraftRecoveryMapReadResult {
  const raw = target.getItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY)
  if (raw === null) return { drafts: {}, error: null }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        drafts: {},
        error: corruptRecoveryError(
          target,
          LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
          raw,
          '旧版练习草稿恢复区格式无效，恢复已降级',
        ),
      }
    }
    const drafts: LegacyDraftRecoveryMap = {}
    let invalidEntry = false
    for (const [exerciseId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        !exerciseId.trim() ||
        exerciseId.length > 200 ||
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value)
      ) {
        invalidEntry = true
        continue
      }
      const entry = value as { code?: unknown; updatedAt?: unknown }
      if (
        typeof entry.code !== 'string' ||
        entry.code.length > MAX_PRACTICE_DRAFT_LENGTH ||
        typeof entry.updatedAt !== 'number' ||
        !Number.isFinite(entry.updatedAt)
      ) {
        invalidEntry = true
        continue
      }
      drafts[exerciseId] = { code: entry.code, updatedAt: entry.updatedAt }
    }
    return invalidEntry
      ? {
          drafts,
          error: corruptRecoveryError(
            target,
            LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
            raw,
            '旧版练习草稿恢复区包含损坏条目，恢复已降级',
          ),
        }
      : { drafts, error: null }
  } catch {
    return {
      drafts: {},
      error: corruptRecoveryError(
        target,
        LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
        raw,
        '旧版练习草稿恢复区 JSON 已损坏，恢复已降级',
      ),
    }
  }
}

function readLegacyV1(target: Storage, exerciseId: string): LegacyDraftRecoveryReadResult {
  const result = readLegacyV1Map(target)
  const entry = result.drafts[exerciseId]
  return {
    entry: entry
      ? {
          code: entry.code,
          language: '',
          baseRevision: null,
          localVersion: 1,
          updatedAt: entry.updatedAt,
          legacy: true,
          sourceKey: LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
          sourceKeys: [LEGACY_PRACTICE_DRAFT_RECOVERY_KEY],
        }
      : null,
    error: result.error,
  }
}

function candidateFingerprint(entry: DraftRecoveryEntry): string {
  return JSON.stringify([entry.code, entry.language, entry.baseRevision])
}

function deduplicateCandidates(candidates: DraftRecoveryEntry[]): DraftRecoveryEntry[] {
  const groups = new Map<string, DraftRecoveryEntry>()
  for (const candidate of candidates) {
    const fingerprint = candidateFingerprint(candidate)
    const existing = groups.get(fingerprint)
    if (!existing) {
      groups.set(fingerprint, { ...candidate, sourceKeys: [...candidate.sourceKeys] })
      continue
    }
    existing.localVersion = Math.max(existing.localVersion, candidate.localVersion)
    existing.updatedAt = Math.max(existing.updatedAt, candidate.updatedAt)
    existing.legacy = existing.legacy && candidate.legacy
    existing.sourceKeys = [...new Set([...existing.sourceKeys, ...candidate.sourceKeys])].sort()
    existing.sourceKey = existing.sourceKeys[0]
  }
  return [...groups.values()].sort((left, right) =>
    candidateFingerprint(left).localeCompare(candidateFingerprint(right)),
  )
}

function matchesExpected(
  entry: StoredDraftRecoveryEntry,
  expected: DraftRecoveryClearExpectation,
): boolean {
  if (entry.code !== expected.snapshot.code || entry.language !== expected.snapshot.language) {
    return false
  }
  if (expected.baseRevision !== undefined && entry.baseRevision !== expected.baseRevision)
    return false
  if (expected.localVersion !== undefined && entry.localVersion !== expected.localVersion)
    return false
  return true
}

function storedDraftFingerprint(entry: StoredDraftRecoveryEntry): string {
  return JSON.stringify([
    entry.code,
    entry.language,
    entry.baseRevision,
    entry.localVersion,
    entry.updatedAt,
  ])
}

function removeStoredRecoveryEntry(
  target: Storage,
  key: string,
  exerciseId: string,
  expected: DraftRecoveryClearExpectation | undefined,
  ownedByCurrentSession: boolean,
): void {
  const initial = readMap(target, key)
  if (initial.error) return
  const initialEntry = initial.drafts[exerciseId]
  if (!initialEntry || (expected && !matchesExpected(initialEntry, expected))) return
  if (!ownedByCurrentSession && !expected) return

  const latest = ownedByCurrentSession ? initial : readMap(target, key)
  if (latest.error) return
  const latestEntry = latest.drafts[exerciseId]
  if (
    !latestEntry ||
    storedDraftFingerprint(latestEntry) !== storedDraftFingerprint(initialEntry) ||
    (expected && !matchesExpected(latestEntry, expected))
  ) {
    return
  }
  delete latest.drafts[exerciseId]
  target.setItem(key, JSON.stringify(latest.drafts))
}

function removeLegacyV1Entry(
  target: Storage,
  exerciseId: string,
  expected?: DraftRecoveryClearExpectation,
): void {
  try {
    const initial = readLegacyV1Map(target)
    if (initial.error) return
    const initialEntry = initial.drafts[exerciseId]
    if (!initialEntry) return
    if (expected && initialEntry.code !== expected.snapshot.code) return
    const initialFingerprint = JSON.stringify(initialEntry)

    const latest = readLegacyV1Map(target)
    if (latest.error) return
    const latestEntry = latest.drafts[exerciseId]
    if (
      !latestEntry ||
      JSON.stringify(latestEntry) !== initialFingerprint ||
      (expected && latestEntry.code !== expected.snapshot.code)
    ) {
      return
    }
    delete latest.drafts[exerciseId]
    target.setItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY, JSON.stringify(latest.drafts))
  } catch {
    // A durable or newer session entry remains authoritative.
  }
}

export class DraftRecoveryStore {
  readonly sessionKey: string
  private readonly bootScope: string | null

  constructor(
    sessionId: string = createSessionId(),
    private readonly getStorage: StorageProvider = defaultStorage,
  ) {
    const normalized = sessionId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120) || 'unknown'
    this.sessionKey = `${PRACTICE_DRAFT_RECOVERY_KEY_PREFIX}${normalized}`
    this.bootScope = recoverySessionBootScope(normalized)
  }

  read(exerciseId: string): DraftRecoveryReadResult {
    const target = this.getStorage()
    if (!target) return { entry: null, candidates: [], conflict: false, error: null }
    const errors: string[] = []
    const candidates: DraftRecoveryEntry[] = []

    for (const key of listSessionKeys(target)) {
      const result = readMap(target, key)
      if (result.error) errors.push(result.error)
      const entry = result.drafts[exerciseId]
      if (entry) {
        candidates.push({
          ...entry,
          legacy: false,
          sourceKey: key,
          sourceKeys: [key],
        })
      }
    }

    const legacyV2 = readMap(target, PRACTICE_DRAFT_RECOVERY_KEY)
    if (legacyV2.error) errors.push(legacyV2.error)
    const legacyV2Entry = legacyV2.drafts[exerciseId]
    if (legacyV2Entry) {
      candidates.push({
        ...legacyV2Entry,
        legacy: false,
        sourceKey: PRACTICE_DRAFT_RECOVERY_KEY,
        sourceKeys: [PRACTICE_DRAFT_RECOVERY_KEY],
      })
    }
    const legacyV1 = readLegacyV1(target, exerciseId)
    if (legacyV1.error) errors.push(legacyV1.error)
    if (legacyV1.entry) candidates.push(legacyV1.entry)

    const deduplicated = deduplicateCandidates(candidates)
    const ownCandidateIndex = deduplicated.findIndex((candidate) =>
      candidate.sourceKeys.includes(this.sessionKey),
    )
    if (ownCandidateIndex > 0) {
      const [ownCandidate] = deduplicated.splice(ownCandidateIndex, 1)
      deduplicated.unshift(ownCandidate)
    }
    const conflict = deduplicated.length > 1
    if (conflict) {
      errors.push(
        `检测到 ${deduplicated.length} 个分叉的练习草稿恢复候选，已保留全部候选并停止自动覆盖`,
      )
    }
    return {
      entry: deduplicated[0] ?? null,
      candidates: deduplicated,
      conflict,
      error: errors.length > 0 ? errors.join('；') : null,
    }
  }

  write(
    exerciseId: string,
    snapshot: DraftSnapshot,
    baseRevision: number,
    localVersion: number,
  ): string | null {
    if (!exerciseId.trim() || exerciseId.length > 200) return '草稿题目标识无效'
    if (snapshot.code.length > MAX_PRACTICE_DRAFT_LENGTH) {
      return `草稿超过 ${MAX_PRACTICE_DRAFT_LENGTH} 字符，无法自动保存`
    }
    if (!snapshot.language.trim() || snapshot.language.length > 40) {
      return '草稿语言无效，无法自动保存'
    }
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) return '草稿版本无效'
    if (!Number.isSafeInteger(localVersion) || localVersion < 1) return '草稿本地版本无效'
    const target = this.getStorage()
    if (!target) return '当前环境不支持草稿恢复存储'

    try {
      const own = readMap(target, this.sessionKey)
      if (own.error) return own.error
      const projected: StoredDraftRecoveryEntry[] = []
      for (const key of listSessionKeys(target)) {
        const result = key === this.sessionKey ? own : readMap(target, key)
        for (const [storedExerciseId, entry] of Object.entries(result.drafts)) {
          if (key !== this.sessionKey || storedExerciseId !== exerciseId) projected.push(entry)
        }
      }
      const legacyV2 = readMap(target, PRACTICE_DRAFT_RECOVERY_KEY)
      projected.push(...Object.values(legacyV2.drafts))
      const next: StoredDraftRecoveryEntry = {
        ...snapshot,
        baseRevision,
        localVersion,
        updatedAt: Date.now(),
      }
      projected.push(next)
      if (projected.length > MAX_PRACTICE_RECOVERY_ENTRIES) {
        return `草稿恢复区最多保存 ${MAX_PRACTICE_RECOVERY_ENTRIES} 个未同步草稿；现有草稿均已保留，请先恢复或清理后重试`
      }
      const totalLength = projected.reduce((total, entry) => total + entry.code.length, 0)
      if (totalLength > MAX_PRACTICE_RECOVERY_TOTAL_LENGTH) {
        return `草稿恢复区总量超过 ${MAX_PRACTICE_RECOVERY_TOTAL_LENGTH} 字符；现有草稿均已保留，请先恢复或清理后重试`
      }

      own.drafts[exerciseId] = next
      target.setItem(this.sessionKey, JSON.stringify(own.drafts))
      this.clearMatchingLegacyEntries(target, exerciseId, {
        snapshot,
        baseRevision,
        localVersion,
      })
      return null
    } catch (error) {
      return error instanceof Error ? `草稿恢复区写入失败：${error.message}` : '草稿恢复区写入失败'
    }
  }

  clear(exerciseId: string, expected?: DraftRecoveryClearExpectation): void {
    const target = this.getStorage()
    if (!target) return
    try {
      const requestedKeys = expected?.sourceKeys?.length
        ? new Set(expected.sourceKeys)
        : expected
          ? null
          : new Set([this.sessionKey])
      const keys = [...listSessionKeys(target), PRACTICE_DRAFT_RECOVERY_KEY]
      for (const key of keys) {
        if (requestedKeys && !requestedKeys.has(key)) continue
        if (
          key !== this.sessionKey &&
          this.bootScope &&
          recoveryKeyBootScope(key, PRACTICE_DRAFT_RECOVERY_KEY_PREFIX) === this.bootScope
        ) {
          continue
        }
        removeStoredRecoveryEntry(target, key, exerciseId, expected, key === this.sessionKey)
      }
      if (!requestedKeys || requestedKeys.has(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY)) {
        removeLegacyV1Entry(target, exerciseId, expected)
      }
    } catch {
      // SQLite is already durable; unmatched or unreadable candidates remain recoverable.
    }
  }

  private clearMatchingLegacyEntries(
    target: Storage,
    exerciseId: string,
    expected: DraftRecoveryClearExpectation,
  ): void {
    removeStoredRecoveryEntry(target, PRACTICE_DRAFT_RECOVERY_KEY, exerciseId, expected, false)
    removeLegacyV1Entry(target, exerciseId, expected)
  }
}

const singleton = new DraftRecoveryStore()

export function getPracticeDraftRecoverySessionKey(): string {
  return singleton.sessionKey
}

export function readDraftRecovery(exerciseId: string): DraftRecoveryEntry | null {
  return singleton.read(exerciseId).entry
}

export function readDraftRecoveryWithStatus(exerciseId: string): DraftRecoveryReadResult {
  return singleton.read(exerciseId)
}

/** Returns an error message instead of hiding quota, size, or session-write failures. */
export function writeDraftRecovery(
  exerciseId: string,
  snapshot: DraftSnapshot,
  baseRevision: number,
  localVersion: number,
): string | null {
  return singleton.write(exerciseId, snapshot, baseRevision, localVersion)
}

export function clearDraftRecovery(
  exerciseId: string,
  expected?: DraftRecoveryClearExpectation,
): void {
  singleton.clear(exerciseId, expected)
}
