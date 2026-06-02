/**
 * Shared label mapping functions for problem metadata.
 * Extracted from ProblemList.tsx and ProblemDetail.tsx to eliminate duplication.
 */

export function parseJsonArray(raw?: string): string[] {
  try {
    return JSON.parse(raw ?? '[]') as string[]
  } catch {
    return []
  }
}

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

export function examStyleLabel(style: string): string {
  const labels: Record<string, string> = {
    acm: 'ACM',
    oa: 'OA',
    modeling: '建模',
    hdl: 'HDL',
  }
  return labels[style] ?? style
}
