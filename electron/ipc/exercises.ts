import { ipcMain } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getDB } from '../db/index'
import { runCodeSnippet } from '../utils/codeRunner'
import { trackPerformance } from '../utils/perfMonitor'

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
}

// ---------------------------------------------------------------------------
// Exercise file loading (content/metadata/exercises.json)
// ---------------------------------------------------------------------------

let exerciseCache: Exercise[] | null = null

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

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

/**
 * Build a Python harness that imports the user's code and runs each test
 * expression, printing structured JSON results to stdout.
 */
function buildPythonTestHarness(userCode: string, tests: ExerciseTest[]): string {
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
function checkKeywords(
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
function languageForTrack(trackId: string): string {
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

        let list = loadExercises()

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
      const exercise = exercises.find((ex) => ex.id === id)
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

      const row = getDB()
        .prepare('SELECT code, updated_at FROM exercise_drafts WHERE exercise_id = ?')
        .get(exerciseId) as { code: string; updated_at: string } | undefined

      return row ?? null
    }),
  )

  // -- exercises-draft-save --------------------------------------------------
  ipcMain.handle(
    'exercises-draft-save',
    trackPerformance(
      'exercises-draft-save',
      (_e, args: { exerciseId: string; code: string; title?: string }) => {
        if (!args || typeof args !== 'object') throw new Error('参数无效')
        if (typeof args.exerciseId !== 'string' || !args.exerciseId.trim())
          throw new Error('参数无效: exerciseId')
        if (typeof args.code !== 'string') throw new Error('参数无效: code')

        args.exerciseId = args.exerciseId.trim().slice(0, 200)
        args.code = args.code.slice(0, 100_000)
        if (args.title !== undefined) {
          if (typeof args.title !== 'string') throw new Error('参数无效: title')
          args.title = args.title.trim().slice(0, 500)
        }

        getDB()
          .prepare(
            `INSERT INTO exercise_drafts (exercise_id, title, code, updated_at)
             VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(exercise_id) DO UPDATE SET title = excluded.title, code = excluded.code, updated_at = excluded.updated_at`,
          )
          .run(args.exerciseId, args.title ?? null, args.code)

        return { success: true }
      },
    ),
  )

  // -- exercises-draft-clear -------------------------------------------------
  ipcMain.handle(
    'exercises-draft-clear',
    trackPerformance('exercises-draft-clear', (_e, exerciseId: string) => {
      if (typeof exerciseId !== 'string' || !exerciseId.trim())
        throw new Error('参数无效: exerciseId')
      exerciseId = exerciseId.trim().slice(0, 200)

      getDB().prepare('DELETE FROM exercise_drafts WHERE exercise_id = ?').run(exerciseId)

      return { success: true }
    }),
  )

  // -- exercises-evaluate ----------------------------------------------------
  ipcMain.handle(
    'exercises-evaluate',
    trackPerformance(
      'exercises-evaluate',
      async (
        _e,
        args: { exerciseId: string; code: string },
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
