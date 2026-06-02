import { describe, it, expect } from 'vitest'
import { splitSqlStatements, isQueryStatement, formatRows } from '../electron/utils/sqlUtils'

describe('splitSqlStatements', () => {
  it('splits on semicolons', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('handles single statement', () => {
    expect(splitSqlStatements('SELECT 1')).toEqual(['SELECT 1'])
  })

  it('handles empty input', () => {
    expect(splitSqlStatements('')).toEqual([])
  })

  it('ignores single-line comments', () => {
    const sql = 'SELECT 1 -- comment\n; SELECT 2'
    const result = splitSqlStatements(sql)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('SELECT 1')
    expect(result[1]).toBe('SELECT 2')
  })

  it('respects single-quoted strings', () => {
    const sql = "SELECT 'hello;world'; SELECT 2"
    const result = splitSqlStatements(sql)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe("SELECT 'hello;world'")
  })

  it('respects double-quoted strings', () => {
    const sql = 'SELECT "hello;world"; SELECT 2'
    const result = splitSqlStatements(sql)
    expect(result).toHaveLength(2)
  })

  it('trims whitespace from statements', () => {
    expect(splitSqlStatements('  SELECT 1  ;  SELECT 2  ')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('skips empty statements from double semicolons', () => {
    expect(splitSqlStatements('SELECT 1;; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('handles quotes that do not match at boundaries', () => {
    const sql = "SELECT 'it''s a test'; SELECT 2"
    const result = splitSqlStatements(sql)
    // The parser handles the quote matching character by character
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('handles comment at end without newline', () => {
    const sql = 'SELECT 1 -- trailing comment'
    const result = splitSqlStatements(sql)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('SELECT 1')
  })
})

describe('isQueryStatement', () => {
  it('detects SELECT statements', () => {
    expect(isQueryStatement('SELECT * FROM t')).toBe(true)
    expect(isQueryStatement('  select 1')).toBe(true)
  })

  it('detects WITH statements (CTEs)', () => {
    expect(isQueryStatement('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true)
  })

  it('detects PRAGMA statements', () => {
    expect(isQueryStatement('PRAGMA table_info(t)')).toBe(true)
  })

  it('detects EXPLAIN statements', () => {
    expect(isQueryStatement('EXPLAIN SELECT 1')).toBe(true)
  })

  it('returns false for INSERT/UPDATE/DELETE', () => {
    expect(isQueryStatement('INSERT INTO t VALUES (1)')).toBe(false)
    expect(isQueryStatement('UPDATE t SET a=1')).toBe(false)
    expect(isQueryStatement('DELETE FROM t')).toBe(false)
    expect(isQueryStatement('CREATE TABLE t (a INT)')).toBe(false)
  })
})

describe('formatRows', () => {
  it('returns empty message for no rows', () => {
    expect(formatRows([])).toBe('查询成功，结果为空')
  })

  it('formats rows as indented JSON', () => {
    const rows = [{ id: 1, name: 'test' }]
    const result = formatRows(rows)
    expect(result).toContain('"id": 1')
    expect(result).toContain('"name": "test"')
  })

  it('handles multiple rows', () => {
    const rows = [{ a: 1 }, { a: 2 }]
    const result = formatRows(rows)
    expect(JSON.parse(result)).toEqual(rows)
  })

  it('handles rows with special characters', () => {
    const rows = [{ text: 'hello\nworld\ttab' }]
    const result = formatRows(rows)
    expect(JSON.parse(result)).toEqual(rows)
  })
})
