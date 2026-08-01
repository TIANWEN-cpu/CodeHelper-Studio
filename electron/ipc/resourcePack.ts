import { app, dialog, ipcMain } from 'electron'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, extname, join, relative } from 'path'
import { getDB } from '../db/index'
import {
  buildKnowledgeDocMetadata,
  insertKnowledgeDocMetadata,
  type KnowledgeDocMetadataValues,
} from '../db/knowledgeMetadataRepository'
import { splitIntoChunks } from '../utils/textUtils'
import { trackPerformance } from '../utils/perfMonitor'
import { type ProblemSeed, inferSourceFromFile, normalizeProblemSeed } from '../utils/problemMeta'
import { PACKAGED_SMOKE_ENV } from '../utils/packagedSmoke'
import { E2E_USER_DATA_ENV } from '../utils/testUserData'

const MAX_KNOWLEDGE_FILE_SIZE = 10 * 1024 * 1024

export const CANONICAL_RESOURCE_PACK_CATEGORIES: Record<
  string,
  { category_key: string; category_label: string }
> = {
  '01-core-cs-foundation': {
    category_key: '01-core-cs-foundation',
    category_label: '计算机基础',
  },
  '02-ai-deep-learning': {
    category_key: '02-ai-deep-learning',
    category_label: 'AI 与深度学习',
  },
  '03-interview-career': {
    category_key: '03-interview-career',
    category_label: '求职面试',
  },
  '04-cs408-and-courses': {
    category_key: '04-cs408-and-courses',
    category_label: 'CS408 / 课程',
  },
  '05-roadmap-and-bug-manual': {
    category_key: '05-roadmap-and-bug-manual',
    category_label: '学习路线 / Bug 手册',
  },
  '06-book-resource-indexes': {
    category_key: '06-book-resource-indexes',
    category_label: '书籍与资源索引',
  },
  '07-language-specific': {
    category_key: '07-language-specific',
    category_label: '语言专题',
  },
}

export const RESOURCE_PACK_CATEGORY_ALIASES: Record<string, string> = {
  '01-cs-foundation': '01-core-cs-foundation',
  '02-programming-books': '06-book-resource-indexes',
  '03-ai-deep-learning': '02-ai-deep-learning',
  '04-courses': '04-cs408-and-courses',
  '05-cs408': '04-cs408-and-courses',
  '06-interview': '03-interview-career',
  '07-learning-roadmap': '05-roadmap-and-bug-manual',
  '08-go': '07-language-specific',
  '09-java': '07-language-specific',
}

const RESOURCE_PACK_CATEGORY_LABEL_ALIASES: Record<string, string> = {
  综合计算机基础: '01-core-cs-foundation',
  计算机基础: '01-core-cs-foundation',
  AI与深度学习: '02-ai-deep-learning',
  'AI 与深度学习': '02-ai-deep-learning',
  面试求职: '03-interview-career',
  求职面试: '03-interview-career',
  考研408: '04-cs408-and-courses',
  课程资料: '04-cs408-and-courses',
  综合学习路线: '05-roadmap-and-bug-manual',
  编程书籍: '06-book-resource-indexes',
  Go: '07-language-specific',
  Java: '07-language-specific',
}

type ResourcePackCategory = (typeof CANONICAL_RESOURCE_PACK_CATEGORIES)[string]

interface ResourcePackRepositoryManifest {
  slug?: string
  category?: string
  category_dir?: string
}

export interface ResourcePackImportResult {
  rootPath: string
  manifest?: {
    id?: string
    title?: string
    generated_at?: string
    source_root?: string
    output_root?: string
    import_target?: string
    repositories?: ResourcePackRepositoryManifest[]
  }
  knowledge: {
    found: number
    imported: number
    skipped: number
    chunks: number
  }
  problems: {
    files: number
    found: number
    imported: number
    updated: number
    skipped: number
  }
  errors: string[]
}

