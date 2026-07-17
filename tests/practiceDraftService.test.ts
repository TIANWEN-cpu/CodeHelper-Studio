import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, getDraft, saveDraft } from '../src/services/practiceService'

vi.mock('../src/services/analyticsService', () => ({ track: vi.fn() }))

describe('practice draft renderer service', () => {
  const invoke = vi.fn()

  beforeEach(() => {
    invoke.mockReset()
    vi.stubGlobal('window', { api: { invoke, on: vi.fn() } })
  })

  it('returns the structured draft record', async () => {
    invoke.mockResolvedValueOnce({
      exerciseId: 'exercise-a',
      title: null,
      code: 'print(1)',
      language: 'python',
      revision: 2,
      updatedAt: '2026-01-01',
      deleted: false,
    })

    await expect(getDraft('exercise-a')).resolves.toMatchObject({
      code: 'print(1)',
      language: 'python',
      revision: 2,
    })
  })

  it('sends code, language, and base revision as one mutation', async () => {
    invoke.mockResolvedValueOnce({ status: 'saved', draft: { revision: 3 } })

    await saveDraft('exercise-a', 'console.log(1)', 'javascript', 2)

    expect(invoke).toHaveBeenCalledWith('exercises-draft-save', {
      exerciseId: 'exercise-a',
      code: 'console.log(1)',
      language: 'javascript',
      baseRevision: 2,
    })
  })

  it('forwards a title or explicit null while omitting undefined titles', async () => {
    invoke.mockResolvedValue({ status: 'saved', draft: { revision: 3 } })

    await saveDraft('exercise-a', 'print(1)', 'python', 2, 'Current exercise')
    await saveDraft('exercise-a', 'print(2)', 'python', 3, null)
    await saveDraft('exercise-a', 'print(3)', 'python', 4, undefined)

    expect(invoke).toHaveBeenNthCalledWith(1, 'exercises-draft-save', {
      exerciseId: 'exercise-a',
      code: 'print(1)',
      language: 'python',
      baseRevision: 2,
      title: 'Current exercise',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'exercises-draft-save', {
      exerciseId: 'exercise-a',
      code: 'print(2)',
      language: 'python',
      baseRevision: 3,
      title: null,
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'exercises-draft-save', {
      exerciseId: 'exercise-a',
      code: 'print(3)',
      language: 'python',
      baseRevision: 4,
    })
  })

  it('uses a base revision when clearing instead of unconditional deletion', async () => {
    invoke.mockResolvedValueOnce({ status: 'saved', draft: { revision: 4, deleted: true } })

    await clearDraft('exercise-a', 3)

    expect(invoke).toHaveBeenCalledWith('exercises-draft-clear', {
      exerciseId: 'exercise-a',
      baseRevision: 3,
    })
  })
})
