export const PRACTICE_SESSION_KEY = 'codehelper-practice-session-v1'

export interface PracticeSession {
  exerciseId: string
  updatedAt: number
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

export function writePracticeSession(exerciseId: string): void {
  const target = storage()
  const normalized = exerciseId.trim().slice(0, 200)
  if (!target || !normalized) return
  try {
    target.setItem(
      PRACTICE_SESSION_KEY,
      JSON.stringify({ exerciseId: normalized, updatedAt: Date.now() } satisfies PracticeSession),
    )
  } catch {
    // Session restore is a convenience; draft persistence remains independent.
  }
}
