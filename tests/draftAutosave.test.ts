import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftAutosaveCoordinator } from '../src/utils/draftAutosave'

afterEach(() => {
  vi.useRealTimers()
})

describe('DraftAutosaveCoordinator', () => {
  it('debounces edits and persists only the latest code', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => undefined)
    const coordinator = new DraftAutosaveCoordinator(save, { delayMs: 2_000 })
    coordinator.setActive('exercise-a', 'starter')

    coordinator.update('first')
    coordinator.update('latest')
    await vi.advanceTimersByTimeAsync(1_999)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('exercise-a', 'latest')
    expect(coordinator.hasPending()).toBe(false)
  })

  it('starts the final save immediately when disposed before the debounce', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => undefined)
    const coordinator = new DraftAutosaveCoordinator(save, { delayMs: 2_000 })
    coordinator.setActive('exercise-a', 'starter')
    coordinator.update('edited immediately before navigation')

    await coordinator.dispose()

    expect(save).toHaveBeenCalledWith('exercise-a', 'edited immediately before navigation')
    expect(coordinator.hasPending()).toBe(false)
  })

  it('keeps a newer edit dirty while an older revision is being saved', async () => {
    let releaseFirst: (() => void) | undefined
    const firstSave = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const save = vi
      .fn<(exerciseId: string, code: string) => Promise<void>>()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValue(undefined)
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', 'starter')
    coordinator.update('revision-1')

    const firstFlush = coordinator.flush()
    coordinator.update('revision-2')
    releaseFirst?.()
    await firstFlush

    expect(coordinator.hasPending()).toBe(true)
    await coordinator.flush()
    expect(save).toHaveBeenNthCalledWith(2, 'exercise-a', 'revision-2')
    expect(coordinator.hasPending()).toBe(false)
  })

  it('retains the dirty revision after a failed save so it can be retried', async () => {
    const save = vi
      .fn<(exerciseId: string, code: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValue(undefined)
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', 'starter')
    coordinator.update('recover me')

    await expect(coordinator.flush()).rejects.toThrow('disk unavailable')
    expect(coordinator.hasPending()).toBe(true)

    await coordinator.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(coordinator.hasPending()).toBe(false)
  })

  it('deduplicates concurrent flushes of the same revision', async () => {
    let release: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const save = vi.fn(() => pending)
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', 'starter')
    coordinator.update('one revision')

    const first = coordinator.flush()
    const second = coordinator.flush()
    release?.()
    await Promise.all([first, second])

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending debounce before clearing the durable draft', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => undefined)
    const clear = vi.fn(async () => undefined)
    const coordinator = new DraftAutosaveCoordinator(save)
    coordinator.setActive('exercise-a', 'starter')
    coordinator.update('do not resurrect')

    await coordinator.clearActive(clear)
    await vi.advanceTimersByTimeAsync(2_000)

    expect(save).not.toHaveBeenCalled()
    expect(clear).toHaveBeenCalledWith('exercise-a')
    expect(coordinator.hasPending()).toBe(false)
  })
})
