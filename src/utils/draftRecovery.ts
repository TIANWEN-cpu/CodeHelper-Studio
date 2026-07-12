export const PRACTICE_DRAFT_RECOVERY_KEY = 'codehelper-practice-draft-recovery-v1'
export const MAX_PRACTICE_DRAFT_LENGTH = 100_000
export const MAX_PRACTICE_RECOVERY_ENTRIES = 20
export const MAX_PRACTICE_RECOVERY_TOTAL_LENGTH = 1_000_000

export interface DraftRecoveryEntry {
  code: string
  updatedAt: number
}

type DraftRecoveryMap = Record<string, DraftRecoveryEntry>

function pruneDrafts(drafts: DraftRecoveryMap, preferredExerciseId?: string): DraftRecoveryMap {
  const entries = Object.entries(drafts).sort(([leftId, left], [rightId, right]) => {
    if (leftId === preferredExerciseId) return -1
    if (rightId === preferredExerciseId) return 1
    return right.updatedAt - left.updatedAt
  })
  const result: DraftRecoveryMap = {}
  let totalLength = 0

  for (const [exerciseId, entry] of entries) {
    if (Object.keys(result).length >= MAX_PRACTICE_RECOVERY_ENTRIES) break
    if (totalLength + entry.code.length > MAX_PRACTICE_RECOVERY_TOTAL_LENGTH) continue
    result[exerciseId] = entry
    totalLength += entry.code.length
  }

  return result
}

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

function readAll(): DraftRecoveryMap {
  const target = storage()
  if (!target) return {}
  try {
    const parsed = JSON.parse(target.getItem(PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: DraftRecoveryMap = {}
    for (const [exerciseId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const entry = value as Partial<DraftRecoveryEntry>
      if (
        typeof entry.code !== 'string' ||
        entry.code.length > MAX_PRACTICE_DRAFT_LENGTH ||
        typeof entry.updatedAt !== 'number' ||
        !Number.isFinite(entry.updatedAt)
      ) {
        continue
      }
      result[exerciseId] = { code: entry.code, updatedAt: entry.updatedAt }
    }
    return pruneDrafts(result)
  } catch {
    return {}
  }
}

export function readDraftRecovery(exerciseId: string): DraftRecoveryEntry | null {
  return readAll()[exerciseId] ?? null
}

/** Returns an error message instead of hiding quota or size failures. */
export function writeDraftRecovery(exerciseId: string, code: string): string | null {
  if (code.length > MAX_PRACTICE_DRAFT_LENGTH) {
    return `草稿超过 ${MAX_PRACTICE_DRAFT_LENGTH} 字符，无法自动保存`
  }
  const target = storage()
  if (!target) return '当前环境不支持草稿恢复存储'
  try {
    const drafts = readAll()
    drafts[exerciseId] = { code, updatedAt: Date.now() }
    target.setItem(PRACTICE_DRAFT_RECOVERY_KEY, JSON.stringify(pruneDrafts(drafts, exerciseId)))
    return null
  } catch (error) {
    return error instanceof Error ? `草稿恢复区写入失败：${error.message}` : '草稿恢复区写入失败'
  }
}

export function clearDraftRecovery(exerciseId: string, expectedCode?: string): void {
  const target = storage()
  if (!target) return
  try {
    const drafts = readAll()
    if (!(exerciseId in drafts)) return
    if (expectedCode !== undefined && drafts[exerciseId].code !== expectedCode) return
    delete drafts[exerciseId]
    target.setItem(PRACTICE_DRAFT_RECOVERY_KEY, JSON.stringify(drafts))
  } catch {
    // The SQLite draft is already durable; stale recovery data can be retried later.
  }
}
