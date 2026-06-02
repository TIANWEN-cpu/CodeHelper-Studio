import { describe, bench } from 'vitest'
import {
  inferSourceFromFile,
  inferTracksFromSource,
  inferPlatformFromSource,
  normalizeOutput,
  normalizeSql,
  mergeErrorTypes,
  normalizeProblemSeed,
  ProblemSeed,
} from '../../electron/utils/problemMeta'

describe('inferSourceFromFile', () => {
  const files = [
    'basic.json',
    'leetcode.json',
    'math-modeling.json',
    'pat-2024-spring.json',
    'csp-2023.json',
    'custom-problem-set.json',
  ]

  bench('6 个文件名推断', () => {
    for (const f of files) {
      inferSourceFromFile(f)
    }
  })
})

describe('inferTracksFromSource', () => {
  const sources = [
    'exam-retest-2024',
    'summer-camp-2024',
    'algo-job-interview',
    'ic-job-prep',
    'math-modeling',
    'leetcode',
    'basic',
  ]

  bench('7 个 source 推断 tracks', () => {
    for (const s of sources) {
      inferTracksFromSource(s)
    }
  })
})

describe('inferPlatformFromSource', () => {
  const sources = [
    'pat-2024',
    'pta-2023',
    'csp-2023',
    'kattis-set',
    'cf-gym-100',
    'uoj-contest',
    'nowcoder-round',
    'oa-amazon',
    'hdlbits-basics',
    'simulation-verilog',
    'official-cumcm',
    'kaggle-titanic',
    'mathworks-challenge',
    'leetcode',
    'math-modeling',
    'basic',
  ]

  bench('16 个 source 推断 platform', () => {
    for (const s of sources) {
      inferPlatformFromSource(s)
    }
  })
})

describe('normalizeSql', () => {
  const simpleSql = 'SELECT * FROM users WHERE id = 1;'
  const complexSql = `
    -- 这是一条注释
    SELECT u.id, u.name, COUNT(o.id) AS cnt
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.name LIKE '%test%'
    GROUP BY u.id
    HAVING COUNT(o.id) > 5
    ORDER BY cnt DESC;
  `

  bench('简单 SQL 标准化', () => {
    normalizeSql(simpleSql)
  })

  bench('复杂 SQL 标准化（含注释、多余空白）', () => {
    normalizeSql(complexSql)
  })
})

describe('normalizeOutput', () => {
  bench('短输出标准化', () => {
    normalizeOutput('  Hello World\r\n  ')
  })

  bench('长输出标准化（含 \\r\\n）', () => {
    normalizeOutput('  ' + 'Line content here\r\n'.repeat(100) + '  ')
  })
})

describe('mergeErrorTypes', () => {
  bench('已解析数组追加新类型', () => {
    mergeErrorTypes('["timeout","oom"]', 'crash')
  })

  bench('undefined 输入', () => {
    mergeErrorTypes(undefined, 'error')
  })

  bench('无效 JSON 输入', () => {
    mergeErrorTypes('not-json', 'fallback')
  })

  bench('类型已存在（去重）', () => {
    mergeErrorTypes('["timeout","crash"]', 'crash')
  })
})

describe('normalizeProblemSeed — 全链路推断', () => {
  const minimalSeed: ProblemSeed = {
    title: 'Two Sum',
    description: 'Given an array...',
    difficulty: 'easy',
    tags: ['array'],
    languages: ['python'],
    examples: [{ input: '[2,7,11,15], 9', output: '[0,1]' }],
    test_cases: [{ input: '[2,7,11,15], 9', expected: '[0,1]' }],
    starter_code: { python: 'def twoSum(): pass' },
  }

  const fullSeed: ProblemSeed = {
    ...minimalSeed,
    source: 'algo-job-interview',
    tracks: ['algo-job'],
    platform: 'leetcode',
    mode: 'oj',
    exam_style: 'oa',
    estimated_time: 20,
  }

  bench('最小种子（全字段推断）', () => {
    normalizeProblemSeed(minimalSeed, 'leetcode.json')
  })

  bench('完整种子（跳过推断）', () => {
    normalizeProblemSeed(fullSeed, 'leetcode.json')
  })

  bench('100 个最小种子批量推断', () => {
    for (let i = 0; i < 100; i++) {
      normalizeProblemSeed(minimalSeed, 'basic.json')
    }
  })
})
