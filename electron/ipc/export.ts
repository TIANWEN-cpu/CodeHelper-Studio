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
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { getDB } from '../db/index'

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

interface ImportResult {
  success: boolean
  imported: Record<string, number>
  skipped: Record<string, number>
  errors: string[]
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateExportData(data: unknown): data is ExportData {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  if (typeof obj.version !== 'number' || obj.version < 1) return false
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
  return true
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function queryTable(category: ExportCategory): Record<string, unknown>[] {
  const meta = TABLE_META[category]
  const rows = getDB().prepare(`SELECT * FROM ${meta.table}`).all()
  return rows as Record<string, unknown>[]
}

function exportData(categories: ExportCategory[]): ExportData {
  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
  }
  for (const cat of categories) {
    data[cat] = queryTable(cat)
  }
  return data
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
  const columns = db.prepare(`PRAGMA table_info(${meta.table})`).all() as Array<{ name: string }>
  const validColumns = new Set(columns.map((c) => c.name))

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
          } else if (conflictResolution === 'merge') {
            // For merge, update non-key fields
            const updateCols = colNames.filter((c) => c !== meta.key)
            if (updateCols.length > 0) {
              const setClauses = updateCols.map((c) => `${c} = ?`).join(', ')
              const values = updateCols.map((c) => filteredRow[c])
              db.prepare(`UPDATE ${meta.table} SET ${setClauses} WHERE ${meta.key} = ?`).run(
                ...values,
                keyVal,
              )
            }
            imported++
            continue
          }
          // overwrite: delete then insert
          db.prepare(`DELETE FROM ${meta.table} WHERE ${meta.key} = ?`).run(keyVal)
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
            } else if (conflictResolution === 'merge') {
              const updateCols = colNames.filter((c) => c !== 'id')
              if (updateCols.length > 0) {
                const setClauses = updateCols.map((c) => `${c} = ?`).join(', ')
                const values = updateCols.map((c) => filteredRow[c])
                db.prepare(`UPDATE ${meta.table} SET ${setClauses} WHERE id = ?`).run(
                  ...values,
                  existingId,
                )
              }
              imported++
              continue
            }
            // overwrite
            db.prepare(`DELETE FROM ${meta.table} WHERE id = ?`).run(existingId)
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

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerExportIPC(): void {
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

        const data = exportData(validCategories)
        const json = JSON.stringify(data, null, 2)
        writeFileSync(result.filePath, json, 'utf-8')

        return { success: true, filePath: result.filePath }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  // Export data to a specific path (no dialog, for progress-based flows)
  ipcMain.handle(
    'export-data-to-path',
    async (
      _e,
      categories: ExportCategory[],
      filePath: string,
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      try {
        if (!Array.isArray(categories) || categories.length === 0) {
          return { success: false, error: '请至少选择一个数据类别' }
        }
        if (typeof filePath !== 'string' || !filePath.trim()) {
          return { success: false, error: '文件路径无效' }
        }

        const validCategories = categories.filter((c) => TABLE_META[c])
        if (validCategories.length === 0) {
          return { success: false, error: '没有有效的数据类别' }
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
      if (!existsSync(filePath)) {
        return { success: false, imported: {}, skipped: {}, errors: ['文件不存在'] }
      }

      const raw = readFileSync(filePath, 'utf-8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { success: false, imported: {}, skipped: {}, errors: ['JSON 格式无效'] }
      }

      if (!validateExportData(parsed)) {
        return {
          success: false,
          imported: {},
          skipped: {},
          errors: ['数据格式校验失败：缺少必要字段或数据类型不正确'],
        }
      }

      const conflictResolution = options?.conflictResolution ?? 'skip'
      const selectedData = options?.selectedData ?? ALL_CATEGORIES

      const importResult: ImportResult = {
        success: true,
        imported: {},
        skipped: {},
        errors: [],
      }

      const db = getDB()

      // Use a transaction for the entire import
      const doImport = db.transaction(() => {
        for (const cat of selectedData) {
          const rows = parsed[cat]
          if (!rows || !Array.isArray(rows) || rows.length === 0) continue

          const catResult = importCategory(cat, rows, conflictResolution)
          importResult.imported[cat] = catResult.imported
          importResult.skipped[cat] = catResult.skipped
          importResult.errors.push(...catResult.errors)
        }
      })

      doImport()

      if (
        importResult.errors.length > 0 &&
        Object.values(importResult.imported).every((v) => v === 0)
      ) {
        importResult.success = false
      }

      return importResult
    } catch (err) {
      return {
        success: false,
        imported: {},
        skipped: {},
        errors: [String(err)],
      }
    }
  })

  // Import data from a specific file path
  ipcMain.handle(
    'import-data-from-path',
    async (_e, filePath: string, options?: ImportOptions): Promise<ImportResult> => {
      try {
        if (typeof filePath !== 'string' || !filePath.trim()) {
          return { success: false, imported: {}, skipped: {}, errors: ['文件路径无效'] }
        }
        if (!existsSync(filePath)) {
          return { success: false, imported: {}, skipped: {}, errors: ['文件不存在'] }
        }

        const raw = readFileSync(filePath, 'utf-8')
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return { success: false, imported: {}, skipped: {}, errors: ['JSON 格式无效'] }
        }

        if (!validateExportData(parsed)) {
          return {
            success: false,
            imported: {},
            skipped: {},
            errors: ['数据格式校验失败：缺少必要字段或数据类型不正确'],
          }
        }

        const conflictResolution = options?.conflictResolution ?? 'skip'
        const selectedData = options?.selectedData ?? ALL_CATEGORIES

        const importResult: ImportResult = {
          success: true,
          imported: {},
          skipped: {},
          errors: [],
        }

        const db = getDB()

        const doImport = db.transaction(() => {
          for (const cat of selectedData) {
            const rows = parsed[cat]
            if (!rows || !Array.isArray(rows) || rows.length === 0) continue

            const catResult = importCategory(cat, rows, conflictResolution)
            importResult.imported[cat] = catResult.imported
            importResult.skipped[cat] = catResult.skipped
            importResult.errors.push(...catResult.errors)
          }
        })

        doImport()

        if (
          importResult.errors.length > 0 &&
          Object.values(importResult.imported).every((v) => v === 0)
        ) {
          importResult.success = false
        }

        return importResult
      } catch (err) {
        return {
          success: false,
          imported: {},
          skipped: {},
          errors: [String(err)],
        }
      }
    },
  )

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
