import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PRACTICE_SESSION_KEY,
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
    },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('practice session recovery', () => {
  it('restores the last successfully opened exercise', () => {
    writePracticeSession('exercise-a')

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
})
