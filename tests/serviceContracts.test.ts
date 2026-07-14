import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/analyticsService', () => ({ track: vi.fn() }))

import { submitToProblem } from '../src/services/workspaceService'
import { getDraft } from '../src/services/practiceService'
import { getLessonNote, searchLessons } from '../src/services/learnService'

describe('renderer service IPC contracts', () => {
  const invoke = vi.fn()

  beforeEach(() => {
    invoke.mockReset()
    vi.stubGlobal('window', { api: { invoke, on: vi.fn() } })
  })

  it('maps the problem submission response into the workspace view model', async () => {
    invoke.mockResolvedValueOnce({
      status: 'accepted',
      passed: 2,
      total: 2,
      results: [{ input: '1', expected: '2', actual: '2', passed: true }],
      duration: 12,
    })

    await expect(submitToProblem('7', 'print(2)', 'python')).resolves.toEqual({
      passed: true,
      score: 1,
      details: [{ case: '1', expected: '2', actual: '2', passed: true }],
    })
  })

  it('keeps versioned draft records and lesson note strings intact', async () => {
    invoke
      .mockResolvedValueOnce({
        exerciseId: 'exercise-1',
        title: null,
        code: 'saved code',
        language: 'python',
        revision: 3,
        updatedAt: '2026-01-01',
        deleted: false,
      })
      .mockResolvedValueOnce('saved note')

    await expect(getDraft('exercise-1')).resolves.toMatchObject({
      code: 'saved code',
      language: 'python',
      revision: 3,
    })
    await expect(getLessonNote('lesson-1')).resolves.toBe('saved note')
  })

  it('treats lesson search results as lesson ids', async () => {
    invoke.mockResolvedValueOnce(['lesson-1', 'lesson-2'])
    await expect(searchLessons('arrays')).resolves.toEqual(['lesson-1', 'lesson-2'])
  })
})
