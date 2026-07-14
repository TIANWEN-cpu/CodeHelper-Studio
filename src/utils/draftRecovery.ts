import type { DraftSnapshot } from './draftAutosave'

export const PRACTICE_DRAFT_RECOVERY_KEY = 'codehelper-practice-draft-recovery-v2'
export const LEGACY_PRACTICE_DRAFT_RECOVERY_KEY = 'codehelper-practice-draft-recovery-v1'
export const MAX_PRACTICE_DRAFT_LENGTH = 100_000
export const MAX_PRACTICE_RECOVERY_ENTRIES = 20
export const MAX_PRACTICE_RECOVERY_TOTAL_LENGTH = 1_000_000

export interface DraftRecoveryEntry extends DraftSnapshot {
  baseRevision: number | null
  localVersion: number
  updatedAt: number
  legacy: boolean
}

type DraftRecoveryMap = Record<string, Omit<DraftRecoveryEntry, 'legacy'>>

export interface DraftRecoveryReadResult {
  entry: DraftRecoveryEntry | null
  error: string | null
}

interface DraftRecoveryMapReadResult {
  drafts: DraftRecoveryMap
  error: string | null
}

const corruptRecoveryBackups = new WeakMap<Storage, Map<string, string | null>>()

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function backupCorruptRecovery(target: Storage, key: string, raw: string): string | null {
  const signature = `${key}\u0000${raw}`
  const existing = corruptRecoveryBackups.get(target)?.get(signature)
  if (existing !== undefined) return existing
  const backupKey = `${key}.corrupt.${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let storedKey: string | null = null
  try {
    target.setItem(backupKey, raw)
    storedKey = backupKey
  } catch {
    storedKey = null
  }
  const backups = corruptRecoveryBackups.get(target) ?? new Map<string, string | null>()
  backups.set(signature, storedKey)
  corruptRecoveryBackups.set(target, backups)
  return storedKey
}

function corruptRecoveryError(target: Storage, key: string, raw: string, message: string): string {
  const backupKey = backupCorruptRecovery(target, key, raw)
  return backupKey
    ? `${message}；原始数据已备份到 ${backupKey}，为避免覆盖已停止写入`
    : `${message}；原始数据备份失败，为避免覆盖已停止写入`
}

function readAll(): DraftRecoveryMapReadResult {
  const target = storage()
  if (!target) return { drafts: {}, error: null }
  const raw = target.getItem(PRACTICE_DRAFT_RECOVERY_KEY)
  if (!raw) return { drafts: {}, error: null }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        drafts: {},
        error: corruptRecoveryError(
          target,
          PRACTICE_DRAFT_RECOVERY_KEY,
          raw,
          '练习草稿恢复区格式无效',
        ),
      }
    }
    const result: DraftRecoveryMap = {}
    let invalidEntry = false
    for (const [exerciseId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!exerciseId.trim() || exerciseId.length > 200 || !value || typeof value !== 'object') {
        invalidEntry = true
        continue
      }
      const entry = value as Partial<DraftRecoveryEntry>
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
      result[exerciseId] = {
        code: entry.code,
        language: entry.language,
        baseRevision: Number(entry.baseRevision),
        localVersion: Number(entry.localVersion),
        updatedAt: entry.updatedAt,
      }
    }
    return invalidEntry
      ? {
          drafts: result,
          error: corruptRecoveryError(
            target,
            PRACTICE_DRAFT_RECOVERY_KEY,
            raw,
            '练习草稿恢复区包含损坏条目',
          ),
        }
      : { drafts: result, error: null }
  } catch {
    return {
      drafts: {},
      error: corruptRecoveryError(
        target,
        PRACTICE_DRAFT_RECOVERY_KEY,
        raw,
        '练习草稿恢复区 JSON 已损坏',
      ),
    }
  }
}

function readLegacy(exerciseId: string): DraftRecoveryEntry | null {
  const target = storage()
  if (!target) return null
  try {
    const parsed = JSON.parse(target.getItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const value = (parsed as Record<string, unknown>)[exerciseId]
    if (!value || typeof value !== 'object') return null
    const entry = value as { code?: unknown; updatedAt?: unknown }
    if (
      typeof entry.code !== 'string' ||
      entry.code.length > MAX_PRACTICE_DRAFT_LENGTH ||
      typeof entry.updatedAt !== 'number' ||
      !Number.isFinite(entry.updatedAt)
    ) {
      return null
    }
    return {
      code: entry.code,
      language: '',
      baseRevision: null,
      localVersion: 1,
      updatedAt: entry.updatedAt,
      legacy: true,
    }
  } catch {
    return null
  }
}

function removeLegacyEntry(exerciseId: string): void {
  const target = storage()
  if (!target) return
  try {
    const parsed = JSON.parse(target.getItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const drafts = parsed as Record<string, unknown>
    if (!(exerciseId in drafts)) return
    delete drafts[exerciseId]
    target.setItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY, JSON.stringify(drafts))
  } catch {
    // Legacy cleanup is best effort; v2 data remains authoritative.
  }
}

export function readDraftRecovery(exerciseId: string): DraftRecoveryEntry | null {
  return readDraftRecoveryWithStatus(exerciseId).entry
}

export function readDraftRecoveryWithStatus(exerciseId: string): DraftRecoveryReadResult {
  const result = readAll()
  const entry = result.drafts[exerciseId]
  return {
    entry: entry ? { ...entry, legacy: false } : readLegacy(exerciseId),
    error: result.error,
  }
}

/** Returns an error message instead of hiding quota or size failures. */
export function writeDraftRecovery(
  exerciseId: string,
  snapshot: DraftSnapshot,
  baseRevision: number,
  localVersion: number,
): string | null {
  if (!exerciseId.trim() || exerciseId.length > 200) return '草稿题目标识无效'
  if (snapshot.code.length > MAX_PRACTICE_DRAFT_LENGTH) {
    return `草稿超过 ${MAX_PRACTICE_DRAFT_LENGTH} 字符，无法自动保存`
  }
  if (!snapshot.language.trim() || snapshot.language.length > 40)
    return '草稿语言无效，无法自动保存'
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) return '草稿版本无效'
  if (!Number.isSafeInteger(localVersion) || localVersion < 1) return '草稿本地版本无效'
  const target = storage()
  if (!target) return '当前环境不支持草稿恢复存储'
  try {
    const current = readAll()
    if (current.error) return current.error
    const drafts = current.drafts
    drafts[exerciseId] = {
      ...snapshot,
      baseRevision,
      localVersion,
      updatedAt: Date.now(),
    }
    const entries = Object.values(drafts)
    if (entries.length > MAX_PRACTICE_RECOVERY_ENTRIES) {
      return `草稿恢复区最多保存 ${MAX_PRACTICE_RECOVERY_ENTRIES} 个未同步草稿；现有草稿均已保留，请先恢复或清理后重试`
    }
    const totalLength = entries.reduce((total, entry) => total + entry.code.length, 0)
    if (totalLength > MAX_PRACTICE_RECOVERY_TOTAL_LENGTH) {
      return `草稿恢复区总量超过 ${MAX_PRACTICE_RECOVERY_TOTAL_LENGTH} 字符；现有草稿均已保留，请先恢复或清理后重试`
    }
    target.setItem(PRACTICE_DRAFT_RECOVERY_KEY, JSON.stringify(drafts))
    removeLegacyEntry(exerciseId)
    return null
  } catch (error) {
    return error instanceof Error ? `草稿恢复区写入失败：${error.message}` : '草稿恢复区写入失败'
  }
}

export function clearDraftRecovery(
  exerciseId: string,
  expected?: { snapshot: DraftSnapshot; baseRevision?: number; localVersion?: number },
): void {
  const target = storage()
  if (!target) return
  try {
    const result = readAll()
    if (result.error) return
    const drafts = result.drafts
    const current = drafts[exerciseId]
    if (current) {
      if (expected && current.code !== expected.snapshot.code) return
      if (expected && current.language !== expected.snapshot.language) return
      if (expected?.baseRevision !== undefined && current.baseRevision !== expected.baseRevision)
        return
      if (expected?.localVersion !== undefined && current.localVersion !== expected.localVersion)
        return
      delete drafts[exerciseId]
      target.setItem(PRACTICE_DRAFT_RECOVERY_KEY, JSON.stringify(drafts))
    }
    removeLegacyEntry(exerciseId)
  } catch {
    // SQLite is already durable; stale recovery data will be reconciled on the next load.
  }
}
