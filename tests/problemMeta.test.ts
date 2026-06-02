import { describe, it, expect } from 'vitest'
import {
  inferSourceFromFile,
  inferTracksFromSource,
  inferPlatformFromSource,
  inferModeFromSource,
  inferExamStyle,
  inferEstimatedTime,
  normalizeOutput,
  normalizeSql,
  mergeErrorTypes,
} from '../electron/utils/problemMeta'

describe('inferSourceFromFile', () => {
  it('basic.json 返回 builtin', () => {
    expect(inferSourceFromFile('basic.json')).toBe('builtin')
  })

  it('leetcode.json 返回 leetcode', () => {
    expect(inferSourceFromFile('leetcode.json')).toBe('leetcode')
  })

  it('math-modeling.json 返回 math-modeling', () => {
    expect(inferSourceFromFile('math-modeling.json')).toBe('math-modeling')
  })

  it('其他文件去掉 .json 后缀', () => {
    expect(inferSourceFromFile('custom-set.json')).toBe('custom-set')
  })

  it('大小写 .JSON 也能去掉', () => {
    expect(inferSourceFromFile('mydata.JSON')).toBe('mydata')
  })
})

describe('inferTracksFromSource', () => {
  it('exam-retest 来源映射到考研复试', () => {
    expect(inferTracksFromSource('exam-retest-pat')).toEqual(['postgrad-retest'])
  })

  it('summer 来源映射到保研夏令营', () => {
    expect(inferTracksFromSource('summer-kattis')).toEqual(['summer-camp'])
  })

  it('algo-job 来源映射到算法校招', () => {
    expect(inferTracksFromSource('algo-job-nowcoder')).toEqual(['algo-job'])
  })

  it('ic-job 来源映射到硬件/IC', () => {
    expect(inferTracksFromSource('ic-job-hdlbits')).toEqual(['ic-job'])
  })

  it('leetcode 映射到算法校招+保研夏令营', () => {
    expect(inferTracksFromSource('leetcode')).toEqual(['algo-job', 'summer-camp'])
  })

  it('math-modeling 映射到数学建模', () => {
    expect(inferTracksFromSource('math-modeling')).toEqual(['math-modeling'])
  })

  it('未知来源映射到默认方向', () => {
    expect(inferTracksFromSource('builtin')).toEqual(['postgrad-retest', 'algo-job'])
  })
})

describe('inferPlatformFromSource', () => {
  it('pat 来源返回 pat', () => {
    expect(inferPlatformFromSource('exam-retest-pat')).toBe('pat')
  })

  it('csp 来源返回 csp', () => {
    expect(inferPlatformFromSource('exam-retest-csp')).toBe('csp')
  })

  it('kattis 来源返回 kattis', () => {
    expect(inferPlatformFromSource('summer-kattis')).toBe('kattis')
  })

  it('leetcode 返回 leetcode', () => {
    expect(inferPlatformFromSource('leetcode')).toBe('leetcode')
  })

  it('math-modeling 返回 cumcm', () => {
    expect(inferPlatformFromSource('math-modeling')).toBe('cumcm')
  })

  it('未知来源返回 internal', () => {
    expect(inferPlatformFromSource('builtin')).toBe('internal')
  })
})

describe('inferModeFromSource', () => {
  it('simulation 来源返回仿真题', () => {
    expect(inferModeFromSource('ic-job-simulation')).toBe('simulation')
  })

  it('kaggle 来源返回数据题', () => {
    expect(inferModeFromSource('modeling-kaggle')).toBe('data-task')
  })

  it('mathworks 来源返回案例题', () => {
    expect(inferModeFromSource('modeling-mathworks')).toBe('case-study')
  })

  it('math-modeling 返回案例题', () => {
    expect(inferModeFromSource('math-modeling')).toBe('case-study')
  })

  it('默认返回 OJ', () => {
    expect(inferModeFromSource('builtin')).toBe('oj')
    expect(inferModeFromSource('leetcode')).toBe('oj')
  })
})

