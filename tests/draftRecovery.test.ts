import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
  MAX_PRACTICE_DRAFT_LENGTH,
  MAX_PRACTICE_RECOVERY_ENTRIES,
  MAX_PRACTICE_RECOVERY_TOTAL_LENGTH,
  PRACTICE_DRAFT_RECOVERY_KEY,
  clearDraftRecovery,
  readDraftRecovery,
  readDraftRecoveryWithStatus,
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

  it('rejects a new entry at capacity without deleting older unsynchronized drafts', () => {
    vi.useFakeTimers()
    for (let index = 0; index < MAX_PRACTICE_RECOVERY_ENTRIES; index += 1) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, index))
      expect(
        writeDraftRecovery(`exercise-${index}`, { code: 'saved', language: 'python' }, 0, 1),
      ).toBeNull()
    }

    const error = writeDraftRecovery(
      'exercise-overflow',
      { code: 'must not evict another draft', language: 'python' },
      0,
      1,
    )

    const stored = JSON.parse(values.get(PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}') as Record<
      string,
      { code: string }
    >
    expect(error).toContain('现有草稿均已保留')
    expect(Object.keys(stored)).toHaveLength(MAX_PRACTICE_RECOVERY_ENTRIES)
    expect(readDraftRecovery('exercise-0')).not.toBeNull()
    expect(readDraftRecovery('exercise-overflow')).toBeNull()
  })

  it('backs up corrupt JSON and refuses to overwrite it silently', () => {
    const corrupt = '{broken recovery json'
    values.set(PRACTICE_DRAFT_RECOVERY_KEY, corrupt)

    const readResult = readDraftRecoveryWithStatus('exercise-a')
    const writeError = writeDraftRecovery(
      'exercise-a',
      { code: 'new code', language: 'python' },
      0,
      1,
    )

    expect(readResult).toMatchObject({ entry: null, error: expect.stringContaining('JSON 已损坏') })
    expect(writeError).toContain('已停止写入')
    expect(values.get(PRACTICE_DRAFT_RECOVERY_KEY)).toBe(corrupt)
    expect(
      [...values.entries()].some(
        ([key, value]) =>
          key.startsWith(`${PRACTICE_DRAFT_RECOVERY_KEY}.corrupt.`) && value === corrupt,
      ),
    ).toBe(true)
    expect(
      [...values.keys()].filter((key) => key.startsWith(`${PRACTICE_DRAFT_RECOVERY_KEY}.corrupt.`)),
    ).toHaveLength(1)
  })

  it('rejects total capacity overflow without pruning existing drafts', () => {
    const fullDraftCount = Math.floor(
      MAX_PRACTICE_RECOVERY_TOTAL_LENGTH / MAX_PRACTICE_DRAFT_LENGTH,
    )
    for (let index = 0; index < fullDraftCount; index += 1) {
      expect(
        writeDraftRecovery(
          `large-${index}`,
          { code: 'x'.repeat(MAX_PRACTICE_DRAFT_LENGTH), language: 'python' },
          0,
          1,
        ),
      ).toBeNull()
    }

    expect(writeDraftRecovery('large-overflow', { code: 'x', language: 'python' }, 0, 1)).toContain(
      '现有草稿均已保留',
    )
    expect(readDraftRecovery('large-0')?.code).toHaveLength(MAX_PRACTICE_DRAFT_LENGTH)
    expect(readDraftRecovery('large-overflow')).toBeNull()
  })
})
