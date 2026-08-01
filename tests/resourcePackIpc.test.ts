import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}))

const knowledgeDocs: Array<{ id: number; filename: string; chunk_count: number }> = []
const knowledgeChunks: Array<{ doc_id: number; content: string; chunk_index: number }> = []
const knowledgeMetadata: Array<{
  docId: number
  categoryKey: string | null
  categoryLabel: string | null
}> = []
const problems: Array<{ id: number; title: string; source: string; description: string }> = []
let failKnowledgeChunkAt: number | null = null
let failKnowledgeMetadata = false

const mockDB = {
  prepare: vi.fn((sql: string) => {
    if (sql.includes('SELECT filename FROM knowledge_docs')) {
      return { all: vi.fn(() => knowledgeDocs.map(({ filename }) => ({ filename }))) }
    }
    if (sql.includes('INSERT INTO knowledge_docs')) {
      return {
        run: vi.fn((filename: string, _fileType: string, _content: string, chunkCount: number) => {
          const id = knowledgeDocs.length + 1
          knowledgeDocs.push({ id, filename, chunk_count: chunkCount })
          return { lastInsertRowid: id }
        }),
      }
    }
    if (sql.includes('INSERT INTO knowledge_chunks')) {
      return {
        run: vi.fn((docId: number, content: string, chunkIndex: number) => {
          if (chunkIndex === failKnowledgeChunkAt) throw new Error('chunk insert failed')
          knowledgeChunks.push({ doc_id: docId, content, chunk_index: chunkIndex })
          return { lastInsertRowid: knowledgeChunks.length }
        }),
      }
    }
    if (sql.includes('INSERT INTO knowledge_doc_metadata')) {
      return {
        run: vi.fn((...args: unknown[]) => {
          if (failKnowledgeMetadata) throw new Error('metadata insert failed')
          knowledgeMetadata.push({
            docId: args[0] as number,
            categoryKey: args[6] as string | null,
            categoryLabel: args[7] as string | null,
          })
          return { changes: 1 }
        }),
      }
    }
    if (sql.includes('SELECT id FROM problems WHERE title = ? AND source = ?')) {
      return {
        get: vi.fn((title: string, source: string) => {
          const found = problems.find(
            (problem) => problem.title === title && problem.source === source,
          )
          return found ? { id: found.id } : undefined
        }),
      }
    }
    if (sql.includes('INSERT INTO problems')) {
      return {
        run: vi.fn(
          (
            title: string,
            description: string,
            _difficulty: string,
            _tags: string,
            _languages: string,
            _examples: string,
            _testCases: string,
            _starterCode: string,
            source: string,
          ) => {
            const id = problems.length + 1
            problems.push({ id, title, description, source })
            return { lastInsertRowid: id }
          },
        ),
      }
    }
    if (sql.includes('UPDATE problems')) {
      return {
        run: vi.fn((description: string, ...args: unknown[]) => {
          const id = args[args.length - 1] as number
          const found = problems.find((problem) => problem.id === id)
          if (found) found.description = description
          return { changes: found ? 1 : 0 }
        }),
      }
    }
    return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() }
  }),
  transaction: vi.fn((fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    const docsSnapshot = knowledgeDocs.map((doc) => ({ ...doc }))
    const chunksSnapshot = knowledgeChunks.map((chunk) => ({ ...chunk }))
    const metadataSnapshot = knowledgeMetadata.map((metadata) => ({ ...metadata }))
    const problemsSnapshot = problems.map((problem) => ({ ...problem }))
    try {
      return fn(...args)
    } catch (error) {
      knowledgeDocs.splice(0, knowledgeDocs.length, ...docsSnapshot)
      knowledgeChunks.splice(0, knowledgeChunks.length, ...chunksSnapshot)
      knowledgeMetadata.splice(0, knowledgeMetadata.length, ...metadataSnapshot)
      problems.splice(0, problems.length, ...problemsSnapshot)
      throw error
    }
  }),
}

vi.mock('../electron/db/index', () => ({
  getDB: () => mockDB,
}))

let tempRoot = ''

function createPackRoot() {
  tempRoot = mkdtempSync(join(tmpdir(), 'codehelper-pack-'))
  mkdirSync(join(tempRoot, 'knowledge-docs', 'core'), { recursive: true })
  mkdirSync(join(tempRoot, 'problems'), { recursive: true })
  writeFileSync(
    join(tempRoot, 'manifest.json'),
    JSON.stringify({ id: '01-core-cs-foundation', generated_at: '2026-06-06T00:00:00Z' }),
  )
  writeFileSync(
    join(tempRoot, 'knowledge-docs', 'core', 'tcp.md'),
    '# TCP\n\n三次握手和可靠传输。\n\n'.repeat(80),
    'utf-8',
  )
  writeFileSync(
    join(tempRoot, 'problems', 'custom-pack.json'),
    JSON.stringify([
      {
        title: '测试题',
        description: '描述',
        difficulty: 'easy',
        tags: ['数组'],
        languages: ['python'],
        examples: [{ input: '1', output: '1' }],
        test_cases: [{ input: '1', expected: '1' }],
        starter_code: { python: '' },
      },
    ]),
    'utf-8',
  )
  return tempRoot
}

