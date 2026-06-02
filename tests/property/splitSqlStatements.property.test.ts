/**
 * Property-based tests for SQL utility functions.
 *
 * Uses randomized inputs to verify invariants that must hold for ANY valid input,
 * rather than testing fixed examples.
 */
import { describe, it, expect } from 'vitest'
import { splitSqlStatements, isQueryStatement, formatRows } from '../../electron/utils/sqlUtils'

// ---------------------------------------------------------------------------
// Lightweight property-based helpers (no external dependency)
// ---------------------------------------------------------------------------

/** Simple seeded pseudo-random number generator (xorshift32). */
function makeRng(seed: number) {
  let s = seed | 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** Generate a random lowercase-alpha string of given length. */
function randomIdent(rng: () => number, len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(rng() * chars.length)]
  return out
}

/** Generate a random SQL-safe value literal. */
function randomValue(rng: () => number): string {
  const r = rng()
  if (r < 0.3) return String(Math.floor(rng() * 10000))
  if (r < 0.6) return `'${randomIdent(rng, Math.floor(rng() * 20) + 1)}'`
  return 'NULL'
}

/** Build a random SELECT statement. */
function randomSelect(rng: () => number): string {
  const table = randomIdent(rng, 4 + Math.floor(rng() * 6))
  return `SELECT * FROM ${table} WHERE id = ${randomValue(rng)}`
}

/** Build a random INSERT statement. */
function randomInsert(rng: () => number): string {
  const table = randomIdent(rng, 4 + Math.floor(rng() * 6))
  return `INSERT INTO ${table} VALUES (${randomValue(rng)})`
}

/** Build a random CREATE statement. */
function randomCreate(rng: () => number): string {
  const table = randomIdent(rng, 4 + Math.floor(rng() * 6))
  const col = randomIdent(rng, 3 + Math.floor(rng() * 5))
  return `CREATE TABLE ${table} (${col} INT)`
}

/** Generate N random statements joined by semicolons. */
function randomSqlBatch(rng: () => number, count: number): { sql: string; statements: string[] } {
  const stmts: string[] = []
  const generators = [randomSelect, randomInsert, randomCreate]
  for (let i = 0; i < count; i++) {
    stmts.push(generators[Math.floor(rng() * generators.length)](rng))
  }
  return { sql: stmts.join('; ') + ';', statements: stmts }
}

// ---------------------------------------------------------------------------
// Property tests for splitSqlStatements
// ---------------------------------------------------------------------------

