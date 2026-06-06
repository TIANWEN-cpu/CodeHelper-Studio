import { dialog, ipcMain } from 'electron'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, extname, join, relative } from 'path'
import { getDB } from '../db/index'
import { splitIntoChunks } from '../utils/textUtils'
import { trackPerformance } from '../utils/perfMonitor'
import { type ProblemSeed, inferSourceFromFile, normalizeProblemSeed } from '../utils/problemMeta'

const MAX_KNOWLEDGE_FILE_SIZE = 10 * 1024 * 1024

export interface ResourcePackImportResult {
  rootPath: string
  manifest?: {
    generated_at?: string
    source_root?: string
    output_root?: string
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
    return {
      generated_at: typeof data.generated_at === 'string' ? data.generated_at : undefined,
      source_root: typeof data.source_root === 'string' ? data.source_root : undefined,
      output_root: typeof data.output_root === 'string' ? data.output_root : undefined,
    }
  } catch {
    return undefined
  }
}

function validateResourcePackRoot(rootPath: string): void {
  if (!existsSync(rootPath)) {
    throw new Error(`资源包目录不存在: ${rootPath}`)
  }

  const hasKnowledge = existsSync(join(rootPath, 'knowledge-docs'))
  const hasProblems = existsSync(join(rootPath, 'problems'))
  if (!hasKnowledge && !hasProblems) {
    throw new Error('请选择包含 knowledge-docs 或 problems 子目录的 import-ready 资源包目录')
  }
}

function importKnowledgeDocs(
  rootPath: string,
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

  const insertMany = db.transaction(() => {
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
        const docResult = insertDoc.run(filename, 'md', content, chunks.length)
        for (let index = 0; index < chunks.length; index++) {
          insertChunk.run(docResult.lastInsertRowid, chunks[index], index)
        }

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
  })

  insertMany()
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
  const knowledge = importKnowledgeDocs(rootPath, errors)
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
        let rootPath = typeof args?.rootPath === 'string' ? args.rootPath.trim() : ''

        if (!rootPath) {
          const result = await dialog.showOpenDialog({
            title: '选择 import-ready 资源包目录',
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