describe('resource pack import', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((key) => delete handlers[key])
    knowledgeDocs.length = 0
    knowledgeChunks.length = 0
    knowledgeMetadata.length = 0
    problems.length = 0
    failKnowledgeChunkAt = null
    failKnowledgeMetadata = false
    mockDB.prepare.mockClear()
    mockDB.transaction.mockClear()
  })

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  it('registers the resource-pack-import handler', async () => {
    const { registerResourcePackIPC } = await import('../electron/ipc/resourcePack')
    registerResourcePackIPC()
    expect(handlers['resource-pack-import']).toBeDefined()
  })

  it('imports knowledge docs and problem seeds from a pack directory', async () => {
    const rootPath = createPackRoot()
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    const result = importResourcePackFromDirectory(rootPath)

    expect(result.manifest?.generated_at).toBe('2026-06-06T00:00:00Z')
    expect(result.knowledge.found).toBe(1)
    expect(result.knowledge.imported).toBe(1)
    expect(result.knowledge.chunks).toBeGreaterThan(1)
    expect(result.problems.files).toBe(1)
    expect(result.problems.found).toBe(1)
    expect(result.problems.imported).toBe(1)
    expect(result.errors).toEqual([])
    expect(knowledgeDocs[0].filename).toBe('core/tcp.md')
    expect(knowledgeChunks.length).toBe(result.knowledge.chunks)
    expect(problems[0].source).toBe('custom-pack')
  })

  it('skips existing knowledge docs and updates existing problems on reimport', async () => {
    const rootPath = createPackRoot()
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    importResourcePackFromDirectory(rootPath)
    const result = importResourcePackFromDirectory(rootPath)

    expect(result.knowledge.imported).toBe(0)
    expect(result.knowledge.skipped).toBe(1)
    expect(result.problems.imported).toBe(0)
    expect(result.problems.updated).toBe(1)
    expect(knowledgeDocs).toHaveLength(1)
    expect(problems).toHaveLength(1)
  })

  it('rolls back a knowledge document when one of its chunks fails to insert', async () => {
    const rootPath = createPackRoot()
    failKnowledgeChunkAt = 1
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    const result = importResourcePackFromDirectory(rootPath)

    expect(result.knowledge).toMatchObject({ imported: 0, skipped: 1, chunks: 0 })
    expect(result.errors).toContain('知识文档导入失败 core/tcp.md: chunk insert failed')
    expect(knowledgeDocs).toEqual([])
    expect(knowledgeChunks).toEqual([])
  })

  it('rolls back a knowledge document when metadata insertion fails', async () => {
    const rootPath = createPackRoot()
    failKnowledgeMetadata = true
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    const result = importResourcePackFromDirectory(rootPath)

    expect(result.knowledge).toMatchObject({ imported: 0, skipped: 1, chunks: 0 })
    expect(result.errors).toContain('知识文档导入失败 core/tcp.md: metadata insert failed')
    expect(knowledgeDocs).toEqual([])
    expect(knowledgeChunks).toEqual([])
  })

  it('rejects an unknown manifest category even when the directory name changes', async () => {
    const rootPath = createPackRoot()
    writeFileSync(join(rootPath, 'manifest.json'), JSON.stringify({ id: 'unknown-batch' }))
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    expect(() => importResourcePackFromDirectory(rootPath)).toThrow('未知资源包分类: unknown-batch')
  })

  it('accepts an ad hoc manifest-free pack and preserves its frontmatter category', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'codehelper-pack-no-manifest-'))
    mkdirSync(join(tempRoot, 'knowledge-docs', 'algorithms'), { recursive: true })
    writeFileSync(
      join(tempRoot, 'knowledge-docs', 'algorithms', 'binary-search.md'),
      ['---', 'title: Binary search', 'category: 算法', '---', '# Binary search'].join('\n'),
      'utf-8',
    )
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    const result = importResourcePackFromDirectory(tempRoot)

    expect(result.knowledge).toMatchObject({ found: 1, imported: 1, skipped: 0 })
    expect(knowledgeMetadata).toEqual([{ docId: 1, categoryKey: null, categoryLabel: '算法' }])
  })

  it('maps the real import-ready aggregate layout to canonical categories without an id', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'codehelper-import-ready-'))
    const coreDir = join(tempRoot, 'knowledge-docs', '01-cs-foundation', 'acme__core')
    const recoveredDir = join(tempRoot, 'knowledge-docs', '99-special-recovered', 'acme__ai-notes')
    mkdirSync(coreDir, { recursive: true })
    mkdirSync(recoveredDir, { recursive: true })
    writeFileSync(join(coreDir, 'network.md'), '# Network', 'utf-8')
    writeFileSync(join(recoveredDir, 'vision.md'), '# Vision', 'utf-8')
    writeFileSync(
      join(tempRoot, 'manifest.json'),
      JSON.stringify({
        generated_at: '2026-06-06T00:00:00Z',
        repositories: [
          {
            slug: 'acme/ai-notes',
            category: 'AI与深度学习',
            category_dir: '03-ai-deep-learning',
          },
        ],
      }),
      'utf-8',
    )
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    const result = importResourcePackFromDirectory(tempRoot)

    expect(result.knowledge).toMatchObject({ found: 2, imported: 2, skipped: 0 })
    expect(
      knowledgeMetadata.map(({ categoryKey, categoryLabel }) => [categoryKey, categoryLabel]),
    ).toEqual([
      ['01-core-cs-foundation', '计算机基础'],
      ['02-ai-deep-learning', 'AI 与深度学习'],
    ])
  })

  it('rejects directories without knowledge-docs or problems', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'codehelper-empty-pack-'))
    const { importResourcePackFromDirectory } = await import('../electron/ipc/resourcePack')

    expect(() => importResourcePackFromDirectory(tempRoot)).toThrow(
      '请选择包含 knowledge-docs 或 problems 子目录的 import-ready/import-batches 资源包目录',
    )
  })
})