describe('Property-based: splitSqlStatements', () => {
  it('INVARIANT: output count matches input count for generated batches', () => {
    const rng = makeRng(42)
    for (let trial = 0; trial < 100; trial++) {
      const count = Math.floor(rng() * 8) + 1
      const { sql, statements } = randomSqlBatch(rng, count)
      const result = splitSqlStatements(sql)
      expect(result).toHaveLength(count)
      for (let i = 0; i < count; i++) {
        expect(result[i]).toBe(statements[i])
      }
    }
  })

  it('INVARIANT: join by "; " round-trips for single statements', () => {
    const rng = makeRng(123)
    for (let trial = 0; trial < 100; trial++) {
      const generators = [randomSelect, randomInsert, randomCreate]
      const stmt = generators[Math.floor(rng() * generators.length)](rng)
      const result = splitSqlStatements(stmt + ';')
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(stmt)
    }
  })

  it('INVARIANT: splitting never produces empty strings', () => {
    const rng = makeRng(999)
    for (let trial = 0; trial < 100; trial++) {
      const count = Math.floor(rng() * 10) + 1
      const { sql } = randomSqlBatch(rng, count)
      const result = splitSqlStatements(sql)
      for (const stmt of result) {
        expect(stmt.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('INVARIANT: semicolons inside single-quoted strings are preserved', () => {
    const rng = makeRng(77)
    for (let trial = 0; trial < 50; trial++) {
      const innerContent = `text;more;${randomIdent(rng, 5)}`
      const stmt = `SELECT '${innerContent}'`
      const result = splitSqlStatements(stmt + ';')
      expect(result).toHaveLength(1)
      expect(result[0]).toContain(';')
    }
  })

  it('INVARIANT: semicolons inside double-quoted strings are preserved', () => {
    const rng = makeRng(88)
    for (let trial = 0; trial < 50; trial++) {
      const innerContent = `col;name;${randomIdent(rng, 5)}`
      const stmt = `SELECT "${innerContent}"`
      const result = splitSqlStatements(stmt + ';')
      expect(result).toHaveLength(1)
      expect(result[0]).toContain(';')
    }
  })

  it('INVARIANT: comments are always stripped from results', () => {
    const rng = makeRng(55)
    for (let trial = 0; trial < 50; trial++) {
      const comment = `-- this is comment ${randomIdent(rng, 10)}`
      const stmt = randomSelect(rng)
      const sql = `${comment}\n${stmt};`
      const result = splitSqlStatements(sql)
      for (const s of result) {
        expect(s).not.toContain('--')
      }
    }
  })

  it('INVARIANT: rejoining output with "; " and splitting again gives the same result', () => {
    const rng = makeRng(333)
    for (let trial = 0; trial < 80; trial++) {
      const count = Math.floor(rng() * 6) + 1
      const { sql } = randomSqlBatch(rng, count)
      const first = splitSqlStatements(sql)
      const rejoined = first.join('; ') + ';'
      const second = splitSqlStatements(rejoined)
      expect(second).toEqual(first)
    }
  })

  it('INVARIANT: trailing whitespace does not affect results', () => {
    const rng = makeRng(200)
    for (let trial = 0; trial < 60; trial++) {
      const stmt = randomSelect(rng)
      const trailing = ' '.repeat(Math.floor(rng() * 10) + 1) + '\n  '
      const result = splitSqlStatements(stmt + trailing + ';')
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(stmt)
    }
  })
})

// ---------------------------------------------------------------------------
// Property tests for isQueryStatement
// ---------------------------------------------------------------------------

describe('Property-based: isQueryStatement', () => {
  it('INVARIANT: SELECT with any WHERE clause is always a query', () => {
    const rng = makeRng(500)
    for (let trial = 0; trial < 80; trial++) {
      const table = randomIdent(rng, 5)
      const col = randomIdent(rng, 5)
      const val = randomValue(rng)
      const stmt = `SELECT * FROM ${table} WHERE ${col} = ${val}`
      expect(isQueryStatement(stmt)).toBe(true)
    }
  })

  it('INVARIANT: INSERT/UPDATE/DELETE are never queries', () => {
    const rng = makeRng(600)
    const nonQueryGenerators = [
      (r: () => number) => randomInsert(r),
      (r: () => number) => randomCreate(r),
      (r: () => number) =>
        `UPDATE ${randomIdent(r, 5)} SET ${randomIdent(r, 3)} = ${randomValue(r)}`,
      (r: () => number) => `DELETE FROM ${randomIdent(r, 5)} WHERE id = ${randomValue(r)}`,
    ]
    for (let trial = 0; trial < 80; trial++) {
      const gen = nonQueryGenerators[Math.floor(rng() * nonQueryGenerators.length)]
      const stmt = gen(rng)
      expect(isQueryStatement(stmt)).toBe(false)
    }
  })

  it('INVARIANT: leading whitespace does not affect classification', () => {
    const rng = makeRng(700)
    for (let trial = 0; trial < 50; trial++) {
      const stmt = randomSelect(rng)
      const padding = ' '.repeat(Math.floor(rng() * 20) + 1)
      expect(isQueryStatement(padding + stmt)).toBe(isQueryStatement(stmt))
    }
  })
})

// ---------------------------------------------------------------------------
// Property tests for formatRows
// ---------------------------------------------------------------------------

describe('Property-based: formatRows', () => {
  it('INVARIANT: non-empty input always produces valid JSON', () => {
    const rng = makeRng(800)
    for (let trial = 0; trial < 60; trial++) {
      const rowCount = Math.floor(rng() * 5) + 1
      const rows: Record<string, unknown>[] = []
      for (let r = 0; r < rowCount; r++) {
        const colCount = Math.floor(rng() * 4) + 1
        const row: Record<string, unknown> = {}
        for (let c = 0; c < colCount; c++) {
          const key = randomIdent(rng, 4)
          row[key] =
            rng() < 0.3 ? null : rng() < 0.5 ? randomIdent(rng, 8) : Math.floor(rng() * 1000)
        }
        rows.push(row)
      }
      const output = formatRows(rows)
      expect(() => JSON.parse(output)).not.toThrow()
      const parsed = JSON.parse(output)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(rowCount)
    }
  })

  it('INVARIANT: empty input always returns the same sentinel', () => {
    for (let i = 0; i < 20; i++) {
      expect(formatRows([])).toBe('查询成功，结果为空')
    }
  })

  it('INVARIANT: null values survive round-trip through JSON', () => {
    const rng = makeRng(900)
    for (let trial = 0; trial < 50; trial++) {
      const row: Record<string, unknown> = {}
      const colCount = Math.floor(rng() * 6) + 1
      for (let c = 0; c < colCount; c++) {
        row[randomIdent(rng, 4)] = rng() < 0.5 ? null : randomValue(rng)
      }
      const parsed = JSON.parse(formatRows([row]))
      expect(parsed[0]).toEqual(row)
    }
  })
})
