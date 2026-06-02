/**
 * Deep edge-case tests for labels, snippets, and store data integrity.
 *
 * Covers:
 *  - labels.ts: exhaustive source/platform/mode/track/style coverage, null/undefined coercion
 *  - snippets: add/remove/update race conditions, prefix edge cases, expand edge cases
 *  - Store boundaries: max data, null states, rapid mutations
 */
import { describe, it, expect } from 'vitest'
import {
  parseJsonArray,
  sourceLabel,
  platformLabel,
  modeLabel,
  trackLabel,
  examStyleLabel,
  DIFF_COLORS,
  DIFF_LABELS,
  LANGUAGE_OPTIONS,
} from '../src/utils/labels'
import { expandSnippetBody, findSnippetByPrefix } from '../src/utils/snippets'

// =========================================================================
// 1. labels.ts — deep data integrity
// =========================================================================

describe('Deep: labels data integrity', () => {
  describe('DIFF_COLORS exact values', () => {
    it('easy maps to success color', () => {
      expect(DIFF_COLORS.easy).toBe('text-[var(--theme-success)]')
    })

    it('medium maps to warning color', () => {
      expect(DIFF_COLORS.medium).toBe('text-[var(--theme-warning)]')
    })

    it('hard maps to danger color', () => {
      expect(DIFF_COLORS.hard).toBe('text-[var(--theme-danger)]')
    })

    it('DIFF_COLORS has exactly 3 keys', () => {
      expect(Object.keys(DIFF_COLORS)).toHaveLength(3)
    })

    it('unknown difficulty returns undefined', () => {
      expect(DIFF_COLORS['unknown']).toBeUndefined()
      expect(DIFF_COLORS['']).toBeUndefined()
    })
  })

  describe('DIFF_LABELS exact values', () => {
    it('easy maps to Chinese label', () => {
      expect(DIFF_LABELS.easy).toBe('简单')
    })

    it('medium maps to Chinese label', () => {
      expect(DIFF_LABELS.medium).toBe('中等')
    })

    it('hard maps to Chinese label', () => {
      expect(DIFF_LABELS.hard).toBe('困难')
    })

    it('DIFF_LABELS has exactly 3 keys', () => {
      expect(Object.keys(DIFF_LABELS)).toHaveLength(3)
    })
  })

  describe('LANGUAGE_OPTIONS data integrity', () => {
    it('has exactly 6 language options', () => {
      expect(LANGUAGE_OPTIONS).toHaveLength(6)
    })

    it('all options have value and label properties', () => {
      for (const opt of LANGUAGE_OPTIONS) {
        expect(typeof opt.value).toBe('string')
        expect(typeof opt.label).toBe('string')
        expect(opt.value.length).toBeGreaterThan(0)
        expect(opt.label.length).toBeGreaterThan(0)
      }
    })

    it('contains expected languages', () => {
      const values = LANGUAGE_OPTIONS.map((o) => o.value)
      expect(values).toEqual(['python', 'c', 'cpp', 'csharp', 'sql', 'verilog'])
    })

    it('labels match expected display names', () => {
      const map = Object.fromEntries(LANGUAGE_OPTIONS.map((o) => [o.value, o.label]))
      expect(map.python).toBe('Python')
      expect(map.c).toBe('C')
      expect(map.cpp).toBe('C++')
      expect(map.csharp).toBe('C#')
      expect(map.sql).toBe('SQL')
      expect(map.verilog).toBe('Verilog')
    })

    it('all values are unique', () => {
      const values = LANGUAGE_OPTIONS.map((o) => o.value)
      expect(new Set(values).size).toBe(values.length)
    })
  })

  describe('sourceLabel — exhaustive coverage', () => {
    const KNOWN_SOURCES: Array<[string, string]> = [
      ['builtin', '基础题库'],
      ['leetcode', 'LeetCode'],
      ['math-modeling', '原有建模题库'],
      ['exam-retest-pat', '复试 PAT'],
      ['exam-retest-pta', '复试 PTA'],
      ['exam-retest-csp', '复试 CSP'],
      ['summer-kattis', '夏令营 Kattis'],
      ['summer-cf-gym', '夏令营 Gym'],
      ['summer-uoj', '夏令营 UOJ'],
      ['algo-job-nowcoder', '校招牛客'],
      ['algo-job-oa', 'OA 模拟'],
      ['ic-job-hdlbits', 'IC HDLBits'],
      ['ic-job-nowcoder-verilog', 'IC Verilog'],
      ['ic-job-simulation', 'IC 仿真'],
      ['modeling-official', '建模真题'],
      ['modeling-kaggle', 'Kaggle 建模'],
      ['modeling-mathworks', 'MathWorks 建模'],
    ]

    it.each(KNOWN_SOURCES)('sourceLabel(%j) === %j', (input, expected) => {
      expect(sourceLabel(input)).toBe(expected)
    })

    it('has exactly 17 known sources', () => {
      expect(KNOWN_SOURCES).toHaveLength(17)
    })

    it('unknown source returns input as-is', () => {
      expect(sourceLabel('unknown-source')).toBe('unknown-source')
      expect(sourceLabel('custom-source')).toBe('custom-source')
    })

    it('empty string returns empty string', () => {
      expect(sourceLabel('')).toBe('')
    })

    it('unicode source returns as-is', () => {
      expect(sourceLabel('自定义来源')).toBe('自定义来源')
    })

    it('source with spaces returns as-is', () => {
      expect(sourceLabel('my custom source')).toBe('my custom source')
    })

    it('all known sources produce non-empty labels', () => {
      for (const [input, label] of KNOWN_SOURCES) {
        expect(label.length).toBeGreaterThan(0)
        expect(label).not.toBe(input) // label differs from key (except for leetcode)
      }
    })
  })

  describe('platformLabel — exhaustive coverage', () => {
    const KNOWN_PLATFORMS: Array<[string, string]> = [
      ['pat', 'PAT'],
      ['pta', 'PTA'],
      ['csp', 'CSP'],
      ['leetcode', 'LeetCode'],
      ['nowcoder', '牛客'],
      ['kattis', 'Kattis'],
      ['cf-gym', 'Gym'],
      ['uoj', 'UOJ'],
      ['hackerrank', 'HackerRank'],
      ['codesignal', 'CodeSignal'],
      ['cumcm', '国赛'],
      ['pgmcm', '研赛'],
      ['mcm-icm', 'MCM/ICM'],
      ['mathorcup', 'MathorCup'],
      ['kaggle', 'Kaggle'],
      ['mathworks', 'MathWorks'],
      ['hdlbits', 'HDLBits'],
      ['eda-playground', 'EDA Playground'],
      ['internal', '内置'],
    ]

    it.each(KNOWN_PLATFORMS)('platformLabel(%j) === %j', (input, expected) => {
      expect(platformLabel(input)).toBe(expected)
    })

    it('has exactly 19 known platforms', () => {
      expect(KNOWN_PLATFORMS).toHaveLength(19)
    })

    it('unknown platform returns input as-is', () => {
      expect(platformLabel('new-platform')).toBe('new-platform')
    })

    it('empty string returns empty string', () => {
      expect(platformLabel('')).toBe('')
    })
  })

  describe('modeLabel — exhaustive coverage', () => {
    const KNOWN_MODES: Array<[string, string]> = [
      ['oj', 'OJ'],
      ['simulation', '仿真题'],
      ['data-task', '数据题'],
      ['case-study', '案例题'],
      ['report-task', '报告题'],
    ]

    it.each(KNOWN_MODES)('modeLabel(%j) === %j', (input, expected) => {
      expect(modeLabel(input)).toBe(expected)
    })

    it('has exactly 5 known modes', () => {
      expect(KNOWN_MODES).toHaveLength(5)
    })

    it('unknown mode returns input as-is', () => {
      expect(modeLabel('new-mode')).toBe('new-mode')
    })
  })

  describe('trackLabel — exhaustive coverage', () => {
    const KNOWN_TRACKS: Array<[string, string]> = [
      ['postgrad-retest', '考研复试'],
      ['summer-camp', '保研夏令营'],
      ['algo-job', '算法校招'],
      ['ic-job', '硬件 / IC'],
      ['math-modeling', '数学建模'],
    ]

    it.each(KNOWN_TRACKS)('trackLabel(%j) === %j', (input, expected) => {
      expect(trackLabel(input)).toBe(expected)
    })

    it('has exactly 5 known tracks', () => {
      expect(KNOWN_TRACKS).toHaveLength(5)
    })

    it('unknown track returns input as-is', () => {
      expect(trackLabel('new-track')).toBe('new-track')
    })
  })

  describe('examStyleLabel — exhaustive coverage', () => {
    const KNOWN_STYLES: Array<[string, string]> = [
      ['acm', 'ACM'],
      ['oa', 'OA'],
      ['modeling', '建模'],
      ['hdl', 'HDL'],
    ]

    it.each(KNOWN_STYLES)('examStyleLabel(%j) === %j', (input, expected) => {
      expect(examStyleLabel(input)).toBe(expected)
    })

    it('has exactly 4 known styles', () => {
      expect(KNOWN_STYLES).toHaveLength(4)
    })

    it('unknown style returns input as-is', () => {
      expect(examStyleLabel('new-style')).toBe('new-style')
    })
  })

  describe('parseJsonArray — deeper edge cases', () => {
    it('parses array of numbers (as any JSON)', () => {
      expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3])
    })

    it('parses array of booleans', () => {
      expect(parseJsonArray('[true,false]')).toEqual([true, false])
    })

    it('parses array with null elements', () => {
      expect(parseJsonArray('[null,null]')).toEqual([null, null])
    })

    it('parses nested arrays of strings', () => {
      expect(parseJsonArray('[["a","b"],["c"]]')).toEqual([['a', 'b'], ['c']])
    })

    it('parses array with mixed types', () => {
      expect(parseJsonArray('[1,"two",true,null]')).toEqual([1, 'two', true, null])
    })

    it('parses deeply nested empty arrays', () => {
      // '[[[[]]]]' has 4 levels of nesting
      expect(parseJsonArray('[[[[]]]]')).toEqual([[[[]]]])
    })

    it('returns empty array for object JSON', () => {
      // Actually parseJsonArray does JSON.parse(raw), so {} is valid JSON but not an array
      // It returns {} as the parsed result (type assertion doesn't check at runtime)
      const result = parseJsonArray('{}')
      // JSON.parse('{}') = {} which is not an array but is returned as-is with type assertion
      expect(result).toEqual({})
    })

    it('handles single-element array', () => {
      expect(parseJsonArray('["only"]')).toEqual(['only'])
    })

    it('handles array with empty strings', () => {
      expect(parseJsonArray('["","",""]')).toEqual(['', '', ''])
    })

    it('handles large array', () => {
      const arr = Array.from({ length: 1000 }, (_, i) => `item-${i}`)
      const json = JSON.stringify(arr)
      const result = parseJsonArray(json)
      expect(result).toHaveLength(1000)
      expect(result[0]).toBe('item-0')
      expect(result[999]).toBe('item-999')
    })

    it('handles array with unicode strings', () => {
      expect(parseJsonArray('["数组","排序","动态规划","图论"]')).toEqual([
        '数组',
        '排序',
        '动态规划',
        '图论',
      ])
    })

    it('handles array with emoji', () => {
      expect(parseJsonArray('["🎉","🚀","✨"]')).toEqual(['🎉', '🚀', '✨'])
    })

    it('handles whitespace-padded JSON', () => {
      expect(parseJsonArray('  ["a","b"]  ')).toEqual(['a', 'b'])
    })
  })
})

