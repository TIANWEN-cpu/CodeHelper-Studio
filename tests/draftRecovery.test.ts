import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DraftRecoveryStore,
  LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
  MAX_PRACTICE_DRAFT_LENGTH,
  MAX_PRACTICE_RECOVERY_ENTRIES,
  MAX_PRACTICE_RECOVERY_TOTAL_LENGTH,
  PRACTICE_DRAFT_RECOVERY_KEY,
  PRACTICE_DRAFT_RECOVERY_KEY_PREFIX,
  clearDraftRecovery,
  getPracticeDraftRecoverySessionKey,
  readDraftRecovery,
  readDraftRecoveryWithStatus,
  writeDraftRecovery,
} from '../src/utils/draftRecovery'
import { createBootScopedRecoverySessionId } from '../src/utils/recoverySession'

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  vi.stubGlobal('window', { localStorage: storage })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('practice draft recovery', () => {
  it('writes and restores the complete per-session snapshot contract', () => {
    expect(
      writeDraftRecovery('exercise-a', { code: 'latest code', language: 'javascript' }, 4, 7),
    ).toBeNull()

    expect(readDraftRecovery('exercise-a')).toMatchObject({
      code: 'latest code',
      language: 'javascript',
      baseRevision: 4,
      localVersion: 7,
      updatedAt: expect.any(Number),
      legacy: false,
      sourceKey: getPracticeDraftRecoverySessionKey(),
      sourceKeys: [getPracticeDraftRecoverySessionKey()],
    })
    expect(storage.values.has(getPracticeDraftRecoverySessionKey())).toBe(true)
    expect(storage.values.has(PRACTICE_DRAFT_RECOVERY_KEY)).toBe(false)
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
    storage.setItem(
      LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
      JSON.stringify({ 'exercise-a': { code: 'legacy code', updatedAt: 123 } }),
    )

    expect(readDraftRecovery('exercise-a')).toMatchObject({
      code: 'legacy code',
      language: '',
      baseRevision: null,
      localVersion: 1,
      updatedAt: 123,
      legacy: true,
      sourceKey: LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
    })

    writeDraftRecovery('exercise-a', { code: 'migrated', language: 'python' }, 0, 2)
    expect(readDraftRecovery('exercise-a')).toMatchObject({
      code: 'migrated',
      baseRevision: 0,
      legacy: false,
    })
    expect(readDraftRecoveryWithStatus('exercise-a').conflict).toBe(true)
  })

  it('backs up malformed v1 JSON at a deterministic key and reports degraded recovery', () => {
    const raw = '{broken legacy recovery json'
    const store = new DraftRecoveryStore('window-a', () => storage)
    storage.setItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY, raw)

    const firstRead = store.read('exercise-a')
    const firstBackup = [...storage.values.entries()].find(
      ([key]) =>
        key.startsWith(`${LEGACY_PRACTICE_DRAFT_RECOVERY_KEY}.corrupt.`) &&
        key !== LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
    )

    expect(firstRead).toMatchObject({
      entry: null,
      candidates: [],
      conflict: false,
      error: expect.stringContaining('旧版练习草稿恢复区 JSON 已损坏，恢复已降级'),
    })
    expect(firstBackup?.[1]).toBe(raw)

    const restartedStorage = new MemoryStorage()
    restartedStorage.setItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY, raw)
    new DraftRecoveryStore('window-b', () => restartedStorage).read('exercise-a')
    const restartedBackupKey = [...restartedStorage.values.keys()].find((key) =>
      key.startsWith(`${LEGACY_PRACTICE_DRAFT_RECOVERY_KEY}.corrupt.`),
    )
    expect(restartedBackupKey).toBe(firstBackup?.[0])

    expect(store.write('exercise-a', { code: 'new code', language: 'python' }, 0, 1)).toBeNull()
    expect(storage.getItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY)).toBe(raw)
    expect(storage.getItem(firstBackup?.[0] ?? '')).toBe(raw)
    expect(store.read('exercise-a')).toMatchObject({
      entry: { code: 'new code', sourceKey: store.sessionKey },
      error: expect.stringContaining('恢复已降级'),
    })
  })

  it('backs up a structurally invalid v1 map and isolates subsequent session writes', () => {
    const raw = JSON.stringify(['not', 'a', 'draft map'])
    const store = new DraftRecoveryStore('window-a', () => storage)
    storage.setItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY, raw)

    expect(store.read('exercise-a')).toMatchObject({
      entry: null,
      error: expect.stringContaining('旧版练习草稿恢复区格式无效，恢复已降级'),
    })
    expect(
      store.write('exercise-a', { code: 'isolated code', language: 'python' }, 0, 1),
    ).toBeNull()
    expect(storage.getItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY)).toBe(raw)
    expect(
      [...storage.values.entries()].some(
        ([key, value]) =>
          key.startsWith(`${LEGACY_PRACTICE_DRAFT_RECOVERY_KEY}.corrupt.`) && value === raw,
      ),
    ).toBe(true)
  })

  it('recovers valid v1 entries while backing up and protecting a damaged sibling entry', () => {
    const raw = JSON.stringify({
      'exercise-a': { code: 'same code as the new session', updatedAt: 'invalid' },
      'exercise-b': { code: 'recoverable legacy code', updatedAt: 456 },
    })
    const store = new DraftRecoveryStore('window-a', () => storage)
    storage.setItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY, raw)

    expect(store.read('exercise-b')).toMatchObject({
      entry: { code: 'recoverable legacy code', legacy: true },
      error: expect.stringContaining('旧版练习草稿恢复区包含损坏条目，恢复已降级'),
    })
    expect(
      store.write('exercise-a', { code: 'same code as the new session', language: 'python' }, 0, 1),
    ).toBeNull()
    expect(storage.getItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY)).toBe(raw)
    expect(
      [...storage.values.entries()].some(
        ([key, value]) =>
          key.startsWith(`${LEGACY_PRACTICE_DRAFT_RECOVERY_KEY}.corrupt.`) && value === raw,
      ),
    ).toBe(true)
  })

  it('continues to clean only the matching entry from a valid v1 map', () => {
    const store = new DraftRecoveryStore('window-a', () => storage)
    storage.setItem(
      LEGACY_PRACTICE_DRAFT_RECOVERY_KEY,
      JSON.stringify({
        'exercise-a': { code: 'migrated code', updatedAt: 123 },
        'exercise-b': { code: 'untouched code', updatedAt: 456 },
      }),
    )

    expect(
      store.write('exercise-a', { code: 'migrated code', language: 'python' }, 0, 1),
    ).toBeNull()
    expect(JSON.parse(storage.getItem(LEGACY_PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}')).toEqual({
      'exercise-b': { code: 'untouched code', updatedAt: 456 },
    })
    expect(store.read('exercise-a')).toMatchObject({
      conflict: false,
      entry: { code: 'migrated code', sourceKey: store.sessionKey },
    })
    expect(store.read('exercise-b')).toMatchObject({
      entry: { code: 'untouched code', legacy: true },
      error: null,
    })
  })

  it('upgrades a matching v2 shared-map entry into the current session without data loss', () => {
    storage.setItem(
      PRACTICE_DRAFT_RECOVERY_KEY,
      JSON.stringify({
        'exercise-a': {
          code: 'legacy v2',
          language: 'python',
          baseRevision: 3,
          localVersion: 5,
          updatedAt: 123,
        },
      }),
    )

    expect(readDraftRecovery('exercise-a')).toMatchObject({ code: 'legacy v2', baseRevision: 3 })
    expect(
      writeDraftRecovery('exercise-a', { code: 'legacy v2', language: 'python' }, 3, 5),
    ).toBeNull()
    expect(JSON.parse(storage.getItem(PRACTICE_DRAFT_RECOVERY_KEY) ?? '{}')).toEqual({})
    expect(readDraftRecovery('exercise-a')).toMatchObject({
      code: 'legacy v2',
      sourceKey: getPracticeDraftRecoverySessionKey(),
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
    const stored = JSON.parse(
      storage.getItem(getPracticeDraftRecoverySessionKey()) ?? '{}',
    ) as Record<string, { code: string }>
    expect(error).toContain('现有草稿均已保留')
    expect(Object.keys(stored)).toHaveLength(MAX_PRACTICE_RECOVERY_ENTRIES)
    expect(readDraftRecovery('exercise-0')).not.toBeNull()
    expect(readDraftRecovery('exercise-overflow')).toBeNull()
  })

  it('backs up corrupt legacy JSON while preserving new writes in a separate session key', () => {
    const corrupt = '{broken recovery json'
    storage.setItem(PRACTICE_DRAFT_RECOVERY_KEY, corrupt)

    const readResult = readDraftRecoveryWithStatus('exercise-a')
    const writeError = writeDraftRecovery(
      'exercise-a',
      { code: 'new code', language: 'python' },
      0,
      1,
    )

    expect(readResult).toMatchObject({ entry: null, error: expect.stringContaining('JSON 已损坏') })
    expect(writeError).toBeNull()
    expect(storage.getItem(PRACTICE_DRAFT_RECOVERY_KEY)).toBe(corrupt)
    expect(readDraftRecovery('exercise-a')).toMatchObject({ code: 'new code' })
    expect(
      [...storage.values.entries()].some(
        ([key, value]) =>
          key.startsWith(`${PRACTICE_DRAFT_RECOVERY_KEY}.corrupt.`) && value === corrupt,
      ),
    ).toBe(true)
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

  it('keeps A and B window edits in independent keys instead of last-writer overwriting', () => {
    const storeA = new DraftRecoveryStore('window-a', () => storage)
    const storeB = new DraftRecoveryStore('window-b', () => storage)

    expect(storeA.write('exercise-a', { code: 'A first', language: 'python' }, 4, 2)).toBeNull()
    expect(storeB.write('exercise-a', { code: 'B branch', language: 'python' }, 4, 2)).toBeNull()
    expect(storeA.write('exercise-a', { code: 'A latest', language: 'python' }, 4, 3)).toBeNull()

    expect(JSON.parse(storage.getItem(storeA.sessionKey) ?? '{}')['exercise-a'].code).toBe(
      'A latest',
    )
    expect(JSON.parse(storage.getItem(storeB.sessionKey) ?? '{}')['exercise-a'].code).toBe(
      'B branch',
    )
  })

  it('deduplicates identical candidates but exposes divergent crash candidates as conflict', () => {
    const storeA = new DraftRecoveryStore('window-a', () => storage)
    const storeB = new DraftRecoveryStore('window-b', () => storage)
    const restart = new DraftRecoveryStore('restart-window', () => storage)

    storeA.write('same', { code: 'same code', language: 'python' }, 2, 3)
    storeB.write('same', { code: 'same code', language: 'python' }, 2, 4)
    expect(restart.read('same')).toMatchObject({
      conflict: false,
      candidates: [{ code: 'same code' }],
    })
    expect(restart.read('same').entry?.sourceKeys).toHaveLength(2)

    storeA.write('fork', { code: 'A branch', language: 'python' }, 2, 3)
    storeB.write('fork', { code: 'B branch', language: 'python' }, 2, 3)
    const result = restart.read('fork')
    expect(result.conflict).toBe(true)
    expect(result.error).toContain('分叉')
    expect(result.candidates.map((candidate) => candidate.code).sort()).toEqual([
      'A branch',
      'B branch',
    ])
  })

  it('clears only matching saved candidates and preserves another window newer branch', () => {
    const storeA = new DraftRecoveryStore('window-a', () => storage)
    const storeB = new DraftRecoveryStore('window-b', () => storage)
    storeA.write('exercise-a', { code: 'A saved', language: 'python' }, 4, 2)
    storeB.write('exercise-a', { code: 'B newer', language: 'python' }, 4, 3)

    storeA.clear('exercise-a', { snapshot: { code: 'A saved', language: 'python' } })

    expect(storeA.read('exercise-a')).toMatchObject({
      conflict: false,
      entry: { code: 'B newer', sourceKey: storeB.sessionKey },
    })
    expect(storage.getItem(storeA.sessionKey)).toBe('{}')
    expect(storage.getItem(storeB.sessionKey)).toContain('B newer')
  })

  it('re-reads a foreign session before clearing so an interleaved newer write survives', () => {
    const storeA = new DraftRecoveryStore('window-a', () => storage)
    const storeB = new DraftRecoveryStore('window-b', () => storage)
    storeA.write('exercise-a', { code: 'saved branch', language: 'python' }, 4, 2)
    storeB.write('exercise-a', { code: 'saved branch', language: 'python' }, 4, 2)
    const originalGetItem = storage.getItem.bind(storage)
    let injected = false
    vi.spyOn(storage, 'getItem').mockImplementation((key: string) => {
      const before = originalGetItem(key)
      if (key === storeB.sessionKey && !injected) {
        injected = true
        storage.values.set(
          storeB.sessionKey,
          JSON.stringify({
            'exercise-a': {
              code: 'newer B branch',
              language: 'python',
              baseRevision: 4,
              localVersion: 3,
              updatedAt: 999,
            },
            'exercise-b': {
              code: 'unrelated B draft',
              language: 'python',
              baseRevision: 1,
              localVersion: 2,
              updatedAt: 1000,
            },
          }),
        )
      }
      return before
    })

    storeA.clear('exercise-a', {
      snapshot: { code: 'saved branch', language: 'python' },
    })

    expect(JSON.parse(originalGetItem(storeB.sessionKey) ?? '{}')).toMatchObject({
      'exercise-a': { code: 'newer B branch', localVersion: 3 },
      'exercise-b': { code: 'unrelated B draft' },
    })
  })

  it('removes only the matching foreign entry while preserving an interleaved unrelated draft', () => {
    const storeA = new DraftRecoveryStore('window-a', () => storage)
    const storeB = new DraftRecoveryStore('window-b', () => storage)
    storeA.write('exercise-a', { code: 'saved branch', language: 'python' }, 4, 2)
    storeB.write('exercise-a', { code: 'saved branch', language: 'python' }, 4, 2)
    const originalGetItem = storage.getItem.bind(storage)
    let injected = false
    vi.spyOn(storage, 'getItem').mockImplementation((key: string) => {
      const before = originalGetItem(key)
      if (key === storeB.sessionKey && !injected) {
        injected = true
        const latest = JSON.parse(before ?? '{}') as Record<string, unknown>
        latest['exercise-b'] = {
          code: 'interleaved unrelated draft',
          language: 'python',
          baseRevision: 1,
          localVersion: 2,
          updatedAt: 1000,
        }
        storage.values.set(storeB.sessionKey, JSON.stringify(latest))
      }
      return before
    })

    storeA.clear('exercise-a', {
      snapshot: { code: 'saved branch', language: 'python' },
    })

    expect(JSON.parse(originalGetItem(storeB.sessionKey) ?? '{}')).toEqual({
      'exercise-b': expect.objectContaining({ code: 'interleaved unrelated draft' }),
    })
  })

  it('never clears another renderer from the current app boot and cleans it after restart', () => {
    const currentBoot = 'current-app-boot'
    const storeA = new DraftRecoveryStore(
      createBootScopedRecoverySessionId('window-a', currentBoot),
      () => storage,
    )
    const storeB = new DraftRecoveryStore(
      createBootScopedRecoverySessionId('window-b', currentBoot),
      () => storage,
    )
    const saved = { code: 'shared saved draft', language: 'python' }
    storeA.write('exercise-a', saved, 4, 2)
    storeB.write('exercise-a', saved, 4, 2)

    storeA.clear('exercise-a', { snapshot: saved, sourceKeys: [storeB.sessionKey] })
    expect(storage.getItem(storeB.sessionKey)).toContain('shared saved draft')

    const restarted = new DraftRecoveryStore(
      createBootScopedRecoverySessionId('window-c', 'next-app-boot'),
      () => storage,
    )
    restarted.clear('exercise-a', { snapshot: saved, sourceKeys: [storeB.sessionKey] })
    expect(storage.getItem(storeB.sessionKey)).toBe('{}')
  })

  it('uses the documented session prefix for every renderer recovery map', () => {
    const store = new DraftRecoveryStore('window-a', () => storage)
    store.write('exercise-a', { code: 'code', language: 'python' }, 0, 1)
    expect(store.sessionKey).toBe(`${PRACTICE_DRAFT_RECOVERY_KEY_PREFIX}window-a`)
  })
})
