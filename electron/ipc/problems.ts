import { ipcMain } from 'electron'
import { getDB } from '../db/index'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { runCodeSnippet } from '../utils/codeRunner'
import { trackPerformance } from '../utils/perfMonitor'
import {
  type ProblemSeed,
  inferSourceFromFile,
  normalizeOutput,
  normalizeSql,
  mergeErrorTypes,
  normalizeProblemSeed,
} from '../utils/problemMeta'
import type { ProblemRow, MistakeRow } from '../types/db'

export function registerProblemsIPC(): void {
  setTimeout(() => {
    try {
      syncProblems()
    } catch (err) {
      console.error('Failed to sync problems:', err)
    }
  }, 0)

  ipcMain.handle(
    'problems-list',
    trackPerformance(
      'problems-list',
      (
        _e,
        filters?: {
          difficulty?: string
          tag?: string
          status?: string
          source?: string
          track?: string
          platform?: string
          mode?: string
        },
      ) => {
        if (filters !== undefined && filters !== null) {
          if (typeof filters !== 'object') throw new Error('参数无效: filters')
          const stringFields = [
            'difficulty',
            'tag',
            'status',
            'source',
            'track',
            'platform',
            'mode',
          ] as const
          for (const field of stringFields) {
            if (filters[field] !== undefined) {
              if (typeof filters[field] !== 'string') throw new Error(`参数无效: ${field}`)
              ;(filters as Record<string, unknown>)[field] = (filters[field] as string)
                .trim()
                .slice(0, 100)
            }
          }
        }
        let query =
          "SELECT p.*, (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.status = 'accepted') as solved FROM problems p WHERE 1=1"
        const params: string[] = []

        if (filters?.difficulty) {
          query += ' AND p.difficulty = ?'
          params.push(filters.difficulty)
        }
        if (filters?.tag) {
          query += ' AND p.tags LIKE ?'
          params.push(`%${filters.tag}%`)
        }
        if (filters?.source) {
          query += ' AND p.source = ?'
          params.push(filters.source)
        }
        if (filters?.track) {
          query += ' AND p.tracks LIKE ?'
          params.push(`%"${filters.track}"%`)
        }
        if (filters?.platform) {
          query += ' AND p.platform = ?'
          params.push(filters.platform)
        }
        if (filters?.mode) {
          query += ' AND p.mode = ?'
          params.push(filters.mode)
        }
        query += ' ORDER BY p.id ASC LIMIT 500'
        return getDB()
          .prepare(query)
          .all(...params)
      },
    ),
  )

  ipcMain.handle(
    'problems-get',
    trackPerformance('problems-get', (_e, id: number) => {
      if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
      return getDB().prepare('SELECT * FROM problems WHERE id = ?').get(id)
    }),
  )

  ipcMain.handle(
    'problems-submit',
    trackPerformance(
      'problems-submit',
      async (_e, args: { problemId: number; code: string; language: string }) => {
        if (!args || typeof args !== 'object') throw new Error('参数无效')
        if (
          typeof args.problemId !== 'number' ||
          !Number.isFinite(args.problemId) ||
          args.problemId < 1
        )
          throw new Error('参数无效: problemId')
        if (typeof args.code !== 'string') throw new Error('参数无效: code')
        if (typeof args.language !== 'string' || !args.language.trim())
          throw new Error('参数无效: language')
        args.code = args.code.slice(0, 100000)
        args.language = args.language.trim().slice(0, 50)
        const problem = getDB()
          .prepare('SELECT * FROM problems WHERE id = ?')
          .get(args.problemId) as ProblemRow | undefined
        if (!problem) throw new Error('题目不存在')

        let testCases: Array<{ input: string; expected: string }>
        try {
          testCases = JSON.parse(problem.test_cases)
        } catch {
          throw new Error(`题目测试用例解析失败 (problem id: ${args.problemId})`)
        }
        const results: { input: string; expected: string; actual: string; passed: boolean }[] = []
        const startTime = Date.now()
        let status: 'accepted' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout' =
          'accepted'

        for (const tc of testCases) {
          if (args.language === 'sql') {
            const actual = normalizeSql(args.code)
            const expected = normalizeSql(String(tc.expected))
            const passed = actual === expected
            results.push({
              input: tc.input,
              expected: tc.expected,
              actual: args.code.trim(),
              passed,
            })
            if (!passed) {
              status = 'wrong_answer'
              break
            }
            continue
          }

          const result = await runCodeSnippet(args.code, args.language, tc.input)
          const actual = result.stdout.trim()
          const passed = normalizeOutput(actual) === normalizeOutput(String(tc.expected))
          results.push({ input: tc.input, expected: tc.expected, actual, passed })

          if (result.exitCode !== 0) {
            status =
              result.stage === 'compile'
                ? 'compile_error'
                : result.stderr.toLowerCase().includes('timed out')
                  ? 'timeout'
                  : 'runtime_error'
            break
          }

          if (!passed) {
            status = 'wrong_answer'
            break
          }
        }

        const duration = Date.now() - startTime
        const passedCount = results.filter((r) => r.passed).length
        if (passedCount === testCases.length) {
          status = 'accepted'
        }

        // Record submission
        getDB()
          .prepare(
            'INSERT INTO submissions (problem_id, language, code, status, passed_cases, total_cases, duration_ms) VALUES (?,?,?,?,?,?,?)',
          )
          .run(
            args.problemId,
            args.language,
            args.code,
            status,
            passedCount,
            testCases.length,
            duration,
          )

        // Record mistake if failed
        if (status !== 'accepted') {
          const existing = getDB()
            .prepare('SELECT * FROM mistakes WHERE problem_id = ?')
            .get(args.problemId) as MistakeRow | undefined
          const errorTypes = mergeErrorTypes(existing?.error_types, status)
          if (existing) {
            getDB()
              .prepare(
                'UPDATE mistakes SET error_count = error_count + 1, last_wrong_code = ?, error_types = ?, updated_at = CURRENT_TIMESTAMP WHERE problem_id = ?',
              )
              .run(args.code, JSON.stringify(errorTypes), args.problemId)
          } else {
            getDB()
              .prepare(
                'INSERT INTO mistakes (problem_id, last_wrong_code, error_types) VALUES (?,?,?)',
              )
              .run(args.problemId, args.code, JSON.stringify(errorTypes))
          }
        } else {
          // If solved, update mistake with correct code
          getDB()
            .prepare('UPDATE mistakes SET correct_code = ? WHERE problem_id = ?')
            .run(args.code, args.problemId)
        }

        return { status, passed: passedCount, total: testCases.length, results, duration }
      },
    ),
  )

  ipcMain.handle(
    'problems-submissions',
    trackPerformance('problems-submissions', (_e, problemId: number) => {
      if (typeof problemId !== 'number' || !Number.isFinite(problemId) || problemId < 1)
        throw new Error('参数无效: problemId')
      return getDB()
        .prepare('SELECT * FROM submissions WHERE problem_id = ? ORDER BY created_at DESC LIMIT 20')
        .all(problemId)
    }),
  )
}

function syncProblems(): void {
  const db = getDB()
  const problemDir = resolveProblemDirectory()
  if (!problemDir) {
    return
  }

  const files = readdirSync(problemDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
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

  for (const file of files) {
    const seedPath = join(problemDir, file)

    try {
      const data = JSON.parse(readFileSync(seedPath, 'utf-8')) as ProblemSeed[]
      const derivedSource = inferSourceFromFile(file)

      for (const problem of data) {
        const normalized = normalizeProblemSeed(problem, derivedSource)
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
      }
    } catch (err) {
      console.error(`Failed to sync problems from ${file}:`, err)
    }
  }
}

function resolveProblemDirectory(): string | null {
  const candidates = [
    join(process.resourcesPath, 'problems'),
    join(__dirname, '../../resources/problems'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