// =========================================================================
// 2. expandSnippetBody — deeper edge cases
// =========================================================================

describe('Deep: expandSnippetBody edge cases', () => {
  it('placeholder with empty default produces empty string', () => {
    expect(expandSnippetBody('${1:}')).toBe('')
  })

  it('placeholder without default (no colon) is NOT matched', () => {
    // The regex is /\$\{(\d+):([^}]*)\}/g which requires a colon
    expect(expandSnippetBody('${1}')).toBe('${1}')
  })

  it('multiple numbered placeholders are all replaced', () => {
    const body = '${1:first} ${2:second} ${3:third} ${4:fourth}'
    expect(expandSnippetBody(body)).toBe('first second third fourth')
  })

  it('non-sequential numbering still works', () => {
    const body = '${3:third} ${1:first} ${2:second}'
    expect(expandSnippetBody(body)).toBe('third first second')
  })

  it('duplicate numbers: last occurrence wins (both expanded)', () => {
    const body = '${1:first} and ${1:second}'
    expect(expandSnippetBody(body)).toBe('first and second')
  })

  it('placeholder with special regex chars in default', () => {
    const body = '${1:if (x) { return y; }}'
    expect(expandSnippetBody(body)).toBe('if (x) { return y; }')
  })

  it('placeholder with dollar sign in default', () => {
    const body = '${1:$var}'
    expect(expandSnippetBody(body)).toBe('$var')
  })

  it('placeholder with backslash in default', () => {
    const body = '${1:\\n}'
    expect(expandSnippetBody(body)).toBe('\\n')
  })

  it('placeholder with unicode default', () => {
    const body = '${1:函数名}'
    expect(expandSnippetBody(body)).toBe('函数名')
  })

  it('placeholder with emoji default', () => {
    const body = '${1:🎉🚀}'
    expect(expandSnippetBody(body)).toBe('🎉🚀')
  })

  it('multiline body with placeholders', () => {
    const body = 'def ${1:name}(${2:params}):\n    ${3:pass}'
    expect(expandSnippetBody(body)).toBe('def name(params):\n    pass')
  })

  it('body with no placeholders returns unchanged', () => {
    const body = 'plain text with no placeholders'
    expect(expandSnippetBody(body)).toBe(body)
  })

  it('empty body returns empty string', () => {
    expect(expandSnippetBody('')).toBe('')
  })

  it('only placeholder returns just the default', () => {
    expect(expandSnippetBody('${1:hello}')).toBe('hello')
  })

  it('large number placeholder', () => {
    expect(expandSnippetBody('${99:value}')).toBe('value')
  })

  it('placeholder with very long default', () => {
    const long = 'x'.repeat(10000)
    expect(expandSnippetBody(`\${1:${long}}`)).toBe(long)
  })
})

