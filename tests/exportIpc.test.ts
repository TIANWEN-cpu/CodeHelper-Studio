import { describe, it, expect, vi, beforeEach } from 'vitest'

// Collect registered handlers
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

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
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  },
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
  closeDB: () => {},
}))

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
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

describe('export IPC', () => {
  let writeSpy: ReturnType<typeof vi.fn>
  let readSpy: ReturnType<typeof vi.fn>
  let existsSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
    mockDB.transaction.mockImplementation((fn: () => void) => () => fn())

    // Reset fs mocks
    const fs = await import('fs')
    writeSpy = fs.writeFileSync as unknown as ReturnType<typeof vi.fn>
    readSpy = fs.readFileSync as unknown as ReturnType<typeof vi.fn>
    existsSpy = fs.existsSync as unknown as ReturnType<typeof vi.fn>
    writeSpy.mockReset()
    readSpy.mockReset()
    existsSpy.mockReturnValue(true)

    registerExportIPC()
  })

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  describe('handler registration', () => {
    it('registers all four export/import handlers', () => {
      expect(handlers['export-data']).toBeDefined() // IPC handler registration
      expect(handlers['export-data-to-path']).toBeDefined()
      expect(handlers['import-data']).toBeDefined()
      expect(handlers['import-data-from-path']).toBeDefined()
      expect(handlers['export-get-counts']).toBeDefined()
    })
  })

  // ---------------------------------------------------------------------------
  // export-data-to-path validation
  // ---------------------------------------------------------------------------
  describe('export-data-to-path', () => {
    it('rejects empty categories array', async () => {
      const result = await handlers['export-data-to-path'](null, [], '/tmp/test.json')
      expect(result.success).toBe(false)
      expect(result.error).toBe('请至少选择一个数据类别')
    })

    it('rejects invalid categories', async () => {
      const result = await handlers['export-data-to-path'](null, ['invalid_cat'], '/tmp/test.json')
      expect(result.success).toBe(false)
      expect(result.error).toBe('没有有效的数据类别')
    })

    it('rejects empty file path', async () => {
      const result = await handlers['export-data-to-path'](null, ['problems'], '')
      expect(result.success).toBe(false)
      expect(result.error).toBe('文件路径无效')
    })

    it('rejects whitespace-only file path', async () => {
      const result = await handlers['export-data-to-path'](null, ['problems'], '   ')
      expect(result.success).toBe(false)
      expect(result.error).toBe('文件路径无效')
    })

    it('exports valid categories to file', async () => {
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM problems')) {
          return makeStmt([{ id: 1, title: 'Test' }])
        }
        return makeStmt([])
      })

      const result = await handlers['export-data-to-path'](null, ['problems'], '/tmp/out.json')
      expect(result.success).toBe(true)
      expect(result.filePath).toBe('/tmp/out.json')
      expect(writeSpy).toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // export-data-to-path data content
  // ---------------------------------------------------------------------------
  describe('export data content', () => {
    it('produces valid JSON with version and timestamp', async () => {
      mockDB.prepare.mockImplementation(() => makeStmt([]))

      await handlers['export-data-to-path'](null, ['settings'], '/tmp/out.json')

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

      await handlers['export-data-to-path'](null, ['problems', 'settings'], '/tmp/out2.json')

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
  // import-data-from-path validation
  // ---------------------------------------------------------------------------
  describe('import-data-from-path', () => {
    it('rejects empty file path', async () => {
      const result = await handlers['import-data-from-path'](null, '')
      expect(result.success).toBe(false)
      expect(result.errors).toContain('文件路径无效')
    })

    it('rejects non-existent file', async () => {
      existsSpy.mockReturnValueOnce(false)
      const result = await handlers['import-data-from-path'](null, '/tmp/nonexistent.json')
      expect(result.success).toBe(false)
      expect(result.errors).toContain('文件不存在')
    })

    it('rejects invalid JSON', async () => {
      readSpy.mockReturnValueOnce('not-json{{{')
      const result = await handlers['import-data-from-path'](null, '/tmp/bad.json')
      expect(result.success).toBe(false)
      expect(result.errors).toContain('JSON 格式无效')
    })

    it('rejects JSON without version field', async () => {
      readSpy.mockReturnValueOnce(JSON.stringify({ exportedAt: '2024-01-01' }))
      const result = await handlers['import-data-from-path'](null, '/tmp/bad.json')
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('数据格式校验失败')
    })

    it('rejects JSON with version < 1', async () => {
      readSpy.mockReturnValueOnce(JSON.stringify({ version: 0, exportedAt: '2024-01-01' }))
      const result = await handlers['import-data-from-path'](null, '/tmp/bad.json')
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('数据格式校验失败')
    })

    it('rejects JSON with non-array data fields', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2024-01-01', problems: 'not-array' }),
      )
      const result = await handlers['import-data-from-path'](null, '/tmp/bad.json')
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
      const result = await handlers['import-data-from-path'](null, '/tmp/bad.json')
      expect(result.success).toBe(false)
    })

    it('accepts valid export data with empty arrays', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({ version: 1, exportedAt: '2024-01-01', problems: [] }),
      )
      const result = await handlers['import-data-from-path'](null, '/tmp/good.json')
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

      const result = await handlers['import-data-from-path'](null, '/tmp/good.json')
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
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
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'key' }, { name: 'value' }])
        }
        if (sql.includes('SELECT 1 FROM')) {
          return makeStmt({}) // existing record
        }
        if (sql.includes('UPDATE')) {
          return { get: vi.fn(), all: vi.fn(), run: mockRun }
        }
        return makeStmt(undefined)
      })

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
        conflictResolution: 'merge',
        selectedData: ['settings'],
      })

      expect(result.success).toBe(true)
      expect(result.imported.settings).toBe(1)
      expect(mockRun).toHaveBeenCalled()
    })

    it('overwrites existing records with overwrite resolution', async () => {
      readSpy.mockReturnValueOnce(
        JSON.stringify({
          version: 1,
          exportedAt: '2024-01-01',
          settings: [{ key: 'theme', value: 'dark' }],
        }),
      )

      const mockRun = vi.fn()
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return makeStmt([{ name: 'key' }, { name: 'value' }])
        }
        if (sql.includes('SELECT 1 FROM')) {
          return makeStmt({}) // existing record
        }
        if (sql.includes('DELETE FROM')) {
          return { get: vi.fn(), all: vi.fn(), run: mockRun }
        }
        if (sql.includes('INSERT INTO')) {
          return { get: vi.fn(), all: vi.fn(), run: mockRun }
        }
        return makeStmt(undefined)
      })

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
        conflictResolution: 'overwrite',
        selectedData: ['settings'],
      })

      expect(result.success).toBe(true)
      expect(result.imported.settings).toBe(1)
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json')
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
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

      const result = await handlers['import-data-from-path'](null, '/tmp/data.json', {
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
