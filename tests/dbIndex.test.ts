import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'

const recoveryMocks = vi.hoisted(() => ({
  openDatabaseWithRecovery: vi.fn(),
}))
const backupMocks = vi.hoisted(() => ({
  createVerifiedDatabaseBackup: vi.fn(),
  readApplicationSchemaVersion: vi.fn(),
  runDatabaseQuickCheck: vi.fn(),
}))
const schemaMocks = vi.hoisted(() => ({
  ensureExerciseDraftSchema: vi.fn(),
  ensureEditorWorkspaceSchema: vi.fn(),
  ensureKnowledgeMetadataSchema: vi.fn(),
  ensureKnowledgeRetrievalSchema: vi.fn(),
  ensureAgentSchema: vi.fn(),
}))

// Set process.resourcesPath before any imports
process.resourcesPath = '/tmp/test-resources'

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-user-data'),
    getVersion: vi.fn(() => '2.3.0'),
  },
}))

// Mock better-sqlite3
const mockDBInstance = {
  pragma: vi.fn(),
  exec: vi.fn(),
  prepare: vi.fn(),
  transaction: vi.fn((fn: () => unknown) => fn),
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

vi.mock('../electron/db/databaseRecovery', () => recoveryMocks)
vi.mock('../electron/db/databaseBackup', () => backupMocks)
vi.mock('../electron/db/exerciseDraftRepository', () => ({
  ensureExerciseDraftSchema: schemaMocks.ensureExerciseDraftSchema,
}))
vi.mock('../electron/db/editorWorkspaceRepository', () => ({
  ensureEditorWorkspaceSchema: schemaMocks.ensureEditorWorkspaceSchema,
}))
vi.mock('../electron/db/knowledgeRetrievalRepository', () => ({
  ensureKnowledgeRetrievalSchema: schemaMocks.ensureKnowledgeRetrievalSchema,
}))
vi.mock('../electron/db/knowledgeMetadataRepository', () => ({
  ensureKnowledgeMetadataSchema: schemaMocks.ensureKnowledgeMetadataSchema,
}))
vi.mock('../electron/db/agentRepository', () => ({
  ensureAgentSchema: schemaMocks.ensureAgentSchema,
}))

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
  }
})

import {
  APPLICATION_SCHEMA_VERSION,
  getDB,
  closeDB,
  __resetDBForTesting,
} from '../electron/db/index'