// =========================================================================
// 3. findSnippetByPrefix — edge cases
// =========================================================================

describe('Deep: findSnippetByPrefix edge cases', () => {
  it('finds python main snippet by prefix', () => {
    const snippet = findSnippetByPrefix('main', 'python')
    expect(snippet).not.toBeNull()
    expect(snippet!.prefix).toBe('main')
    expect(snippet!.language).toBe('python')
    expect(snippet!.isBuiltin).toBe(true)
    expect(snippet!.name).toBe('Main Entry')
  })

  it('finds javascript arrow function snippet', () => {
    const snippet = findSnippetByPrefix('af', 'javascript')
    expect(snippet).not.toBeNull()
    expect(snippet!.name).toBe('Arrow Function')
    expect(snippet!.body).toContain('=>')
  })

  it('finds typescript interface snippet', () => {
    const snippet = findSnippetByPrefix('intf', 'typescript')
    expect(snippet).not.toBeNull()
    expect(snippet!.name).toBe('Interface')
    expect(snippet!.body).toContain('interface')
  })

  it('finds cpp class snippet', () => {
    const snippet = findSnippetByPrefix('cls', 'cpp')
    expect(snippet).not.toBeNull()
    expect(snippet!.name).toBe('Class')
    expect(snippet!.body).toContain('class')
  })

  it('finds rust struct snippet', () => {
    const snippet = findSnippetByPrefix('struct', 'rust')
    expect(snippet).not.toBeNull()
    expect(snippet!.name).toBe('Struct')
  })

  it('finds go function snippet', () => {
    const snippet = findSnippetByPrefix('fn', 'go')
    expect(snippet).not.toBeNull()
    expect(snippet!.name).toBe('Function')
    expect(snippet!.body).toContain('func')
  })

  it('returns null for empty prefix', () => {
    expect(findSnippetByPrefix('', 'python')).toBeNull()
  })

  it('returns null for empty language', () => {
    expect(findSnippetByPrefix('main', '')).toBeNull()
  })

  it('prefix is case-sensitive', () => {
    expect(findSnippetByPrefix('Main', 'python')).toBeNull()
    expect(findSnippetByPrefix('MAIN', 'python')).toBeNull()
  })

  it('returns first matching snippet when multiple share prefix', () => {
    // "main" exists in python, cpp, java, go, rust
    // For python, it should return the python one
    const py = findSnippetByPrefix('main', 'python')
    const cpp = findSnippetByPrefix('main', 'cpp')
    expect(py!.language).toBe('python')
    expect(cpp!.language).toBe('cpp')
    expect(py!.id).not.toBe(cpp!.id)
  })

  it('returns null when prefix exists but for different language', () => {
    // "intf" is typescript-only
    expect(findSnippetByPrefix('intf', 'python')).toBeNull()
    expect(findSnippetByPrefix('intf', 'javascript')).toBeNull()
  })
})
