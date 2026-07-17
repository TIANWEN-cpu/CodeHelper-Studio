import { describe, expect, it } from 'vitest'
import {
  legacyExerciseRecoveryFilename,
  legacyExerciseRecoveryTabId,
} from '../src/shared/editorWorkspaceContract'

describe('editor workspace shared contract', () => {
  it('keeps deterministic recovery identities within IPC limits', () => {
    const source = {
      id: `exercise-${'id'.repeat(120)}`,
      filename: `a.${'x'.repeat(400)}`,
      language: 'python',
      content: 'print("valuable")',
      problemId: `problem-${'p'.repeat(240)}`,
    }

    const filename = legacyExerciseRecoveryFilename(source.filename)
    const tabId = legacyExerciseRecoveryTabId(source)

    expect(filename).toHaveLength(255)
    expect(filename).toBe(legacyExerciseRecoveryFilename(source.filename))
    expect(filename).toContain('.recovered.')
    expect(tabId.length).toBeLessThanOrEqual(200)
    expect(tabId).toBe(legacyExerciseRecoveryTabId(source))
  })
})
