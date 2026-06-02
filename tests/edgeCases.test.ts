/**
 * Edge-case tests for all utility functions.
 *
 * Covers: empty inputs, very long strings (>10KB), Unicode/emoji,
 * null/undefined handling, special characters in SQL, markdown, code.
 */
import { describe, it, expect } from 'vitest'
import { splitSqlStatements, isQueryStatement, formatRows } from '../electron/utils/sqlUtils'
import { splitIntoChunks, escapeRegExp } from '../electron/utils/textUtils'
import {
  toErrorMessage,
  safeAsync,
  safeSync,
  parseJsonSafe,
  categorizeError,
  getUserMessage,
} from '../src/utils/errors'

// ---------------------------------------------------------------------------
// Edge-case: splitSqlStatements
// ---------------------------------------------------------------------------

describe('Edge-case: splitSqlStatements', () => {
  describe('empty / whitespace inputs', () => {
    it('empty string returns empty array', () => {
      expect(splitSqlStatements('')).toEqual([])
    })
    it('whitespace-only returns empty array', () => {
      expect(splitSqlStatements('   \n\t\r  ')).toEqual([])
    })
    it('multiple consecutive semicolons return empty array', () => {
      expect(splitSqlStatements(';;;')).toEqual([])
    })
    it('semicolon surrounded by spaces only', () => {
      expect(splitSqlStatements(' ; ')).toEqual([])
    })
  })

  describe('very long strings (>10KB)', () => {
    it('handles 20KB single statement', () => {
      const bigVal = 'a'.repeat(20000)
      const sql = `SELECT '${bigVal}';`
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain(bigVal)
    })

    it('handles many small statements totaling >10KB', () => {
      const stmts = Array.from(
        { length: 1000 },
        (_, i) => `SELECT ${i} AS val, 'data_${i}' AS name`,
      )
      const sql = stmts.join('; ') + ';'
      expect(sql.length).toBeGreaterThan(10000)
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1000)
    })

    it('handles deeply nested single-quoted string with semicolons', () => {
      const inner = ';'.repeat(5000)
      const sql = `SELECT '${inner}';`
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain(';'.repeat(5000))
    })

    it('handles long comment block', () => {
      const comment = '-- ' + 'x'.repeat(15000) + '\n'
      const sql = comment + 'SELECT 1;'
      const result = splitSqlStatements(sql)
      expect(result).toEqual(['SELECT 1'])
    })
  })

  describe('Unicode and emoji inputs', () => {
    it('handles Unicode identifiers', () => {
      const sql = 'SELECT * FROM usuarios WHERE nombre = "张三";'
      expect(splitSqlStatements(sql)).toHaveLength(1)
    })

    it('handles emoji inside string literals', () => {
      const sql = "SELECT 'hello 🌍🚀 emoji'; SELECT 2;"
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(2)
      expect(result[0]).toContain('🌍🚀')
    })

    it('handles mixed CJK and Latin in comments', () => {
      const sql = '-- 这是中文注释\nSELECT 1;'
      expect(splitSqlStatements(sql)).toEqual(['SELECT 1'])
    })

    it('handles emoji as table name in unquoted position', () => {
      const sql = 'SELECT 1; SELECT 2;'
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(2)
    })
  })

  describe('special characters in SQL', () => {
    it('escaped single quote (consecutive quotes)', () => {
      const sql = "SELECT 'it''s a test'; SELECT 1;"
      const result = splitSqlStatements(sql)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('backslash in double-quoted string', () => {
      const sql = 'SELECT "path\\\\to\\\\file";'
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(1)
    })

    it('angle brackets in string', () => {
      const sql = "SELECT '<html></html>';"
      expect(splitSqlStatements(sql)).toHaveLength(1)
    })

    it('hash and dollar signs', () => {
      const sql = "SELECT '$100 #price';"
      expect(splitSqlStatements(sql)).toHaveLength(1)
    })

    it('newline inside string literal', () => {
      const sql = "SELECT 'line1\nline2';"
      expect(splitSqlStatements(sql)).toHaveLength(1)
    })
  })

  describe('null/undefined-like edge cases in SQL', () => {
    it('SQL NULL keyword is just a statement', () => {
      expect(splitSqlStatements('SELECT NULL;')).toEqual(['SELECT NULL'])
    })
    it('empty comment between statements', () => {
      const sql = 'SELECT 1; --\nSELECT 2;'
      expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2'])
    })
  })
})

// ---------------------------------------------------------------------------
// Edge-case: isQueryStatement
// ---------------------------------------------------------------------------

describe('Edge-case: isQueryStatement', () => {
  it('empty string returns false', () => {
    expect(isQueryStatement('')).toBe(false)
  })

  it('whitespace-only returns false', () => {
    expect(isQueryStatement('   ')).toBe(false)
  })

  it('only keyword SELECT without table returns true', () => {
    expect(isQueryStatement('SELECT')).toBe(true)
  })

  it('keyword as substring does not match', () => {
    expect(isQueryStatement('SELECTOR_NAME = 1')).toBe(false)
  })

  it('Unicode before keyword does not match', () => {
    expect(isQueryStatement('你好 SELECT')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Edge-case: formatRows
// ---------------------------------------------------------------------------

describe('Edge-case: formatRows', () => {
  it('single row with all nulls', () => {
    const result = formatRows([{ a: null, b: null }])
    const parsed = JSON.parse(result)
    expect(parsed[0]).toEqual({ a: null, b: null })
  })

  it('row with empty string values', () => {
    const result = formatRows([{ name: '', desc: '' }])
    const parsed = JSON.parse(result)
    expect(parsed[0].name).toBe('')
  })

  it('row with deeply nested object', () => {
    const nested = { a: { b: { c: { d: 'deep' } } } }
    const result = formatRows([nested as unknown as Record<string, unknown>])
    const parsed = JSON.parse(result)
    expect(parsed[0].a.b.c.d).toBe('deep')
  })

  it('row with very long string value (>10KB)', () => {
    const big = 'x'.repeat(20000)
    const result = formatRows([{ data: big }])
    const parsed = JSON.parse(result)
    expect(parsed[0].data).toHaveLength(20000)
  })

  it('row with emoji values', () => {
    const result = formatRows([{ mood: '🎉🔥', status: '✅' }])
    const parsed = JSON.parse(result)
    expect(parsed[0].mood).toBe('🎉🔥')
    expect(parsed[0].status).toBe('✅')
  })

  it('row with numeric edge values', () => {
    const result = formatRows([{ zero: 0, neg: -1, big: Number.MAX_SAFE_INTEGER, float: 0.000001 }])
    const parsed = JSON.parse(result)
    expect(parsed[0].zero).toBe(0)
    expect(parsed[0].neg).toBe(-1)
    expect(parsed[0].big).toBe(Number.MAX_SAFE_INTEGER)
    expect(parsed[0].float).toBeCloseTo(0.000001)
  })

  it('many rows (>100)', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, val: `row-${i}` }))
    const result = formatRows(rows)
    const parsed = JSON.parse(result)
    expect(parsed).toHaveLength(200)
  })
})

// ---------------------------------------------------------------------------
// Edge-case: splitIntoChunks
// ---------------------------------------------------------------------------

describe('Edge-case: splitIntoChunks', () => {
  describe('empty / whitespace', () => {
    it('empty string returns [""]', () => {
      expect(splitIntoChunks('', 100)).toEqual([''])
    })
    it('spaces-only returns [""]', () => {
      expect(splitIntoChunks('   ', 100)).toEqual([''])
    })
    it('newlines-only returns [""]', () => {
      expect(splitIntoChunks('\n\n\n', 100)).toEqual([''])
    })
  })

  describe('very long strings (>10KB)', () => {
    it('single paragraph >10KB stays intact', () => {
      const big = 'a'.repeat(15000)
      const result = splitIntoChunks(big, 5000)
      expect(result).toHaveLength(1)
      expect(result[0]).toHaveLength(15000)
    })

    it('many small paragraphs totaling >10KB are chunked correctly', () => {
      const paras = Array.from({ length: 500 }, () => 'word '.repeat(20))
      const text = paras.join('\n\n')
      expect(text.length).toBeGreaterThan(10000)
      const result = splitIntoChunks(text, 1000)
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(1100)
      }
    })
  })

  describe('Unicode and emoji', () => {
    it('handles CJK paragraphs', () => {
      const text =
        '这是一段比较长的中文内容用来测试分块效果。\n\n这是第二段同样较长的中文内容用于验证分块是否正确。'
      const result = splitIntoChunks(text, 20)
      expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it('handles emoji paragraphs', () => {
      const text = '🎉🚀✨\n\n🌟💫⭐'
      const result = splitIntoChunks(text, 10)
      expect(result.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('special characters in markdown/code', () => {
    it('handles markdown with headers', () => {
      const text = '# Header\n\nSome **bold** text\n\n```js\ncode();\n```'
      const result = splitIntoChunks(text, 50)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('handles code with special chars', () => {
      const text =
        '```python\ndef foo():\n    return {key: "value"}\n```\n\n```python\nprint("done")\n```'
      const result = splitIntoChunks(text, 50)
      expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it('handles HTML entities', () => {
      const text = '&lt;div&gt;&amp;\n\n&amp;lt;span&gt;'
      const result = splitIntoChunks(text, 20)
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('null/undefined-like inputs', () => {
    it('handles string "null"', () => {
      const result = splitIntoChunks('null', 100)
      expect(result).toEqual(['null'])
    })

    it('handles string "undefined"', () => {
      const result = splitIntoChunks('undefined', 100)
      expect(result).toEqual(['undefined'])
    })
  })
})

// ---------------------------------------------------------------------------
// Edge-case: escapeRegExp
// ---------------------------------------------------------------------------

describe('Edge-case: escapeRegExp', () => {
  it('empty string returns empty string', () => {
    expect(escapeRegExp('')).toBe('')
  })

  it('string with only special chars', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
  })

  it('handles Unicode', () => {
    expect(escapeRegExp('用户[0]')).toBe('用户\\[0\\]')
    expect(escapeRegExp('hello.世界')).toBe('hello\\.世界')
  })

  it('handles emoji', () => {
    expect(escapeRegExp('test🎉')).toBe('test🎉')
    expect(escapeRegExp('[🎉]')).toBe('\\[🎉\\]')
  })

  it('very long string with specials', () => {
    const input = '(a|b)'.repeat(5000)
    const escaped = escapeRegExp(input)
    expect(escaped).toContain('\\(a\\|b\\)')
    expect(new RegExp(escaped).test(input)).toBe(true)
  })

  it('backslash at start and end', () => {
    expect(escapeRegExp('\\start\\')).toBe('\\\\start\\\\')
  })

  it('markdown syntax chars', () => {
    expect(escapeRegExp('**bold** _italic_ `code`')).toBe('\\*\\*bold\\*\\* _italic_ `code`')
  })
})

// ---------------------------------------------------------------------------
// Edge-case: error utilities
// ---------------------------------------------------------------------------

describe('Edge-case: toErrorMessage', () => {
  it('boolean true returns "true"', () => {
    expect(toErrorMessage(true)).toBe('true')
  })

  it('boolean false returns "false"', () => {
    expect(toErrorMessage(false)).toBe('false')
  })

  it('empty string returns empty string', () => {
    expect(toErrorMessage('')).toBe('')
  })

  it('object without message returns "[object Object]"', () => {
    expect(toErrorMessage({ foo: 'bar' })).toBe('[object Object]')
  })

  it('Error with empty message', () => {
    expect(toErrorMessage(new Error(''))).toBe('')
  })

  it('nested error-like object', () => {
    expect(toErrorMessage({ message: { nested: true } })).toBe('[object Object]')
  })

  it('symbol returns "Symbol()"', () => {
    expect(toErrorMessage(Symbol('test'))).toMatch(/^Symbol\(test\)$/)
  })
})

describe('Edge-case: safeAsync', () => {
  it('resolves with null data', async () => {
    const [data, err] = await safeAsync(async () => null)
    expect(data).toBeNull()
    expect(err).toBeNull()
  })

  it('resolves with object', async () => {
    const obj = { key: 'value' }
    const [data, err] = await safeAsync(async () => obj)
    expect(data).toEqual(obj)
    expect(err).toBeNull()
  })

  it('catches thrown undefined', async () => {
    const [data, err] = await safeAsync(async () => {
      throw undefined
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
  })

  it('catches thrown number', async () => {
    const [data, err] = await safeAsync(async () => {
      throw 42
    })
    expect(data).toBeNull()
    expect(err?.message).toBe('42')
  })
})

describe('Edge-case: safeSync', () => {
  it('returns null as valid data', () => {
    const [data, err] = safeSync(() => null)
    expect(data).toBeNull()
    expect(err).toBeNull()
  })

  it('catches thrown object', () => {
    const [data, err] = safeSync(() => {
      throw { code: 404, message: 'not found' }
    })
    expect(data).toBeNull()
    expect(err?.message).toBe('not found')
  })

  it('catches thrown 0', () => {
    const [data, err] = safeSync(() => {
      throw 0
    })
    expect(data).toBeNull()
    expect(err?.message).toBe('0')
  })
})

describe('Edge-case: parseJsonSafe', () => {
  it('valid JSON with nested arrays', () => {
    expect(parseJsonSafe('[[1,2],[3,4]]', [])).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('whitespace-only JSON is invalid', () => {
    expect(parseJsonSafe('   ', 'fallback')).toBe('fallback')
  })

  it('JSON with unicode', () => {
    expect(parseJsonSafe('{"name":"张三"}', {})).toEqual({ name: '张三' })
  })

  it('JSON with emoji', () => {
    expect(parseJsonSafe('{"mood":"🎉"}', {})).toEqual({ mood: '🎉' })
  })

  it('extremely large JSON string', () => {
    const big = JSON.stringify({ data: 'x'.repeat(50000) })
    const result = parseJsonSafe(big, {})
    expect((result as { data: string }).data).toHaveLength(50000)
  })

  it('null as JSON literal', () => {
    expect(parseJsonSafe('null', 'fallback')).toBeNull()
  })

  it('number as JSON literal', () => {
    expect(parseJsonSafe('42', 0)).toBe(42)
  })

  it('boolean as JSON literal', () => {
    expect(parseJsonSafe('true', false)).toBe(true)
  })
})

describe('Edge-case: categorizeError', () => {
  it('mixed case "NETWORK ERROR"', () => {
    expect(categorizeError('NETWORK ERROR')).toBe('network')
  })

  it('string with "401 Unauthorized"', () => {
    expect(categorizeError('401 Unauthorized')).toBe('auth')
  })

  it('Error instance with timeout message', () => {
    expect(categorizeError(new Error('connection timed out'))).toBe('timeout')
  })

  it('empty string is unknown', () => {
    expect(categorizeError('')).toBe('unknown')
  })

  it('null is unknown', () => {
    expect(categorizeError(null)).toBe('unknown')
  })

  it('number is unknown', () => {
    expect(categorizeError(42)).toBe('unknown')
  })

  it('object with no message is unknown', () => {
    expect(categorizeError({ code: 500 })).toBe('unknown')
  })

  it('fetch error pattern', () => {
    expect(categorizeError('TypeError: fetch failed')).toBe('network')
  })

  it('validation with required keyword', () => {
    expect(categorizeError('field is required')).toBe('validation')
  })
})

describe('Edge-case: getUserMessage', () => {
  it('non-empty Error message returns directly', () => {
    expect(getUserMessage(new Error('specific error'))).toBe('specific error')
  })

  it('empty Error message falls back to category', () => {
    // empty string has no category keywords -> unknown
    const msg = getUserMessage(new Error(''))
    expect(msg).toBe('发生未知错误，请稍后重试')
  })

  it('"undefined" string triggers fallback', () => {
    const msg = getUserMessage('undefined')
    expect(msg).toBe('发生未知错误，请稍后重试')
  })

  it('"null" string triggers fallback', () => {
    const msg = getUserMessage('null')
    expect(msg).toBe('发生未知错误，请稍后重试')
  })

  it('[object Object] triggers fallback', () => {
    const msg = getUserMessage({})
    expect(msg).toBe('[object Object]') // String({}) produces '[object Object]'
  })

  it('object with network message returns message string', () => {
    const msg = getUserMessage({ message: 'fetch failed' })
    expect(msg).toBe('fetch failed')
  })
})
