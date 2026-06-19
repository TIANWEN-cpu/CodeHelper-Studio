import { describe, it, expect } from 'vitest'
import {
  extractMemoryCandidates,
  buildSearchTerms,
  BUILTIN_PRESETS,
  rankMemories,
  recencyWeight,
  parseSqliteTime,
  normalizeForDedup,
  type ScorableMemory,
} from '../electron/utils/chatHelpers'

describe('extractMemoryCandidates', () => {
  it('extracts "记住" pattern', () => {
    const result = extractMemoryCandidates('记住：Python是最好的语言')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Python是最好的语言')
    expect(result[0].category).toBe('fact')
  })

  it('extracts "帮我记住" pattern', () => {
    const result = extractMemoryCandidates('帮我记住这个知识点')
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('fact')
  })

  it('extracts "记一下" pattern', () => {
    const result = extractMemoryCandidates('请记一下：React hooks规则')
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('fact')
  })

  it('extracts "以后" pattern as preference', () => {
    const result = extractMemoryCandidates('以后请用TypeScript回答')
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('preference')
  })

  it('returns empty for non-matching messages', () => {
    expect(extractMemoryCandidates('你好')).toEqual([])
    expect(extractMemoryCandidates('解释一下Python')).toEqual([])
    expect(extractMemoryCandidates('')).toEqual([])
  })

  it('filters matches shorter than 2 chars', () => {
    const result = extractMemoryCandidates('记住：x')
    expect(result).toEqual([])
  })

  it('truncates long content to 300 chars', () => {
    const longContent = 'a'.repeat(500)
    const result = extractMemoryCandidates(`记住：${longContent}`)
    expect(result).toHaveLength(1)
    expect(result[0].content.length).toBeLessThanOrEqual(300)
  })

  it('handles mixed case', () => {
    const result = extractMemoryCandidates('帮我记住：TypeScript')
    expect(result).toHaveLength(1)
  })

  it('handles full-width colon', () => {
    const result = extractMemoryCandidates('记住：test content')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('test content')
  })

  it('extracts identity (我叫…)', () => {
    const result = extractMemoryCandidates('我叫张三')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ content: '张三', category: 'identity' })
  })

  it('extracts identity (我是一名…)', () => {
    const result = extractMemoryCandidates('我是一名后端工程师')
    expect(result[0].category).toBe('identity')
    expect(result[0].content).toBe('后端工程师')
  })

  it('extracts preference (我喜欢…)', () => {
    const result = extractMemoryCandidates('我喜欢函数式编程')
    expect(result[0].category).toBe('preference')
    expect(result[0].content).toBe('函数式编程')
  })

  it('extracts tech stack (我在用…)', () => {
    const result = extractMemoryCandidates('我在用 React 和 TypeScript')
    expect(result[0].category).toBe('tech')
    expect(result[0].content).toBe('React 和 TypeScript')
  })

  it('extracts constraint (不要…)', () => {
    const result = extractMemoryCandidates('不要用中文注释')
    expect(result[0].category).toBe('constraint')
    expect(result[0].content).toBe('用中文注释')
  })

  it('extracts goal (我想学…)', () => {
    const result = extractMemoryCandidates('我想学 Rust')
    expect(result[0].category).toBe('goal')
    expect(result[0].content).toBe('Rust')
  })

  it('extracts English patterns', () => {
    expect(extractMemoryCandidates('remember that the deadline is Friday')[0]).toEqual({
      content: 'the deadline is Friday',
      category: 'fact',
    })
    expect(extractMemoryCandidates('my name is Alice')[0].category).toBe('identity')
    expect(extractMemoryCandidates("don't use var")[0].category).toBe('constraint')
  })

  it('trims trailing punctuation from captured content', () => {
    const result = extractMemoryCandidates('记住：今天要复习。')
    expect(result[0].content).toBe('今天要复习')
  })

  it('does not capture ordinary questions', () => {
    expect(extractMemoryCandidates('解释一下闭包')).toEqual([])
    expect(extractMemoryCandidates('怎么实现快排？')).toEqual([])
  })

  it('caps candidates at 3 per message', () => {
    const result = extractMemoryCandidates('记住：A')
    expect(result.length).toBeLessThanOrEqual(3)
  })
})

describe('normalizeForDedup', () => {
  it('treats punctuation/whitespace/case variants as equal', () => {
    expect(normalizeForDedup('我喜欢 Python。')).toBe(normalizeForDedup('我喜欢python'))
    expect(normalizeForDedup('Hello, World!')).toBe(normalizeForDedup('helloworld'))
  })

  it('keeps distinct content distinct', () => {
    expect(normalizeForDedup('喜欢 Python')).not.toBe(normalizeForDedup('喜欢 Java'))
  })
})

describe('parseSqliteTime', () => {
  it('parses SQLite UTC datetime', () => {
    expect(parseSqliteTime('2026-06-19 12:00:00')).toBe(Date.parse('2026-06-19T12:00:00Z'))
  })

  it('returns NaN for missing/invalid input', () => {
    expect(Number.isNaN(parseSqliteTime(undefined))).toBe(true)
    expect(Number.isNaN(parseSqliteTime(null))).toBe(true)
    expect(Number.isNaN(parseSqliteTime('not a date'))).toBe(true)
  })
})

