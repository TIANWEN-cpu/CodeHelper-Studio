/**
 * Pure SQL utility functions extracted from codeRunner.ts for testability.
 * These functions have zero Electron/Node dependencies.
 */

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]

    if (!quote && char === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1
      }
      current += '\n'
      continue
    }

    if (char === '\'' || char === '"') {
      if (quote === char) {
        quote = null
      } else if (!quote) {
        quote = char
      }
    }

    if (char === ';' && !quote) {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      continue
    }

    current += char
  }

  const last = current.trim()
  if (last) statements.push(last)
  return statements
}

export function isQueryStatement(statement: string): boolean {
  return /^(select|with|pragma|explain)\b/i.test(statement.trim())
}

export function formatRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return '查询成功，结果为空'
  }
  return JSON.stringify(rows, null, 2)
}
