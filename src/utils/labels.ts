export const DIFF_COLORS: Record<string, string> = {
  easy: 'text-[var(--theme-success)]',
  medium: 'text-[var(--theme-warning)]',
  hard: 'text-[var(--theme-danger)]',
}

export const DIFF_LABELS: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

export const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'sql', label: 'SQL' },
  { value: 'verilog', label: 'Verilog' },
]

export function parseJsonArray(raw?: string): unknown[] {
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function labelFor(map: Record<string, string>, key: string): string {
  return map[key] ?? key
}

export const sourceLabel = (source: string) =>
  labelFor(
    {
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
    },
    source,
  )

export const platformLabel = (platform: string) =>
  labelFor(
    {
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
    },
    platform,
  )

export const modeLabel = (mode: string) =>
  labelFor(
    {
      oj: 'OJ',
      simulation: '仿真题',
      'data-task': '数据题',
      'case-study': '案例题',
      'report-task': '报告题',
    },
    mode,
  )

export const trackLabel = (track: string) =>
  labelFor(
    {
      'postgrad-retest': '考研复试',
      'summer-camp': '保研夏令营',
      'algo-job': '算法校招',
      'ic-job': '硬件 / IC',
      'math-modeling': '数学建模',
    },
    track,
  )

export const examStyleLabel = (style: string) =>
  labelFor({ acm: 'ACM', oa: 'OA', modeling: '建模', hdl: 'HDL' }, style)
