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
} from '../electron/utils/problemMeta'

describe('inferSourceFromFile', () => {
  it('returns builtin for basic.json', () => {
    expect(inferSourceFromFile('basic.json')).toBe('builtin')
  })

  it('returns leetcode for leetcode.json', () => {
    expect(inferSourceFromFile('leetcode.json')).toBe('leetcode')
  })

  it('returns math-modeling for math-modeling.json', () => {
    expect(inferSourceFromFile('math-modeling.json')).toBe('math-modeling')
  })

  it('strips .json extension for other files', () => {
    expect(inferSourceFromFile('exam-retest-pat.json')).toBe('exam-retest-pat')
    expect(inferSourceFromFile('summer-kattis.json')).toBe('summer-kattis')
  })
})

describe('inferTracksFromSource', () => {
  it('returns postgrad-retest for exam-retest sources', () => {
    expect(inferTracksFromSource('exam-retest-pat')).toEqual(['postgrad-retest'])
    expect(inferTracksFromSource('exam-retest-csp')).toEqual(['postgrad-retest'])
  })

  it('returns summer-camp for summer sources', () => {
    expect(inferTracksFromSource('summer-kattis')).toEqual(['summer-camp'])
  })

  it('returns algo-job for algo-job sources', () => {
    expect(inferTracksFromSource('algo-job-nowcoder')).toEqual(['algo-job'])
  })

  it('returns ic-job for ic-job sources', () => {
    expect(inferTracksFromSource('ic-job-hdlbits')).toEqual(['ic-job'])
  })

  it('returns math-modeling for modeling sources', () => {
    expect(inferTracksFromSource('modeling-official')).toEqual(['math-modeling'])
    expect(inferTracksFromSource('math-modeling')).toEqual(['math-modeling'])
  })

  it('returns both algo-job and summer-camp for leetcode', () => {
    expect(inferTracksFromSource('leetcode')).toEqual(['algo-job', 'summer-camp'])
  })

  it('returns default tracks for unknown sources', () => {
    expect(inferTracksFromSource('unknown')).toEqual(['postgrad-retest', 'algo-job'])
  })
})

describe('inferPlatformFromSource', () => {
  it('returns correct platform for known source patterns', () => {
    expect(inferPlatformFromSource('exam-retest-pat')).toBe('pat')
    expect(inferPlatformFromSource('exam-retest-pta')).toBe('pta')
    expect(inferPlatformFromSource('exam-retest-csp')).toBe('csp')
    expect(inferPlatformFromSource('summer-kattis')).toBe('kattis')
    expect(inferPlatformFromSource('summer-cf-gym')).toBe('cf-gym')
    expect(inferPlatformFromSource('summer-uoj')).toBe('uoj')
    expect(inferPlatformFromSource('algo-job-nowcoder')).toBe('nowcoder')
    expect(inferPlatformFromSource('algo-job-oa')).toBe('hackerrank')
    expect(inferPlatformFromSource('ic-job-hdlbits')).toBe('hdlbits')
    expect(inferPlatformFromSource('ic-job-simulation')).toBe('eda-playground')
    expect(inferPlatformFromSource('modeling-official')).toBe('cumcm')
    expect(inferPlatformFromSource('modeling-kaggle')).toBe('kaggle')
    expect(inferPlatformFromSource('modeling-mathworks')).toBe('mathworks')
    expect(inferPlatformFromSource('leetcode')).toBe('leetcode')
    expect(inferPlatformFromSource('math-modeling')).toBe('cumcm')
  })

  it('returns internal for unknown sources', () => {
    expect(inferPlatformFromSource('unknown')).toBe('internal')
  })
})

describe('inferModeFromSource', () => {
  it('returns simulation for simulation sources', () => {
    expect(inferModeFromSource('ic-job-simulation')).toBe('simulation')
  })

  it('returns data-task for kaggle sources', () => {
    expect(inferModeFromSource('modeling-kaggle')).toBe('data-task')
  })

  it('returns case-study for mathworks/official/math-modeling', () => {
    expect(inferModeFromSource('modeling-mathworks')).toBe('case-study')
    expect(inferModeFromSource('modeling-official')).toBe('case-study')
    expect(inferModeFromSource('math-modeling')).toBe('case-study')
  })

  it('returns oj for other sources', () => {
    expect(inferModeFromSource('exam-retest-pat')).toBe('oj')
    expect(inferModeFromSource('leetcode')).toBe('oj')
    expect(inferModeFromSource('unknown')).toBe('oj')
  })
})

describe('inferExamStyle', () => {
  it('returns hdl for ic-job and hdlbits', () => {
    expect(inferExamStyle('ic-job-hdlbits')).toBe('hdl')
    expect(inferExamStyle('ic-job-nowcoder-verilog')).toBe('hdl')
  })

  it('returns modeling for modeling sources', () => {
    expect(inferExamStyle('modeling-official')).toBe('modeling')
    expect(inferExamStyle('math-modeling')).toBe('modeling')
  })

  it('returns oa for algo-job/leetcode/oa sources', () => {
    expect(inferExamStyle('algo-job-nowcoder')).toBe('oa')
    expect(inferExamStyle('leetcode')).toBe('oa')
    expect(inferExamStyle('algo-job-oa')).toBe('oa')
  })

  it('returns acm for other sources', () => {
    expect(inferExamStyle('exam-retest-pat')).toBe('acm')
    expect(inferExamStyle('unknown')).toBe('acm')
  })
})

