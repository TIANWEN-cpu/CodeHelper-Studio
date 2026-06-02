/**
 * Shared label mapping functions for problem metadata.
 * Extracted from ProblemList.tsx and ProblemDetail.tsx to eliminate duplication.
 */

/** CSS class for difficulty text colors. */
export const DIFF_COLORS: Record<string, string> = {
  easy: 'text-[var(--theme-success)]',
  medium: 'text-[var(--theme-warning)]',
  hard: 'text-[var(--theme-danger)]',
}

/** Chinese labels for difficulty levels. */
export const DIFF_LABELS: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

/** Available languages for code execution. */
export const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'sql', label: 'SQL' },
  { value: 'verilog', label: 'Verilog' },
]

/**
 * Safely parse a JSON array string. Returns an empty array on failure or if
 * the input is undefined.
 *
 * @param raw - A JSON-encoded array string (e.g. `'["a","b"]'`).
 * @returns Parsed string array, or `[]` on error.
 *
 * @example
 * ```ts
 * parseJsonArray('["数组","排序"]')  // => ['数组', '排序']
 * parseJsonArray(undefined)          // => []
 * parseJsonArray('invalid')          // => []
 * ```
 */
export function parseJsonArray(raw?: string): string[] {
  try {
    return JSON.parse(raw ?? '[]') as string[]
  } catch {
    return []
  }
}

/**
 * Map a problem source identifier to a human-readable Chinese label.
 *
 * @param source - Source key from the `problems` table (e.g. `'leetcode'`, `'exam-retest-pat'`).
 * @returns Localised label string. Falls back to the raw value when no mapping exists.
 *
 * @example
 * ```ts
 * sourceLabel('leetcode')           // => 'LeetCode'
 * sourceLabel('exam-retest-csp')    // => '复试 CSP'
 * sourceLabel('unknown-source')     // => 'unknown-source'
 * ```
 */
export function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    builtin: '基础题库',
    leetcode: 'LeetCode',
    'math-modeling': '原有建模题库',
    'exam-retest-pat': '复试 PAT',
    'exam-retest-pta': '复试 PTA',
    'exam-retest-csp': '复试 CSP',
    'summer-kattis': '夏令营 Kattis',
    'summer-cf-gym': '夏令营 Gym',
    'summer-uoj': '夏令营 UOJ',
    'algo-job-nowcoder': '校招牛客',
    'algo-job-oa': 'OA 模拟',
    'ic-job-hdlbits': 'IC HDLBits',
    'ic-job-nowcoder-verilog': 'IC Verilog',
    'ic-job-simulation': 'IC 仿真',
    'modeling-official': '建模真题',
    'modeling-kaggle': 'Kaggle 建模',
    'modeling-mathworks': 'MathWorks 建模',
  }
  return labels[source] ?? source
}

/**
 * Map a problem platform identifier to a human-readable Chinese label.
 *
 * @param platform - Platform key from the `problems` table (e.g. `'leetcode'`, `'nowcoder'`).
 * @returns Localised label string. Falls back to the raw value when no mapping exists.
 *
 * @example
 * ```ts
 * platformLabel('pat')        // => 'PAT'
 * platformLabel('nowcoder')   // => '牛客'
 * ```
 */
export function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    pat: 'PAT',
    pta: 'PTA',
    csp: 'CSP',
    leetcode: 'LeetCode',
    nowcoder: '牛客',
    kattis: 'Kattis',
    'cf-gym': 'Gym',
    uoj: 'UOJ',
    hackerrank: 'HackerRank',
    codesignal: 'CodeSignal',
    cumcm: '国赛',
    pgmcm: '研赛',
    'mcm-icm': 'MCM/ICM',
    mathorcup: 'MathorCup',
    kaggle: 'Kaggle',
    mathworks: 'MathWorks',
    hdlbits: 'HDLBits',
    'eda-playground': 'EDA Playground',
    internal: '内置',
  }
  return labels[platform] ?? platform
}

/**
 * Map a problem mode identifier to a human-readable Chinese label.
 *
 * @param mode - Mode key (e.g. `'oj'`, `'simulation'`, `'data-task'`).
 * @returns Localised label string. Falls back to the raw value when no mapping exists.
 *
 * @example
 * ```ts
 * modeLabel('oj')           // => 'OJ'
 * modeLabel('simulation')   // => '仿真题'
 * ```
 */
export function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    oj: 'OJ',
    simulation: '仿真题',
    'data-task': '数据题',
    'case-study': '案例题',
    'report-task': '报告题',
  }
  return labels[mode] ?? mode
}

/**
 * Map a learning-track identifier to a human-readable Chinese label.
 *
 * @param track - Track key (e.g. `'postgrad-retest'`, `'summer-camp'`).
 * @returns Localised label string. Falls back to the raw value when no mapping exists.
 *
 * @example
 * ```ts
 * trackLabel('postgrad-retest')  // => '考研复试'
 * trackLabel('algo-job')         // => '算法校招'
 * ```
 */
export function trackLabel(track: string): string {
  const labels: Record<string, string> = {
    'postgrad-retest': '考研复试',
    'summer-camp': '保研夏令营',
    'algo-job': '算法校招',
    'ic-job': '硬件 / IC',
    'math-modeling': '数学建模',
  }
  return labels[track] ?? track
}

/**
 * Map an exam-style identifier to a human-readable Chinese label.
 *
 * @param style - Exam style key (e.g. `'acm'`, `'oa'`, `'modeling'`).
 * @returns Localised label string. Falls back to the raw value when no mapping exists.
 *
 * @example
 * ```ts
 * examStyleLabel('acm')       // => 'ACM'
 * examStyleLabel('modeling')  // => '建模'
 * ```
 */
export function examStyleLabel(style: string): string {
  const labels: Record<string, string> = {
    acm: 'ACM',
    oa: 'OA',
    modeling: '建模',
    hdl: 'HDL',
  }
  return labels[style] ?? style
}
