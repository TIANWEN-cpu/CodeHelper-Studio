/**
 * Pure problem metadata inference functions extracted from problems.ts for testability.
 * These functions have zero Electron/Node dependencies.
 */

export interface ProblemSeed {
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  languages: string[]
  examples: Array<{ input: string; output: string; explanation?: string }>
  test_cases: Array<{ input: string; expected: string }>
  starter_code: Record<string, string>
  source?: string
  tracks?: string[]
  platform?: string
  mode?: string
  exam_style?: string
  year?: number
  official_url?: string
  estimated_time?: number
}

export function inferSourceFromFile(file: string): string {
  if (file === 'basic.json') return 'builtin'
  if (file === 'leetcode.json') return 'leetcode'
  if (file === 'math-modeling.json') return 'math-modeling'
  return file.replace(/\.json$/i, '')
}

export function inferTracksFromSource(source: string): string[] {
  if (source.includes('exam-retest')) return ['postgrad-retest']
  if (source.includes('summer')) return ['summer-camp']
  if (source.includes('algo-job')) return ['algo-job']
  if (source.includes('ic-job')) return ['ic-job']
  if (source.includes('modeling') || source === 'math-modeling') return ['math-modeling']
  if (source === 'leetcode') return ['algo-job', 'summer-camp']
  return ['postgrad-retest', 'algo-job']
}

export function inferPlatformFromSource(source: string): string {
  if (source.includes('pat')) return 'pat'
  if (source.includes('pta')) return 'pta'
  if (source.includes('csp')) return 'csp'
  if (source.includes('kattis')) return 'kattis'
  if (source.includes('cf-gym')) return 'cf-gym'
  if (source.includes('uoj')) return 'uoj'
  if (source.includes('nowcoder')) return 'nowcoder'
  if (source.includes('oa')) return 'hackerrank'
  if (source.includes('hdlbits')) return 'hdlbits'
  if (source.includes('simulation')) return 'eda-playground'
  if (source.includes('official')) return 'cumcm'
  if (source.includes('kaggle')) return 'kaggle'
  if (source.includes('mathworks')) return 'mathworks'
  if (source === 'leetcode') return 'leetcode'
  if (source === 'math-modeling') return 'cumcm'
  return 'internal'
}

export function inferModeFromSource(source: string): string {
  if (source.includes('simulation')) return 'simulation'
  if (source.includes('kaggle')) return 'data-task'
  if (source.includes('mathworks') || source.includes('official') || source === 'math-modeling')
    return 'case-study'
  return 'oj'
}

export function inferExamStyle(source: string): string {
  if (source.includes('ic-job') || source.includes('hdlbits')) return 'hdl'
  if (source.includes('modeling') || source === 'math-modeling') return 'modeling'
  if (source.includes('algo-job') || source === 'leetcode' || source.includes('oa')) return 'oa'
  return 'acm'
}

export function inferEstimatedTime(difficulty: string, mode: string): number {
  const base = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 35 : 55
  if (mode === 'simulation') return base + 15
  if (mode === 'data-task' || mode === 'case-study' || mode === 'report-task') return base + 25
  return base
}

export function normalizeOutput(output: string): string {
  return output.trim().replace(/\r\n/g, '\n')
}

export function normalizeSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*;\s*$/, '')
    .trim()
    .toLowerCase()
}

export function mergeErrorTypes(rawErrorTypes: string | undefined, status: string): string[] {
  try {
    const parsed = rawErrorTypes ? JSON.parse(rawErrorTypes) : []
    const errorTypes: string[] = Array.isArray(parsed)
      ? parsed.filter((item: unknown) => typeof item === 'string')
      : []
    if (!errorTypes.includes(status)) {
      errorTypes.push(status)
    }
    return errorTypes
  } catch {
    return [status]
  }
}

export function normalizeProblemSeed(problem: ProblemSeed, fallbackSource: string): ProblemSeed {
  const source = problem.source ?? fallbackSource
  return {
    ...problem,
    source,
    tracks: problem.tracks ?? inferTracksFromSource(source),
    platform: problem.platform ?? inferPlatformFromSource(source),
    mode: problem.mode ?? inferModeFromSource(source),
    exam_style: problem.exam_style ?? inferExamStyle(source),
    estimated_time:
      problem.estimated_time ??
      inferEstimatedTime(problem.difficulty, problem.mode ?? inferModeFromSource(source)),
  }
}
