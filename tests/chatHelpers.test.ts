import { describe, it, expect } from 'vitest'
import {
  extractMemoryCandidates,
  buildSearchTerms,
  BUILTIN_PRESETS,
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
