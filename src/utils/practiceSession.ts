export const PRACTICE_SESSION_KEY = 'codehelper-practice-session-v1'

export interface PracticeSession {
  exerciseId: string
  updatedAt: number
}

export interface PracticeSessionPersistenceResult {
  persisted: boolean
  error: string | null
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

export function readPracticeSession(): PracticeSession | null {
  const target = storage()
  if (!target) return null
  try {
    const parsed = JSON.parse(target.getItem(PRACTICE_SESSION_KEY) ?? 'null') as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const session = parsed as Partial<PracticeSession>
    if (
      typeof session.exerciseId !== 'string' ||
      !session.exerciseId.trim() ||
      typeof session.updatedAt !== 'number' ||
      !Number.isFinite(session.updatedAt)
    ) {
      return null
    }
    return { exerciseId: session.exerciseId.trim().slice(0, 200), updatedAt: session.updatedAt }
  } catch {
    return null
  }
}

function persistenceFailure(error: unknown): PracticeSessionPersistenceResult {
  const detail = error instanceof Error && error.message.trim() ? `：${error.message.trim()}` : ''
  return { persisted: false, error: `本地练习恢复状态写入失败${detail}` }
}

export function writePracticeSession(exerciseId: string): PracticeSessionPersistenceResult {
  const target = storage()
  const normalized = exerciseId.trim().slice(0, 200)
  if (!target) return persistenceFailure('localStorage unavailable')
  if (!normalized) return persistenceFailure('exercise id is empty')
  try {
    target.setItem(
      PRACTICE_SESSION_KEY,
      JSON.stringify({ exerciseId: normalized, updatedAt: Date.now() } satisfies PracticeSession),
    )
    const persisted = readPracticeSession()
    if (persisted?.exerciseId !== normalized) {
      return persistenceFailure('localStorage did not retain the selected exercise')
    }
    return { persisted: true, error: null }
  } catch (error) {
    return persistenceFailure(error)
  }
}

export function clearPracticeSession(): PracticeSessionPersistenceResult {
  const target = storage()
  if (!target) return persistenceFailure('localStorage unavailable')
  try {
    target.removeItem(PRACTICE_SESSION_KEY)
    if (target.getItem(PRACTICE_SESSION_KEY) !== null) {
      return persistenceFailure('localStorage did not remove the closed exercise')
    }
    return { persisted: true, error: null }
  } catch (error) {
    return persistenceFailure(error)
  }
}
