import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  execCalls: [] as string[],
  pragmaCalls: [] as string[],
  execError: null as string | null,
  closed: false,
}))

vi.mock('better-sqlite3', () => ({
  default: class MockDatabase {
    exec(statement: string) {
      mockDb.execCalls.push(statement)
      if (mockDb.execError) throw new Error(mockDb.execError)
    }

    pragma(statement: string) {
      mockDb.pragmaCalls.push(statement)
    }

    prepare() {
      return {
        iterate: () => mockDb.rows.values(),
      }
    }

    close() {
      mockDb.closed = true
    }
  },
}))

const { executeSqlRequest } = await import('../electron/utils/sqlRunnerCore')
const { SQL_MAX_CELL_BYTES, SQL_MAX_OUTPUT_BYTES, SQL_MAX_ROWS, validateSqlStatements } =
  await import('../electron/utils/sqlRunnerProtocol')

function request(overrides: Partial<Parameters<typeof executeSqlRequest>[0]> = {}) {
  return {
    statements: ['SELECT 1'],
    queryLast: true,
    maxRows: SQL_MAX_ROWS,
    maxOutputBytes: SQL_MAX_OUTPUT_BYTES,
    maxCellBytes: SQL_MAX_CELL_BYTES,
    ...overrides,
  }
}

describe('sqlRunnerProtocol', () => {
  it('rejects filesystem-capable statements and writable pragmas', () => {
    expect(validateSqlStatements(["ATTACH DATABASE 'secret.db' AS secret"])).toContain('禁止')
    expect(validateSqlStatements(["VACUUM INTO 'copy.db'"])).toContain('禁止')
    expect(validateSqlStatements(['PRAGMA schema_version(123)'])).toContain('只读')
  })

  it('allows ordinary and recursive WITH syntax inside the isolated utility process', () => {
    expect(
      validateSqlStatements([
        'WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt) SELECT * FROM cnt',
      ]),
    ).toBeNull()
    expect(validateSqlStatements(['WITH value(x) AS (SELECT 1) SELECT * FROM value'])).toBeNull()
    expect(
      validateSqlStatements([
        'WITH cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt) SELECT * FROM cnt',
      ]),
    ).toBeNull()
  })

  it('does not treat blocked keywords inside literals or comments as executable tokens', () => {
    expect(validateSqlStatements(["SELECT 'ATTACH VACUUM' AS text -- DETACH"])).toBeNull()
  })

  it('allows read-only structure pragmas with one object argument', () => {
    expect(validateSqlStatements(['PRAGMA table_info(example)'])).toBeNull()
    expect(validateSqlStatements(['PRAGMA table_info("example")'])).toBeNull()
    expect(validateSqlStatements(['PRAGMA index_list(example)'])).toBeNull()
  })
})

describe('sqlRunnerCore', () => {
  beforeEach(() => {
    mockDb.rows = []
    mockDb.execCalls = []
    mockDb.pragmaCalls = []
    mockDb.execError = null
    mockDb.closed = false
  })

  it('executes setup statements and formats the final query', () => {
    mockDb.rows = [{ value: 42 }]
    const result = executeSqlRequest(
      request({ statements: ['CREATE TABLE t(value)', 'SELECT value FROM t'] }),
    )

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error(result.error)
    expect(JSON.parse(result.stdout)).toEqual([{ value: 42 }])
    expect(mockDb.execCalls).toEqual(['CREATE TABLE t(value)'])
    expect(mockDb.pragmaCalls).toEqual(
      expect.arrayContaining(['trusted_schema = OFF', 'foreign_keys = ON']),
    )
    expect(mockDb.closed).toBe(true)
  })

  it('caps rows while preserving valid JSON', () => {
    mockDb.rows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const result = executeSqlRequest(request({ maxRows: 2 }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(JSON.parse(result.stdout)).toEqual([{ id: 1 }, { id: 2 }])
    expect(result.warning).toContain('最多 2 行')
  })

  it('caps total output bytes without returning malformed JSON', () => {
    mockDb.rows = [{ text: 'a'.repeat(200) }, { text: 'b'.repeat(200) }]
    const result = executeSqlRequest(request({ maxOutputBytes: 120 }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(() => JSON.parse(result.stdout)).not.toThrow()
    expect(result.warning).toContain('总计 1KB')
  })

  it('warns when large strings or blobs are represented in bounded form', () => {
    mockDb.rows = [{ text: 'abcdef'.repeat(20), blob: Buffer.alloc(32) }]
    const result = executeSqlRequest(request({ maxCellBytes: 20 }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.stdout).toContain('已截断')
    expect(result.stdout).toContain('BLOB 32 bytes')
    expect(result.warning).toContain('单元格 1KB')
  })

  it('closes the database when execution fails', () => {
    mockDb.execError = 'syntax error'
    const result = executeSqlRequest(request({ queryLast: false }))

    expect(result).toEqual({ ok: false, error: 'syntax error' })
    expect(mockDb.closed).toBe(true)
  })
})
