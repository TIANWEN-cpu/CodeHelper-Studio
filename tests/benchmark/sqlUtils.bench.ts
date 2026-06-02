import { describe, bench } from 'vitest'
import { splitSqlStatements, isQueryStatement, formatRows } from '../../electron/utils/sqlUtils'

/** 生成 N 条简单 INSERT 语句拼接的 SQL */
function generateBulkInserts(n: number): string {
  const lines: string[] = []
  for (let i = 0; i < n; i++) {
    lines.push(`INSERT INTO t (id, name) VALUES (${i}, 'user_${i}');`)
  }
  return lines.join('\n')
}

/** 生成带注释、引号转义的复杂 SQL */
function generateComplexSql(): string {
  return `
    -- 创建表
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      bio TEXT DEFAULT ''
    );
    -- 插入数据
    INSERT INTO users (name, bio) VALUES ('O''Brien', 'He said "hello"');
    INSERT INTO users (name, bio) VALUES ('Alice', 'Line1\\nLine2');
    -- 查询
    SELECT u.id, u.name, COUNT(o.id) AS order_count
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.name LIKE '%test%'
    GROUP BY u.id
    HAVING COUNT(o.id) > 5
    ORDER BY order_count DESC
    LIMIT 100;
    -- 更新
    UPDATE users SET bio = 'Updated ''value''' WHERE id = 1;
    -- 删除
    DELETE FROM users WHERE id IN (1, 2, 3);
  `
}

describe('splitSqlStatements', () => {
  bench('10 条简单语句', () => {
    splitSqlStatements(generateBulkInserts(10))
  })

  bench('100 条简单语句', () => {
    splitSqlStatements(generateBulkInserts(100))
  })

  bench('1000 条简单语句', () => {
    splitSqlStatements(generateBulkInserts(1000))
  })

  bench('复杂 SQL（含注释、转义引号、多表 JOIN）', () => {
    splitSqlStatements(generateComplexSql())
  })

  bench('单条超长语句（无分号分隔）', () => {
    const longSql =
      'SELECT ' +
      Array.from({ length: 200 }, (_, i) => `col_${i}`).join(', ') +
      ' FROM big_table WHERE ' +
      Array.from({ length: 50 }, (_, i) => `col_${i} > ${i}`).join(' AND ')
    splitSqlStatements(longSql)
  })
})

describe('isQueryStatement', () => {
  const statements = [
    'SELECT * FROM users',
    'WITH cte AS (SELECT 1) SELECT * FROM cte',
    'PRAGMA table_info(users)',
    'EXPLAIN SELECT * FROM users',
    'INSERT INTO users VALUES (1, "a")',
    'UPDATE users SET name = "b"',
    'DELETE FROM users WHERE id = 1',
    'CREATE TABLE t (id INTEGER)',
  ]

  bench('8 条混合语句类型判断', () => {
    for (const s of statements) {
      isQueryStatement(s)
    }
  })
})

describe('formatRows', () => {
  bench('空结果集', () => {
    formatRows([])
  })

  bench('10 行结果', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      name: `user_${i}`,
      email: `u${i}@test.com`,
    }))
    formatRows(rows)
  })

  bench('100 行结果', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `user_${i}`,
      email: `u${i}@test.com`,
    }))
    formatRows(rows)
  })
})