interface ResourcePackImportArgs {
  rootPath?: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function listFilesRecursive(root: string, predicate: (filename: string) => boolean): string[] {
  if (!existsSync(root)) return []
  const files: string[] = []

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && predicate(entry.name)) {
        files.push(fullPath)
      }
    }
  }

  walk(root)
  return files.sort((a, b) => a.localeCompare(b))
}

function readManifest(rootPath: string): ResourcePackImportResult['manifest'] {
  const manifestPath = join(rootPath, 'manifest.json')
  if (!existsSync(manifestPath)) return undefined

  try {
    const data = JSON.parse(readFileSync(manifestPath, 'utf-8')) as unknown
    if (!isPlainObject(data)) return undefined
    const repositories = Array.isArray(data.repositories)
      ? data.repositories.flatMap((entry): ResourcePackRepositoryManifest[] => {
          if (!isPlainObject(entry)) return []
          return [
            {
              slug: typeof entry.slug === 'string' ? entry.slug : undefined,
              category: typeof entry.category === 'string' ? entry.category : undefined,
              category_dir: typeof entry.category_dir === 'string' ? entry.category_dir : undefined,
            },
          ]
        })
      : undefined
    return {
      id: typeof data.id === 'string' ? data.id : undefined,
      title: typeof data.title === 'string' ? data.title : undefined,
      generated_at: typeof data.generated_at === 'string' ? data.generated_at : undefined,
      source_root: typeof data.source_root === 'string' ? data.source_root : undefined,
      output_root: typeof data.output_root === 'string' ? data.output_root : undefined,
      import_target: typeof data.import_target === 'string' ? data.import_target : undefined,
      ...(repositories ? { repositories } : {}),
    }
  } catch {
    return undefined
  }
}

function canonicalResourcePackCategory(value?: string): ResourcePackCategory | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  const canonicalKey = RESOURCE_PACK_CATEGORY_ALIASES[normalized] ?? normalized
  return CANONICAL_RESOURCE_PACK_CATEGORIES[canonicalKey]
}

function categoryFromRepositoryManifest(
  filename: string,
  manifest: ResourcePackImportResult['manifest'],
): ResourcePackCategory | undefined {
  const [, repositoryDirectory] = normalizeRelativePath(filename).split('/')
  if (!repositoryDirectory) return undefined
  const repository = manifest?.repositories?.find((entry) => {
    const directory = entry.slug
      ?.trim()
      .replace(/[\\/]+/g, '__')
      .toLowerCase()
    return directory === repositoryDirectory.toLowerCase()
  })
  if (!repository) return undefined
  const fromDirectory = canonicalResourcePackCategory(repository.category_dir)
  if (fromDirectory) return fromDirectory
  const categoryKey = repository.category
    ? RESOURCE_PACK_CATEGORY_LABEL_ALIASES[repository.category.trim()]
    : undefined
  return categoryKey ? CANONICAL_RESOURCE_PACK_CATEGORIES[categoryKey] : undefined
}

function categoryForKnowledgeDocument(
  rootPath: string,
  filename: string,
  manifest: ResourcePackImportResult['manifest'],
  explicitCategory?: ResourcePackCategory,
): ResourcePackCategory | undefined {
  if (explicitCategory) return explicitCategory
  const rootCategory = canonicalResourcePackCategory(basename(rootPath))
  if (rootCategory) return rootCategory

  const categoryDirectory = normalizeRelativePath(filename).split('/')[0]
  if (categoryDirectory === '99-special-recovered') {
    return categoryFromRepositoryManifest(filename, manifest)
  }
  return canonicalResourcePackCategory(categoryDirectory)
}

function validateResourcePackRoot(rootPath: string): void {
  if (!existsSync(rootPath)) {
    throw new Error(`资源包目录不存在: ${rootPath}`)
  }

  const hasKnowledge = existsSync(join(rootPath, 'knowledge-docs'))
  const hasProblems = existsSync(join(rootPath, 'problems'))
  if (!hasKnowledge && !hasProblems) {
    throw new Error(
      '请选择包含 knowledge-docs 或 problems 子目录的 import-ready/import-batches 资源包目录',
    )
  }
}

