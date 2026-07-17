import { describe, it, expect, vi, beforeEach } from 'vitest'

// Collect registered handlers
// Handler return shapes vary by channel; this harness validates them at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: Record<string, (...args: unknown[]) => any> = {}
const backupMocks = vi.hoisted(() => ({
  createVerifiedDatabaseBackup: vi.fn(() => ({
    id: 'pre-import-test',
    kind: 'pre-import',
    filePath: '/tmp/pre-import.db',
  })),
}))
const dialogMocks = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
}))

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  dialog: dialogMocks,
}))

// Mock better-sqlite3 via db/index
const mockDB = {
  prepare: vi.fn(),
  exec: vi.fn(),
  pragma: vi.fn(),
  close: vi.fn(),
  transaction: vi.fn((fn: () => void) => {
    return () => fn()
  }),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
  getDatabasePath: () => '/tmp/codehelper.db',
  closeDB: () => {},
}))

vi.mock('../electron/db/databaseBackup', () => backupMocks)

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 1024 })),
  }
})

// Now import the module under test
const { registerExportIPC } = await import('../electron/ipc/export')

function makeStmt(result: unknown = undefined) {
  return {
    get: vi.fn(() => result),
    all: vi.fn(() => (Array.isArray(result) ? result : [result])),
    run: vi.fn(() => ({ lastInsertRowid: 1 })),
  }
}

function invokeDialogImport(
  event: unknown,
  _rendererSuppliedPath: string,
  options?: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return handlers['import-data'](event, options)
}

