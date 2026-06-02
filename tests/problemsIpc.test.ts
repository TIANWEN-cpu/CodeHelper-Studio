import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set process.resourcesPath before any imports
process.resourcesPath = '/tmp/test-resources'

// Collect registered handlers
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

// Mock better-sqlite3 via db/index
const mockDB = {
  prepare: vi.fn(),
  exec: vi.fn(),
  pragma: vi.fn(),
  close: vi.fn(),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
  closeDB: () => {},
}))

// Mock fs for problem sync
const mockExistsSync = vi.fn(() => false)
const mockReaddirSync = vi.fn(() => [])
const mockReadFileSync = vi.fn(() => '')

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
    statSync: vi.fn(() => ({ size: 100 })),
  }
})

// Mock codeRunner
const mockRunCodeSnippet = vi.fn()
vi.mock('../electron/utils/codeRunner', () => ({
  runCodeSnippet: (...args: unknown[]) => mockRunCodeSnippet(...args),
}))

function makeStmt(result: unknown = undefined) {
  return {
    get: vi.fn(() => result),
    all: vi.fn(() => (Array.isArray(result) ? result : [result])),
    run: vi.fn(() => ({ lastInsertRowid: 1 })),
  }
}

describe('registerProblemsIPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
    mockRunCodeSnippet.mockReset()
  })

  it('registers all problem handlers', async () => {
    mockDB.prepare.mockReturnValue(makeStmt(undefined))

    const { registerProblemsIPC } = await import('../electron/ipc/problems')
    registerProblemsIPC()

    expect(handlers['problems-list']).toBeDefined()
    expect(handlers['problems-get']).toBeDefined()
    expect(handlers['problems-submit']).toBeDefined()
    expect(handlers['problems-submissions']).toBeDefined()
  })

  describe('problems-list', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerProblemsIPC } = await import('../electron/ipc/problems')
      registerProblemsIPC()
    })

    it('returns all problems without filters', async () => {
      const problems = [{ id: 1, title: 'Test', difficulty: 'easy' }]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('problems') && sql.includes('ORDER BY')) return makeStmt(problems)
        return makeStmt(undefined)
      })

      const result = await handlers['problems-list'](null)
      expect(result).toEqual(problems)
    })

    it('validates filters type', async () => {
      await expect(handlers['problems-list'](null, 'invalid')).rejects.toThrow('参数无效: filters')
    })

    it('validates filter field types', async () => {
      await expect(handlers['problems-list'](null, { difficulty: 123 as unknown })).rejects.toThrow(
        '参数无效: difficulty',
      )
      await expect(handlers['problems-list'](null, { tag: 123 as unknown })).rejects.toThrow(
        '参数无效: tag',
      )
      await expect(handlers['problems-list'](null, { status: 123 as unknown })).rejects.toThrow(
        '参数无效: status',
      )
      await expect(handlers['problems-list'](null, { source: 123 as unknown })).rejects.toThrow(
        '参数无效: source',
      )
      await expect(handlers['problems-list'](null, { track: 123 as unknown })).rejects.toThrow(
        '参数无效: track',
      )
      await expect(handlers['problems-list'](null, { platform: 123 as unknown })).rejects.toThrow(
        '参数无效: platform',
      )
      await expect(handlers['problems-list'](null, { mode: 123 as unknown })).rejects.toThrow(
        '参数无效: mode',
      )
    })

    it('applies difficulty filter', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('difficulty')) return makeStmt([{ id: 1 }])
        return makeStmt(undefined)
      })

      const result = await handlers['problems-list'](null, { difficulty: 'easy' })
      expect(result).toBeDefined()
    })

    it('applies tag filter', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('tags LIKE')) return makeStmt([{ id: 1 }])
        return makeStmt(undefined)
      })

      const result = await handlers['problems-list'](null, { tag: 'array' })
      expect(result).toBeDefined()
    })

    it('applies source filter', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('source =')) return makeStmt([{ id: 1 }])
        return makeStmt(undefined)
      })

      const result = await handlers['problems-list'](null, { source: 'leetcode' })
      expect(result).toBeDefined()
    })

    it('applies track filter', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('tracks LIKE')) return makeStmt([{ id: 1 }])
        return makeStmt(undefined)
      })

      const result = await handlers['problems-list'](null, { track: 'beginner' })
      expect(result).toBeDefined()
    })

    it('applies platform filter', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('platform =')) return makeStmt([{ id: 1 }])
        return makeStmt(undefined)
      })

      const result = await handlers['problems-list'](null, { platform: 'leetcode' })
      expect(result).toBeDefined()
    })

    it('applies mode filter', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('mode =')) return makeStmt([{ id: 1 }])
        return makeStmt(undefined)
      })

      const result = await handlers['problems-list'](null, { mode: 'acm' })
      expect(result).toBeDefined()
    })

    it('handles null/undefined filters', async () => {
      mockDB.prepare.mockReturnValue(makeStmt([]))

      await handlers['problems-list'](null, null)
      await handlers['problems-list'](null, undefined)
    })
  })

  describe('problems-get', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerProblemsIPC } = await import('../electron/ipc/problems')
      registerProblemsIPC()
    })

    it('validates id', async () => {
      await expect(handlers['problems-get'](null, -1)).rejects.toThrow('参数无效: id')
      await expect(handlers['problems-get'](null, NaN)).rejects.toThrow('参数无效: id')
      await expect(handlers['problems-get'](null, 0)).rejects.toThrow('参数无效: id')
    })

    it('returns problem by id', async () => {
      const problem = { id: 1, title: 'Test', difficulty: 'easy' }
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?')) return makeStmt(problem)
        return makeStmt(undefined)
      })

      const result = await handlers['problems-get'](null, 1)
      expect(result).toEqual(problem)
    })
  })

  describe('problems-submit', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerProblemsIPC } = await import('../electron/ipc/problems')
      registerProblemsIPC()
    })

    it('validates args object', async () => {
      await expect(handlers['problems-submit'](null, null)).rejects.toThrow('参数无效')
    })

    it('validates problemId', async () => {
      await expect(
        handlers['problems-submit'](null, { problemId: -1, code: 'x', language: 'py' }),
      ).rejects.toThrow('参数无效: problemId')
    })

    it('validates code is string', async () => {
      await expect(
        handlers['problems-submit'](null, { problemId: 1, code: 123 as unknown, language: 'py' }),
      ).rejects.toThrow('参数无效: code')
    })

    it('validates language', async () => {
      await expect(
        handlers['problems-submit'](null, { problemId: 1, code: 'x', language: '' }),
      ).rejects.toThrow('参数无效: language')
    })

    it('throws when problem not found', async () => {
      mockDB.prepare.mockImplementation(() => makeStmt(undefined))

      await expect(
        handlers['problems-submit'](null, { problemId: 999, code: 'x', language: 'python' }),
      ).rejects.toThrow('题目不存在')
    })

    it('throws when test_cases JSON is invalid', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?')) {
          return makeStmt({ id: 1, title: 'Test', test_cases: 'not-json' })
        }
        return makeStmt(undefined)
      })

      await expect(
        handlers['problems-submit'](null, { problemId: 1, code: 'x', language: 'python' }),
      ).rejects.toThrow('题目测试用例解析失败')
    })

    it('submits SQL code and detects correct answer', async () => {
      const problem = {
        id: 1,
        title: 'SQL Test',
        test_cases: JSON.stringify([{ input: '', expected: 'SELECT 1' }]),
      }
      const runFn = vi.fn(() => ({ lastInsertRowid: 1 }))
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        return { get: vi.fn(), all: vi.fn(), run: runFn }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'SELECT 1',
        language: 'sql',
      })
      expect(result.status).toBe('accepted')
      expect(result.passed).toBe(1)
      expect(result.total).toBe(1)
    })

    it('submits SQL code and detects wrong answer', async () => {
      const problem = {
        id: 1,
        title: 'SQL Test',
        test_cases: JSON.stringify([{ input: '', expected: 'SELECT 2' }]),
      }
      const existingMistake = undefined
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        if (sql.includes('SELECT * FROM mistakes WHERE problem_id'))
          return makeStmt(existingMistake)
        return { get: vi.fn(), all: vi.fn(), run: vi.fn(() => ({ lastInsertRowid: 1 })) }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'SELECT 1',
        language: 'sql',
      })
      expect(result.status).toBe('wrong_answer')
    })

    it('submits code via runCodeSnippet and detects accepted', async () => {
      const problem = {
        id: 1,
        title: 'Python Test',
        test_cases: JSON.stringify([{ input: '5', expected: '10' }]),
      }
      mockRunCodeSnippet.mockResolvedValue({ stdout: '10', stderr: '', exitCode: 0, stage: 'run' })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        return { get: vi.fn(), all: vi.fn(), run: vi.fn(() => ({ lastInsertRowid: 1 })) }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'print(int(input())*2)',
        language: 'python',
      })
      expect(result.status).toBe('accepted')
      expect(mockRunCodeSnippet).toHaveBeenCalledWith('print(int(input())*2)', 'python', '5')
    })

    it('detects compile_error', async () => {
      const problem = {
        id: 1,
        title: 'Test',
        test_cases: JSON.stringify([{ input: '', expected: '10' }]),
      }
      mockRunCodeSnippet.mockResolvedValue({
        stdout: '',
        stderr: 'compile error',
        exitCode: 1,
        stage: 'compile',
      })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        if (sql.includes('SELECT * FROM mistakes WHERE problem_id')) return makeStmt(undefined)
        return { get: vi.fn(), all: vi.fn(), run: vi.fn(() => ({ lastInsertRowid: 1 })) }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'bad code',
        language: 'python',
      })
      expect(result.status).toBe('compile_error')
    })

    it('detects timeout', async () => {
      const problem = {
        id: 1,
        title: 'Test',
        test_cases: JSON.stringify([{ input: '', expected: '10' }]),
      }
      mockRunCodeSnippet.mockResolvedValue({
        stdout: '',
        stderr: 'timed out',
        exitCode: 1,
        stage: 'run',
      })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        if (sql.includes('SELECT * FROM mistakes WHERE problem_id')) return makeStmt(undefined)
        return { get: vi.fn(), all: vi.fn(), run: vi.fn(() => ({ lastInsertRowid: 1 })) }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'while True: pass',
        language: 'python',
      })
      expect(result.status).toBe('timeout')
    })

    it('detects runtime_error', async () => {
      const problem = {
        id: 1,
        title: 'Test',
        test_cases: JSON.stringify([{ input: '', expected: '10' }]),
      }
      mockRunCodeSnippet.mockResolvedValue({
        stdout: '',
        stderr: 'runtime error',
        exitCode: 1,
        stage: 'run',
      })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        if (sql.includes('SELECT * FROM mistakes WHERE problem_id')) return makeStmt(undefined)
        return { get: vi.fn(), all: vi.fn(), run: vi.fn(() => ({ lastInsertRowid: 1 })) }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'raise Exception()',
        language: 'python',
      })
      expect(result.status).toBe('runtime_error')
    })

    it('updates existing mistake on failure', async () => {
      const problem = {
        id: 1,
        title: 'Test',
        test_cases: JSON.stringify([{ input: '', expected: '10' }]),
      }
      const existingMistake = { id: 1, problem_id: 1, error_types: '["wrong_answer"]' }
      mockRunCodeSnippet.mockResolvedValue({ stdout: '5', stderr: '', exitCode: 0, stage: 'run' })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        if (sql.includes('SELECT * FROM mistakes WHERE problem_id'))
          return makeStmt(existingMistake)
        return { get: vi.fn(), all: vi.fn(), run: vi.fn(() => ({ lastInsertRowid: 1 })) }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'print(5)',
        language: 'python',
      })
      expect(result.status).toBe('wrong_answer')
    })

    it('records correct code on accepted submission', async () => {
      const problem = {
        id: 1,
        title: 'Test',
        test_cases: JSON.stringify([{ input: '', expected: '10' }]),
      }
      mockRunCodeSnippet.mockResolvedValue({ stdout: '10', stderr: '', exitCode: 0, stage: 'run' })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('WHERE id = ?') && sql.includes('problems')) return makeStmt(problem)
        return { get: vi.fn(), all: vi.fn(), run: vi.fn(() => ({ lastInsertRowid: 1 })) }
      })

      const result = await handlers['problems-submit'](null, {
        problemId: 1,
        code: 'print(10)',
        language: 'python',
      })
      expect(result.status).toBe('accepted')
    })
  })

  describe('problems-submissions', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerProblemsIPC } = await import('../electron/ipc/problems')
      registerProblemsIPC()
    })

    it('validates problemId', async () => {
      await expect(handlers['problems-submissions'](null, -1)).rejects.toThrow(
        '参数无效: problemId',
      )
      await expect(handlers['problems-submissions'](null, NaN)).rejects.toThrow(
        '参数无效: problemId',
      )
    })

    it('returns submissions for problem', async () => {
      const submissions = [{ id: 1, status: 'accepted', language: 'python' }]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('submissions')) return makeStmt(submissions)
        return makeStmt(undefined)
      })

      const result = await handlers['problems-submissions'](null, 1)
      expect(result).toEqual(submissions)
    })
  })
})

