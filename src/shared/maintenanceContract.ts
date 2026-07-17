export const DATABASE_BACKUP_MANIFEST_VERSION = 1 as const

export type DatabaseBackupKind = 'manual' | 'pre-import' | 'pre-migration'
export type DatabaseBackupIntegrity = 'ok' | 'failed'

export interface DatabaseBackupRecord {
  manifestVersion: typeof DATABASE_BACKUP_MANIFEST_VERSION
  id: string
  kind: DatabaseBackupKind
  createdAt: string
  verifiedAt: string
  filePath: string
  manifestPath: string
  sizeBytes: number
  sha256: string
  integrity: DatabaseBackupIntegrity
  quickCheck: string[]
  applicationVersion: string
  applicationSchemaVersion: number
  componentSchemaVersions: Record<string, number>
}

export interface DatabaseBackupListResult {
  directoryPath: string
  backups: DatabaseBackupRecord[]
  warnings: string[]
}

export interface DatabaseBackupCreateResult {
  success: boolean
  backup?: DatabaseBackupRecord
  error?: string
}

export interface OpenBackupDirectoryResult {
  success: boolean
  directoryPath: string
  error?: string
}

export interface RecoveryLayerEntry {
  key: string
  value: string
}

export interface RecoveryLayerExportResult {
  success: boolean
  filePath?: string
  entryCount?: number
  error?: string
}

export interface PortableImportResult {
  success: boolean
  imported: Record<string, number>
  skipped: Record<string, number>
  errors: string[]
  backup?: DatabaseBackupRecord
}
