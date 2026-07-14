export const SQL_MAX_STATEMENTS = 100
export const SQL_MAX_INPUT_BYTES = 256 * 1024
export const SQL_MAX_ROWS = 1_000
export const SQL_MAX_OUTPUT_BYTES = 512 * 1024
export const SQL_MAX_CELL_BYTES = 64 * 1024
export const SQL_TIMEOUT_MS = 3_000

export interface SqlRunnerRequest {
  statements: string[]
  queryLast: boolean
  maxRows: number
  maxOutputBytes: number
  maxCellBytes: number
}

export type SqlRunnerResponse =
  | { ok: true; stdout: string; warning?: string }
  | { ok: false; error: string }

export function isSqlRunnerResponse(value: unknown): value is SqlRunnerResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SqlRunnerResponse>
  if (candidate.ok === true) {
    return (
      typeof candidate.stdout === 'string' &&
      (candidate.warning === undefined || typeof candidate.warning === 'string')
    )
  }
  return candidate.ok === false && typeof candidate.error === 'string'
}

const ALLOWED_STATEMENT_PREFIX =
  /^(create|insert|update|delete|select|with|pragma|explain|drop|alter|replace|begin|commit|rollback|savepoint|release)\b/i

const SAFE_PRAGMAS = new Set([
  'compile_options',
  'database_list',
  'encoding',
  'foreign_key_list',
  'freelist_count',
  'function_list',
  'index_info',
  'index_list',
  'index_xinfo',
  'page_count',
  'schema_version',
  'table_info',
  'table_list',
  'table_xinfo',
])

const PARAMETERIZED_PRAGMAS = new Set([
  'foreign_key_list',
  'index_info',
  'index_list',
  'index_xinfo',
  'table_info',
  'table_xinfo',
])

function stripSqlLiteralsAndComments(statement: string): string {
  let output = ''
  let mode: 'normal' | 'single' | 'double' | 'backtick' | 'bracket' | 'line' | 'block' = 'normal'

  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index]
    const next = statement[index + 1]

    if (mode === 'line') {
      if (char === '\n') {
        mode = 'normal'
        output += '\n'
      } else {
        output += ' '
      }
      continue
    }

    if (mode === 'block') {
      if (char === '*' && next === '/') {
        output += '  '
        index += 1
        mode = 'normal'
      } else {
        output += char === '\n' ? '\n' : ' '
      }
      continue
    }

    if (mode !== 'normal') {
      const closes =
        (mode === 'single' && char === "'") ||
        (mode === 'double' && char === '"') ||
        (mode === 'backtick' && char === '`') ||
        (mode === 'bracket' && char === ']')
      if (closes) {
        const doubled = mode !== 'bracket' && next === char
        output += doubled ? '  ' : ' '
        if (doubled) index += 1
        else mode = 'normal'
      } else {
        output += char === '\n' ? '\n' : ' '
      }
      continue
    }

    if (char === '-' && next === '-') {
      output += '  '
      index += 1
      mode = 'line'
    } else if (char === '/' && next === '*') {
      output += '  '
      index += 1
      mode = 'block'
    } else if (char === "'") {
      output += ' '
      mode = 'single'
    } else if (char === '"') {
      output += ' '
      mode = 'double'
    } else if (char === '`') {
      output += ' '
      mode = 'backtick'
    } else if (char === '[') {
      output += ' '
      mode = 'bracket'
    } else {
      output += char
    }
  }

  return output
}

export function validateSqlStatements(statements: string[]): string | null {
  if (statements.length > SQL_MAX_STATEMENTS) {
    return `SQL 语句数量不能超过 ${SQL_MAX_STATEMENTS} 条`
  }

  for (const statement of statements) {
    const visibleSql = stripSqlLiteralsAndComments(statement).trim()
    if (/\b(attach|detach|vacuum|load_extension)\b/i.test(visibleSql)) {
      return '为保护本地文件，禁止 ATTACH、DETACH、VACUUM 和扩展加载'
    }
    if (!ALLOWED_STATEMENT_PREFIX.test(visibleSql)) {
      return '仅支持内存数据库中的常规 DDL、DML 和查询语句'
    }
    if (/^pragma\b/i.test(visibleSql)) {
      const match = visibleSql.match(/^pragma\s+(?:[a-z_][\w]*\.)?([a-z_][\w]*)/i)
      const pragma = match?.[1]?.toLowerCase()
      const tail = match ? visibleSql.slice(match[0].length).trim() : ''
      const validTail = pragma
        ? PARAMETERIZED_PRAGMAS.has(pragma)
          ? /^\(\s*(?:[a-z_][\w]*)?\s*\)$/i.test(tail)
          : tail.length === 0
        : false
      if (!pragma || !SAFE_PRAGMAS.has(pragma) || !validTail) {
        return '仅支持只读的数据库结构 PRAGMA 查询'
      }
    }
  }

  return null
}
