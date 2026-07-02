// exercises.ts 顶层 import electron + db（IPC 注册）。我们只测导出的纯函数，
// 故 mock 掉这些副作用依赖，让模块可被加载（registerExercisesIPC 不会被调用）。
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../electron/db/index', () => ({ getDB: vi.fn() }))

import { describe, it, expect } from 'vitest'
import {
  isProblemTestCase,
  parseStarterCode,
  difficultyLabel,
  checkKeywords,
  languageForTrack,
  buildPythonTestHarness,
} from '../electron/ipc/exercises'

describe('isProblemTestCase', () => {
  it('接受含 input 与 expected 字符串的对象', () => {
    expect(isProblemTestCase({ input: '1 2', expected: '3' })).toBe(true)
  })

  it('拒绝缺失字段的对象', () => {
    expect(isProblemTestCase({ input: '1' })).toBe(false)
    expect(isProblemTestCase({ expected: '3' })).toBe(false)
  })

  it('拒绝字段类型错误的对象（数字/布尔）', () => {
    expect(isProblemTestCase({ input: 1, expected: '3' })).toBe(false)
    expect(isProblemTestCase({ input: '1', expected: true })).toBe(false)
  })

  it('拒绝非对象（null/数组/原始值）', () => {
    expect(isProblemTestCase(null)).toBe(false)
    expect(isProblemTestCase(undefined)).toBe(false)
    expect(isProblemTestCase('x')).toBe(false)
    expect(isProblemTestCase(['a', 'b'])).toBe(false) // 数组虽 typeof object，但无正确字段
  })
})

describe('parseStarterCode', () => {
  it('空/null/undefined 返回空串', () => {
    expect(parseStarterCode(null)).toBe('')
    expect(parseStarterCode(undefined)).toBe('')
    expect(parseStarterCode('')).toBe('')
  })

  it('JSON 字符串直接返回', () => {
    expect(parseStarterCode('"def solve(): pass"')).toBe('def solve(): pass')
  })

  it('对象优先取 preferredLanguage 字段', () => {
    const raw = JSON.stringify({ python: 'py-code', cpp: 'cpp-code' })
    expect(parseStarterCode(raw, 'cpp')).toBe('cpp-code')
  })

  it('对象缺 preferredLanguage 时回退 python', () => {
    const raw = JSON.stringify({ python: 'py-code', javascript: 'js-code' })
    expect(parseStarterCode(raw, 'rust')).toBe('py-code')
  })

  it('对象既无 preferred 也无 python 时取第一个值', () => {
    const raw = JSON.stringify({ java: 'java-code' })
    expect(parseStarterCode(raw, 'rust')).toBe('java-code')
  })

  it('对象值非字符串时返回空', () => {
    const raw = JSON.stringify({ python: 123 })
    expect(parseStarterCode(raw)).toBe('')
  })

  it('非合法 JSON 时原样返回 raw', () => {
    expect(parseStarterCode('not json, just code')).toBe('not json, just code')
  })
})

describe('difficultyLabel', () => {
  it('easy → 基础', () => {
    expect(difficultyLabel('easy')).toBe('基础')
  })

  it('medium → 进阶', () => {
    expect(difficultyLabel('medium')).toBe('进阶')
  })

  it('hard → 综合', () => {
    expect(difficultyLabel('hard')).toBe('综合')
  })

  it('未知难度原样返回', () => {
    expect(difficultyLabel('extreme')).toBe('extreme')
    expect(difficultyLabel('')).toBe('')
  })
})

describe('checkKeywords', () => {
  it('所有必需关键字都在、无禁止关键字时通过', () => {
    const r = checkKeywords('def solve():\n    return 42', ['def', 'return'], ['exec'])
    expect(r.passed).toBe(true)
    expect(r.feedback_lines).toEqual([])
  })

  it('缺少必需关键字时给出反馈且不通过', () => {
    const r = checkKeywords('x = 1', ['def', 'class'], [])
    expect(r.passed).toBe(false)
    expect(r.feedback_lines).toContain('缺少必需关键字: def')
    expect(r.feedback_lines).toContain('缺少必需关键字: class')
  })

  it('出现禁止关键字时不通过', () => {
    const r = checkKeywords('import os; os.system("rm")', [], ['os.system'])
    expect(r.passed).toBe(false)
    expect(r.feedback_lines).toContain('使用了禁止的关键字: os.system')
  })

  it('必需关键字大小写不敏感', () => {
    const r = checkKeywords('DEF Solve(): pass', ['def'], [])
    expect(r.passed).toBe(true)
  })

  it('禁止关键字大小写不敏感', () => {
    const r = checkKeywords('EXEC(x)', [], ['exec'])
    expect(r.passed).toBe(false)
  })

  it('空约束直接通过', () => {
    expect(checkKeywords('any code', [], []).passed).toBe(true)
  })

  it('同时缺必需又含禁止时两类反馈都给出', () => {
    const r = checkKeywords('eval(x)', ['def'], ['eval'])
    expect(r.passed).toBe(false)
    expect(r.feedback_lines).toHaveLength(2)
  })
})

describe('languageForTrack', () => {
  it('python/integration 轨道 → python', () => {
    expect(languageForTrack('python')).toBe('python')
    expect(languageForTrack('integration')).toBe('python')
  })

  it('database 轨道 → sql', () => {
    expect(languageForTrack('database')).toBe('sql')
  })

  it('c / csharp 轨道各自映射', () => {
    expect(languageForTrack('c')).toBe('c')
    expect(languageForTrack('csharp')).toBe('csharp')
  })

  it('未知轨道回退 python', () => {
    expect(languageForTrack('rust')).toBe('python')
    expect(languageForTrack('')).toBe('python')
  })
})

describe('buildPythonTestHarness', () => {
  it('包含结果标记前缀，供运行器解析', () => {
    const harness = buildPythonTestHarness('x=1', [{ expression: 'x', expected: 1 }])
    expect(harness).toContain('__EXERCISE_RESULT__')
  })

  it('内嵌用户代码', () => {
    const harness = buildPythonTestHarness('def add(a,b): return a+b', [])
    expect(harness).toContain('def add(a,b): return a+b')
  })

  it('测试数据被双重 JSON 转义（防注入：测试表达式里的引号不会破坏 Python 源）', () => {
    const harness = buildPythonTestHarness('x=1', [
      { expression: 'x', expected: 'ha"; inject = 1 #' },
    ])
    // 测试 JSON 经 JSON.stringify 后是合法 Python 字符串字面量，
    // 恶意内容被封装在字符串内，不会被当成 Python 代码执行。
    expect(harness).toContain('json.loads(')
    // 原始恶意串不应以"裸代码"形式出现（应在转义后的 JSON 内）
    expect(harness).not.toMatch(/inject\s*=\s*1\s*#\s*$/m)
  })

  it('多个测试都被序列化进 harness', () => {
    const harness = buildPythonTestHarness('x=1', [
      { expression: 'x', expected: 1 },
      { expression: 'x+1', expected: 2 },
    ])
    expect(harness).toContain('"expression":"x"')
    expect(harness).toContain('"expression":"x+1"')
  })

  it('空测试列表仍生成合法 harness', () => {
    const harness = buildPythonTestHarness('x=1', [])
    expect(harness).toContain('json.loads(')
    expect(harness).toContain('__EXERCISE_RESULT__')
  })
})
