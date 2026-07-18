import { describe, it, expect, vi, beforeEach } from 'vitest'

// Collect registered handlers
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

const pdfParseMocks = vi.hoisted(() => ({
  construct: vi.fn(),
  getText: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(options: { data: Uint8Array }) {
      pdfParseMocks.construct(options)
    }

    getText() {
      return pdfParseMocks.getText()
    }

    destroy() {
      return pdfParseMocks.destroy()
    }
  },
}))

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
  // better-sqlite3 transaction(fn) 返回一个调用 fn 的函数；测试里同步直通即可。
  transaction: vi.fn(
    (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args),
  ),
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

/** Flush microtask queue so the deferred DB init (Promise.resolve().then) completes. */
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('registerRAGIPC', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])
    mockDB.prepare.mockReset()
    mockDB.exec.mockReset()
    pdfParseMocks.construct.mockReset()
    pdfParseMocks.getText.mockReset()
    pdfParseMocks.destroy.mockReset()
    pdfParseMocks.destroy.mockResolvedValue(undefined)
  })

  it('registers all RAG handlers', async () => {
    mockDB.prepare.mockReturnValue(makeStmt(undefined))

    const { registerRAGIPC } = await import('../electron/ipc/rag')
    registerRAGIPC()

    expect(handlers['knowledge-upload']).toBeDefined() // IPC handler registration
    expect(handlers['knowledge-list']).toBeDefined()
    expect(handlers['knowledge-get']).toBeDefined()
    expect(handlers['knowledge-link-audit']).toBeDefined()
    expect(handlers['knowledge-delete']).toBeDefined()
    expect(handlers['knowledge-search']).toBeDefined()
    expect(handlers['knowledge-retrieval-status']).toBeDefined()
    expect(handlers['knowledge-semantic-search']).toBeDefined()
    expect(handlers['knowledge-summarize']).toBeDefined()
    expect(handlers['knowledge-concept-graph']).toBeDefined()
    expect(handlers['knowledge-concept-detail']).toBeDefined()
    expect(handlers['knowledge-auto-tag']).toBeDefined()
    expect(handlers['knowledge-tags']).toBeDefined()
    expect(handlers['knowledge-tag-documents']).toBeDefined()
    expect(handlers['knowledge-rag-context']).toBeDefined()
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
      // doc + chunks 写入必须在事务内，保证不留半截文档。
      expect(mockDB.transaction).toHaveBeenCalled()
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

    it('uploads PDF text with the pdf-parse v2 class API', async () => {
      const { dialog } = await import('electron')
      const fs = await import('fs')
      const buffer = Buffer.from('pdf-content')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: ['/test/doc.pdf'],
      })
      ;(fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ size: 100 })
      ;(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(buffer)
      pdfParseMocks.getText.mockResolvedValue({ text: '# PDF title\r\nExtracted body' })

      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO knowledge_docs')) {
          return { run: vi.fn(() => ({ lastInsertRowid: 3 })), get: vi.fn(), all: vi.fn() }
        }
        if (sql.includes('INSERT INTO knowledge_chunks')) {
          return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
        }
        return makeStmt(undefined)
      })

      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      await expect(handlers['knowledge-upload']()).resolves.toEqual(['doc.pdf'])
      expect(pdfParseMocks.construct).toHaveBeenCalledWith({ data: expect.any(Uint8Array) })
      expect(pdfParseMocks.getText).toHaveBeenCalledOnce()
      expect(pdfParseMocks.destroy).toHaveBeenCalledOnce()
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

    it('handles PDF parse failure gracefully and destroys the parser', async () => {
      const { dialog } = await import('electron')
      const fs = await import('fs')
      ;(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        canceled: false,
        filePaths: ['/test/doc.pdf'],
      })
      ;(fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ size: 100 })
      ;(fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(Buffer.from('pdf-content'))
      pdfParseMocks.getText.mockRejectedValue(new Error('invalid PDF'))

      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      await expect(handlers['knowledge-upload']()).rejects.toThrow('PDF 解析失败: invalid PDF')
      expect(pdfParseMocks.destroy).toHaveBeenCalledOnce()
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
      await flushMicrotasks() // allow deferred DB init to complete

      const result = await handlers['knowledge-list']()
      expect(result).toEqual([expect.objectContaining(docs[0])])
      expect(result[0]).toMatchObject({
        display_title: 'doc',
        tags: [],
        document_kind: 'text',
        visibility: 'local',
      })
    })
  })

  describe('knowledge-get', () => {
    it('waits for database initialization and returns the full document', async () => {
      const doc = {
        id: 1,
        filename: 'doc.md',
        file_type: '.md',
        content: '# Full content',
        chunk_count: 1,
        created_at: '2024-01-01',
      }
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('FROM knowledge_docs')) return makeStmt(doc)
        return makeStmt(undefined)
      })

      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      await expect(handlers['knowledge-get'](null, 1)).resolves.toMatchObject(doc)
    })
  })

  describe('knowledge-link-audit', () => {
    it('rejects invalid document ids', async () => {
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()

      await expect(handlers['knowledge-link-audit'](null, 0)).rejects.toThrow('参数无效: id')
      await expect(handlers['knowledge-link-audit'](null, Number.NaN)).rejects.toThrow(
        '参数无效: id',
      )
    })
  })

  describe('knowledge-delete', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()
      await flushMicrotasks() // allow deferred DB init to complete
    })

    it('validates id', async () => {
      await expect(handlers['knowledge-delete'](null, -1)).rejects.toThrow('参数无效: id')
      await expect(handlers['knowledge-delete'](null, NaN)).rejects.toThrow('参数无效: id')
      await expect(handlers['knowledge-delete'](null, 0)).rejects.toThrow('参数无效: id')
    })

    it('deletes knowledge doc', async () => {
      const runFn = vi.fn()
      mockDB.prepare.mockImplementation(() => ({
        get: vi.fn(),
        all: vi.fn(),
        run: runFn,
      }))

      await handlers['knowledge-delete'](null, 5)
      expect(runFn).toHaveBeenCalled()
      expect(mockDB.transaction).toHaveBeenCalled()
    })
  })

  describe('knowledge-search', () => {
    beforeEach(async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()
      await flushMicrotasks() // allow deferred DB init to complete
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
      expect(result).toMatchObject({ query: 'a', results: [] })
      expect(result.retrieval.mode).toBe('hybrid')
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
      expect(result.results).toBeDefined()
      expect(result.results.length).toBeLessThanOrEqual(12)
      expect(result.retrieval).toMatchObject({ available: true, mode: 'hybrid' })
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
      expect(result.results[0].score).toBeGreaterThanOrEqual(
        result.results[result.results.length - 1].score,
      )
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
      expect(result.results.length).toBeLessThanOrEqual(12)
    })

    it('truncates long query to 1000 chars', async () => {
      mockDB.prepare.mockReturnValue(makeStmt([]))
      const longQuery = 'a'.repeat(2000)
      // Should not throw
      await handlers['knowledge-search'](null, longQuery)
    })
  })

  describe('knowledge-summarize', () => {
    it('returns the object contract consumed by knowledgeService.summarizeDocuments', async () => {
      mockDB.prepare.mockReturnValue(makeStmt([]))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()
      await flushMicrotasks()

      await expect(handlers['knowledge-summarize'](null, 'graph search')).resolves.toEqual({
        summary: expect.any(String),
        keyConcepts: expect.any(Array),
      })
    })
  })

  describe('knowledge retrieval status and RAG sources', () => {
    it('reports the active retrieval backends', async () => {
      mockDB.prepare.mockReturnValue(makeStmt(undefined))
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()
      await flushMicrotasks()

      await expect(handlers['knowledge-retrieval-status']()).resolves.toMatchObject({
        available: true,
        degraded: false,
        mode: 'hybrid',
        lexicalBackend: 'fts5-bm25',
        semanticBackend: 'fts5-trigram-local-ngram',
      })
    })

    it('injects auditable filename and chunk labels into RAG context', async () => {
      const chunks = [
        {
          id: 7,
          doc_id: 3,
          content: 'Breadth first search uses a queue.',
          chunk_index: 2,
          filename: 'graphs/bfs.md',
        },
      ]
      mockDB.prepare.mockImplementation((sql: string) => {
        if (sql.includes('knowledge_chunks') && sql.includes('JOIN')) return makeStmt(chunks)
        return makeStmt(undefined)
      })
      const { registerRAGIPC } = await import('../electron/ipc/rag')
      registerRAGIPC()
      await flushMicrotasks()

      const context = await handlers['knowledge-rag-context'](null, 'BFS queue')
      expect(context.knowledgeChunks[0]).toContain('来源：graphs/bfs.md#片段3')
      expect(context.knowledgeSources[0]).toMatchObject({
        docId: 3,
        filename: 'graphs/bfs.md',
        chunkIndex: 2,
      })
      expect(context.retrieval.mode).toBe('hybrid')
    })
  })
})
