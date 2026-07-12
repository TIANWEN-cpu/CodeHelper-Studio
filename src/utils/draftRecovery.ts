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

function pruneDrafts(drafts: DraftRecoveryMap, preferredExerciseId?: string): DraftRecoveryMap {
  const entries = Object.entries(drafts).sort(([leftId, left], [rightId, right]) => {
    if (leftId === preferredExerciseId) return -1
    if (rightId === preferredExerciseId) return 1
    return right.updatedAt - left.updatedAt
  })
  const result: DraftRecoveryMap = {}
  let totalLength = 0
  let entryCount = 0

  for (const [exerciseId, entry] of entries) {
    if (entryCount >= MAX_PRACTICE_RECOVERY_ENTRIES) break
    if (totalLength + entry.code.length > MAX_PRACTICE_RECOVERY_TOTAL_LENGTH) continue
    result[exerciseId] = entry
    totalLength += entry.code.length
    entryCount += 1
  }

  return result
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function readAll(): DraftRecoveryMap {
  const target = storage()
  if (!target) return {}
  try {
    const parsed = JSON.parse(target.getItem(PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: DraftRecoveryMap = {}
    for (const [exerciseId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!exerciseId.trim() || exerciseId.length > 200) continue
      if (!value || typeof value !== 'object') continue
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
    return pruneDrafts(result)
  } catch {
    return {}
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
  const entry = readAll()[exerciseId]
  return entry ? { ...entry, legacy: false } : readLegacy(exerciseId)
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
    const drafts = readAll()
    drafts[exerciseId] = {
      ...snapshot,
      baseRevision,
      localVersion,
      updatedAt: Date.now(),
    }
    target.setItem(PRACTICE_DRAFT_RECOVERY_KEY, JSON.stringify(pruneDrafts(drafts, exerciseId)))
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
    const drafts = readAll()
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
