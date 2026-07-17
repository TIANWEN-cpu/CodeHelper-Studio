import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRACTICE_SESSION_KEY,
  clearPracticeSession,
  readPracticeSession,
  writePracticeSession,
} from '../src/utils/practiceSession'

const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('practice session recovery', () => {
  it('restores the last successfully opened exercise', () => {
    expect(writePracticeSession('exercise-a')).toEqual({ persisted: true, error: null })

    expect(readPracticeSession()).toEqual({
      exerciseId: 'exercise-a',
      updatedAt: expect.any(Number),
    })
    expect(values.has(PRACTICE_SESSION_KEY)).toBe(true)
  })

  it('ignores malformed session data', () => {
    values.set(PRACTICE_SESSION_KEY, JSON.stringify({ exerciseId: '', updatedAt: 'never' }))
    expect(readPracticeSession()).toBeNull()
  })

  it('durably removes the fallback after the last exercise tab closes', () => {
    writePracticeSession('exercise-a')

    expect(clearPracticeSession()).toEqual({ persisted: true, error: null })
    expect(values.has(PRACTICE_SESSION_KEY)).toBe(false)
    expect(readPracticeSession()).toBeNull()
  })

  it('treats an already absent fallback as a successful closed topology', () => {
    expect(clearPracticeSession()).toEqual({ persisted: true, error: null })
  })

  it('reports a failed fallback removal without pretending the close is durable', () => {
    values.set(
      PRACTICE_SESSION_KEY,
      JSON.stringify({ exerciseId: 'exercise-a', updatedAt: Date.now() }),
    )
    const localStorage = window.localStorage
    vi.mocked(localStorage.removeItem).mockImplementation(() => {
      throw new Error('storage blocked')
    })

    const result = clearPracticeSession()

    expect(result.persisted).toBe(false)
    expect(result.error).toContain('storage blocked')
    expect(readPracticeSession()?.exerciseId).toBe('exercise-a')
  })

  it('reports silent storage write and removal failures', () => {
    const localStorage = window.localStorage
    vi.mocked(localStorage.setItem).mockImplementation(() => undefined)
    expect(writePracticeSession('exercise-a')).toMatchObject({ persisted: false })

    values.set(
      PRACTICE_SESSION_KEY,
      JSON.stringify({ exerciseId: 'exercise-a', updatedAt: Date.now() }),
    )
    vi.mocked(localStorage.removeItem).mockImplementation(() => undefined)
    expect(clearPracticeSession()).toMatchObject({ persisted: false })
  })
})
