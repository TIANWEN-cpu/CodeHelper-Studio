import { ipcMain } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getDB } from '../db/index'
import {
  clearExerciseDraft,
  getExerciseDraft,
  saveExerciseDraft,
} from '../db/exerciseDraftRepository'
import { runCodeSnippet } from '../utils/codeRunner'
import { trackPerformance } from '../utils/perfMonitor'
import { mergeErrorTypes, normalizeOutput, normalizeSql } from '../utils/problemMeta'
import type { MistakeRow, ProblemRow } from '../types/db'

// ---------------------------------------------------------------------------
// Exercise data model
// ---------------------------------------------------------------------------

export interface ExerciseTest {
  expression: string
  expected: unknown
}

export interface Exercise {
  id: string
  title: string
  track_id: string
  difficulty: string
  prompt: string
  lesson_id: string
  hints: string[]
  starter_code: string
  expected_nodes: string[]
  required_names: string[]
  tests: ExerciseTest[]
  required_keywords: string[]
  forbidden_keywords: string[]
  source_type?: 'exercise' | 'problem'
  source?: string
  languages?: string[]
  platform?: string
  mode?: string
  problem_id?: number
}

// ---------------------------------------------------------------------------
// Exercise file loading (content/metadata/exercises.json)
// ---------------------------------------------------------------------------

let exerciseCache: Exercise[] | null = null
let problemExerciseCache: Exercise[] | null = null
let problemExerciseCacheKey = ''

function loadExercises(): Exercise[] {
  if (exerciseCache) return exerciseCache

  const candidates = [
    join(process.resourcesPath, 'content', 'metadata', 'exercises.json'),
    join(__dirname, '../../content/metadata/exercises.json'),
    join(__dirname, '../../../content/metadata/exercises.json'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, 'utf-8')
        const parsed = JSON.parse(raw) as { exercises: Exercise[] }
        exerciseCache = parsed.exercises
        console.log(`[IPC] Loaded ${exerciseCache.length} exercises from: ${candidate}`)
        return exerciseCache
      } catch (err) {
        console.error(`[IPC] Failed to parse exercises from ${candidate}:`, err)
      }
    }
  }

  console.warn('[IPC] No exercises.json found in any candidate path:', candidates)
  exerciseCache = []
  return exerciseCache
}

function parseJsonArray<T>(
  raw: string | null | undefined,
  fallback: T[],
  guard?: (value: unknown) => value is T,
): T[] {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return guard ? parsed.filter(guard) : (parsed as T[])
  } catch {
    return fallback
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isProblemTestCase(value: unknown): value is { input: string; expected: string } {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.input === 'string' && typeof item.expected === 'string'
}

export function parseStarterCode(
  raw: string | null | undefined,
  preferredLanguage = 'python',
): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const candidate = record[preferredLanguage] ?? record.python ?? Object.values(record)[0]
      return typeof candidate === 'string' ? candidate : ''
    }
  } catch {
    return raw
  }
  return ''
}

export function difficultyLabel(difficulty: string): string {
  if (difficulty === 'easy') return '基础'
  if (difficulty === 'medium') return '进阶'
  if (difficulty === 'hard') return '综合'
  return difficulty
}

function trackFromProblem(row: ProblemRow): string {
  const tracks = parseJsonArray<string>(row.tracks, [], isString)
  return tracks[0] ?? row.source ?? 'imported-problems'
}

