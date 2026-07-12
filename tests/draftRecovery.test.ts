import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
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
  it('writes and restores the complete local snapshot contract', () => {
    expect(
      writeDraftRecovery('exercise-a', { code: 'latest code', language: 'javascript' }, 4, 7),
    ).toBeNull()

    expect(readDraftRecovery('exercise-a')).toEqual({
      code: 'latest code',
      language: 'javascript',
      baseRevision: 4,
      localVersion: 7,
      updatedAt: expect.any(Number),
      legacy: false,
    })
    expect(values.has(PRACTICE_DRAFT_RECOVERY_KEY)).toBe(true)
  })

  it('does not clear a newer recovery entry with the same code but another language', () => {
    writeDraftRecovery('exercise-a', { code: 'same', language: 'javascript' }, 4, 8)

    clearDraftRecovery('exercise-a', {
      snapshot: { code: 'same', language: 'python' },
      baseRevision: 4,
      localVersion: 7,
    })
    expect(readDraftRecovery('exercise-a')?.language).toBe('javascript')

    clearDraftRecovery('exercise-a', {
      snapshot: { code: 'same', language: 'javascript' },
      baseRevision: 4,
      localVersion: 8,
    })
    expect(readDraftRecovery('exercise-a')).toBeNull()
  })

  it('reads v1 code-only recovery without inventing a database revision', () => {
    values.set(
      LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
      JSON.stringify({ 'exercise-a': { code: 'legacy code', updatedAt: 123 } }),
    )

    expect(readDraftRecovery('exercise-a')).toEqual({
      code: 'legacy code',
      language: '',
      baseRevision: null,
      localVersion: 1,
      updatedAt: 123,
      legacy: true,
    })

    writeDraftRecovery('exercise-a', { code: 'migrated', language: 'python' }, 0, 2)
    expect(readDraftRecovery('exercise-a')).toMatchObject({
      code: 'migrated',
      baseRevision: 0,
      legacy: false,
    })
  })

  it('reports oversized drafts instead of truncating them', () => {
    const error = writeDraftRecovery(
      'exercise-a',
      { code: 'x'.repeat(MAX_PRACTICE_DRAFT_LENGTH + 1), language: 'python' },
      0,
      1,
    )

    expect(error).toContain('无法自动保存')
    expect(readDraftRecovery('exercise-a')).toBeNull()
  })

  it('evicts old entries before the recovery area reaches its capacity', () => {
    vi.useFakeTimers()
    const draftCount = MAX_PRACTICE_RECOVERY_ENTRIES + 5
    for (let index = 0; index < draftCount; index += 1) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, index))
      expect(
        writeDraftRecovery(
          `exercise-${index}`,
          { code: 'x'.repeat(60_000), language: 'python' },
          0,
          1,
        ),
      ).toBeNull()
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
