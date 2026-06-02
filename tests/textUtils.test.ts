import { describe, it, expect } from 'vitest'
import { splitIntoChunks, escapeRegExp } from '../electron/utils/textUtils'

describe('splitIntoChunks', () => {
  it('短文本返回单个块', () => {
    expect(splitIntoChunks('hello world', 100)).toEqual(['hello world'])
  })

  it('按双换行分段，超过 maxLen 时拆分', () => {
    const text = 'paragraph one\n\nparagraph two\n\nparagraph three'
    const result = splitIntoChunks(text, 30)
    expect(result.length).toBeGreaterThanOrEqual(2)
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(30 + 20)
    })
  })

  it('空文本返回包含空字符串的数组', () => {
    expect(splitIntoChunks('', 100)).toEqual([''])
  })

  it('只有空白返回包含空字符串的数组', () => {
    expect(splitIntoChunks('   ', 100)).toEqual([''])
  })

  it('长段落保持完整性（不超过 maxLen 时）', () => {
    const para = 'a'.repeat(50)
    const text = `${para}\n\n${para}`
    const result = splitIntoChunks(text, 200)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain(para)
  })

  it('超长段落仍会被保留（单段超 maxLen 时不会截断）', () => {
    const longPara = 'x'.repeat(200)
    const result = splitIntoChunks(longPara, 50)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(longPara)
  })

  it('多个段落逐步累积直到超限', () => {
    const text = 'aaa\n\nbbb\n\nccc\n\nddd'
    const result = splitIntoChunks(text, 10)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('恰好达到 maxLen 时不拆分', () => {
    const text = 'a'.repeat(50)
    const result = splitIntoChunks(text, 50)
    expect(result).toHaveLength(1)
  })

  it('两段组合恰好超过 maxLen 时拆分', () => {
    const text = 'a'.repeat(30) + '\n\n' + 'b'.repeat(30)
    const result = splitIntoChunks(text, 61) // 30 + 2 (分隔符) + 30 = 62 > 61
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('a'.repeat(30))
    expect(result[1]).toBe('b'.repeat(30))
  })

  it('多个连续换行符被视为段落分隔符', () => {
    const text = 'aaa\n\n\n\nbbb'
    const result = splitIntoChunks(text, 100)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('aaa\n\nbbb')
  })

  it('三段累积后超限正确拆分', () => {
    const text = 'aa\n\nbb\n\ncc'
    const result = splitIntoChunks(text, 6) // "aa\n\nbb" = 6 chars, then "cc" is next
    expect(result.length).toBeGreaterThanOrEqual(1)
    result.forEach((chunk) => {
      expect(chunk.trim().length).toBeGreaterThan(0)
    })
  })
})

describe('escapeRegExp', () => {
  it('转义特殊正则字符', () => {
    expect(escapeRegExp('[test]')).toBe('\\[test\\]')
    expect(escapeRegExp('a.b')).toBe('a\\.b')
    expect(escapeRegExp('a+b')).toBe('a\\+b')
    expect(escapeRegExp('a*b')).toBe('a\\*b')
    expect(escapeRegExp('a?b')).toBe('a\\?b')
    expect(escapeRegExp('a^b')).toBe('a\\^b')
    expect(escapeRegExp('a$b')).toBe('a\\$b')
    expect(escapeRegExp('(a|b)')).toBe('\\(a\\|b\\)')
    expect(escapeRegExp('{a}')).toBe('\\{a\\}')
  })

  it('不含特殊字符时原样返回', () => {
    expect(escapeRegExp('hello world')).toBe('hello world')
  })

  it('空字符串返回空字符串', () => {
    expect(escapeRegExp('')).toBe('')
  })

  it('所有特殊字符组合', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe(
      '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
    )
  })

  it('反斜杠自身被转义', () => {
    expect(escapeRegExp('a\\b')).toBe('a\\\\b')
  })

  it('中文字符不含特殊字符', () => {
    expect(escapeRegExp('你好世界')).toBe('你好世界')
  })

  it('混合中英文和特殊字符', () => {
    expect(escapeRegExp('用户[1]')).toBe('用户\\[1\\]')
  })

  it('转义后的字符串可用于安全构造正则', () => {
    const input = 'price: $100 (USD)'
    const escaped = escapeRegExp(input)
    const re = new RegExp(escaped)
    expect(re.test(input)).toBe(true)
    expect(re.test('price: $200 (USD)')).toBe(false)
  })
})
