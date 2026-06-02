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
  it('解析合法 JSON 数组', () => {
    expect(parseJsonArray('["a","b","c"]')).toEqual(['a', 'b', 'c'])
  })

  it('空字符串返回空数组', () => {
    expect(parseJsonArray('')).toEqual([])
  })

  it('undefined 返回空数组', () => {
    expect(parseJsonArray(undefined)).toEqual([])
  })

  it('非法 JSON 返回空数组', () => {
    expect(parseJsonArray('{invalid')).toEqual([])
  })

  it('空 JSON 数组返回空数组', () => {
    expect(parseJsonArray('[]')).toEqual([])
  })

  it('JSON 对象原样返回（parseJsonArray 不做类型校验）', () => {
    expect(parseJsonArray('{"key":"value"}')).toEqual({ key: 'value' })
  })

  it('数字数组正确解析', () => {
    expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('嵌套数组正确解析', () => {
    expect(parseJsonArray('[["a","b"],["c"]]')).toEqual([['a', 'b'], ['c']])
  })
})

describe('sourceLabel', () => {
  it('已知来源返回中文标签', () => {
    expect(sourceLabel('builtin')).toBe('基础题库')
    expect(sourceLabel('leetcode')).toBe('LeetCode')
    expect(sourceLabel('exam-retest-pat')).toBe('复试 PAT')
  })

  it('未知来源原样返回', () => {
    expect(sourceLabel('unknown-source')).toBe('unknown-source')
  })

  it('空字符串原样返回', () => {
    expect(sourceLabel('')).toBe('')
  })
})

describe('platformLabel', () => {
  it('已知平台返回中文标签', () => {
    expect(platformLabel('pat')).toBe('PAT')
    expect(platformLabel('nowcoder')).toBe('牛客')
    expect(platformLabel('leetcode')).toBe('LeetCode')
  })

  it('未知平台原样返回', () => {
    expect(platformLabel('my-platform')).toBe('my-platform')
  })

  it('csp 平台返回正确标签', () => {
    expect(platformLabel('csp')).toBe('CSP')
  })
})

describe('modeLabel', () => {
  it('已知模式返回中文标签', () => {
    expect(modeLabel('oj')).toBe('OJ')
    expect(modeLabel('simulation')).toBe('仿真题')
    expect(modeLabel('data-task')).toBe('数据题')
  })

  it('未知模式原样返回', () => {
    expect(modeLabel('custom-mode')).toBe('custom-mode')
  })

  it('case-study 模式返回正确标签', () => {
    expect(modeLabel('case-study')).toBe('案例题')
  })

  it('report-task 模式返回正确标签', () => {
    expect(modeLabel('report-task')).toBe('报告题')
  })
})

describe('trackLabel', () => {
  it('已知方向返回中文标签', () => {
    expect(trackLabel('postgrad-retest')).toBe('考研复试')
    expect(trackLabel('summer-camp')).toBe('保研夏令营')
    expect(trackLabel('algo-job')).toBe('算法校招')
  })

  it('未知方向原样返回', () => {
    expect(trackLabel('new-track')).toBe('new-track')
  })

  it('ic-job 方向返回正确标签', () => {
    expect(trackLabel('ic-job')).toBe('硬件 / IC')
  })

  it('math-modeling 方向返回正确标签', () => {
    expect(trackLabel('math-modeling')).toBe('数学建模')
  })
})

describe('examStyleLabel', () => {
  it('已知考试风格返回中文标签', () => {
    expect(examStyleLabel('acm')).toBe('ACM')
    expect(examStyleLabel('oa')).toBe('OA')
    expect(examStyleLabel('modeling')).toBe('建模')
    expect(examStyleLabel('hdl')).toBe('HDL')
  })

  it('未知风格原样返回', () => {
    expect(examStyleLabel('new-style')).toBe('new-style')
  })
})
