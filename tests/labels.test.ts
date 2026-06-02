import { describe, it, expect } from 'vitest'
import {
  parseJsonArray,
  sourceLabel,
  platformLabel,
  modeLabel,
  trackLabel,
  examStyleLabel,
} from '../src/utils/labels'

describe('parseJsonArray', () => {
  it('parses valid JSON array', () => {
    expect(parseJsonArray('["a","b","c"]')).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseJsonArray('not json')).toEqual([])
  })

  it('returns empty array for undefined input', () => {
    expect(parseJsonArray(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseJsonArray('')).toEqual([])
  })

  it('handles nested arrays', () => {
    expect(parseJsonArray('[["a"],["b"]]')).toEqual([['a'], ['b']])
  })
})

describe('sourceLabel', () => {
  it('returns Chinese label for known sources', () => {
    expect(sourceLabel('builtin')).toBe('基础题库')
    expect(sourceLabel('leetcode')).toBe('LeetCode')
    expect(sourceLabel('math-modeling')).toBe('原有建模题库')
    expect(sourceLabel('exam-retest-pat')).toBe('复试 PAT')
    expect(sourceLabel('exam-retest-pta')).toBe('复试 PTA')
    expect(sourceLabel('exam-retest-csp')).toBe('复试 CSP')
    expect(sourceLabel('summer-kattis')).toBe('夏令营 Kattis')
    expect(sourceLabel('summer-cf-gym')).toBe('夏令营 Gym')
    expect(sourceLabel('summer-uoj')).toBe('夏令营 UOJ')
    expect(sourceLabel('algo-job-nowcoder')).toBe('校招牛客')
    expect(sourceLabel('algo-job-oa')).toBe('OA 模拟')
    expect(sourceLabel('ic-job-hdlbits')).toBe('IC HDLBits')
    expect(sourceLabel('ic-job-nowcoder-verilog')).toBe('IC Verilog')
    expect(sourceLabel('ic-job-simulation')).toBe('IC 仿真')
    expect(sourceLabel('modeling-official')).toBe('建模真题')
    expect(sourceLabel('modeling-kaggle')).toBe('Kaggle 建模')
    expect(sourceLabel('modeling-mathworks')).toBe('MathWorks 建模')
  })

  it('returns the source string for unknown sources', () => {
    expect(sourceLabel('unknown-source')).toBe('unknown-source')
  })
})

describe('platformLabel', () => {
  it('returns Chinese label for known platforms', () => {
    expect(platformLabel('pat')).toBe('PAT')
    expect(platformLabel('pta')).toBe('PTA')
    expect(platformLabel('csp')).toBe('CSP')
    expect(platformLabel('leetcode')).toBe('LeetCode')
    expect(platformLabel('nowcoder')).toBe('牛客')
    expect(platformLabel('kattis')).toBe('Kattis')
    expect(platformLabel('cf-gym')).toBe('Gym')
    expect(platformLabel('uoj')).toBe('UOJ')
    expect(platformLabel('hackerrank')).toBe('HackerRank')
    expect(platformLabel('codesignal')).toBe('CodeSignal')
    expect(platformLabel('cumcm')).toBe('国赛')
    expect(platformLabel('pgmcm')).toBe('研赛')
    expect(platformLabel('mcm-icm')).toBe('MCM/ICM')
    expect(platformLabel('mathorcup')).toBe('MathorCup')
    expect(platformLabel('kaggle')).toBe('Kaggle')
    expect(platformLabel('mathworks')).toBe('MathWorks')
    expect(platformLabel('hdlbits')).toBe('HDLBits')
    expect(platformLabel('eda-playground')).toBe('EDA Playground')
    expect(platformLabel('internal')).toBe('内置')
  })

  it('returns the platform string for unknown platforms', () => {
    expect(platformLabel('unknown')).toBe('unknown')
  })
})

describe('modeLabel', () => {
  it('returns Chinese label for known modes', () => {
    expect(modeLabel('oj')).toBe('OJ')
    expect(modeLabel('simulation')).toBe('仿真题')
    expect(modeLabel('data-task')).toBe('数据题')
    expect(modeLabel('case-study')).toBe('案例题')
    expect(modeLabel('report-task')).toBe('报告题')
  })

  it('returns the mode string for unknown modes', () => {
    expect(modeLabel('custom')).toBe('custom')
  })
})

describe('trackLabel', () => {
  it('returns Chinese label for known tracks', () => {
    expect(trackLabel('postgrad-retest')).toBe('考研复试')
    expect(trackLabel('summer-camp')).toBe('保研夏令营')
    expect(trackLabel('algo-job')).toBe('算法校招')
    expect(trackLabel('ic-job')).toBe('硬件 / IC')
    expect(trackLabel('math-modeling')).toBe('数学建模')
  })

  it('returns the track string for unknown tracks', () => {
    expect(trackLabel('unknown-track')).toBe('unknown-track')
  })
})

describe('examStyleLabel', () => {
  it('returns Chinese label for known styles', () => {
    expect(examStyleLabel('acm')).toBe('ACM')
    expect(examStyleLabel('oa')).toBe('OA')
    expect(examStyleLabel('modeling')).toBe('建模')
    expect(examStyleLabel('hdl')).toBe('HDL')
  })

  it('returns the style string for unknown styles', () => {
    expect(examStyleLabel('custom-style')).toBe('custom-style')
  })
})
