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
