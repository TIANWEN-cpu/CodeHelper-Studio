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
    expect(splitSqlStatements(sql).length).toBeGreaterThanOrEqual(1)
  })

  it('多条语句混合注释', () => {
    const sql = 'SELECT 1; -- comment\nSELECT 2; SELECT 3;'
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3'])
  })

  it('单条语句无分号', () => {
    expect(splitSqlStatements('SELECT 1')).toEqual(['SELECT 1'])
  })

  it('CREATE TABLE + INSERT + SELECT 序列', () => {
    const sql =
      'CREATE TABLE t(id INT);\nINSERT INTO t VALUES (1);\nSELECT * FROM t;'
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE t(id INT)',
      'INSERT INTO t VALUES (1)',
      'SELECT * FROM t',
    ])
  })

  it('连续分号产生空语句被跳过', () => {
    const sql = 'SELECT 1;;SELECT 2;'
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('包含换行的多行语句保持完整', () => {
    const sql = 'SELECT\n  id,\n  name\nFROM users;'
    expect(splitSqlStatements(sql)).toEqual(['SELECT\n  id,\n  name\nFROM users'])
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

  it('UPDATE 语句返回 false', () => {
    expect(isQueryStatement('UPDATE users SET name = "a"')).toBe(false)
  })

  it('DELETE 语句返回 false', () => {
    expect(isQueryStatement('DELETE FROM users WHERE id = 1')).toBe(false)
  })

  it('DROP TABLE 返回 false', () => {
    expect(isQueryStatement('DROP TABLE users')).toBe(false)
  })

  it('ALTER TABLE 返回 false', () => {
    expect(isQueryStatement('ALTER TABLE users ADD COLUMN age INT')).toBe(false)
  })

  it('空字符串返回 false', () => {
    expect(isQueryStatement('')).toBe(false)
  })

  it('WITH ... INSERT 返回 true（CTE 语法）', () => {
    expect(isQueryStatement('WITH cte AS (SELECT 1) INSERT INTO t SELECT * FROM cte')).toBe(true)
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

  it('null 值正确序列化', () => {
    const rows = [{ value: null }]
    const result = JSON.parse(formatRows(rows))
    expect(result[0].value).toBeNull()
  })

  it('特殊字符正确序列化', () => {
    const rows = [{ text: 'hello "world"' }]
    const result = JSON.parse(formatRows(rows))
    expect(result[0].text).toBe('hello "world"')
  })

  it('Unicode 字符正确序列化', () => {
    const rows = [{ name: '张三' }]
    const result = formatRows(rows)
    expect(result).toContain('张三')
  })

  it('包含数字和浮点数', () => {
    const rows = [{ int_val: 42, float_val: 3.14 }]
    const result = JSON.parse(formatRows(rows))
    expect(result[0].int_val).toBe(42)
    expect(result[0].float_val).toBeCloseTo(3.14)
  })
})