function problemToExercise(row: ProblemRow): Exercise {
  const languages = parseJsonArray<string>(row.languages, ['python'], isString)
  const tests = parseJsonArray<{ input: string; expected: string }>(
    row.test_cases,
    [],
    isProblemTestCase,
  )
  const tags = parseJsonArray<string>(row.tags, [], isString)
  const meta = [
    row.source ? `来源：${row.source}` : null,
    row.platform ? `平台：${row.platform}` : null,
    row.mode ? `模式：${row.mode}` : null,
    tags.length > 0 ? `标签：${tags.join('、')}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    id: `problem:${row.id}`,
    title: row.title,
    track_id: trackFromProblem(row),
    difficulty: difficultyLabel(row.difficulty),
    prompt: meta ? `${row.description}\n\n${meta}` : row.description,
    lesson_id: `problem-${row.id}`,
    hints: [],
    starter_code: parseStarterCode(row.starter_code, languages[0] ?? 'python'),
    expected_nodes: [],
    required_names: [],
    tests: tests.map((test) => ({ expression: test.input, expected: test.expected })),
    required_keywords: [],
    forbidden_keywords: [],
    source_type: 'problem',
    source: row.source,
    languages,
    platform: row.platform,
    mode: row.mode,
    problem_id: row.id,
  }
}

function listProblemExercises(): Exercise[] {
  const db = getDB()
  const stats = db.prepare('SELECT COUNT(*) AS count, MAX(id) AS maxId FROM problems').get() as {
    count: number
    maxId: number | null
  }
  const cacheKey = `${stats.count}:${stats.maxId ?? 0}`
  if (problemExerciseCache && problemExerciseCacheKey === cacheKey) return problemExerciseCache

  const rows = db
    .prepare(
      `SELECT id, title, description, difficulty, tags, languages, examples, test_cases, starter_code,
              source, tracks, platform, mode, exam_style, year, official_url, estimated_time
       FROM problems
       ORDER BY id ASC`,
    )
    .all() as ProblemRow[]
  problemExerciseCache = rows.map(problemToExercise)
  problemExerciseCacheKey = cacheKey
  return problemExerciseCache
}

function getProblemExercise(id: string): Exercise | null {
  const problemId = Number(id.replace(/^problem:/, ''))
  if (!Number.isInteger(problemId) || problemId < 1) return null
  const row = getDB()
    .prepare(
      `SELECT id, title, description, difficulty, tags, languages, examples, test_cases, starter_code,
              source, tracks, platform, mode, exam_style, year, official_url, estimated_time
       FROM problems
       WHERE id = ?`,
    )
    .get(problemId) as ProblemRow | undefined
  return row ? problemToExercise(row) : null
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

/**
 * Build a Python harness that imports the user's code and runs each test
 * expression, printing structured JSON results to stdout.
 */
export function buildPythonTestHarness(userCode: string, tests: ExerciseTest[]): string {
  const testJson = JSON.stringify(tests)
  return `
import json, sys

${userCode}

_tests = json.loads(${JSON.stringify(testJson)})
_results = []
for _t in _tests:
    try:
        _actual = eval(_t["expression"])
        _expected = _t["expected"]
        _passed = _actual == _expected
        _results.append({"expression": _t["expression"], "passed": _passed, "actual": _actual, "expected": _expected})
    except Exception as _e:
        _results.append({"expression": _t["expression"], "passed": False, "actual": str(_e), "expected": _t["expected"]})

print("__EXERCISE_RESULT__" + json.dumps(_results, ensure_ascii=False, default=str))
`.trim()
}

interface TestCaseResult {
  expression: string
  passed: boolean
  actual: unknown
  expected: unknown
}

/**
 * Check keyword constraints in the user's code (case-insensitive for
 * required_keywords, exact for forbidden_keywords).
 */
export function checkKeywords(
  code: string,
  required: string[],
  forbidden: string[],
): { passed: boolean; feedback_lines: string[] } {
  const feedback: string[] = []
  const lowerCode = code.toLowerCase()

  for (const kw of required) {
    if (!lowerCode.includes(kw.toLowerCase())) {
      feedback.push(`缺少必需关键字: ${kw}`)
    }
  }

  for (const kw of forbidden) {
    if (lowerCode.includes(kw.toLowerCase())) {
      feedback.push(`使用了禁止的关键字: ${kw}`)
    }
  }

  return { passed: feedback.length === 0, feedback_lines: feedback }
}

/** Map difficulty to language (C# and C tracks use keyword-only evaluation). */
export function languageForTrack(trackId: string): string {
  switch (trackId) {
    case 'python':
    case 'integration':
      return 'python'
    case 'database':
      return 'sql'
    case 'c':
      return 'c'
    case 'csharp':
      return 'csharp'
    default:
      return 'python'
  }
}

async function evaluateProblemExercise(args: {
  exerciseId: string
  code: string
  language?: string
}): Promise<{
  passed: boolean
  score: number
  feedback_lines: string[]
  stdout: string
  duration_sec: number
}> {
  const problemId = Number(args.exerciseId.replace(/^problem:/, ''))
  const db = getDB()
  const problem = getDB().prepare('SELECT * FROM problems WHERE id = ?').get(problemId) as
    | ProblemRow
    | undefined
  if (!problem) throw new Error(`题目不存在: ${args.exerciseId}`)

  const testCases = parseJsonArray<{ input: string; expected: string }>(
    problem.test_cases,
    [],
    isProblemTestCase,
  )
  if (testCases.length === 0) {
    return {
      passed: false,
      score: 0,
      feedback_lines: ['该导入题暂时没有测试用例，无法自动评测。'],
      stdout: '',
      duration_sec: 0,
    }
  }

  const language = (
    args.language ||
    parseJsonArray<string>(problem.languages, ['python'], isString)[0] ||
    'python'
  )
    .trim()
    .slice(0, 50)
  const startTime = Date.now()
  const results: { input: string; expected: string; actual: string; passed: boolean }[] = []
  let status: 'accepted' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout' =
    'accepted'

  if (language === 'sql') {
    for (const test of testCases) {
      const actual = normalizeSql(args.code)
      const expected = normalizeSql(String(test.expected))
      const passed = actual === expected
      results.push({
        input: test.input,
        expected: test.expected,
        actual: args.code.trim(),
        passed,
      })
      if (!passed) {
        status = 'wrong_answer'
        break
      }
    }
  } else {
    for (const test of testCases) {
      const result = await runCodeSnippet(args.code, language, test.input)
      const actual = result.stdout.trim()
      const passed =
        result.exitCode === 0 && normalizeOutput(actual) === normalizeOutput(String(test.expected))
      results.push({ input: test.input, expected: test.expected, actual, passed })

      if (result.exitCode !== 0) {
        status =
          result.stage === 'compile'
            ? 'compile_error'
            : result.timedOut
              ? 'timeout'
              : 'runtime_error'
        break
      }

      if (!passed) {
        status = 'wrong_answer'
        break
      }
    }
  }

  const duration = Date.now() - startTime
  const passedCount = results.filter((result) => result.passed).length
  if (passedCount === testCases.length) {
    status = 'accepted'
  }

  db.prepare(
    'INSERT INTO submissions (problem_id, language, code, status, passed_cases, total_cases, duration_ms) VALUES (?,?,?,?,?,?,?)',
  ).run(problemId, language, args.code, status, passedCount, testCases.length, duration)

  if (status !== 'accepted') {
    const existing = db.prepare('SELECT * FROM mistakes WHERE problem_id = ?').get(problemId) as
      | MistakeRow
      | undefined
    const errorTypes = mergeErrorTypes(existing?.error_types, status)
    if (existing) {
      db.prepare(
        'UPDATE mistakes SET error_count = error_count + 1, last_wrong_code = ?, error_types = ?, updated_at = CURRENT_TIMESTAMP WHERE problem_id = ?',
      ).run(args.code, JSON.stringify(errorTypes), problemId)
    } else {
      db.prepare(
        'INSERT INTO mistakes (problem_id, last_wrong_code, error_types) VALUES (?,?,?)',
      ).run(problemId, args.code, JSON.stringify(errorTypes))
    }
    db.prepare(
      `INSERT OR IGNORE INTO review_schedule (exercise_id, interval_days, ease_factor, repetitions, next_review)
       VALUES (?, 1, 2.5, 0, date('now'))`,
    ).run(String(problemId))
  } else {
    db.prepare('UPDATE mistakes SET correct_code = ? WHERE problem_id = ?').run(
      args.code,
      problemId,
    )
  }

  const feedbackLines = [
    status === 'accepted'
      ? `全部通过 (${passedCount}/${testCases.length})`
      : `通过 ${passedCount}/${testCases.length} 个测试`,
    ...results.slice(0, 6).map((result, index) => {
      if (result.passed) return `用例 ${index + 1} 通过`
      return `用例 ${index + 1} 未通过：期望 ${result.expected}，实际 ${result.actual}`
    }),
  ]
  if (results.length > 6) feedbackLines.push(`其余 ${results.length - 6} 个用例已省略`)

  return {
    passed: status === 'accepted',
    score: Math.round((passedCount / testCases.length) * 100) / 100,
    feedback_lines: feedbackLines,
    stdout: '',
    duration_sec: Math.round((duration / 1000) * 100) / 100,
  }
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerExercisesIPC(): void {
  // -- exercises-list --------------------------------------------------------
  ipcMain.handle(
    'exercises-list',
    trackPerformance(
      'exercises-list',
      (
        _e,
        filters?: {
          track_id?: string
          difficulty?: string
        },
      ) => {
        if (filters !== undefined && filters !== null) {
          if (typeof filters !== 'object') throw new Error('参数无效: filters')
          if (filters.track_id !== undefined) {
            if (typeof filters.track_id !== 'string') throw new Error('参数无效: track_id')
            filters.track_id = filters.track_id.trim().slice(0, 100)
          }
          if (filters.difficulty !== undefined) {
            if (typeof filters.difficulty !== 'string') throw new Error('参数无效: difficulty')
            filters.difficulty = filters.difficulty.trim().slice(0, 50)
          }
        }

        let list = [
          ...loadExercises().map((exercise) => ({ ...exercise, source_type: 'exercise' as const })),
          ...listProblemExercises(),
        ]

        if (filters?.track_id) {
          list = list.filter((ex) => ex.track_id === filters.track_id)
        }
        if (filters?.difficulty) {
          list = list.filter((ex) => ex.difficulty === filters.difficulty)
        }

        return list
      },
    ),
  )

  // -- exercises-get ---------------------------------------------------------
  ipcMain.handle(
    'exercises-get',
    trackPerformance('exercises-get', (_e, id: string) => {
      if (typeof id !== 'string' || !id.trim()) throw new Error('参数无效: id')
      id = id.trim().slice(0, 200)
      const exercises = loadExercises()
      const exercise = id.startsWith('problem:')
        ? getProblemExercise(id)
        : exercises.find((ex) => ex.id === id)
      if (!exercise) throw new Error(`练习不存在: ${id}`)
      return exercise
    }),
  )

  // -- exercises-draft-get ---------------------------------------------------
  ipcMain.handle(
    'exercises-draft-get',
    trackPerformance('exercises-draft-get', (_e, exerciseId: string) => {
      if (typeof exerciseId !== 'string' || !exerciseId.trim())
        throw new Error('参数无效: exerciseId')
      exerciseId = exerciseId.trim().slice(0, 200)

      return getExerciseDraft(getDB(), exerciseId)
    }),
  )

  // -- exercises-draft-save --------------------------------------------------
  ipcMain.handle(
    'exercises-draft-save',
    trackPerformance(
      'exercises-draft-save',
      (
        _e,
        args: {
          exerciseId: string
          code: string
          language: string
          baseRevision: number
          title?: string | null
        },
      ) => {
        if (!args || typeof args !== 'object') throw new Error('参数无效')
        if (typeof args.exerciseId !== 'string' || !args.exerciseId.trim())
          throw new Error('参数无效: exerciseId')
        if (typeof args.code !== 'string') throw new Error('参数无效: code')
        if (args.code.length > 100_000) throw new Error('草稿超过 100000 字符，无法保存')
        if (typeof args.language !== 'string' || !args.language.trim())
          throw new Error('参数无效: language')
        if (args.language.length > 40) throw new Error('参数无效: language')
        if (!Number.isSafeInteger(args.baseRevision) || args.baseRevision < 0)
          throw new Error('参数无效: baseRevision')

        args.exerciseId = args.exerciseId.trim().slice(0, 200)
        args.language = args.language.trim()
        if (args.title !== undefined && args.title !== null) {
          if (typeof args.title !== 'string') throw new Error('参数无效: title')
          args.title = args.title.trim().slice(0, 500)
        }

        return saveExerciseDraft(getDB(), {
          exerciseId: args.exerciseId,
          title: args.title,
          code: args.code,
          language: args.language,
          baseRevision: args.baseRevision,
        })
      },
    ),
  )

  // -- exercises-draft-clear -------------------------------------------------
  ipcMain.handle(
    'exercises-draft-clear',
    trackPerformance(
      'exercises-draft-clear',
      (_e, args: { exerciseId: string; baseRevision: number }) => {
        if (!args || typeof args !== 'object') throw new Error('参数无效')
        if (typeof args.exerciseId !== 'string' || !args.exerciseId.trim())
          throw new Error('参数无效: exerciseId')
        if (!Number.isSafeInteger(args.baseRevision) || args.baseRevision < 0)
          throw new Error('参数无效: baseRevision')

        return clearExerciseDraft(getDB(), args.exerciseId.trim().slice(0, 200), args.baseRevision)
      },
    ),
  )

  // -- exercises-evaluate ----------------------------------------------------
  ipcMain.handle(
    'exercises-evaluate',
    trackPerformance(
      'exercises-evaluate',
      async (
        _e,
        args: { exerciseId: string; code: string; language?: string },
      ): Promise<{
        passed: boolean
        score: number
        feedback_lines: string[]
        stdout: string
        duration_sec: number
      }> => {
        if (!args || typeof args !== 'object') throw new Error('参数无效')
        if (typeof args.exerciseId !== 'string' || !args.exerciseId.trim())
          throw new Error('参数无效: exerciseId')
        if (typeof args.code !== 'string') throw new Error('参数无效: code')

        args.exerciseId = args.exerciseId.trim().slice(0, 200)
        args.code = args.code.slice(0, 100_000)
        if (args.language !== undefined) {
          if (typeof args.language !== 'string') throw new Error('参数无效: language')
          args.language = args.language.trim().slice(0, 50)
        }

        if (args.exerciseId.startsWith('problem:')) {
          return evaluateProblemExercise(args)
        }

        const exercises = loadExercises()
        const exercise = exercises.find((ex) => ex.id === args.exerciseId)
        if (!exercise) throw new Error(`练习不存在: ${args.exerciseId}`)

        const startTime = Date.now()
        const feedbackLines: string[] = []
        const hasTests = exercise.tests.length > 0

        // Step 1: keyword checks (apply to all tracks)
        if (exercise.required_keywords.length > 0 || exercise.forbidden_keywords.length > 0) {
          const kwResult = checkKeywords(
            args.code,
            exercise.required_keywords,
            exercise.forbidden_keywords,
          )
          if (!kwResult.passed) {
            feedbackLines.push(...kwResult.feedback_lines)
            const durationSec = (Date.now() - startTime) / 1000
            return {
              passed: false,
              score: 0,
              feedback_lines: feedbackLines,
              stdout: '',
              duration_sec: Math.round(durationSec * 100) / 100,
            }
          }
          // If no tests and keyword check passed, the exercise is passed
          if (!hasTests) {
            feedbackLines.push('关键字检查通过')
            const durationSec = (Date.now() - startTime) / 1000
            return {
              passed: true,
              score: 1,
              feedback_lines: feedbackLines,
              stdout: '',
              duration_sec: Math.round(durationSec * 100) / 100,
            }
          }
        }

        // Step 2: run code tests (Python exercises with expression tests)
        if (hasTests) {
          const language = languageForTrack(exercise.track_id)
          if (language !== 'python') {
            // For non-Python tracks with no keyword-only mode, we cannot
            // easily eval expressions. Return keyword-only result.
            feedbackLines.push('当前仅支持 Python 练习的自动评测')
            const durationSec = (Date.now() - startTime) / 1000
            return {
              passed: false,
              score: 0,
              feedback_lines: feedbackLines,
              stdout: '',
              duration_sec: Math.round(durationSec * 100) / 100,
            }
          }

          const harness = buildPythonTestHarness(args.code, exercise.tests)
          const result = await runCodeSnippet(harness, 'python')
          const stdout = result.stdout

          // Parse the structured result from the harness
          const marker = '__EXERCISE_RESULT__'
          const markerIdx = stdout.lastIndexOf(marker)

          if (result.exitCode !== 0 && markerIdx === -1) {
            // Runtime error before tests could run
            feedbackLines.push('代码执行出错:')
            const errorDetail = result.stderr.trim() || stdout.trim()
            // Show first few lines of error
            const errorLines = errorDetail.split('\n').slice(0, 5)
            for (const line of errorLines) {
              feedbackLines.push(`  ${line}`)
            }
            const durationSec = (Date.now() - startTime) / 1000
            return {
              passed: false,
              score: 0,
              feedback_lines: feedbackLines,
              stdout,
              duration_sec: Math.round(durationSec * 100) / 100,
            }
          }

          if (markerIdx === -1) {
            feedbackLines.push('评测结果解析失败，请检查代码是否正确运行')
            const durationSec = (Date.now() - startTime) / 1000
            return {
              passed: false,
              score: 0,
              feedback_lines: feedbackLines,
              stdout,
              duration_sec: Math.round(durationSec * 100) / 100,
            }
          }

          const jsonStr = stdout.slice(markerIdx + marker.length).trim()
          let testResults: TestCaseResult[]
          try {
            testResults = JSON.parse(jsonStr) as TestCaseResult[]
          } catch {
            feedbackLines.push('评测结果解析失败')
            const durationSec = (Date.now() - startTime) / 1000
            return {
              passed: false,
              score: 0,
              feedback_lines: feedbackLines,
              stdout,
              duration_sec: Math.round(durationSec * 100) / 100,
            }
          }

          const passedCount = testResults.filter((r) => r.passed).length
          const totalTests = testResults.length
          const allPassed = passedCount === totalTests
          const score = totalTests > 0 ? passedCount / totalTests : 0

          if (allPassed) {
            feedbackLines.push(`全部通过 (${passedCount}/${totalTests})`)
          } else {
            feedbackLines.push(`通过 ${passedCount}/${totalTests} 个测试`)
            for (const tr of testResults) {
              if (!tr.passed) {
                feedbackLines.push(
                  `  FAIL: ${tr.expression} — 期望 ${JSON.stringify(tr.expected)}，实际 ${JSON.stringify(tr.actual)}`,
                )
              }
            }
          }

          const durationSec = (Date.now() - startTime) / 1000
          return {
            passed: allPassed,
            score: Math.round(score * 100) / 100,
            feedback_lines: feedbackLines,
            stdout,
            duration_sec: Math.round(durationSec * 100) / 100,
          }
        }

        // No tests and no keyword constraints — nothing to evaluate
        feedbackLines.push('该练习暂无可评测的内容')
        const durationSec = (Date.now() - startTime) / 1000
        return {
          passed: false,
          score: 0,
          feedback_lines: feedbackLines,
          stdout: '',
          duration_sec: Math.round(durationSec * 100) / 100,
        }
      },
    ),
  )

  console.log('[IPC] Registered: exercises handlers')
}