describe('inferExamStyle', () => {
  it('ic-job 来源返回 hdl', () => {
    expect(inferExamStyle('ic-job-hdlbits')).toBe('hdl')
  })

  it('modeling 来源返回 modeling', () => {
    expect(inferExamStyle('modeling-official')).toBe('modeling')
  })

  it('math-modeling 返回 modeling', () => {
    expect(inferExamStyle('math-modeling')).toBe('modeling')
  })

  it('algo-job 来源返回 oa', () => {
    expect(inferExamStyle('algo-job-nowcoder')).toBe('oa')
  })

  it('leetcode 返回 oa', () => {
    expect(inferExamStyle('leetcode')).toBe('oa')
  })

  it('默认返回 acm', () => {
    expect(inferExamStyle('builtin')).toBe('acm')
  })
})

describe('inferEstimatedTime', () => {
  it('easy 基础时间 20 分钟', () => {
    expect(inferEstimatedTime('easy', 'oj')).toBe(20)
  })

  it('medium 基础时间 35 分钟', () => {
    expect(inferEstimatedTime('medium', 'oj')).toBe(35)
  })

  it('hard 基础时间 55 分钟', () => {
    expect(inferEstimatedTime('hard', 'oj')).toBe(55)
  })

  it('simulation 模式额外加 15 分钟', () => {
    expect(inferEstimatedTime('easy', 'simulation')).toBe(35)
    expect(inferEstimatedTime('hard', 'simulation')).toBe(70)
  })

  it('data-task 模式额外加 25 分钟', () => {
    expect(inferEstimatedTime('medium', 'data-task')).toBe(60)
  })

  it('case-study 模式额外加 25 分钟', () => {
    expect(inferEstimatedTime('easy', 'case-study')).toBe(45)
  })

  it('report-task 模式额外加 25 分钟', () => {
    expect(inferEstimatedTime('hard', 'report-task')).toBe(80)
  })
})

describe('normalizeOutput', () => {
  it('去除首尾空白', () => {
    expect(normalizeOutput('  hello  ')).toBe('hello')
  })

  it('Windows 换行转 Unix 换行', () => {
    expect(normalizeOutput('line1\r\nline2')).toBe('line1\nline2')
  })

  it('混合空白和换行', () => {
    expect(normalizeOutput('  hello\r\nworld  ')).toBe('hello\nworld')
  })
})

describe('normalizeSql', () => {
  it('去除单行注释', () => {
    expect(normalizeSql('SELECT * -- comment\nFROM t')).toBe('select * from t')
  })

  it('多余空白合并为单个空格', () => {
    expect(normalizeSql('SELECT   *   FROM   t')).toBe('select * from t')
  })

  it('去除末尾分号', () => {
    expect(normalizeSql('SELECT 1;')).toBe('select 1')
  })

  it('转为小写', () => {
    expect(normalizeSql('SELECT * FROM Users')).toBe('select * from users')
  })

  it('综合处理', () => {
    expect(normalizeSql('  SELECT  * -- test\n  FROM  Users;  ')).toBe('select * from users')
  })
})

describe('mergeErrorTypes', () => {
  it('undefined 输入返回包含 status 的数组', () => {
    expect(mergeErrorTypes(undefined, 'wrong_answer')).toEqual(['wrong_answer'])
  })

  it('合法 JSON 数组追加新 status', () => {
    expect(mergeErrorTypes('["timeout"]', 'wrong_answer')).toEqual([
      'timeout',
      'wrong_answer',
    ])
  })

  it('已存在 status 不重复追加', () => {
    expect(mergeErrorTypes('["wrong_answer"]', 'wrong_answer')).toEqual(['wrong_answer'])
  })

  it('非法 JSON 回退到只包含 status', () => {
    expect(mergeErrorTypes('{invalid', 'wrong_answer')).toEqual(['wrong_answer'])
  })

  it('空数组追加 status', () => {
    expect(mergeErrorTypes('[]', 'runtime_error')).toEqual(['runtime_error'])
  })

  it('过滤非字符串元素', () => {
    expect(mergeErrorTypes('[1, "timeout", null]', 'wrong_answer')).toEqual([
      'timeout',
      'wrong_answer',
    ])
  })
})
