export const DATABASE_RECOVERY_NOTICE_VERSION = 1
export const DATABASE_RECOVERY_NOTICE_KEY = 'database_recovery_notice_v1'

export type DatabaseRecoveryReason = 'SQLITE_CORRUPT' | 'SQLITE_NOTADB' | 'quick-check-failed'

export interface IsolatedDatabaseFile {
  sourcePath: string
  backupPath: string
}

export interface DatabaseRecoveryNotice {
  version: typeof DATABASE_RECOVERY_NOTICE_VERSION
  reason: DatabaseRecoveryReason
  detectedAt: string
  databasePath: string
  backupPath: string
  isolatedFiles: IsolatedDatabaseFile[]
  quickCheckResult: string[] | null
}

const RECOVERY_REASONS = new Set<DatabaseRecoveryReason>([
  'SQLITE_CORRUPT',
  'SQLITE_NOTADB',
  'quick-check-failed',
])

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maxLength) : null
}

export function parseDatabaseRecoveryNotice(value: string | null): DatabaseRecoveryNotice | null {
  if (!value) return null
  try {
    const raw = JSON.parse(value) as Partial<DatabaseRecoveryNotice>
    if (raw.version !== DATABASE_RECOVERY_NOTICE_VERSION || !RECOVERY_REASONS.has(raw.reason!)) {
      return null
    }
    const detectedAt = boundedString(raw.detectedAt, 100)
    const databasePath = boundedString(raw.databasePath, 4096)
    const backupPath = boundedString(raw.backupPath, 4096)
    if (!detectedAt || !databasePath || !backupPath || !Array.isArray(raw.isolatedFiles))
      return null
    const isolatedFiles = raw.isolatedFiles.slice(0, 8).flatMap((item) => {
      const sourcePath = boundedString(item?.sourcePath, 4096)
      const isolatedPath = boundedString(item?.backupPath, 4096)
      return sourcePath && isolatedPath ? [{ sourcePath, backupPath: isolatedPath }] : []
    })
    if (isolatedFiles.length === 0) return null
    const quickCheckResult = Array.isArray(raw.quickCheckResult)
      ? raw.quickCheckResult.slice(0, 20).map((item) => String(item).slice(0, 500))
      : null
    return {
      version: DATABASE_RECOVERY_NOTICE_VERSION,
      reason: raw.reason!,
      detectedAt,
      databasePath,
      backupPath,
      isolatedFiles,
      quickCheckResult,
    }
  } catch {
    return null
  }
}

export function serializeDatabaseRecoveryNotice(notice: DatabaseRecoveryNotice): string {
  return JSON.stringify(notice)
}
