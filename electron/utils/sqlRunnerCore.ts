import Database from 'better-sqlite3'
import {
  type SqlRunnerRequest,
  type SqlRunnerResponse,
  validateSqlStatements,
} from './sqlRunnerProtocol'

const SQLITE_HARD_HEAP_LIMIT_BYTES = 128 * 1024 * 1024

interface SanitizedValue<T = unknown> {
  value: T
  truncated: boolean
}

function truncateUtf8(value: string, maxBytes: number): SanitizedValue<string> {
  const source = Buffer.from(value, 'utf8')
  if (source.byteLength <= maxBytes) return { value, truncated: false }

  const marker = '…[已截断]'
  const markerBytes = Buffer.byteLength(marker, 'utf8')
  const suffix = markerBytes <= maxBytes ? marker : '.'.repeat(maxBytes)
  const contentLimit = maxBytes - Buffer.byteLength(suffix, 'utf8')
  let content = ''
  let contentBytes = 0
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, 'utf8')
    if (contentBytes + charBytes > contentLimit) break
    content += char
    contentBytes += charBytes
  }
  return { value: content + suffix, truncated: true }
}

function sanitizeValue(value: unknown, maxCellBytes: number): SanitizedValue {
  if (typeof value === 'string') return truncateUtf8(value, maxCellBytes)
  if (typeof value === 'bigint') return { value: value.toString(), truncated: false }
  if (Buffer.isBuffer(value)) {
    if (value.byteLength <= maxCellBytes) {
      return { value: value.toJSON(), truncated: false }
    }
    return { value: `<BLOB ${value.byteLength} bytes>`, truncated: true }
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { value: String(value), truncated: false }
  }
  return { value, truncated: false }
}

function sanitizeRow(
  row: Record<string, unknown>,
  maxCellBytes: number,
): SanitizedValue<Record<string, unknown>> {
  let truncated = false
  const entries = Object.entries(row).map(([key, value]) => {
    const sanitized = sanitizeValue(value, maxCellBytes)
    truncated ||= sanitized.truncated
    return [key, sanitized.value]
  })
  return { value: Object.fromEntries(entries), truncated }
}

function formatRowsBounded(
  rows: Iterable<Record<string, unknown>>,
  request: SqlRunnerRequest,
): { stdout: string; truncated: boolean } {
  const formattedRows: string[] = []
  let outputBytes = Buffer.byteLength('[\n\n]', 'utf8')
  let truncated = false

  for (const row of rows) {
    if (formattedRows.length >= request.maxRows) {
      truncated = true
      break
    }

    const sanitized = sanitizeRow(row, request.maxCellBytes)
    truncated ||= sanitized.truncated
    const json = JSON.stringify(sanitized.value, null, 2)
    const indented = json
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n')
    const separator = formattedRows.length === 0 ? '' : ',\n'
    const nextBytes = Buffer.byteLength(separator + indented, 'utf8')
    if (outputBytes + nextBytes > request.maxOutputBytes) {
      truncated = true
      break
    }

    formattedRows.push(indented)
    outputBytes += nextBytes
  }

  if (formattedRows.length === 0 && !truncated) {
    return { stdout: '查询成功，结果为空', truncated: false }
  }

  return {
    stdout: `[\n${formattedRows.join(',\n')}\n]`,
    truncated,
  }
}

export function executeSqlRequest(request: SqlRunnerRequest): SqlRunnerResponse {
  const validationError = validateSqlStatements(request.statements)
  if (validationError) return { ok: false, error: validationError }
  if (request.statements.length === 0) return { ok: true, stdout: '' }

  const db = new Database(':memory:')
  try {
    try {
      db.pragma(`hard_heap_limit = ${SQLITE_HARD_HEAP_LIMIT_BYTES}`)
    } catch {
      // Older SQLite builds may not expose hard_heap_limit.
    }
    db.pragma('trusted_schema = OFF')
    db.pragma('foreign_keys = ON')

    for (const statement of request.statements.slice(0, -1)) {
      db.exec(statement)
    }

    const last = request.statements[request.statements.length - 1]
    if (!request.queryLast) {
      db.exec(last)
      return { ok: true, stdout: '执行成功' }
    }

    const rows = db.prepare(last).iterate() as Iterable<Record<string, unknown>>
    const formatted = formatRowsBounded(rows, request)
    return {
      ok: true,
      stdout: formatted.stdout,
      warning: formatted.truncated
        ? `查询结果已截断（最多 ${request.maxRows} 行、总计 ${Math.ceil(request.maxOutputBytes / 1024)}KB、单元格 ${Math.ceil(request.maxCellBytes / 1024)}KB）`
        : undefined,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    db.close()
  }
}
