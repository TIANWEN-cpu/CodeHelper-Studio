export const DATABASE_BACKUP_MANIFEST_VERSION = 1 as const
export const KNOWLEDGE_MAINTENANCE_BACKUP_MANIFEST_VERSION = 2 as const

export type DatabaseBackupManifestVersion =
  | typeof DATABASE_BACKUP_MANIFEST_VERSION
  | typeof KNOWLEDGE_MAINTENANCE_BACKUP_MANIFEST_VERSION

export type DatabaseBackupKind = 'manual' | 'pre-import' | 'pre-migration'
export type DatabaseBackupIntegrity = 'ok' | 'failed'

export interface DatabaseBackupRecord {
  manifestVersion: DatabaseBackupManifestVersion
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
  maintenanceState?: Record<string, unknown>
  sourceDatabasePath?: string
  sourceDatabaseIdentity?: Record<string, unknown>
  sourceDatabaseFullFingerprint?: string
  backupDatabaseFullFingerprint?: string
  planSha256?: string
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
