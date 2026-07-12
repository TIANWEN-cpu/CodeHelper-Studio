import { describe, expect, it } from 'vitest'
import type { PracticeDraft } from '../src/services/practiceService'
import type { DraftRecoveryEntry } from '../src/utils/draftRecovery'
import { resolvePracticeDraft } from '../src/utils/practiceDraftResolution'

function draft(overrides: Partial<PracticeDraft> = {}): PracticeDraft {
  return {
    exerciseId: 'exercise-a',
    title: null,
    code: 'saved',
    language: 'python',
    revision: 4,
    updatedAt: '2026-01-01',
    deleted: false,
    ...overrides,
  }
}

function recovery(overrides: Partial<DraftRecoveryEntry> = {}): DraftRecoveryEntry {
  return {
    code: 'local',
    language: 'javascript',
    baseRevision: 4,
    localVersion: 3,
    updatedAt: 123,
    legacy: false,
    ...overrides,
  }
}

describe('resolvePracticeDraft', () => {
  it('uses a v2 recovery based on the current durable revision and schedules autosave', () => {
    expect(resolvePracticeDraft(draft(), recovery(), 'starter', 'python')).toMatchObject({
      snapshot: { code: 'local', language: 'javascript' },
      baseRevision: 4,
      dirty: true,
      autosave: true,
      conflict: false,
    })
  })

  it('discards recovery that already matches the durable code and language', () => {
    expect(
      resolvePracticeDraft(
        draft(),
        recovery({ code: 'saved', language: 'python', baseRevision: 3 }),
        'starter',
        'python',
      ),
    ).toMatchObject({ dirty: false, discardRecovery: true, conflict: false })
  })

  it('preserves a conflicting local snapshot without auto-overwriting the durable version', () => {
    expect(
      resolvePracticeDraft(
        draft({ revision: 7 }),
        recovery({ baseRevision: 4 }),
        'starter',
        'python',
      ),
    ).toMatchObject({
      snapshot: { code: 'local', language: 'javascript' },
      baseRevision: 4,
      dirty: true,
      autosave: false,
      conflict: true,
    })
  })

  it('imports a legacy recovery only when no durable row has ever existed', () => {
    const legacy = recovery({ language: '', baseRevision: null, legacy: true })
    expect(resolvePracticeDraft(null, legacy, 'starter', 'python')).toMatchObject({
      snapshot: { code: 'local', language: 'python' },
      baseRevision: 0,
      autosave: true,
      conflict: false,
    })
    expect(resolvePracticeDraft(draft(), legacy, 'starter', 'python')).toMatchObject({
      autosave: false,
      conflict: true,
    })
  })

  it('does not resurrect legacy content across a tombstone', () => {
    expect(
      resolvePracticeDraft(
        draft({ deleted: true, revision: 8, code: '', language: null }),
        recovery({ language: '', baseRevision: null, legacy: true }),
        'starter',
        'python',
      ),
    ).toMatchObject({ baseRevision: 0, autosave: false, conflict: true })
  })
})