function importKnowledgeDocs(
  rootPath: string,
  manifest: ResourcePackImportResult['manifest'],
  errors: string[],
): ResourcePackImportResult['knowledge'] {
  const knowledgeDir = join(rootPath, 'knowledge-docs')
  const files = listFilesRecursive(knowledgeDir, (file) => extname(file).toLowerCase() === '.md')
  const result = { found: files.length, imported: 0, skipped: 0, chunks: 0 }
  if (files.length === 0) return result

  const db = getDB()
  const existing = new Set(
    (db.prepare('SELECT filename FROM knowledge_docs').all() as Array<{ filename: string }>).map(
      (row) => row.filename,
    ),
  )
  const insertDoc = db.prepare(
    'INSERT INTO knowledge_docs (filename, file_type, content, chunk_count) VALUES (?,?,?,?)',
  )
  const insertChunk = db.prepare(
    'INSERT INTO knowledge_chunks (doc_id, content, chunk_index) VALUES (?,?,?)',
  )

  const insertKnowledgeDocument = db.transaction(
    (filename: string, content: string, chunks: string[], metadata: KnowledgeDocMetadataValues) => {
      const docResult = insertDoc.run(filename, 'md', content, chunks.length)
      const docId = Number(docResult.lastInsertRowid)
      insertKnowledgeDocMetadata(db, docId, metadata)
      for (let index = 0; index < chunks.length; index++) {
        insertChunk.run(docId, chunks[index], index)
      }
    },
  )

  const manifestId = manifest?.id?.trim()
  const explicitCategory = canonicalResourcePackCategory(manifestId)
  if (manifestId && !explicitCategory) {
    throw new Error(`未知资源包分类: ${manifestId.toLowerCase()}`)
  }

  for (const filePath of files) {
    const filename = normalizeRelativePath(relative(knowledgeDir, filePath)) || basename(filePath)

    try {
      if (existing.has(filename)) {
        result.skipped++
        continue
      }

      const stat = statSync(filePath)
      if (stat.size > MAX_KNOWLEDGE_FILE_SIZE) {
        result.skipped++
        errors.push(`知识文档超过 10MB，已跳过: ${filename}`)
        continue
      }

      const content = readFileSync(filePath, 'utf-8')
      const chunks = splitIntoChunks(content, 1500)
      const canonicalCategory = categoryForKnowledgeDocument(
        rootPath,
        filename,
        manifest,
        explicitCategory,
      )
      const metadata = buildKnowledgeDocMetadata({
        filename,
        fileType: 'md',
        content,
        fallbacks: {
          source_repo: 'resource-pack',
          source_path: filename,
          import_target: manifest?.import_target ?? 'resource-pack',
          generated_at: manifest?.generated_at,
          document_kind: 'markdown',
          visibility: 'local',
        },
        ...(canonicalCategory ? { overrides: canonicalCategory } : {}),
      })
      insertKnowledgeDocument(filename, content, chunks, metadata)

      existing.add(filename)
      result.imported++
      result.chunks += chunks.length
    } catch (error) {
      result.skipped++
      errors.push(
        `知识文档导入失败 ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return result
}

function importProblemSeeds(
  rootPath: string,
  errors: string[],
): ResourcePackImportResult['problems'] {
  const problemsDir = join(rootPath, 'problems')
  const files = listFilesRecursive(problemsDir, (file) => extname(file).toLowerCase() === '.json')
  const result = { files: files.length, found: 0, imported: 0, updated: 0, skipped: 0 }
  if (files.length === 0) return result

  const db = getDB()
  const insertStmt = db.prepare(`
    INSERT INTO problems (
      title, description, difficulty, tags, languages, examples, test_cases, starter_code,
      source, tracks, platform, mode, exam_style, year, official_url, estimated_time
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  const updateStmt = db.prepare(`
    UPDATE problems
    SET description = ?, difficulty = ?, tags = ?, languages = ?, examples = ?, test_cases = ?, starter_code = ?,
        tracks = ?, platform = ?, mode = ?, exam_style = ?, year = ?, official_url = ?, estimated_time = ?
    WHERE id = ?
  `)
  const existsStmt = db.prepare('SELECT id FROM problems WHERE title = ? AND source = ? LIMIT 1')

  const importMany = db.transaction(() => {
    for (const filePath of files) {
      const filename = basename(filePath)

      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
        if (!Array.isArray(parsed)) {
          result.skipped++
          errors.push(`题库文件不是数组，已跳过: ${filename}`)
          continue
        }

        result.found += parsed.length
        const derivedSource = inferSourceFromFile(filename)

        for (const rawProblem of parsed) {
          try {
            const normalized = normalizeProblemSeed(rawProblem as ProblemSeed, derivedSource)
            const exists = existsStmt.get(normalized.title, normalized.source) as
              | { id: number }
              | undefined

            if (exists) {
              updateStmt.run(
                normalized.description,
                normalized.difficulty,
                JSON.stringify(normalized.tags),
                JSON.stringify(normalized.languages),
                JSON.stringify(normalized.examples),
                JSON.stringify(normalized.test_cases),
                JSON.stringify(normalized.starter_code),
                JSON.stringify(normalized.tracks),
                normalized.platform,
                normalized.mode,
                normalized.exam_style,
                normalized.year ?? null,
                normalized.official_url ?? null,
                normalized.estimated_time ?? null,
                exists.id,
              )
              result.updated++
              continue
            }

            insertStmt.run(
              normalized.title,
              normalized.description,
              normalized.difficulty,
              JSON.stringify(normalized.tags),
              JSON.stringify(normalized.languages),
              JSON.stringify(normalized.examples),
              JSON.stringify(normalized.test_cases),
              JSON.stringify(normalized.starter_code),
              normalized.source,
              JSON.stringify(normalized.tracks),
              normalized.platform,
              normalized.mode,
              normalized.exam_style,
              normalized.year ?? null,
              normalized.official_url ?? null,
              normalized.estimated_time ?? null,
            )
            result.imported++
          } catch (error) {
            result.skipped++
            errors.push(
              `题目导入失败 ${filename}: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      } catch (error) {
        result.skipped++
        errors.push(
          `题库文件读取失败 ${filename}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  })

  importMany()
  return result
}

export function importResourcePackFromDirectory(rootPath: string): ResourcePackImportResult {
  validateResourcePackRoot(rootPath)

  const errors: string[] = []
  const manifest = readManifest(rootPath)
  const knowledge = importKnowledgeDocs(rootPath, manifest, errors)
  const problems = importProblemSeeds(rootPath, errors)

  return {
    rootPath,
    manifest,
    knowledge,
    problems,
    errors,
  }
}

export function registerResourcePackIPC(): void {
  ipcMain.handle(
    'resource-pack-import',
    trackPerformance(
      'resource-pack-import',
      async (_event, args?: ResourcePackImportArgs): Promise<ResourcePackImportResult | null> => {
        const rendererRootPathTrusted =
          process.env[PACKAGED_SMOKE_ENV] === '1' ||
          (!app.isPackaged && Boolean(process.env[E2E_USER_DATA_ENV]))
        let rootPath =
          rendererRootPathTrusted && typeof args?.rootPath === 'string' ? args.rootPath.trim() : ''

        if (!rootPath) {
          const result = await dialog.showOpenDialog({
            title: '选择 import-ready 或 import-batches 资源包目录',
            properties: ['openDirectory'],
          })

          if (result.canceled || result.filePaths.length === 0) return null
          rootPath = result.filePaths[0]
        }

        return importResourcePackFromDirectory(rootPath)
      },
    ),
  )
}
