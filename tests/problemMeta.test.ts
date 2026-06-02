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
  normalizeProblemSeed,
  ProblemSeed,
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

  it('不含 .json 后缀的文件原样返回', () => {
    expect(inferSourceFromFile('data.xml')).toBe('data.xml')
  })

  it('文件名仅 .json 返回空字符串', () => {
    expect(inferSourceFromFile('.json')).toBe('')
  })
})

describe('inferTracksFromSource', () => {
  it('exam-retest 来源映射到考研复试', () => {
    expect(inferTracksFromSource('exam-retest-pat')).toEqual(['postgrad-retest'])
  })

  it('exam-retest-csp 也映射到考研复试', () => {
    expect(inferTracksFromSource('exam-retest-csp')).toEqual(['postgrad-retest'])
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

  it('modeling-official 映射到数学建模', () => {
    expect(inferTracksFromSource('modeling-official')).toEqual(['math-modeling'])
  })

  it('modeling-kaggle 映射到数学建模', () => {
    expect(inferTracksFromSource('modeling-kaggle')).toEqual(['math-modeling'])
  })

  it('空字符串映射到默认方向', () => {
    expect(inferTracksFromSource('')).toEqual(['postgrad-retest', 'algo-job'])
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

  it('pta 来源返回 pta', () => {
    expect(inferPlatformFromSource('exam-retest-pta')).toBe('pta')
  })

  it('cf-gym 来源返回 cf-gym', () => {
    expect(inferPlatformFromSource('algo-job-cf-gym')).toBe('cf-gym')
  })

  it('uoj 来源返回 uoj', () => {
    expect(inferPlatformFromSource('algo-job-uoj')).toBe('uoj')
  })

  it('nowcoder 来源返回 nowcoder', () => {
    expect(inferPlatformFromSource('algo-job-nowcoder')).toBe('nowcoder')
  })

  it('hdlbits 来源返回 hdlbits', () => {
    expect(inferPlatformFromSource('ic-job-hdlbits')).toBe('hdlbits')
  })

  it('simulation 来源返回 eda-playground', () => {
    expect(inferPlatformFromSource('ic-job-simulation')).toBe('eda-playground')
  })

  it('official 来源返回 cumcm', () => {
    expect(inferPlatformFromSource('modeling-official')).toBe('cumcm')
  })

  it('kaggle 来源返回 kaggle', () => {
    expect(inferPlatformFromSource('modeling-kaggle')).toBe('kaggle')
  })

  it('mathworks 来源返回 mathworks', () => {
    expect(inferPlatformFromSource('modeling-mathworks')).toBe('mathworks')
  })

  it('oa 来源返回 hackerrank', () => {
    expect(inferPlatformFromSource('algo-job-oa')).toBe('hackerrank')
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

  it('official 来源返回案例题', () => {
    expect(inferModeFromSource('modeling-official')).toBe('case-study')
  })

  it('空字符串返回 OJ', () => {
    expect(inferModeFromSource('')).toBe('oj')
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

  it('hdlbits（无 ic-job 前缀）返回 hdl', () => {
    expect(inferExamStyle('hdlbits')).toBe('hdl')
  })

  it('oa 来源返回 oa', () => {
    expect(inferExamStyle('algo-job-oa')).toBe('oa')
  })

  it('summer-kattis 返回 acm', () => {
    expect(inferExamStyle('summer-kattis')).toBe('acm')
  })

  it('空字符串返回 acm', () => {
    expect(inferExamStyle('')).toBe('acm')
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

  it('未知难度 fallback 到 hard 基础时间', () => {
    expect(inferEstimatedTime('unknown', 'oj')).toBe(55)
  })

  it('未知模式不加时间', () => {
    expect(inferEstimatedTime('medium', 'unknown')).toBe(35)
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

  it('纯换行文本', () => {
    expect(normalizeOutput('\r\n\r\n')).toBe('')
  })

  it('多次 Windows 换行', () => {
    expect(normalizeOutput('a\r\nb\r\nc')).toBe('a\nb\nc')
  })

  it('Unix 换行不受影响', () => {
    expect(normalizeOutput('a\nb')).toBe('a\nb')
  })

  it('空白字符串', () => {
    expect(normalizeOutput('   ')).toBe('')
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

  it('空字符串返回空字符串', () => {
    expect(normalizeSql('')).toBe('')
  })

  it('只有注释返回空字符串', () => {
    expect(normalizeSql('-- just a comment')).toBe('')
  })

  it('多个分号只去除末尾的', () => {
    expect(normalizeSql('SELECT 1; SELECT 2;')).toBe('select 1; select 2')
  })

  it('制表符和换行符都被压缩', () => {
    expect(normalizeSql("SELECT\t*\nFROM\tusers")).toBe('select * from users')
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

  it('JSON 对象（非数组）回退到只包含 status', () => {
    expect(mergeErrorTypes('{"key":"value"}', 'error')).toEqual(['error'])
  })

  it('多次追加不同 status', () => {
    const result = mergeErrorTypes('["timeout"]', 'wrong_answer')
    expect(result).toEqual(['timeout', 'wrong_answer'])
    const result2 = mergeErrorTypes(JSON.stringify(result), 'runtime_error')
    expect(result2).toEqual(['timeout', 'wrong_answer', 'runtime_error'])
  })

  it('布尔值数组被过滤', () => {
    expect(mergeErrorTypes('[true, false]', 'error')).toEqual(['error'])
  })
})

describe('normalizeProblemSeed', () => {
  const makeSeed = (overrides: Partial<ProblemSeed> = {}): ProblemSeed => ({
    title: 'Test',
    description: 'Desc',
    difficulty: 'medium',
    tags: [],
    languages: [],
    examples: [],
    test_cases: [],
    starter_code: {},
    ...overrides,
  })

  it('当 source 未设置时使用 fallbackSource', () => {
    const result = normalizeProblemSeed(makeSeed(), 'exam-retest-pat')
    expect(result.source).toBe('exam-retest-pat')
    expect(result.platform).toBe('pat')
    expect(result.tracks).toEqual(['postgrad-retest'])
    expect(result.mode).toBe('oj')
    expect(result.exam_style).toBe('acm')
  })

  it('当 source 已设置时保留原有值', () => {
    const result = normalizeProblemSeed(
      makeSeed({ source: 'leetcode' }),
      'builtin',
    )
    expect(result.source).toBe('leetcode')
    expect(result.platform).toBe('leetcode')
    expect(result.tracks).toEqual(['algo-job', 'summer-camp'])
  })

  it('当 tracks 已设置时保留原有值', () => {
    const result = normalizeProblemSeed(
      makeSeed({ tracks: ['custom-track'] }),
      'builtin',
    )
    expect(result.tracks).toEqual(['custom-track'])
  })

  it('当 platform 已设置时保留原有值', () => {
    const result = normalizeProblemSeed(
      makeSeed({ platform: 'custom-platform' }),
      'builtin',
    )
    expect(result.platform).toBe('custom-platform')
  })

  it('当 mode 已设置时保留原有值', () => {
    const result = normalizeProblemSeed(
      makeSeed({ mode: 'simulation' }),
      'builtin',
    )
    expect(result.mode).toBe('simulation')
  })

  it('当 exam_style 已设置时保留原有值', () => {
    const result = normalizeProblemSeed(
      makeSeed({ exam_style: 'hdl' }),
      'builtin',
    )
    expect(result.exam_style).toBe('hdl')
  })

  it('当 estimated_time 已设置时保留原有值', () => {
    const result = normalizeProblemSeed(
      makeSeed({ estimated_time: 42 }),
      'builtin',
    )
    expect(result.estimated_time).toBe(42)
  })

  it('根据 difficulty 和 mode 计算 estimated_time', () => {
    const result = normalizeProblemSeed(
      makeSeed({ difficulty: 'hard', mode: 'simulation' }),
      'builtin',
    )
    expect(result.estimated_time).toBe(70) // 55 + 15
  })

  it('不修改 title, description, tags 等原始字段', () => {
    const seed = makeSeed({
      title: 'My Title',
      description: 'My Desc',
      tags: ['tag1'],
      languages: ['python'],
    })
    const result = normalizeProblemSeed(seed, 'builtin')
    expect(result.title).toBe('My Title')
    expect(result.description).toBe('My Desc')
    expect(result.tags).toEqual(['tag1'])
    expect(result.languages).toEqual(['python'])
  })
})