describe('inferEstimatedTime', () => {
  it('returns 20 for easy/oj', () => {
    expect(inferEstimatedTime('easy', 'oj')).toBe(20)
  })

  it('returns 35 for medium/oj', () => {
    expect(inferEstimatedTime('medium', 'oj')).toBe(35)
  })

  it('returns 55 for hard/oj', () => {
    expect(inferEstimatedTime('hard', 'oj')).toBe(55)
  })

  it('adds 15 for simulation mode', () => {
    expect(inferEstimatedTime('easy', 'simulation')).toBe(35)
    expect(inferEstimatedTime('medium', 'simulation')).toBe(50)
  })

  it('adds 25 for data-task/case-study/report-task modes', () => {
    expect(inferEstimatedTime('easy', 'data-task')).toBe(45)
    expect(inferEstimatedTime('medium', 'case-study')).toBe(60)
    expect(inferEstimatedTime('hard', 'report-task')).toBe(80)
  })
})

describe('normalizeOutput', () => {
  it('trims whitespace', () => {
    expect(normalizeOutput('  hello  ')).toBe('hello')
  })

  it('converts CRLF to LF', () => {
    expect(normalizeOutput('a\r\nb\r\nc')).toBe('a\nb\nc')
  })

  it('handles empty string', () => {
    expect(normalizeOutput('')).toBe('')
  })
})

describe('normalizeSql', () => {
  it('removes comments', () => {
    expect(normalizeSql('SELECT 1 -- comment')).toBe('select 1')
  })

  it('normalizes whitespace', () => {
    expect(normalizeSql('SELECT   1   FROM   t')).toBe('select 1 from t')
  })

  it('removes trailing semicolons', () => {
    expect(normalizeSql('SELECT 1;')).toBe('select 1')
  })

  it('converts to lowercase', () => {
    expect(normalizeSql('SELECT 1')).toBe('select 1')
  })

  it('handles complex SQL', () => {
    expect(normalizeSql('  SELECT  *  FROM  t  WHERE  x = 1  ;  ')).toBe(
      'select * from t where x = 1',
    )
  })
})

describe('mergeErrorTypes', () => {
  it('adds status to empty error types', () => {
    expect(mergeErrorTypes(undefined, 'wrong_answer')).toEqual(['wrong_answer'])
  })

  it('adds new status to existing types', () => {
    expect(mergeErrorTypes('["wrong_answer"]', 'timeout')).toEqual(['wrong_answer', 'timeout'])
  })

  it('does not duplicate existing status', () => {
    expect(mergeErrorTypes('["wrong_answer"]', 'wrong_answer')).toEqual(['wrong_answer'])
  })

  it('handles invalid JSON gracefully', () => {
    expect(mergeErrorTypes('not json', 'timeout')).toEqual(['timeout'])
  })

  it('handles non-array JSON', () => {
    expect(mergeErrorTypes('"not_array"', 'timeout')).toEqual(['timeout'])
  })

  it('filters non-string items from array', () => {
    expect(mergeErrorTypes('[1, null, "wrong_answer"]', 'timeout')).toEqual([
      'wrong_answer',
      'timeout',
    ])
  })
})

describe('normalizeProblemSeed', () => {
  it('fills in missing fields from derived source', () => {
    const seed = {
      title: 'Test',
      description: 'Desc',
      difficulty: 'easy' as const,
      tags: ['array'],
      languages: ['python'],
      examples: [],
      test_cases: [],
      starter_code: {},
    }

    const result = normalizeProblemSeed(seed, 'exam-retest-pat')
    expect(result.source).toBe('exam-retest-pat')
    expect(result.tracks).toEqual(['postgrad-retest'])
    expect(result.platform).toBe('pat')
    expect(result.mode).toBe('oj')
    expect(result.exam_style).toBe('acm')
    expect(result.estimated_time).toBe(20)
  })

  it('preserves explicitly set fields', () => {
    const seed = {
      title: 'Test',
      description: 'Desc',
      difficulty: 'medium' as const,
      tags: [],
      languages: [],
      examples: [],
      test_cases: [],
      starter_code: {},
      source: 'leetcode',
      tracks: ['custom-track'],
      platform: 'custom-platform',
      mode: 'simulation',
      exam_style: 'oa',
      estimated_time: 42,
    }

    const result = normalizeProblemSeed(seed, 'builtin')
    expect(result.source).toBe('leetcode')
    expect(result.tracks).toEqual(['custom-track'])
    expect(result.platform).toBe('custom-platform')
    expect(result.mode).toBe('simulation')
    expect(result.exam_style).toBe('oa')
    expect(result.estimated_time).toBe(42)
  })
})
