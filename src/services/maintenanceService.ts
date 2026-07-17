import { invoke } from './ipc'
import type {
  DatabaseBackupCreateResult,
  DatabaseBackupListResult,
  OpenBackupDirectoryResult,
  RecoveryLayerEntry,
  RecoveryLayerExportResult,
} from '../shared/maintenanceContract'

export function listDatabaseBackups(): Promise<DatabaseBackupListResult> {
  return invoke<DatabaseBackupListResult>('database-backups-list')
}

export async function createDatabaseBackup(): Promise<DatabaseBackupCreateResult> {
  const result = await invoke<DatabaseBackupCreateResult>('database-backup-create')
  if (!result.success) throw new Error(result.error || '创建数据库备份失败')
  return result
}

export async function openDatabaseBackupDirectory(): Promise<OpenBackupDirectoryResult> {
  const result = await invoke<OpenBackupDirectoryResult>('database-backups-open-directory')
  if (!result.success) throw new Error(result.error || '无法打开备份目录')
  return result
}

export async function exportRecoveryLayer(
  entries: RecoveryLayerEntry[],
): Promise<RecoveryLayerExportResult> {
  const result = await invoke<RecoveryLayerExportResult>('recovery-layer-export', entries)
  if (!result.success) throw new Error(result.error || '导出恢复层失败')
  return result
}
