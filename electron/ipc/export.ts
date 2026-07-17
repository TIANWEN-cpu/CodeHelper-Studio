/**
 * Export/Import IPC handlers.
 *
 * Supports:
 * - Full database export to JSON
 * - Selective export (problems, chat history, knowledge, settings)
 * - Import from JSON with conflict resolution (skip, merge, overwrite)
 * - Data validation on import
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync, readFileSync, existsSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { getDB, getDatabasePath } from '../db/index'
import { createVerifiedDatabaseBackup } from '../db/databaseBackup'
import type { PortableImportResult as ImportResult } from '../../src/shared/maintenanceContract'
import type { WindowCloseFlushResult } from '../utils/windowCloseHandshake'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportData {
  version: number
  exportedAt: string
  problems?: Record<string, unknown>[]
  submissions?: Record<string, unknown>[]
  mistakes?: Record<string, unknown>[]
  chat_sessions?: Record<string, unknown>[]
  chat_history?: Record<string, unknown>[]
  knowledge_docs?: Record<string, unknown>[]
  knowledge_chunks?: Record<string, unknown>[]
  settings?: Record<string, unknown>[]
  memories?: Record<string, unknown>[]
  prompt_presets?: Record<string, unknown>[]
}

interface ImportOptions {
  conflictResolution: 'skip' | 'merge' | 'overwrite'
  selectedData: ExportCategory[]
}

export interface ExportIpcDependencies {
  requestRendererFlush: () => Promise<WindowCloseFlushResult>
  scheduleRendererReload: () => void
}

type ExportCategory =
  | 'problems'
  | 'submissions'
  | 'mistakes'
  | 'chat_sessions'
  | 'chat_history'
  | 'knowledge_docs'
  | 'knowledge_chunks'
  | 'settings'
  | 'memories'
  | 'prompt_presets'

interface TableColumnInfo {
  name: string
  notnull: number
  dflt_value: string | null
  pk: number
}

// Map from category to its table and unique key
const TABLE_META: Record<
  ExportCategory,
  { table: string; key: string | null; hasAutoId: boolean }
> = {
  problems: { table: 'problems', key: 'id', hasAutoId: true },
  submissions: { table: 'submissions', key: 'id', hasAutoId: true },
  mistakes: { table: 'mistakes', key: 'problem_id', hasAutoId: false },
  chat_sessions: { table: 'chat_sessions', key: 'id', hasAutoId: false },
  chat_history: { table: 'chat_history', key: 'id', hasAutoId: true },
  knowledge_docs: { table: 'knowledge_docs', key: 'id', hasAutoId: true },
  knowledge_chunks: { table: 'knowledge_chunks', key: 'id', hasAutoId: true },
  settings: { table: 'settings', key: 'key', hasAutoId: false },
  memories: { table: 'memories', key: 'id', hasAutoId: true },
  prompt_presets: { table: 'prompt_presets', key: 'id', hasAutoId: true },
}

const ALL_CATEGORIES: ExportCategory[] = Object.keys(TABLE_META) as ExportCategory[]
const EXPORT_FORMAT_VERSION = 1
const MAX_IMPORT_FILE_BYTES = 32 * 1024 * 1024
const MAX_IMPORT_ROWS = 100_000

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/** Validate that a file path is safe (no traversal, ends in .json). */
export function validateFilePath(filePath: string): string | null {
  if (typeof filePath !== 'string' || !filePath.trim()) return '文件路径无效'
  const normalized = resolve(filePath)
  // Block null bytes and traversal sequences
  if (filePath.includes('\0')) return '文件路径包含非法字符'
  if (!normalized.endsWith('.json')) return '仅支持 .json 文件'
  // Ensure the parent directory exists
  const dir = dirname(normalized)
  if (!existsSync(dir)) return '目标目录不存在'
  return null
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateExportData(data: unknown): data is ExportData {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  if (obj.version !== EXPORT_FORMAT_VERSION) return false
  if (typeof obj.exportedAt !== 'string') return false

  // Validate each present array field
  for (const cat of ALL_CATEGORIES) {
    const value = obj[cat]
    if (value !== undefined) {
      if (!Array.isArray(value)) return false
      for (const item of value) {
        if (!item || typeof item !== 'object') return false
      }
    }
  }
  const rowCount = ALL_CATEGORIES.reduce((count, category) => {
    const rows = obj[category]
    return count + (Array.isArray(rows) ? rows.length : 0)
  }, 0)
  if (rowCount > MAX_IMPORT_ROWS) return false
  return true
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function queryTable(
  database: ReturnType<typeof getDB>,
  category: ExportCategory,
): Record<string, unknown>[] {
  const meta = TABLE_META[category]
  const rows = database.prepare(`SELECT * FROM ${meta.table}`).all()
  return rows as Record<string, unknown>[]
}

function exportData(categories: ExportCategory[]): ExportData {
  const database = getDB()
  return database.transaction(() => {
    const data: ExportData = {
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
    }
    for (const category of categories) data[category] = queryTable(database, category)
    return data
  })()
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

function importCategory(
  category: ExportCategory,
  rows: Record<string, unknown>[],
  conflictResolution: 'skip' | 'merge' | 'overwrite',
): { imported: number; skipped: number; errors: string[] } {
  const db = getDB()
  const meta = TABLE_META[category]
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  // Get column names for the table
  const columns = db.prepare(`PRAGMA table_info(${meta.table})`).all() as TableColumnInfo[]
  const validColumns = new Set(columns.map((c) => c.name))

  const updateExisting = (
    filteredRow: Record<string, unknown>,
    keyName: string,
    keyValue: unknown,
    overwrite: boolean,
  ) => {
    const immutableColumns = new Set([
      keyName,
      ...columns.filter((column) => column.pk > 0).map((column) => column.name),
    ])
    const updateColumns = overwrite
      ? columns.filter((column) => !immutableColumns.has(column.name))
      : columns.filter(
          (column) =>
            !immutableColumns.has(column.name) &&
            Object.prototype.hasOwnProperty.call(filteredRow, column.name),
        )

    if (updateColumns.length === 0) return

    const values: unknown[] = []
    const assignments = updateColumns.map((column) => {
      if (Object.prototype.hasOwnProperty.call(filteredRow, column.name)) {
        values.push(filteredRow[column.name])
        return `${column.name} = ?`
      }
      if (column.dflt_value !== null && column.dflt_value !== undefined) {
        return `${column.name} = ${column.dflt_value}`
      }
      if (column.notnull) {
        throw new Error(`cannot overwrite missing required column "${column.name}"`)
      }
      return `${column.name} = NULL`
    })

    db.prepare(`UPDATE ${meta.table} SET ${assignments.join(', ')} WHERE ${keyName} = ?`).run(
      ...values,
      keyValue,
    )
  }

  for (const row of rows) {
    try {
      // Filter out columns that don't exist in the current schema
      const filteredRow: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(row)) {
        if (validColumns.has(key)) {
          filteredRow[key] = value
        }
      }

      const colNames = Object.keys(filteredRow)
      if (colNames.length === 0) {
        skipped++
        continue
      }

      if (meta.key && !meta.hasAutoId) {
        // Table has a natural key (like settings.key or chat_sessions.id)
        const keyVal = filteredRow[meta.key]
        if (keyVal === undefined || keyVal === null) {
          errors.push(`${category}: missing key "${meta.key}"`)
          skipped++
          continue
        }

        const existing = db.prepare(`SELECT 1 FROM ${meta.table} WHERE ${meta.key} = ?`).get(keyVal)

        if (existing) {
          if (conflictResolution === 'skip') {
            skipped++
            continue
          } else if (conflictResolution === 'merge' || conflictResolution === 'overwrite') {
            updateExisting(filteredRow, meta.key, keyVal, conflictResolution === 'overwrite')
            imported++
            continue
          }
        }
      }

      if (meta.hasAutoId) {
        // Table with auto-increment id
        const existingId = filteredRow['id']
        if (existingId !== undefined && existingId !== null) {
          const existing = db.prepare(`SELECT 1 FROM ${meta.table} WHERE id = ?`).get(existingId)

          if (existing) {
            if (conflictResolution === 'skip') {
              skipped++
              continue
            } else if (conflictResolution === 'merge' || conflictResolution === 'overwrite') {
              updateExisting(filteredRow, 'id', existingId, conflictResolution === 'overwrite')
              imported++
              continue
            }
          }
        }
      }

      // Insert the row
      const placeholders = colNames.map(() => '?').join(', ')
      const values = colNames.map((c) => filteredRow[c])
      db.prepare(`INSERT INTO ${meta.table} (${colNames.join(', ')}) VALUES (${placeholders})`).run(
        ...values,
      )
      imported++
    } catch (err) {
      errors.push(`${category}: ${String(err)}`)
      skipped++
    }
  }

  return { imported, skipped, errors }
}

function readValidatedImportFile(filePath: string): { data?: ExportData; error?: string } {
  if (!existsSync(filePath)) return { error: '文件不存在' }
  if (statSync(filePath).size > MAX_IMPORT_FILE_BYTES) {
    return { error: '导入文件超过 32 MB 上限' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return { error: 'JSON 格式无效' }
  }
  if (!validateExportData(parsed)) {
    return { error: '数据格式校验失败：版本、字段或数据规模不受支持' }
  }
  return { data: parsed }
}

function normalizeImportOptions(options?: ImportOptions): ImportOptions {
  const conflictResolution = options?.conflictResolution ?? 'skip'
  if (!['skip', 'merge', 'overwrite'].includes(conflictResolution)) {
    throw new Error('无效的冲突处理策略')
  }
  const requested = options?.selectedData ?? ALL_CATEGORIES
  if (!Array.isArray(requested) || requested.some((category) => !TABLE_META[category])) {
    throw new Error('导入类别无效')
  }
  return { conflictResolution, selectedData: [...new Set(requested)] }
}

function importValidatedData(data: ExportData, options?: ImportOptions): ImportResult {
  const normalized = normalizeImportOptions(options)
  const database = getDB()
  const backup = createVerifiedDatabaseBackup(database, {
    kind: 'pre-import',
    databasePath: getDatabasePath(),
  })
  const importResult: ImportResult = {
    success: true,
    imported: {},
    skipped: {},
    errors: [],
    backup,
  }

  try {
    const doImport = database.transaction(() => {
      for (const category of normalized.selectedData) {
        const rows = data[category]
        if (!rows || rows.length === 0) continue
        const categoryResult = importCategory(category, rows, normalized.conflictResolution)
        importResult.imported[category] = categoryResult.imported
        importResult.skipped[category] = categoryResult.skipped
        importResult.errors.push(...categoryResult.errors)
      }
      if (importResult.errors.length > 0) {
        throw new Error('便携数据导入校验失败，事务已回滚')
      }
    })
    doImport()
    return importResult
  } catch (error) {
    return {
      ...importResult,
      success: false,
      imported: Object.fromEntries(
        Object.keys(importResult.imported).map((category) => [category, 0]),
      ),
      errors:
        importResult.errors.length > 0
          ? importResult.errors
          : [error instanceof Error ? error.message : String(error)],
    }
  }
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerExportIPC(dependencies: ExportIpcDependencies): void {
  let importInProgress = false

  const importWithCoordination = async (
    data: ExportData,
    options?: ImportOptions,
  ): Promise<ImportResult> => {
    if (importInProgress) {
      return {
        success: false,
        imported: {},
        skipped: {},
        errors: ['A portable data import is already in progress'],
      }
    }

    importInProgress = true
    try {
      const flushResult = await dependencies.requestRendererFlush()
      if (!flushResult.ok) {
        return {
          success: false,
          imported: {},
          skipped: {},
          errors: [flushResult.error || 'Unable to persist all open windows before import'],
        }
      }

      const result = importValidatedData(data, options)
      if (result.success) dependencies.scheduleRendererReload()
      return result
    } finally {
      importInProgress = false
    }
  }

  // Export data to JSON file
  ipcMain.handle(
    'export-data',
    async (
      _e,
      categories: ExportCategory[],
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        if (!Array.isArray(categories) || categories.length === 0) {
          return { success: false, error: '请至少选择一个数据类别' }
        }

        const validCategories = categories.filter((c) => TABLE_META[c])
        if (validCategories.length === 0) {
          return { success: false, error: '没有有效的数据类别' }
        }

        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const result = await dialog.showSaveDialog(win, {
          title: '导出数据',
          defaultPath: `codehelper-export-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: '用户取消' }
        }

        const filePath = result.filePath
        const pathError = validateFilePath(filePath)
        if (pathError) {
          return { success: false, error: pathError }
        }

        const data = exportData(validCategories)
        const json = JSON.stringify(data, null, 2)
        writeFileSync(filePath, json, 'utf-8')

        return { success: true, filePath }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Import data from JSON file
  ipcMain.handle('import-data', async (_e, options?: ImportOptions): Promise<ImportResult> => {
    try {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(win, {
        title: '导入数据',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, imported: {}, skipped: {}, errors: ['用户取消'] }
      }

      const filePath = result.filePaths[0]
      const pathError = validateFilePath(filePath)
      if (pathError) {
        return { success: false, imported: {}, skipped: {}, errors: [pathError] }
      }
      const validated = readValidatedImportFile(filePath)
      if (!validated.data) {
        return {
          success: false,
          imported: {},
          skipped: {},
          errors: [validated.error ?? '导入失败'],
        }
      }
      return await importWithCoordination(validated.data, options)
    } catch (err) {
      return {
        success: false,
        imported: {},
        skipped: {},
        errors: [String(err)],
      }
    }
  })

  // Get data counts for the export UI
  ipcMain.handle('export-get-counts', () => {
    const db = getDB()
    const counts: Record<string, number> = {}
    for (const cat of ALL_CATEGORIES) {
      const meta = TABLE_META[cat]
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${meta.table}`).get() as {
        count: number
      }
      counts[cat] = row.count
    }
    return counts
  })
}
