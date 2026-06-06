import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}
const prepareCalls: string[] = []
const runBySql = new Map<string, ReturnType<typeof vi.fn>>()
let transactionRunner: ReturnType<typeof vi.fn>

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

const mockDB = {
  prepare: vi.fn((sql: string) => {
    prepareCalls.push(sql)
    const run = vi.fn(() => ({ changes: 1 }))
    runBySql.set(sql, run)
    return { run }
  }),
  transaction: vi.fn((fn: () => void) => {
    transactionRunner = vi.fn(() => fn())
    return transactionRunner
  }),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
}))

describe('learning records IPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    prepareCalls.length = 0
    runBySql.clear()
    mockDB.prepare.mockClear()
    mockDB.transaction.mockClear()
  })

  it('registers learning-records-clear', async () => {
    const { registerLearningRecordsIPC } = await import('../electron/ipc/learningRecords')
    registerLearningRecordsIPC()

    expect(handlers['learning-records-clear']).toBeDefined()
  })

  it('clears learning records in a single transaction without deleting source content', async () => {
    const { registerLearningRecordsIPC } = await import('../electron/ipc/learningRecords')
    registerLearningRecordsIPC()

    const result = handlers['learning-records-clear']()

    expect(mockDB.transaction).toHaveBeenCalledTimes(1)
    expect(transactionRunner).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      success: true,
      changed: {
        lesson_progress: 1,
        achievement_progress: 1,
        analytics_events: 1,
        review_schedule: 1,
        exercise_drafts: 1,
        exercise_timers: 1,
        submissions: 1,
        mistakes: 1,
      },
    })
    expect(prepareCalls.join('\n')).toContain('UPDATE lesson_progress')
    expect(prepareCalls.join('\n')).toContain("status = 'not_started'")
    expect(prepareCalls.join('\n')).toContain('UPDATE achievement_progress')
    for (const table of [
      'analytics_events',
      'review_schedule',
      'exercise_drafts',
      'exercise_timers',
      'submissions',
      'mistakes',
    ]) {
      expect(prepareCalls).toContain(`DELETE FROM ${table}`)
    }
    expect(
      prepareCalls.some((sql) =>
        /DELETE FROM (problems|achievements|knowledge_docs|settings)/.test(sql),
      ),
    ).toBe(false)
  })
})