describe('electron/db/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the singleton without re-importing the module
    __resetDBForTesting()
    vi.mocked(fs.existsSync).mockReset().mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReset().mockReturnValue('')
    backupMocks.readApplicationSchemaVersion.mockReset().mockReturnValue(APPLICATION_SCHEMA_VERSION)
    backupMocks.runDatabaseQuickCheck.mockReset().mockReturnValue(['ok'])
    backupMocks.createVerifiedDatabaseBackup.mockReset().mockReturnValue({
      filePath: '/tmp/test-user-data/backups/pre-migration.db',
    })
    recoveryMocks.openDatabaseWithRecovery.mockImplementation(
      (
        databasePath: string,
        initialize: (database: typeof mockDBInstance) => void,
        options?: { beforeOpenWritable?: (database: typeof mockDBInstance) => void },
      ) => {
        if (fs.existsSync(databasePath)) options?.beforeOpenWritable?.(mockDBInstance)
        initialize(mockDBInstance)
        return { database: mockDBInstance, recoveryNotice: null }
      },
    )
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
      run: vi.fn(() => ({ changes: 0 })),
    })

    const db = getDB()

    expect(db).toBe(mockDBInstance)
    expect(mockDBInstance.pragma).toHaveBeenCalledWith('journal_mode = WAL')
    expect(mockDBInstance.pragma).toHaveBeenCalledWith('foreign_keys = ON')
    expect(mockDBInstance.transaction).toHaveBeenCalledTimes(1)
    expect(schemaMocks.ensureExerciseDraftSchema).toHaveBeenCalledWith(mockDBInstance)
    expect(schemaMocks.ensureEditorWorkspaceSchema).toHaveBeenCalledWith(mockDBInstance)
    expect(schemaMocks.ensureKnowledgeMetadataSchema).toHaveBeenCalledWith(mockDBInstance, {
      fullBackfill: false,
    })
  })

  it('uses application schema version 2 for the metadata and audit migration', () => {
    expect(APPLICATION_SCHEMA_VERSION).toBe(2)
  })

  it('creates a verified backup before migrating an older application schema', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      String(path).replace(/\\/g, '/').endsWith('/codehelper.db'),
    )
    backupMocks.readApplicationSchemaVersion
      .mockReturnValueOnce(APPLICATION_SCHEMA_VERSION - 1)
      .mockReturnValue(APPLICATION_SCHEMA_VERSION)
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: vi.fn(() => ({ changes: 0 })),
    })

    getDB()

    expect(backupMocks.createVerifiedDatabaseBackup).toHaveBeenCalledWith(
      mockDBInstance,
      expect.objectContaining({
        kind: 'pre-migration',
        databasePath: expect.stringMatching(/codehelper\.db$/),
        applicationVersion: '2.3.0',
      }),
    )
    expect(backupMocks.createVerifiedDatabaseBackup.mock.invocationCallOrder[0]).toBeLessThan(
      schemaMocks.ensureExerciseDraftSchema.mock.invocationCallOrder[0],
    )
    expect(schemaMocks.ensureKnowledgeMetadataSchema).toHaveBeenCalledWith(mockDBInstance, {
      fullBackfill: true,
    })
  })

  it('refuses a database created by a newer application schema', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      String(path).replace(/\\/g, '/').endsWith('/codehelper.db'),
    )
    backupMocks.readApplicationSchemaVersion.mockReturnValue(APPLICATION_SCHEMA_VERSION + 1)

    expect(() => getDB()).toThrow(/newer than this application supports/)
    expect(backupMocks.createVerifiedDatabaseBackup).not.toHaveBeenCalled()
    expect(schemaMocks.ensureExerciseDraftSchema).not.toHaveBeenCalled()
    expect(schemaMocks.ensureEditorWorkspaceSchema).not.toHaveBeenCalled()
  })

  it('does not run migrations when the pre-migration backup fails', () => {
    vi.mocked(fs.existsSync).mockImplementation((path) =>
      String(path).replace(/\\/g, '/').endsWith('/codehelper.db'),
    )
    backupMocks.readApplicationSchemaVersion.mockReturnValue(APPLICATION_SCHEMA_VERSION - 1)
    backupMocks.createVerifiedDatabaseBackup.mockImplementationOnce(() => {
      throw new Error('backup verification failed')
    })

    expect(() => getDB()).toThrow('backup verification failed')
    expect(schemaMocks.ensureExerciseDraftSchema).not.toHaveBeenCalled()
    expect(schemaMocks.ensureEditorWorkspaceSchema).not.toHaveBeenCalled()
    expect(mockDBInstance.pragma).not.toHaveBeenCalled()
    expect(mockDBInstance.exec).not.toHaveBeenCalled()
  })

  it('does not record the application schema version when post-migration quick_check fails', () => {
    const versionRun = vi.fn()
    mockDBInstance.prepare.mockImplementation((sql: string) => ({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: sql.includes('INSERT INTO schema_migrations')
        ? versionRun
        : vi.fn(() => ({ changes: 0 })),
    }))
    backupMocks.runDatabaseQuickCheck.mockReturnValueOnce(['database disk image is malformed'])

    expect(() => getDB()).toThrow(/quick_check failed after migration/)
    expect(schemaMocks.ensureExerciseDraftSchema).toHaveBeenCalledWith(mockDBInstance)
    expect(schemaMocks.ensureEditorWorkspaceSchema).toHaveBeenCalledWith(mockDBInstance)
    expect(backupMocks.runDatabaseQuickCheck).toHaveBeenCalledWith(mockDBInstance)
    expect(versionRun).not.toHaveBeenCalled()
  })

  it('getDB returns same instance on subsequent calls (singleton)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: vi.fn(() => ({ changes: 0 })),
    })

    const db1 = getDB()
    const db2 = getDB()

    expect(db1).toBe(db2)
  })

  it('does not cache a half-initialized database after startup failure', () => {
    const startupError = new Error('schema initialization failed')
    recoveryMocks.openDatabaseWithRecovery.mockImplementationOnce(() => {
      throw startupError
    })
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: vi.fn(() => ({ changes: 0 })),
    })

    expect(() => getDB()).toThrow(startupError)
    expect(getDB()).toBe(mockDBInstance)
    expect(recoveryMocks.openDatabaseWithRecovery).toHaveBeenCalledTimes(2)
  })

  it('getDB loads schema from first existing path', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: string) => p.includes('schema.sql'))
    vi.mocked(fs.readFileSync).mockReturnValue('CREATE TABLE test (id INTEGER);')
    mockDBInstance.prepare.mockReturnValue({
      all: vi.fn(() => [{ name: 'id' }]),
      get: vi.fn(),
      run: vi.fn(() => ({ changes: 0 })),
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
      run: vi.fn(() => ({ changes: 0 })),
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
      run: vi.fn(() => ({ changes: 0 })),
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
      run: vi.fn(() => ({ changes: 0 })),
    })
    const execFn = vi.fn()
    mockDBInstance.exec = execFn

    getDB()

    // Should NOT have called exec for ALTER TABLE
    const alterCalls = execFn.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes('ALTER TABLE problems'),
    )
    expect(alterCalls).toHaveLength(0)
  })

  it('migrates an existing chat_history table without the session foreign key', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const problemColumns = [
      'tracks',
      'platform',
      'mode',
      'exam_style',
      'year',
      'official_url',
      'estimated_time',
    ].map((name) => ({ name }))
    mockDBInstance.prepare.mockImplementation((sql: string) => ({
      all: vi.fn(() => (sql.includes('foreign_key_list') ? [] : problemColumns)),
      get: vi.fn(),
      run: vi.fn(() => ({ changes: 0 })),
    }))
    const execFn = vi.fn()
    mockDBInstance.exec = execFn

    getDB()

    expect(execFn).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE chat_history_migrated'),
    )
    expect(execFn).toHaveBeenCalledWith(expect.stringContaining('JOIN chat_sessions'))
    expect(execFn).toHaveBeenCalledWith(expect.stringContaining('ON DELETE CASCADE'))
  })

  it('keeps chat_history unchanged when the cascade foreign key already exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    mockDBInstance.prepare.mockImplementation((sql: string) => ({
      all: vi.fn(() =>
        sql.includes('foreign_key_list')
          ? [{ table: 'chat_sessions', from: 'session_id', on_delete: 'CASCADE' }]
          : [{ name: 'tracks' }],
      ),
      get: vi.fn(),
      run: vi.fn(() => ({ changes: 0 })),
    }))
    const execFn = vi.fn()
    mockDBInstance.exec = execFn

    getDB()

    expect(execFn.mock.calls.some(([sql]) => String(sql).includes('chat_history_migrated'))).toBe(
      false,
    )
  })
})