describe('syncProblems (called on registerProblemsIPC)', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
    mockRunCodeSnippet.mockReset()
    mockExistsSync.mockReset()
    mockReaddirSync.mockReset()
    mockReadFileSync.mockReset()
    mockExistsSync.mockReturnValue(false)
    mockReaddirSync.mockReturnValue([])
    mockReadFileSync.mockReturnValue('')
  })

  it('syncs problems from JSON files when problem directory exists', async () => {
    const problemSeed = [
      {
        title: 'Two Sum',
        description: 'Find two numbers that add up to target',
        difficulty: 'easy',
        tags: ['array'],
        languages: ['python'],
        examples: [{ input: '[2,7,11,15], 9', output: '[0,1]' }],
        test_cases: [{ input: '[2,7,11,15] 9', expected: '0 1' }],
        starter_code: { python: 'def two_sum():' },
      },
    ]

    mockExistsSync.mockImplementation((p: string) => p.includes('problems'))
    mockReaddirSync.mockReturnValue(['problems.json'])
    mockReadFileSync.mockReturnValue(JSON.stringify(problemSeed))

    // Mock DB: no existing problem, insert succeeds
    const runFn = vi.fn(() => ({ lastInsertRowid: 1 }))
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM problems WHERE title')) return makeStmt(undefined)
      return { get: vi.fn(), all: vi.fn(), run: runFn }
    })

    const { registerProblemsIPC } = await import('../electron/ipc/problems')
    registerProblemsIPC()

    // syncProblems runs in setTimeout, wait for it
    await new Promise((r) => setTimeout(r, 50))

    expect(mockReaddirSync).toHaveBeenCalled()
    expect(runFn).toHaveBeenCalled()
  })

  it('updates existing problems during sync', async () => {
    const problemSeed = [
      {
        title: 'Existing Problem',
        description: 'Updated description',
        difficulty: 'medium',
        tags: ['dp'],
        languages: ['python'],
        examples: [],
        test_cases: [{ input: '', expected: '42' }],
        starter_code: {},
      },
    ]

    mockExistsSync.mockImplementation((p: string) => p.includes('problems'))
    mockReaddirSync.mockReturnValue(['dp-problems.json'])
    mockReadFileSync.mockReturnValue(JSON.stringify(problemSeed))

    const runFn = vi.fn()
    mockDB.prepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM problems WHERE title')) return makeStmt({ id: 5 })
      return { get: vi.fn(), all: vi.fn(), run: runFn }
    })

    const { registerProblemsIPC } = await import('../electron/ipc/problems')
    registerProblemsIPC()

    await new Promise((r) => setTimeout(r, 50))
    expect(runFn).toHaveBeenCalled()
  })

  it('handles JSON parse errors gracefully during sync', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('problems'))
    mockReaddirSync.mockReturnValue(['bad.json'])
    mockReadFileSync.mockReturnValue('not valid json')

    mockDB.prepare.mockReturnValue(makeStmt(undefined))

    const { registerProblemsIPC } = await import('../electron/ipc/problems')
    registerProblemsIPC()

    // Should not throw, error is caught
    await new Promise((r) => setTimeout(r, 50))
  })

  it('skips non-json files in problem directory', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('problems'))
    mockReaddirSync.mockReturnValue(['readme.txt', '.gitignore'])

    mockDB.prepare.mockReturnValue(makeStmt(undefined))

    const { registerProblemsIPC } = await import('../electron/ipc/problems')
    registerProblemsIPC()

    await new Promise((r) => setTimeout(r, 50))
    // readFileSync should not have been called for non-json files
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('returns null when no problem directory exists', async () => {
    mockExistsSync.mockReturnValue(false)

    mockDB.prepare.mockReturnValue(makeStmt(undefined))

    const { registerProblemsIPC } = await import('../electron/ipc/problems')
    registerProblemsIPC()

    await new Promise((r) => setTimeout(r, 50))
    // readdirSync should not be called
    expect(mockReaddirSync).not.toHaveBeenCalled()
  })
})
