import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_PRACTICE_DRAFT_LENGTH,
  MAX_PRACTICE_RECOVERY_ENTRIES,
  MAX_PRACTICE_RECOVERY_TOTAL_LENGTH,
  PRACTICE_DRAFT_RECOVERY_KEY,
  clearDraftRecovery,
  readDraftRecovery,
  writeDraftRecovery,
} from '../src/utils/draftRecovery'

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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('practice draft recovery', () => {
  it('writes synchronously and restores the latest code after a renderer restart', () => {
    expect(writeDraftRecovery('exercise-a', 'latest code')).toBeNull()

    expect(readDraftRecovery('exercise-a')).toEqual({
      code: 'latest code',
      updatedAt: expect.any(Number),
    })
    expect(values.has(PRACTICE_DRAFT_RECOVERY_KEY)).toBe(true)
  })

  it('only clears the recovery entry that matches the persisted code', () => {
    writeDraftRecovery('exercise-a', 'newer code')

    clearDraftRecovery('exercise-a', 'older code')
    expect(readDraftRecovery('exercise-a')?.code).toBe('newer code')

    clearDraftRecovery('exercise-a', 'newer code')
    expect(readDraftRecovery('exercise-a')).toBeNull()
  })

  it('reports oversized drafts instead of truncating them', () => {
    const error = writeDraftRecovery('exercise-a', 'x'.repeat(MAX_PRACTICE_DRAFT_LENGTH + 1))

    expect(error).toContain('无法自动保存')
    expect(readDraftRecovery('exercise-a')).toBeNull()
  })

  it('evicts old entries before the recovery area reaches its capacity', () => {
    vi.useFakeTimers()
    const draftCount = MAX_PRACTICE_RECOVERY_ENTRIES + 5
    for (let index = 0; index < draftCount; index += 1) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, index))
      expect(writeDraftRecovery(`exercise-${index}`, 'x'.repeat(60_000))).toBeNull()
    }

    const stored = JSON.parse(values.get(PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}') as Record<
      string,
      { code: string }
    >
    expect(Object.keys(stored).length).toBeLessThanOrEqual(MAX_PRACTICE_RECOVERY_ENTRIES)
    expect(
      Object.values(stored).reduce((total, entry) => total + entry.code.length, 0),
    ).toBeLessThanOrEqual(MAX_PRACTICE_RECOVERY_TOTAL_LENGTH)
    expect(readDraftRecovery(`exercise-${draftCount - 1}`)).not.toBeNull()
    expect(readDraftRecovery('exercise-0')).toBeNull()
  })
})
