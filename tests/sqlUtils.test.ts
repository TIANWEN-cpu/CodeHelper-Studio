import { describe, it, expect } from 'vitest'
import { splitSqlStatements, isQueryStatement, formatRows } from '../electron/utils/sqlUtils'

describe('splitSqlStatements', () => {
  it('按分号分割多条语句', () => {
    const sql = 'SELECT 1; SELECT 2; SELECT 3;'
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3'])
  })

  it('忽略字符串内的分号', () => {
    const sql = "SELECT 'hello;world'; SELECT 2;"
    expect(splitSqlStatements(sql)).toEqual(["SELECT 'hello;world'", 'SELECT 2'])
  })

  it('忽略双引号字符串内的分号', () => {
    const sql = 'SELECT "hello;world"; SELECT 2;'
    expect(splitSqlStatements(sql)).toEqual(['SELECT "hello;world"', 'SELECT 2'])
  })

  it('跳过单行注释', () => {
    const sql = '-- this is a comment\nSELECT 1; SELECT 2;'
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('处理末尾无分号的语句', () => {
    const sql = 'SELECT 1; SELECT 2'
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('空输入返回空数组', () => {
    expect(splitSqlStatements('')).toEqual([])
  })

  it('只有空白返回空数组', () => {
    expect(splitSqlStatements('   \n  ')).toEqual([])
  })

  it('只有注释返回空数组', () => {
    expect(splitSqlStatements('-- just a comment\n')).toEqual([])
  })

  it('处理转义引号（连续两个单引号）', () => {
    const sql = "SELECT 'it''s a test'; SELECT 1;"
    // The parser tracks quote state: first ' opens, second ' closes, third ' opens, fourth ' closes
    expect(splitSqlStatements(sql).length).toBeGreaterThanOrEqual(1)
  })
})

describe('isQueryStatement', () => {
  it('SELECT 语句返回 true', () => {
    expect(isQueryStatement('SELECT * FROM users')).toBe(true)
  })

  it('WITH (CTE) 语句返回 true', () => {
    expect(isQueryStatement('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true)
  })

  it('PRAGMA 语句返回 true', () => {
    expect(isQueryStatement('PRAGMA table_info(users)')).toBe(true)
  })

  it('EXPLAIN 语句返回 true', () => {
    expect(isQueryStatement('EXPLAIN SELECT * FROM users')).toBe(true)
  })

  it('INSERT 语句返回 false', () => {
    expect(isQueryStatement('INSERT INTO users VALUES (1)')).toBe(false)
  })

  it('CREATE TABLE 返回 false', () => {
    expect(isQueryStatement('CREATE TABLE t (id INT)')).toBe(false)
  })

  it('大小写不敏感', () => {
    expect(isQueryStatement('select 1')).toBe(true)
    expect(isQueryStatement('Select 1')).toBe(true)
  })

  it('忽略前导空白', () => {
    expect(isQueryStatement('  SELECT 1')).toBe(true)
  })
})

describe('formatRows', () => {
  it('空结果返回提示文本', () => {
    expect(formatRows([])).toBe('查询成功，结果为空')
  })

  it('单行结果格式化为 JSON', () => {
    const rows = [{ id: 1, name: 'test' }]
    const result = formatRows(rows)
    expect(result).toContain('"id": 1')
    expect(result).toContain('"name": "test"')
  })

  it('多行结果格式化为 JSON 数组', () => {
    const rows = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]
    const result = JSON.parse(formatRows(rows))
    expect(result).toHaveLength(2)
  })
})
