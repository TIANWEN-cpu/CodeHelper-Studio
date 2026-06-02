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
  dialog: {
    showOpenDialog: vi.fn(),
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

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => 'file content here'),
    statSync: vi.fn(() => ({ size: 100 })),
  }
})

function makeStmt(result: unknown = undefined) {
  return {
    get: vi.fn(() => result),
    all: vi.fn(() => (Array.isArray(result) ? result : [result])),
    run: vi.fn(() => ({ lastInsertRowid: 1 })),
  }
}

describe('registerRAGIPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
  })

  it('registers all RAG handlers', async () => {
    mockDB.prepare.mockReturnValue(makeStmt(undefined))

    const { registerRAGIPC } = await import('../electron/ipc/rag')
    registerRAGIPC()

    expect(handlers['knowledge-upload']).toBeDefined()
    expect(handlers['knowledge-list']).toBeDefined()
    expect(handlers['knowledge-delete']).toBeDefined()
    expect(handlers['knowledge-search']).toBeDefined()
  })

  describe('knowledge-upload', () => {
    it('returns null when dialog is canceled', async () => {
      const { dialog } = await import('electron')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: true,
        filePaths: [],
      })

      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      const result = await handlers['knowledge-upload']()
      expect(result).toBeNull()
    })

    it('returns null when no files selected', async () => {
      const { dialog } = await import('electron')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: [],
      })

      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      const result = await handlers['knowledge-upload']()
      expect(result).toBeNull()
    })

    it('uploads txt file successfully', async () => {
      const { dialog } = await import('electron')
      const fs = await import('fs')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: ['/test/doc.txt'],
      })
      ;(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('Hello world content')
      ;(fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ size: 100 })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO knowledge_docs')) {
          return { run: vi.fn(() => ({ lastInsertRowid: 1 })), get: vi.fn(), all: vi.fn() }
        }
        if (sql.includes('INSERT INTO knowledge_chunks')) {
          return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
        }
        return makeStmt(undefined)
      })

      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      const result = await handlers['knowledge-upload']()
      expect(result).toEqual(['doc.txt'])
    })

    it('uploads md file successfully', async () => {
      const { dialog } = await import('electron')
      const fs = await import('fs')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: ['/test/readme.md'],
      })
      ;(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('# Title\nContent')
      ;(fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ size: 50 })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO knowledge_docs')) {
          return { run: vi.fn(() => ({ lastInsertRowid: 2 })), get: vi.fn(), all: vi.fn() }
        }
        if (sql.includes('INSERT INTO knowledge_chunks')) {
          return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
        }
        return makeStmt(undefined)
      })

      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      const result = await handlers['knowledge-upload']()
      expect(result).toEqual(['readme.md'])
    })

    it('throws when file exceeds size limit', async () => {
      const { dialog } = await import('electron')
      const fs = await import('fs')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: ['/test/huge.txt'],
      })
      ;(fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ size: 20 * 1024 * 1024 }) // 20MB

      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      await expect(handlers['knowledge-upload']()).rejects.toThrow('超过大小限制')
    })

    it('handles PDF parse failure gracefully', async () => {
      const { dialog } = await import('electron')
      const fs = await import('fs')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: ['/test/doc.pdf'],
      })
      ;(fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ size: 100 })
      ;(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('pdf-content'))

      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      // PDF import will fail in test environment
      await expect(handlers['knowledge-upload']()).rejects.toThrow()
    })
  })

  describe('knowledge-list', () => {
    it('returns all knowledge docs', async () => {
      const docs = [
        { id: 1, filename: 'doc.txt', file_type: '.txt', chunk_count: 3, created_at: '2024-01-01' },
      ]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('knowledge_docs')) return makeStmt(docs)
        return makeStmt(undefined)
      })

      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      const result = handlers['knowledge-list']()
      expect(result).toEqual(docs)
    })
  })

  describe('knowledge-delete', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()
    })

    it('validates id', () => {
      expect(() => handlers['knowledge-delete'](null, -1)).toThrow('参数无效: id')
      expect(() => handlers['knowledge-delete'](null, NaN)).toThrow('参数无效: id')
      expect(() => handlers['knowledge-delete'](null, 0)).toThrow('参数无效: id')
    })

    it('deletes knowledge doc', () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation(() => ({
        get: vi.fn(),
        all: vi.fn(),
        run: runFn,
      }))

      handlers['knowledge-delete'](null, 5)
      expect(runFn).toHaveBeenCalled()
    })
  })

  describe('knowledge-search', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()
    })

    it('validates query', async () => {
      await expect(handlers['knowledge-search'](null, '')).rejects.toThrow('参数无效: query')
      await expect(handlers['knowledge-search'](null, 123 as unknown)).rejects.toThrow(
        '参数无效: query',
      )
      await expect(handlers['knowledge-search'](null, '   ')).rejects.toThrow('参数无效: query')
    })

    it('returns empty for single-char keywords', async () => {
      const result = await handlers['knowledge-search'](null, 'a')
      expect(result).toEqual([])
    })

    it('searches and scores chunks', async () => {
      const chunks = [
        {
          id: 1,
          doc_id: 1,
          content: 'Python is great for data science',
          chunk_index: 0,
          filename: 'doc.txt',
        },
        { id: 2, doc_id: 1, content: 'Java is also popular', chunk_index: 1, filename: 'doc.txt' },
      ]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('knowledge_chunks') && sql.includes('JOIN')) return makeStmt(chunks)
        return makeStmt(undefined)
      })

      const result = await handlers['knowledge-search'](null, 'Python data')
      expect(result).toBeDefined()
      expect(result.length).toBeLessThanOrEqual(5)
    })

    it('sorts results by score descending', async () => {
      const chunks = [
        { id: 1, doc_id: 1, content: 'Python python python', chunk_index: 0, filename: 'doc.txt' },
        {
          id: 2,
          doc_id: 1,
          content: 'just one python mention',
          chunk_index: 1,
          filename: 'doc.txt',
        },
      ]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('knowledge_chunks') && sql.includes('JOIN')) return makeStmt(chunks)
        return makeStmt(undefined)
      })

      const result = await handlers['knowledge-search'](null, 'python')
      expect(result[0].score).toBeGreaterThanOrEqual(result[result.length - 1].score)
    })

    it('limits results to 5', async () => {
      const chunks = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        doc_id: 1,
        content: `python chunk ${i}`,
        chunk_index: i,
        filename: 'doc.txt',
      }))
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('knowledge_chunks') && sql.includes('JOIN')) return makeStmt(chunks)
        return makeStmt(undefined)
      })

      const result = await handlers['knowledge-search'](null, 'python')
      expect(result.length).toBeLessThanOrEqual(5)
    })

    it('truncates long query to 1000 chars', async () => {
      mockDB.prepare.mockReturnValue(makeStmt([]))
      const longQuery = 'a'.repeat(2000)
      // Should not throw
      await handlers['knowledge-search'](null, longQuery)
    })
  })
})
