import Database from 'better-sqlite3'
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import {
  DATABASE_RECOVERY_NOTICE_VERSION,
  type DatabaseRecoveryNotice,
  type IsolatedDatabaseFile,
} from '../../src/shared/databaseRecoveryContract'

export interface OpenDatabaseWithRecoveryResult {
  database: Database.Database
  recoveryNotice: DatabaseRecoveryNotice | null
}

export type DatabaseInitializer = (database: Database.Database) => void

export interface OpenDatabaseWithRecoveryOptions {
  beforeOpenWritable?: (database: Database.Database) => void
}

class QuickCheckFailure extends Error {
  constructor(readonly results: string[]) {
    super(`SQLite quick_check failed: ${results.join('; ') || 'no result'}`)
    this.name = 'QuickCheckFailure'
  }
}

function closeQuietly(database: Database.Database | null): void {
  if (!database) return
  try {
    database.close()
  } catch {
    // Preserve the error that caused the database to be closed.
  }
}

function sqliteCorruptionCode(error: unknown): 'SQLITE_CORRUPT' | 'SQLITE_NOTADB' | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB' ? code : null
}

function runQuickCheck(database: Database.Database): string[] {
  const rows = database.prepare('PRAGMA quick_check').all() as Array<Record<string, unknown>>
  return rows.flatMap((row) => Object.values(row).map((value) => String(value)))
}

function assertQuickCheck(database: Database.Database): void {
  const results = runQuickCheck(database)
  if (results.length !== 1 || results[0].trim().toLowerCase() !== 'ok') {
    throw new QuickCheckFailure(results)
  }
}

function uniqueBackupPath(databasePath: string): string {
  let timestamp = Date.now()
  let backupPath = `${databasePath}.corrupt.${timestamp}`
  while (
    existsSync(backupPath) ||
    existsSync(`${backupPath}-wal`) ||
    existsSync(`${backupPath}-shm`)
  ) {
    timestamp += 1
    backupPath = `${databasePath}.corrupt.${timestamp}`
  }
  return backupPath
}

function isolateDatabaseFiles(
  databasePath: string,
  originalShm: Buffer | null,
): {
  backupPath: string
  isolatedFiles: IsolatedDatabaseFile[]
} {
  const backupPath = uniqueBackupPath(databasePath)
  const candidates = [
    { sourcePath: databasePath, backupPath },
    { sourcePath: `${databasePath}-wal`, backupPath: `${backupPath}-wal` },
    { sourcePath: `${databasePath}-shm`, backupPath: `${backupPath}-shm` },
  ]
  const isolatedFiles: IsolatedDatabaseFile[] = []

  try {
    for (const candidate of candidates) {
      if (candidate.sourcePath === `${databasePath}-shm` && originalShm) {
        writeFileSync(candidate.backupPath, originalShm, { flag: 'wx' })
        isolatedFiles.push(candidate)
        if (existsSync(candidate.sourcePath)) unlinkSync(candidate.sourcePath)
        continue
      }
      if (!existsSync(candidate.sourcePath)) continue
      renameSync(candidate.sourcePath, candidate.backupPath)
      isolatedFiles.push(candidate)
    }
  } catch (error) {
    for (const isolated of [...isolatedFiles].reverse()) {
      if (existsSync(isolated.backupPath) && !existsSync(isolated.sourcePath)) {
        try {
          renameSync(isolated.backupPath, isolated.sourcePath)
        } catch {
          // Keep every successfully isolated file if rollback is no longer possible.
        }
      }
    }
    throw error
  }

  return { backupPath, isolatedFiles }
}

export function openDatabaseWithRecovery(
  databasePath: string,
  initialize: DatabaseInitializer,
  options: OpenDatabaseWithRecoveryOptions = {},
): OpenDatabaseWithRecoveryResult {
  let database: Database.Database | null = null
  const databaseExisted = existsSync(databasePath)
  const shmPath = `${databasePath}-shm`
  const originalShm = existsSync(shmPath) ? readFileSync(shmPath) : null

  try {
    if (databaseExisted) {
      database = new Database(databasePath, { readonly: true, fileMustExist: true })
      assertQuickCheck(database)
      options.beforeOpenWritable?.(database)
      database.close()
      database = null
    }

    database = new Database(databasePath)
    if (!databaseExisted) assertQuickCheck(database)
    initialize(database)
    return { database, recoveryNotice: null }
  } catch (error) {
    closeQuietly(database)
    database = null

    const corruptionCode = sqliteCorruptionCode(error)
    if (!corruptionCode && !(error instanceof QuickCheckFailure)) throw error

    const detectedAt = new Date().toISOString()
    const { backupPath, isolatedFiles } = isolateDatabaseFiles(databasePath, originalShm)
    try {
      database = new Database(databasePath)
      initialize(database)
      return {
        database,
        recoveryNotice: {
          version: DATABASE_RECOVERY_NOTICE_VERSION,
          reason: corruptionCode ?? 'quick-check-failed',
          detectedAt,
          databasePath,
          backupPath,
          isolatedFiles,
          quickCheckResult: error instanceof QuickCheckFailure ? error.results : null,
        },
      }
    } catch (recoveryError) {
      closeQuietly(database)
      throw recoveryError
    }
  }
}
