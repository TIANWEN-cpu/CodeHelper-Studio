import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DraftAutosaveCoordinator,
  DraftConflictError,
  type DraftSaveReceipt,
  type DraftSnapshot,
} from '../src/utils/draftAutosave'

const python = (code: string): DraftSnapshot => ({ code, language: 'python' })
const receipt = (revision: number): DraftSaveReceipt => ({
  revision,
  updatedAt: `2026-01-01T00:00:0${revision}Z`,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DraftAutosaveCoordinator', () => {
  it('debounces edits and persists the latest code and language from the known base revision', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => receipt(6))
    const coordinator = new DraftAutosaveCoordinator(save, { delayMs: 2_000 })
    coordinator.setActive('exercise-a', python('starter'), 5)

    coordinator.update(python('first'))
    coordinator.update({ code: 'latest', language: 'javascript' })
    await vi.advanceTimersByTimeAsync(1_999)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledWith('exercise-a', { code: 'latest', language: 'javascript' }, 5)
    expect(coordinator.hasPending()).toBe(false)
    expect(coordinator.getState()?.baseRevision).toBe(6)
  })

  it('starts the final save immediately when disposed before the debounce', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => receipt(1))
    const coordinator = new DraftAutosaveCoordinator(save, { delayMs: 2_000 })
    coordinator.setActive('exercise-a', python('starter'), 0)
    coordinator.update(python('edited immediately before navigation'))

    await coordinator.dispose()

    expect(save).toHaveBeenCalledWith(
      'exercise-a',
      python('edited immediately before navigation'),
      0,
    )
    expect(coordinator.hasPending()).toBe(false)
  })

  it('chases edits made during an in-flight save and uses the returned revision', async () => {
    let releaseFirst: ((value: DraftSaveReceipt) => void) | undefined
    const firstSave = new Promise<DraftSaveReceipt>((resolve) => {
      releaseFirst = resolve
    })
    const save = vi
      .fn()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValueOnce(receipt(7))
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', python('starter'), 5)
    coordinator.update(python('revision-1'))

    const flush = coordinator.flush()
    coordinator.update(python('revision-2'))
    releaseFirst?.(receipt(6))
    await flush

    expect(save).toHaveBeenNthCalledWith(1, 'exercise-a', python('revision-1'), 5)
    expect(save).toHaveBeenNthCalledWith(2, 'exercise-a', python('revision-2'), 6)
    expect(coordinator.getState()?.baseRevision).toBe(7)
    expect(coordinator.hasPending()).toBe(false)
  })

  it('retains the dirty snapshot after an ordinary failure so flush can retry', async () => {
    vi.useFakeTimers()
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(receipt(6))
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', python('starter'), 5)
    coordinator.update(python('recover me'))

    await expect(coordinator.flush()).rejects.toThrow('disk unavailable')
    expect(coordinator.hasPending()).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(1)

    await coordinator.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('exercise-a', python('recover me'), 5)
    expect(coordinator.hasPending()).toBe(false)
  })

  it('deduplicates concurrent flushes while one worker is active', async () => {
    let release: ((value: DraftSaveReceipt) => void) | undefined
    const pending = new Promise<DraftSaveReceipt>((resolve) => {
      release = resolve
    })
    const save = vi.fn(() => pending)
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', python('starter'), 0)
    coordinator.update(python('one revision'))

    const first = coordinator.flush()
    const second = coordinator.flush()
    release?.(receipt(1))
    await Promise.all([first, second])

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('keeps conflicts stable until the caller explicitly resolves them', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new DraftConflictError())
      .mockResolvedValueOnce(receipt(10))
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', python('starter'), 5)
    coordinator.update(python('local change'))

    await expect(coordinator.flush()).rejects.toBeInstanceOf(DraftConflictError)
    expect(coordinator.hasConflict()).toBe(true)
    await expect(coordinator.flush()).rejects.toBeInstanceOf(DraftConflictError)
    expect(save).toHaveBeenCalledTimes(1)

    coordinator.resolveConflict(9)
    await coordinator.flush()
    expect(save).toHaveBeenLastCalledWith('exercise-a', python('local change'), 9)
    expect(coordinator.hasConflict()).toBe(false)
  })

  it('blocks edits loaded in conflict until the caller explicitly keeps the local draft', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => receipt(8))
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', python('recovered local'), 4, {
      dirty: true,
      autosave: false,
      conflict: true,
    })

    coordinator.update(python('edited while deciding'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).not.toHaveBeenCalled()
    await expect(coordinator.flush()).rejects.toBeInstanceOf(DraftConflictError)

    coordinator.resolveConflict(7)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(save).toHaveBeenCalledWith('exercise-a', python('edited while deciding'), 7)
    expect(coordinator.hasConflict()).toBe(false)
  })

  it('serializes clear after the latest save and preserves edits made during clear', async () => {
    let releaseClear: ((value: DraftSaveReceipt) => void) | undefined
    const clearPending = new Promise<DraftSaveReceipt>((resolve) => {
      releaseClear = resolve
    })
    const save = vi.fn().mockResolvedValueOnce(receipt(6)).mockResolvedValueOnce(receipt(8))
    const clear = vi.fn(() => clearPending)
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', python('starter'), 5)
    coordinator.update(python('save before clear'))

    const clearing = coordinator.clearActive(clear)
    await vi.waitFor(() => expect(clear).toHaveBeenCalledWith('exercise-a', 6))
    coordinator.update(python('temporary edit while clearing'))
    coordinator.update(python('save before clear'))
    releaseClear?.(receipt(7))
    await clearing

    expect(coordinator.hasPending()).toBe(true)
    expect(coordinator.getState()?.snapshot).toEqual(python('save before clear'))
    expect(coordinator.getState()?.localVersion).toBe(4)
    await coordinator.flush()
    expect(save).toHaveBeenLastCalledWith('exercise-a', python('save before clear'), 7)
    expect(coordinator.getState()?.baseRevision).toBe(8)
  })
})