describe('recencyWeight', () => {
  const now = Date.parse('2026-06-19T12:00:00Z')

  it('is 1 at the current moment', () => {
    expect(recencyWeight(now, now)).toBeCloseTo(1, 5)
  })

  it('decays for older timestamps', () => {
    const oneHourAgo = now - 3_600_000
    const oneDayAgo = now - 24 * 3_600_000
    expect(recencyWeight(oneHourAgo, now)).toBeCloseTo(0.99, 2)
    expect(recencyWeight(oneDayAgo, now)).toBeLessThan(recencyWeight(oneHourAgo, now))
  })

  it('returns 0 for invalid timestamps', () => {
    expect(recencyWeight(NaN, now)).toBe(0)
  })
})

describe('rankMemories', () => {
  const now = Date.parse('2026-06-19T12:00:00Z')
  const mem = (
    over: Partial<ScorableMemory> & { id: number; content: string },
  ): ScorableMemory => ({
    pinned: 0,
    confidence: 1,
    created_at: '2026-06-01 12:00:00',
    last_used_at: null,
    ...over,
  })

  it('ranks relevant memories above irrelevant ones (filtered out)', () => {
    const rows = [
      mem({ id: 1, content: 'Java note' }),
      mem({ id: 2, content: 'Python decorator pattern' }),
    ]
    const result = rankMemories(rows, 'Python', now)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })

  it('breaks ties by recency (recently used ranks higher)', () => {
    const rows = [
      mem({ id: 1, content: 'python tips', last_used_at: '2026-06-10 12:00:00' }),
      mem({ id: 2, content: 'python tips', last_used_at: '2026-06-19 11:00:00' }),
    ]
    const result = rankMemories(rows, 'python', now)
    expect(result[0].id).toBe(2)
  })

  it('breaks ties by importance (confidence) when recency equal', () => {
    const rows = [
      mem({ id: 1, content: 'python tips', confidence: 0.2 }),
      mem({ id: 2, content: 'python tips', confidence: 1 }),
    ]
    const result = rankMemories(rows, 'python', now)
    expect(result[0].id).toBe(2)
  })

  it('always includes pinned memories even without keyword match', () => {
    const rows = [mem({ id: 1, content: 'unrelated', pinned: 1 })]
    const result = rankMemories(rows, 'totally different', now)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('falls back to at most 3 memories when nothing matches', () => {
    const rows = [
      mem({ id: 1, content: 'aaa' }),
      mem({ id: 2, content: 'bbb' }),
      mem({ id: 3, content: 'ccc' }),
      mem({ id: 4, content: 'ddd' }),
    ]
    const result = rankMemories(rows, 'zzzzz', now)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('respects the limit parameter', () => {
    const rows = Array.from({ length: 20 }, (_, i) => mem({ id: i + 1, content: `python ${i}` }))
    expect(rankMemories(rows, 'python', now, 5)).toHaveLength(5)
  })
})

describe('buildSearchTerms', () => {
  it('splits on whitespace', () => {
    const terms = buildSearchTerms('Python decorators')
    expect(terms).toContain('python')
    expect(terms).toContain('decorators')
  })

  it('adds compact form (whitespace removed)', () => {
    const terms = buildSearchTerms('hello world')
    expect(terms).toContain('helloworld')
  })

  it('filters terms shorter than 2 chars', () => {
    const terms = buildSearchTerms('a b cd ef')
    expect(terms).not.toContain('a')
    expect(terms).not.toContain('b')
    expect(terms).toContain('cd')
    expect(terms).toContain('ef')
  })

  it('converts to lowercase', () => {
    const terms = buildSearchTerms('Python JAVA')
    expect(terms).toContain('python')
    expect(terms).toContain('java')
  })

  it('handles Chinese text', () => {
    const terms = buildSearchTerms('Python装饰器模式')
    expect(terms.length).toBeGreaterThan(0)
  })

  it('handles empty input', () => {
    const terms = buildSearchTerms('')
    expect(terms).toEqual([])
  })

  it('handles punctuation-only input (compact form preserved)', () => {
    const terms = buildSearchTerms('!@#$%')
    // "!" splits the string, creating "@#$%" as a split term
    // The compact form "!@#$%" is also added
    expect(terms.length).toBeGreaterThanOrEqual(1)
    expect(terms).toContain('!@#$%')
  })

  it('splits on various punctuation', () => {
    const terms = buildSearchTerms('hello,world;test:case')
    expect(terms).toContain('hello')
    expect(terms).toContain('world')
    expect(terms).toContain('test')
    expect(terms).toContain('case')
  })

  it('deduplicates terms', () => {
    const terms = buildSearchTerms('hello hello hello')
    const helloCount = terms.filter((t) => t === 'hello').length
    expect(helloCount).toBe(1)
  })
})

describe('BUILTIN_PRESETS', () => {
  it('contains exactly 4 presets', () => {
    expect(BUILTIN_PRESETS).toHaveLength(4)
  })

  it('has name and prompt for each preset', () => {
    for (const preset of BUILTIN_PRESETS) {
      expect(typeof preset.name).toBe('string')
      expect(preset.name.length).toBeGreaterThan(0)
      expect(typeof preset.prompt).toBe('string')
      expect(preset.prompt.length).toBeGreaterThan(0)
    }
  })

  it('includes expected preset names', () => {
    const names = BUILTIN_PRESETS.map((p) => p.name)
    expect(names).toContain('通用助手')
    expect(names).toContain('代码专家')
    expect(names).toContain('面试官')
    expect(names).toContain('学习导师')
  })
})