describe('export IPC', () => {
  let writeSpy: ReturnType<typeof vi.fn>
  let readSpy: ReturnType<typeof vi.fn>
  let existsSpy: ReturnType<typeof vi.fn>
  let statSpy: ReturnType<typeof vi.fn>
  const requestRendererFlush = vi.fn()
  const scheduleRendererReload = vi.fn()

  beforeEach(async () => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
    mockDB.transaction.mockReset()
    mockDB.transaction.mockImplementation((fn: () => void) => () => fn())

    // Reset fs mocks
    const fs = await import('fs')
    writeSpy = fs.writeFileSync as unknown as ReturnType<typeof vi.fn>
    readSpy = fs.readFileSync as unknown as ReturnType<typeof vi.fn>
    existsSpy = fs.existsSync as unknown as ReturnType<typeof vi.fn>
    statSpy = fs.statSync as unknown as ReturnType<typeof vi.fn>
    writeSpy.mockReset()
    readSpy.mockReset()
    existsSpy.mockReturnValue(true)
    statSpy.mockReturnValue({ size: 1024 })
    backupMocks.createVerifiedDatabaseBackup.mockClear()
    dialogMocks.showSaveDialog.mockReset().mockResolvedValue({
      canceled: false,
      filePath: '/tmp/authorized-export.json',
    })
    dialogMocks.showOpenDialog.mockReset().mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/authorized-import.json'],
    })
    requestRendererFlush.mockReset().mockResolvedValue({ ok: true })
    scheduleRendererReload.mockReset()

    registerExportIPC({ requestRendererFlush, scheduleRendererReload })
  })

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  describe('handler registration', () => {
    it('registers only dialog-authorized export/import handlers', () => {
      expect(handlers['export-data']).toBeDefined() // IPC handler registration
      expect(handlers['import-data']).toBeDefined()
      expect(handlers['export-get-counts']).toBeDefined()
      expect(handlers['export-data-to-path']).toBeUndefined()
      expect(handlers['import-data-from-path']).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // Dialog-authorized export validation
  // ---------------------------------------------------------------------------
  describe('export-data', () => {
    it('rejects empty categories array', async () => {
      const result = await handlers['export-data'](null, [])
      expect(result.success).toBe(false)
      expect(result.error).toBe('请至少选择一个数据类别')
      expect(dialogMocks.showSaveDialog).not.toHaveBeenCalled()
    })

    it('rejects invalid categories', async () => {
      const result = await handlers['export-data'](null, ['invalid_cat'])
      expect(result.success).toBe(false)
      expect(result.error).toBe('没有有效的数据类别')
      expect(dialogMocks.showSaveDialog).not.toHaveBeenCalled()
    })

    it('does not write when the native save dialog is canceled', async () => {
      dialogMocks.showSaveDialog.mockResolvedValueOnce({ canceled: true })

      const result = await handlers['export-data'](null, ['problems'])

      expect(result.success).toBe(false)
      expect(result.error).toBe('用户取消')
      expect(writeSpy).not.toHaveBeenCalled()
    })

    it('exports only to the path returned by the native save dialog', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM problems')) {
          return makeStmt([{ id: 1, title: 'Test' }])
        }
        return makeStmt([])
      })

      const result = await handlers['export-data'](
        null,
        ['problems'],
        '/tmp/renderer-supplied.json',
      )

      expect(result.success).toBe(true)
      expect(result.filePath).toBe('/tmp/authorized-export.json')
      expect(writeSpy).toHaveBeenCalledWith(
        '/tmp/authorized-export.json',
        expect.any(String),
        'utf-8',
      )
      expect(writeSpy).not.toHaveBeenCalledWith(
        '/tmp/renderer-supplied.json',
        expect.anything(),
        expect.anything(),
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Export data content
  // ---------------------------------------------------------------------------
  describe('export data content', () => {
    it('produces valid JSON with version and timestamp', async () => {
      mockDB.prepare.mockImplementation(() => makeStmt([]))

      await handlers['export-data'](null, ['settings'])

      expect(writeSpy).toHaveBeenCalled()
      const writtenArg = writeSpy.mock.calls[0][1]
      const json = JSON.parse(writtenArg)
      expect(json.version).toBe(1)
      expect(typeof json.exportedAt).toBe('string')
      // Verify it's a valid ISO date
      expect(new Date(json.exportedAt).toISOString()).toBe(json.exportedAt)
    })

    it('includes only selected categories', async () => {
      mockDB.prepare.mockImplementation(() => makeStmt([]))

      await handlers['export-data'](null, ['problems', 'settings'])

      expect(writeSpy).toHaveBeenCalled()
      const writtenArg = writeSpy.mock.calls[0][1]
      const json = JSON.parse(writtenArg)
      expect(json.problems).toBeDefined() // problems category is included
      expect(json.problems).toEqual([])
      expect(json.settings).toBeDefined() // settings category is included
      expect(json.chat_sessions).toBeUndefined()
      expect(json.knowledge_docs).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // export-get-counts
  // ---------------------------------------------------------------------------
  describe('export-get-counts', () => {
    it('returns counts for all categories', () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return makeStmt({ count: 5 })
        }
        return makeStmt([])
      })

      const counts = handlers['export-get-counts']()
      expect(typeof counts).toBe('object')
      // Should have entries for all categories
      expect(counts.problems).toBe(5)
      expect(counts.settings).toBe(5)
      expect(counts.memories).toBe(5)
    })
  })

  // ---------------------------------------------------------------------------
  // Dialog-authorized import validation
  // ---------------------------------------------------------------------------
  describe('import-data', () => {
    it('creates and returns a verified pre-import backup before opening the transaction', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2026-07-17', problems: [] }),
      )

      const result = await invokeDialogImport(null, '/tmp/good.json')

      expect(backupMocks.createVerifiedDatabaseBackup).toHaveBeenCalledWith(mockDB, {
        kind: 'pre-import',
        databasePath: '/tmp/codehelper.db',
      })
      expect(backupMocks.createVerifiedDatabaseBackup.mock.invocationCallOrder[0]).toBeLessThan(
        mockDB.transaction.mock.invocationCallOrder[0],
      )
      expect(result).toMatchObject({
        success: true,
        backup: {
          id: 'pre-import-test',
          kind: 'pre-import',
          filePath: '/tmp/pre-import.db',
        },
      })
      expect(requestRendererFlush).toHaveBeenCalledTimes(1)
    })

    it('fails closed before backup when any renderer cannot flush', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2026-07-17', problems: [] }),
      )
      requestRendererFlush.mockResolvedValueOnce({ ok: false, error: 'workspace flush failed' })

      const result = await invokeDialogImport(null, '/tmp/good.json')

      expect(result).toMatchObject({ success: false, errors: ['workspace flush failed'] })
      expect(backupMocks.createVerifiedDatabaseBackup).not.toHaveBeenCalled()
      expect(mockDB.transaction).not.toHaveBeenCalled()
    })

    it('rejects a second import while the first renderer flush is pending', async () => {
      readSpy.mockReturnValue(
        JSON.stringify({ version: 1, exportedAt: '2026-07-17', problems: [] }),
      )
      let releaseFlush: (() => void) | undefined
      requestRendererFlush.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFlush = () => resolve({ ok: true })
          }),
      )

      const first = invokeDialogImport(null, '/tmp/good.json')
      await expect(invokeDialogImport(null, '/tmp/good.json')).resolves.toMatchObject({
        success: false,
        errors: ['A portable data import is already in progress'],
      })
      releaseFlush?.()
      await expect(first).resolves.toMatchObject({ success: true })
    })

    it('fails closed without starting a transaction when the pre-import backup fails', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2026-07-17', problems: [] }),
      )
      backupMocks.createVerifiedDatabaseBackup.mockImplementationOnce(() => {
        throw new Error('snapshot failed')
      })

      const result = await invokeDialogImport(null, '/tmp/good.json')

      expect(result.success).toBe(false)
      expect(result.errors).toEqual([expect.stringContaining('snapshot failed')])
      expect(mockDB.transaction).not.toHaveBeenCalled()
      expect(mockDB.prepare).not.toHaveBeenCalled()
    })

    it('rolls back all category mutations and resets imported counts when validation fails', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2026-07-17',
          problems: [{ id: 99, title: 'inserted then rolled back' }],
          settings: [{ value: 'missing natural key' }],
        }),
      )
      let durableProblemIds: number[] = []
      mockDB.transaction.mockImplementationOnce((fn: () => void) => () => {
        const snapshot = [...durableProblemIds]
        try {
          fn()
        } catch (error) {
          durableProblemIds = snapshot
          throw error
        }
      })
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info(problems)')) {
          return makeStmt([
            { name: 'id', notnull: 1, dflt_value: null, pk: 1 },
            { name: 'title', notnull: 1, dflt_value: null, pk: 0 },
          ])
        }
        if (sql.includes('PRAGMA table_info(settings)')) {
          return makeStmt([
            { name: 'key', notnull: 1, dflt_value: null, pk: 1 },
            { name: 'value', notnull: 0, dflt_value: null, pk: 0 },
          ])
        }
        if (sql.includes('SELECT 1 FROM problems WHERE id')) return makeStmt(undefined)
        if (sql.includes('INSERT INTO problems')) {
          return {
            get: vi.fn(),
            all: vi.fn(),
            run: vi.fn((id: number) => {
              durableProblemIds.push(id)
              return { lastInsertRowid: id }
            }),
          }
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/good.json', {
        selectedData: ['problems', 'settings'],
        conflictResolution: 'skip',
      })

      expect(result.success).toBe(false)
      expect(result.imported.problems).toBe(0)
      expect(result.skipped.settings).toBe(1)
      expect(result.errors[0]).toContain('missing key "key"')
      expect(result.backup).toMatchObject({ id: 'pre-import-test', kind: 'pre-import' })
      expect(durableProblemIds).toEqual([])
    })

    it('ignores a renderer-supplied path and reads only the native dialog selection', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2026-07-17', problems: [] }),
      )

      const result = await handlers['import-data'](null, '/tmp/renderer-supplied.json', {
        conflictResolution: 'overwrite',
      })

      expect(result.success).toBe(true)
      expect(readSpy).toHaveBeenCalledWith('/tmp/authorized-import.json', 'utf-8')
      expect(readSpy).not.toHaveBeenCalledWith('/tmp/renderer-supplied.json', expect.anything())
    })

    it('rejects non-existent file', async () => {
      // First existsSync call is directory check (passes), second is file check (fails)
      existsSpy.mockReturnValueOnce(true).mockReturnValueOnce(false)
      const result = await invokeDialogImport(null, '/tmp/nonexistent.json')
      expect(result.success).toBe(false)
      expect(result.errors).toContain('文件不存在')
    })

    it('rejects invalid JSON', async () => {
      readSpy.mockReturnValueOnce('not-json{{{')
      const result = await invokeDialogImport(null, '/tmp/bad.json')
      expect(result.success).toBe(false)
      expect(result.errors).toContain('JSON 格式无效')
    })

    it('rejects JSON without version field', async () => {
      readSpy.mockReturnValueOnce(JSON.stringify({ exportedAt: '2024-01-01' }))
      const result = await invokeDialogImport(null, '/tmp/bad.json')
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('数据格式校验失败')
    })

    it('rejects JSON with version < 1', async () => {
      readSpy.mockReturnValueOnce(JSON.stringify({ version: 0, exportedAt: '2024-01-01' }))
      const result = await invokeDialogImport(null, '/tmp/bad.json')
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('数据格式校验失败')
    })

    it('rejects JSON with non-array data fields', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2024-01-01', problems: 'not-array' }),
      )
      const result = await invokeDialogImport(null, '/tmp/bad.json')
      expect(result.success).toBe(false)
    })

    it('rejects JSON with non-object items in arrays', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          problems: [123, 'string'],
        }),
      )
      const result = await invokeDialogImport(null, '/tmp/bad.json')
      expect(result.success).toBe(false)
    })

    it('accepts valid export data with empty arrays', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2024-01-01', problems: [] }),
      )
      const result = await invokeDialogImport(null, '/tmp/good.json')
      expect(result.success).toBe(true)
    })

    it('accepts valid export data with object items', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          problems: [{ id: 1, title: 'Test' }],
        }),
      )

      // DB setup for import
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'id' }, { name: 'title' }])
        }
        if (sql.includes('SELECT 1 FROM')) {
          return makeStmt(undefined) // no existing row
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/good.json')
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Import conflict resolution
  // ---------------------------------------------------------------------------
  describe('import conflict resolution', () => {
    it('skips existing records with skip resolution', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          settings: [{ key: 'theme', value: 'dark' }],
        }),
      )

      // settings table: key='key', hasAutoId=false
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'key' }, { name: 'value' }])
        }
        if (sql.includes('SELECT 1 FROM')) {
          return makeStmt({}) // existing record
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'skip',
        selectedData: ['settings'],
      })

      expect(result.success).toBe(true)
      expect(result.skipped.settings).toBe(1)
      expect(result.imported.settings).toBe(0)
    })

    it('merges existing records with merge resolution', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          settings: [{ key: 'theme', value: 'dark' }],
        }),
      )

      const mockRun = vi.fn()
      const mutationSql: string[] = []
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([
            { name: 'key', notnull: 1, dflt_value: null, pk: 1 },
            { name: 'value', notnull: 0, dflt_value: null, pk: 0 },
            { name: 'scope', notnull: 1, dflt_value: "'global'", pk: 0 },
          ])
        }
        if (sql.includes('SELECT 1 FROM')) {
          return makeStmt({}) // existing record
        }
        if (sql.includes('UPDATE')) {
          mutationSql.push(sql)
          return { get: vi.fn(), all: vi.fn(), run: mockRun }
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'merge',
        selectedData: ['settings'],
      })

      expect(result.success).toBe(true)
      expect(result.imported.settings).toBe(1)
      expect(mutationSql).toHaveLength(1)
      expect(mutationSql[0]).toContain('UPDATE settings SET value = ? WHERE key = ?')
      expect(mutationSql[0]).not.toContain('scope')
      expect(mockRun).toHaveBeenCalledWith('dark', 'theme')
    })

    it('overwrites existing records in place without deleting related data', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          settings: [{ key: 'theme', value: 'dark' }],
        }),
      )

      const mockRun = vi.fn()
      const mutationSql: string[] = []
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([
            { name: 'key', notnull: 1, dflt_value: null, pk: 1 },
            { name: 'value', notnull: 0, dflt_value: null, pk: 0 },
            { name: 'scope', notnull: 1, dflt_value: "'global'", pk: 0 },
          ])
        }
        if (sql.includes('SELECT 1 FROM')) {
          return makeStmt({}) // existing record
        }
        if (sql.includes('UPDATE') || sql.includes('DELETE FROM') || sql.includes('INSERT INTO')) {
          mutationSql.push(sql)
          return { get: vi.fn(), all: vi.fn(), run: mockRun }
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'overwrite',
        selectedData: ['settings'],
      })

      expect(result.success).toBe(true)
      expect(result.imported.settings).toBe(1)
      expect(mutationSql).toHaveLength(1)
      expect(mutationSql[0]).toContain(
        "UPDATE settings SET value = ?, scope = 'global' WHERE key = ?",
      )
      expect(mockRun).toHaveBeenCalledWith('dark', 'theme')
    })

    it('rejects an overwrite that omits a required column without a default', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          settings: [{ key: 'theme' }],
        }),
      )

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([
            { name: 'key', notnull: 1, dflt_value: null, pk: 1 },
            { name: 'value', notnull: 1, dflt_value: null, pk: 0 },
          ])
        }
        if (sql.includes('SELECT 1 FROM')) return makeStmt({})
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'overwrite',
        selectedData: ['settings'],
      })

      expect(result.success).toBe(false)
      expect(result.imported.settings).toBe(0)
      expect(result.skipped.settings).toBe(1)
      expect(result.errors[0]).toContain('missing required column "value"')
    })

    it('defaults to skip resolution when options not provided', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          settings: [{ key: 'theme', value: 'dark' }],
        }),
      )

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'key' }, { name: 'value' }])
        }
        if (sql.includes('SELECT 1 FROM')) {
          return makeStmt({}) // existing record
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json')
      expect(result.skipped.settings).toBe(1)
      expect(result.imported.settings).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Import with auto-id tables
  // ---------------------------------------------------------------------------
  describe('import with auto-id tables', () => {
    it('handles auto-id table with skip on conflict', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          problems: [{ id: 1, title: 'Test' }],
        }),
      )

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'id' }, { name: 'title' }])
        }
        if (sql.includes('SELECT 1 FROM problems WHERE id')) {
          return makeStmt({}) // existing
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'skip',
        selectedData: ['problems'],
      })

      expect(result.skipped.problems).toBe(1)
      expect(result.imported.problems).toBe(0)
    })

    it('inserts new record when no conflict', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          problems: [{ id: 99, title: 'New Problem' }],
        }),
      )

      const mockRun = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'id' }, { name: 'title' }])
        }
        if (sql.includes('SELECT 1 FROM problems WHERE id')) {
          return makeStmt(undefined) // no existing
        }
        if (sql.includes('INSERT INTO')) {
          return { get: vi.fn(), all: vi.fn(), run: mockRun }
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'skip',
        selectedData: ['problems'],
      })

      expect(result.imported.problems).toBe(1)
      expect(mockRun).toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Import with missing key
  // ---------------------------------------------------------------------------
  describe('import with missing key', () => {
    it('skips rows with missing natural key', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          settings: [{ value: 'dark' }], // missing 'key' field
        }),
      )

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'key' }, { name: 'value' }])
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'skip',
        selectedData: ['settings'],
      })

      expect(result.skipped.settings).toBe(1)
      expect(result.errors[0]).toContain('missing key')
    })
  })

  // ---------------------------------------------------------------------------
  // Import with schema mismatch
  // ---------------------------------------------------------------------------
  describe('import with schema mismatch', () => {
    it('skips rows with zero matching columns', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          problems: [{ nonexistent_col: 'value' }],
        }),
      )

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'id' }, { name: 'title' }])
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'skip',
        selectedData: ['problems'],
      })

      expect(result.skipped.problems).toBe(1)
      expect(result.imported.problems).toBe(0)
    })

    it('filters out columns not in current schema', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          problems: [{ id: 1, title: 'Test', removed_col: 'old' }],
        }),
      )

      const mockRun = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'id' }, { name: 'title' }])
        }
        if (sql.includes('SELECT 1 FROM problems WHERE id')) {
          return makeStmt(undefined)
        }
        if (sql.includes('INSERT INTO')) {
          // Verify the INSERT doesn't include removed_col
          expect(sql).not.toContain('removed_col')
          return { get: vi.fn(), all: vi.fn(), run: mockRun }
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        selectedData: ['problems'],
      })

      expect(result.imported.problems).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Import selected data filtering
  // ---------------------------------------------------------------------------
  describe('import selected data filtering', () => {
    it('only imports categories specified in selectedData', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          problems: [{ id: 1, title: 'Test' }],
          settings: [{ key: 'theme', value: 'dark' }],
        }),
      )

      // problems: id column, auto-id
      let callCount = 0
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'id' }, { name: 'title' }])
        }
        if (sql.includes('SELECT 1 FROM problems WHERE id')) {
          return makeStmt(undefined)
        }
        if (sql.includes('INSERT INTO problems')) {
          callCount++
          return makeStmt(undefined)
        }
        return makeStmt(undefined)
      })

      const result = await invokeDialogImport(null, '/tmp/data.json', {
        conflictResolution: 'skip',
        selectedData: ['problems'],
      })

      // Only problems was selected, so only problems appears in the result
      expect(result.imported.problems).toBe(1)
      expect(result.imported.settings).toBeUndefined()
      expect(callCount).toBe(1)
    })
  })
})
