import { beforeEach, describe, expect, it, vi } from 'vitest'

process.resourcesPath = '/tmp/codehelper-test-resources'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

const mockExistsSync = vi.fn(() => false)
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: mockExistsSync,
    readFileSync: vi.fn(() => JSON.stringify({ exercises: [] })),
  }
})

const mockRunCodeSnippet = vi.fn()
vi.mock('../electron/utils/codeRunner', () => ({
  runCodeSnippet: (...args: unknown[]) => mockRunCodeSnippet(...args),
}))

const problemRows = [
  {
    id: 1,
    title: '导入 Python 题',
    description: '读取一个整数并输出。',
    difficulty: 'easy',
    tags: '["模拟"]',
    languages: '["python"]',
    examples: '[]',
    test_cases: '[{"input":"1","expected":"1"},{"input":"2","expected":"2"}]',
    starter_code: '{"python":"print(input())"}',
    source: 'leetcode',
    tracks: '["algo-job"]',
    platform: 'leetcode',
    mode: 'oj',
    exam_style: 'oa',
    year: null,
    official_url: null,
    estimated_time: 20,
  },
  {
    id: 2,
    title: '导入 SQL 题',
    description: '写出查询语句。',
    difficulty: 'easy',
    tags: '["SQL"]',
    languages: '["sql"]',
    examples: '[]',
    test_cases: '[{"input":"","expected":"select * from users"}]',
    starter_code: '{"sql":"SELECT * FROM users;"}',
    source: 'builtin',
    tracks: '["database"]',
    platform: 'internal',
    mode: 'oj',
    exam_style: 'acm',
    year: null,
    official_url: null,
    estimated_time: 20,
  },
]

const writes = {
  submissions: [] as unknown[][],
  mistakes: [] as unknown[][],
  reviews: [] as unknown[][],
  correctUpdates: [] as unknown[][],
}

const mockDB = {
  prepare: vi.fn((sql: string) => {
    if (sql.includes('SELECT COUNT(*) AS count, MAX(id) AS maxId FROM problems')) {
      return { get: vi.fn(() => ({ count: problemRows.length, maxId: 2 })) }
    }
    if (sql.includes('FROM problems') && sql.includes('ORDER BY id ASC')) {
      return { all: vi.fn(() => problemRows) }
    }
    if (sql.includes('FROM problems') && sql.includes('WHERE id = ?')) {
      return {
        get: vi.fn((id: number) => problemRows.find((row) => row.id === id)),
      }
    }
    if (sql.includes('INSERT INTO submissions')) {
      return {
        run: vi.fn((...args: unknown[]) => {
          writes.submissions.push(args)
          return { lastInsertRowid: writes.submissions.length }
        }),
      }
    }
    if (sql.includes('SELECT * FROM mistakes')) {
      return { get: vi.fn(() => undefined) }
    }
    if (sql.includes('INSERT INTO mistakes')) {
      return {
        run: vi.fn((...args: unknown[]) => {
          writes.mistakes.push(args)
          return { lastInsertRowid: writes.mistakes.length }
        }),
      }
    }
    if (sql.includes('INSERT OR IGNORE INTO review_schedule')) {
      return {
        run: vi.fn((...args: unknown[]) => {
          writes.reviews.push(args)
          return { changes: 1 }
        }),
      }
    }
    if (sql.includes('UPDATE mistakes SET correct_code')) {
      return {
        run: vi.fn((...args: unknown[]) => {
          writes.correctUpdates.push(args)
          return { changes: 0 }
        }),
      }
    }
    if (sql.includes('UPDATE mistakes SET error_count')) {
      return { run: vi.fn(() => ({ changes: 0 })) }
    }
    return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn(() => ({ changes: 0 })) }
  }),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
}))

describe('registerExercisesIPC imported problems', () => {
  beforeEach(async () => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    writes.submissions.length = 0
    writes.mistakes.length = 0
    writes.reviews.length = 0
    writes.correctUpdates.length = 0
    mockDB.prepare.mockClear()
    mockRunCodeSnippet.mockReset()
    vi.resetModules()
    const { registerExercisesIPC } = await import('../electron/ipc/exercises')
    registerExercisesIPC()
  })

  it('includes SQLite problems as imported practice items', async () => {
    const result = (await handlers['exercises-list'](null)) as Array<{
      id: string
      source_type: string
      title: string
      track_id: string
    }>

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'problem:1',
      source_type: 'problem',
      title: '导入 Python 题',
      track_id: 'algo-job',
    })
  })

  it('returns only the saved draft code', async () => {
    const fallback = mockDB.prepare.getMockImplementation()!
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT code, updated_at FROM exercise_drafts')) {
        return { get: vi.fn(() => ({ code: 'saved code', updated_at: '2026-01-01' })) }
      }
      return fallback(sql)
    })

    await expect(handlers['exercises-draft-get'](null, 'problem:1')).resolves.toBe('saved code')
  })

  it('rejects oversized drafts instead of silently truncating them', async () => {
    await expect(
      handlers['exercises-draft-save'](null, {
        exerciseId: 'problem:1',
        code: 'x'.repeat(100_001),
      }),
    ).rejects.toThrow('草稿超过 100000 字符')
  })

  it('evaluates imported Python problems and records accepted submissions', async () => {
    mockRunCodeSnippet
      .mockResolvedValueOnce({ stdout: '1\n', stderr: '', exitCode: 0, stage: 'run' })
      .mockResolvedValueOnce({ stdout: '2\n', stderr: '', exitCode: 0, stage: 'run' })

    const result = (await handlers['exercises-evaluate'](null, {
      exerciseId: 'problem:1',
      code: 'print(input())',
      language: 'python',
    })) as { passed: boolean; score: number }

    expect(result).toEqual(expect.objectContaining({ passed: true, score: 1 }))
    expect(writes.submissions[0]).toEqual([
      1,
      'python',
      'print(input())',
      'accepted',
      2,
      2,
      expect.any(Number),
    ])
    expect(writes.mistakes).toEqual([])
    expect(writes.correctUpdates[0]).toEqual(['print(input())', 1])
  })

  it('records failed imported problem attempts into mistakes and review queue', async () => {
    mockRunCodeSnippet.mockResolvedValueOnce({
      stdout: '0\n',
      stderr: '',
      exitCode: 0,
      stage: 'run',
    })

    const result = (await handlers['exercises-evaluate'](null, {
      exerciseId: 'problem:1',
      code: 'print(0)',
      language: 'python',
    })) as { passed: boolean; score: number }

    expect(result.passed).toBe(false)
    expect(writes.submissions[0]).toEqual([
      1,
      'python',
      'print(0)',
      'wrong_answer',
      0,
      2,
      expect.any(Number),
    ])
    expect(writes.mistakes[0]).toEqual([1, 'print(0)', '["wrong_answer"]'])
    expect(writes.reviews[0]).toEqual(['1'])
  })

  it('keeps imported SQL problems on normalized SQL comparison instead of running sqlite', async () => {
    const result = (await handlers['exercises-evaluate'](null, {
      exerciseId: 'problem:2',
      code: 'SELECT * FROM users;',
      language: 'sql',
    })) as { passed: boolean; score: number }

    expect(result).toEqual(expect.objectContaining({ passed: true, score: 1 }))
    expect(mockRunCodeSnippet).not.toHaveBeenCalled()
    expect(writes.submissions[0]).toEqual([
      2,
      'sql',
      'SELECT * FROM users;',
      'accepted',
      1,
      1,
      expect.any(Number),
    ])
  })
})
