import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import {
  createVerifiedDatabaseBackup,
  getDatabaseBackupDirectory,
  listDatabaseBackups,
} from '../db/databaseBackup'
import { getDB, getDatabasePath } from '../db/index'
import type {
  DatabaseBackupCreateResult,
  OpenBackupDirectoryResult,
  RecoveryLayerEntry,
  RecoveryLayerExportResult,
} from '../../src/shared/maintenanceContract'
import type { WindowCloseFlushResult } from '../utils/windowCloseHandshake'

const MAX_RECOVERY_LAYER_ENTRIES = 100
const MAX_RECOVERY_LAYER_KEY_BYTES = 512
const MAX_RECOVERY_LAYER_ENTRY_BYTES = 2 * 1024 * 1024
const MAX_RECOVERY_LAYER_TOTAL_BYTES = 8 * 1024 * 1024
const DEFAULT_MANUAL_BACKUP_COOLDOWN_MS = 60_000

export interface MaintenanceIpcDependencies {
  requestRendererFlush: () => Promise<WindowCloseFlushResult>
  now?: () => number
  manualBackupCooldownMs?: number
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export function isRecoveryLayerKey(key: string): boolean {
  return (
    key.startsWith('codehelper-') &&
    (key.includes('.migration-backup.') || key.includes('.corrupt.'))
  )
}

export function validateRecoveryLayerEntries(value: unknown): RecoveryLayerEntry[] {
  if (!Array.isArray(value)) throw new Error('Recovery layer entries must be an array')
  if (value.length > MAX_RECOVERY_LAYER_ENTRIES) {
    throw new Error(`Recovery layer export is limited to ${MAX_RECOVERY_LAYER_ENTRIES} entries`)
  }

  let totalBytes = 0
  const seen = new Set<string>()
  const entries: RecoveryLayerEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('Invalid recovery layer entry')
    const { key, value: entryValue } = item as { key?: unknown; value?: unknown }
    if (typeof key !== 'string' || !isRecoveryLayerKey(key)) {
      throw new Error('Recovery layer key is outside the CodeHelper migration/corruption boundary')
    }
    if (typeof entryValue !== 'string') throw new Error('Recovery layer value must be a string')
    if (seen.has(key)) throw new Error('Recovery layer keys must be unique')
    const keyBytes = byteLength(key)
    const valueBytes = byteLength(entryValue)
    if (keyBytes > MAX_RECOVERY_LAYER_KEY_BYTES) throw new Error('Recovery layer key is too large')
    if (valueBytes > MAX_RECOVERY_LAYER_ENTRY_BYTES) {
      throw new Error('Recovery layer entry exceeds the per-entry size limit')
    }
    totalBytes += keyBytes + valueBytes
    if (totalBytes > MAX_RECOVERY_LAYER_TOTAL_BYTES) {
      throw new Error('Recovery layer export exceeds the total size limit')
    }
    seen.add(key)
    entries.push({ key, value: entryValue })
  }
  return entries
}

export function registerMaintenanceIPC(dependencies: MaintenanceIpcDependencies): void {
  const now = dependencies.now ?? Date.now
  const manualBackupCooldownMs =
    dependencies.manualBackupCooldownMs ?? DEFAULT_MANUAL_BACKUP_COOLDOWN_MS
  let backupInProgress = false
  let lastSuccessfulBackupAt: number | null = null

  ipcMain.handle('database-backups-list', () => listDatabaseBackups())

  ipcMain.handle('database-backup-create', async (): Promise<DatabaseBackupCreateResult> => {
    if (backupInProgress) {
      return { success: false, error: 'A database backup is already in progress' }
    }
    const elapsed = lastSuccessfulBackupAt === null ? null : now() - lastSuccessfulBackupAt
    if (elapsed !== null && elapsed < manualBackupCooldownMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((manualBackupCooldownMs - elapsed) / 1000))
      return {
        success: false,
        error: `A verified backup was just created; retry in ${retryAfterSeconds} seconds`,
      }
    }

    backupInProgress = true
    try {
      const flushResult = await dependencies.requestRendererFlush()
      if (!flushResult.ok) {
        return {
          success: false,
          error: flushResult.error || 'Unable to persist all open windows before backup',
        }
      }
      const backup = createVerifiedDatabaseBackup(getDB(), {
        kind: 'manual',
        databasePath: getDatabasePath(),
        applicationVersion: app.getVersion(),
      })
      lastSuccessfulBackupAt = now()
      return { success: true, backup }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      backupInProgress = false
    }
  })

  ipcMain.handle(
    'database-backups-open-directory',
    async (): Promise<OpenBackupDirectoryResult> => {
      const directoryPath = getDatabaseBackupDirectory()
      try {
        mkdirSync(directoryPath, { recursive: true })
        const error = await shell.openPath(directoryPath)
        return error ? { success: false, directoryPath, error } : { success: true, directoryPath }
      } catch (error) {
        return {
          success: false,
          directoryPath,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )

  ipcMain.handle(
    'recovery-layer-export',
    async (_event, value: unknown): Promise<RecoveryLayerExportResult> => {
      try {
        const entries = validateRecoveryLayerEntries(value)
        if (entries.length === 0) return { success: false, error: 'No recovery entries to export' }
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        const result = await dialog.showSaveDialog(win, {
          title: 'Export CodeHelper recovery layer',
          defaultPath: `codehelper-recovery-layer-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON file', extensions: ['json'] }],
        })
        if (result.canceled || !result.filePath) {
          return { success: false, error: 'User cancelled' }
        }
        writeFileSync(
          result.filePath,
          `${JSON.stringify(
            {
              version: 1,
              exportedAt: new Date().toISOString(),
              purpose: 'diagnostic-recovery-layer-export',
              entries,
            },
            null,
            2,
          )}\n`,
          'utf8',
        )
        return { success: true, filePath: result.filePath, entryCount: entries.length }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )
}
