import { describe, it, expect } from 'vitest'
import { splitIntoChunks, escapeRegExp } from '../electron/utils/textUtils'

describe('splitIntoChunks', () => {
  it('splits text by double newlines respecting max length', () => {
    const text = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3'
    const chunks = splitIntoChunks(text, 50)
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.join('\n\n')).toContain('Paragraph')
  })

  it('returns single chunk for short text', () => {
    const chunks = splitIntoChunks('Hello', 500)
    expect(chunks).toEqual(['Hello'])
  })

  it('returns empty string chunk for empty input', () => {
    const chunks = splitIntoChunks('', 500)
    expect(chunks).toEqual([''])
  })

  it('combines small paragraphs under max length', () => {
    const text = 'A\n\nB\n\nC'
    const chunks = splitIntoChunks(text, 100)
    expect(chunks).toEqual(['A\n\nB\n\nC'])
  })

  it('splits large paragraphs that exceed limit', () => {
    const bigPara = 'X'.repeat(200)
    const text = bigPara + '\n\n' + bigPara
    const chunks = splitIntoChunks(text, 150)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe(bigPara)
    expect(chunks[1]).toBe(bigPara)
  })

  it('starts new chunk when adding paragraph exceeds limit', () => {
    const text = 'A'.repeat(80) + '\n\n' + 'B'.repeat(80)
    const chunks = splitIntoChunks(text, 100)
    expect(chunks).toHaveLength(2)
  })
})

describe('escapeRegExp', () => {
  it('escapes dot', () => {
    expect(escapeRegExp('hello.world')).toBe('hello\\.world')
  })

  it('escapes plus and star', () => {
    expect(escapeRegExp('a+b*c')).toBe('a\\+b\\*c')
  })

  it('escapes brackets', () => {
    expect(escapeRegExp('[test]')).toBe('\\[test\\]')
  })

  it('escapes parentheses', () => {
    expect(escapeRegExp('(group)')).toBe('\\(group\\)')
  })

  it('escapes question mark', () => {
    expect(escapeRegExp('a?b')).toBe('a\\?b')
  })

  it('escapes curly braces', () => {
    expect(escapeRegExp('a{2}')).toBe('a\\{2\\}')
  })

  it('escapes pipe', () => {
    expect(escapeRegExp('a|b')).toBe('a\\|b')
  })

  it('escapes caret and dollar', () => {
    expect(escapeRegExp('^abc$')).toBe('\\^abc\\$')
  })

  it('escapes backslash', () => {
    expect(escapeRegExp('a\\b')).toBe('a\\\\b')
  })

  it('leaves normal text unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world')
    expect(escapeRegExp('abc123')).toBe('abc123')
  })

  it('handles empty string', () => {
    expect(escapeRegExp('')).toBe('')
  })

  it('handles complex pattern', () => {
    expect(escapeRegExp('price: $10.00 (USD)')).toBe('price: \\$10\\.00 \\(USD\\)')
  })
})
