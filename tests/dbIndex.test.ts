import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'

// Set process.resourcesPath before any imports
process.resourcesPath = '/tmp/test-resources'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data'),
  },
}))

// Mock better-sqlite3
const mockDBInstance = {
  pragma: vi.fn(),
  exec: vi.fn(),
  prepare: vi.fn(),
  close: vi.fn(),
}

vi.mock('better-sqlite3', () => {
  return {
    __esModule: true,
    default: class MockDatabase {
      constructor() {
        return mockDBInstance
      }
    },
  }
})

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
  }
})

import { getDB, closeDB, __resetDBForTesting } from '../electron/db/index'

describe('electron/db/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the singleton without re-importing the module
    __resetDBForTesting()
  })

  it('getDB creates database with WAL mode and foreign keys', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    // Mock PRAGMA table_info to return all columns
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [
        { name: 'id' },
        { name: 'title' },
        { name: 'tracks' },
        { name: 'platform' },
        { name: 'mode' },
        { name: 'exam_style' },
        { name: 'year' },
        { name: 'official_url' },
        { name: 'estimated_time' },
      ]),
      get: vi.fn(),
      run: vi.fn(),
    })

    const db = getDB()

    expect(db).toBe(mockDBInstance)
    expect(mockDBInstance.pragma).toHaveBeenCalledWith('journal_mode = WAL')
    expect(mockDBInstance.pragma).toHaveBeenCalledWith('foreign_keys = ON')
  })

  it('getDB returns same instance on subsequent calls (singleton)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: vi.fn(),
    })

    const db1 = getDB()
    const db2 = getDB()

    expect(db1).toBe(db2)
  })

  it('getDB loads schema from first existing path', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: string) => p.includes('schema.sql'))
    vi.mocked(fs.readFileSync).mockReturnValue('CREATE TABLE test (id INTEGER);')
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: vi.fn(),
    })

    getDB()

    expect(fs.readFileSync).toHaveBeenCalled()
    expect(mockDBInstance.exec).toHaveBeenCalledWith('CREATE TABLE test (id INTEGER);')
  })

  it('closeDB closes database and resets singleton', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: vi.fn(),
    })

    getDB()
    closeDB()

    expect(mockDBInstance.close).toHaveBeenCalled()
  })

  it('closeDB does nothing when db is null', () => {
    closeDB()
    // Should not throw
  })

  it('ensureSchemaColumns adds missing columns', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    // First call: only has 'id' column
    const allFn = vi.fn(() => [{ name: 'id' }])
    const execFn = vi.fn()
    mockDBInstance.prepare.mockReturnValue({
      all: allFn,
      get: vi.fn(),
      run: vi.fn(),
    })
    mockDBInstance.exec = execFn

    getDB()

    // Should have called exec to add missing columns
    expect(execFn).toHaveBeenCalled()
    const execCalls = execFn.mock.calls.map((c: unknown[]) => c[0] as string)
    const addedColumns = execCalls.some(
      (sql: string) => sql.includes('ALTER TABLE') && sql.includes('tracks'),
    )
    expect(addedColumns).toBe(true)
  })

  it('ensureSchemaColumns skips existing columns', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    // All columns already exist
    const allColumns = [
      'id',
      'title',
      'description',
      'difficulty',
      'tags',
      'languages',
      'examples',
      'test_cases',
      'starter_code',
      'source',
      'tracks',
      'platform',
      'mode',
      'exam_style',
      'year',
      'official_url',
      'estimated_time',
    ].map((name) => ({ name }))

    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => allColumns),
      get: vi.fn(),
      run: vi.fn(),
    })
    const execFn = vi.fn()
    mockDBInstance.exec = execFn

    getDB()

    // Should NOT have called exec for ALTER TABLE
    const alterCalls = execFn.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('ALTER TABLE'),
    )
    expect(alterCalls).toHaveLength(0)
  })
})
