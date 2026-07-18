import Database from 'better-sqlite3'
import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import {
  DATABASE_BACKUP_MANIFEST_VERSION,
  KNOWLEDGE_MAINTENANCE_BACKUP_MANIFEST_VERSION,
  type DatabaseBackupIntegrity,
  type DatabaseBackupKind,
  type DatabaseBackupListResult,
  type DatabaseBackupManifestVersion,
  type DatabaseBackupRecord,
} from '../../src/shared/maintenanceContract'

interface DatabaseBackupManifest {
  manifestVersion: DatabaseBackupManifestVersion
  id: string
  kind: DatabaseBackupKind
  createdAt: string
  verifiedAt: string
  fileName: string
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

export interface CreateDatabaseBackupOptions {
  kind: DatabaseBackupKind
  databasePath: string
  backupDirectory?: string
  applicationVersion?: string
  now?: Date
  id?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function tableExists(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  )
}

export function readComponentSchemaVersions(database: Database.Database): Record<string, number> {
  if (!tableExists(database, 'schema_migrations')) return {}
  const rows = database
    .prepare('SELECT component, version FROM schema_migrations ORDER BY component')
    .all() as Array<{ component: unknown; version: unknown }>
  const versions: Record<string, number> = {}
  for (const row of rows) {
    if (typeof row.component !== 'string') continue
    const version = Number(row.version)
    if (Number.isSafeInteger(version) && version >= 0) versions[row.component] = version
  }
  return versions
}

export function readApplicationSchemaVersion(database: Database.Database): number {
  return readComponentSchemaVersions(database).application ?? 0
}

export function runDatabaseQuickCheck(database: Database.Database): string[] {
  const rows = database.prepare('PRAGMA quick_check').all() as Array<Record<string, unknown>>
  return rows.flatMap((row) => Object.values(row).map((value) => String(value)))
}

function quickCheckPassed(results: string[]): boolean {
  return results.length === 1 && results[0].trim().toLowerCase() === 'ok'
}

function fileSha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function getDatabaseBackupDirectory(userDataPath = app.getPath('userData')): string {
  return join(userDataPath, 'backups')
}

function safeTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

function writeManifest(manifestPath: string, manifest: DatabaseBackupManifest): void {
  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${randomUUID()}`
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  renameSync(temporaryPath, manifestPath)
}

function toRecord(
  directoryPath: string,
  manifestPath: string,
  manifest: DatabaseBackupManifest,
): DatabaseBackupRecord {
  return {
    ...manifest,
    filePath: join(directoryPath, manifest.fileName),
    manifestPath,
  }
}

export function createVerifiedDatabaseBackup(
  database: Database.Database,
  options: CreateDatabaseBackupOptions,
): DatabaseBackupRecord {
  const createdAt = (options.now ?? new Date()).toISOString()
  const id = options.id ?? randomUUID()
  const backupDirectory = resolve(options.backupDirectory ?? getDatabaseBackupDirectory())
  mkdirSync(backupDirectory, { recursive: true })

  const fileName = `codehelper-${options.kind}-${safeTimestamp(new Date(createdAt))}-${id}.db`
  const filePath = join(backupDirectory, fileName)
  const manifestPath = `${filePath}.manifest.json`
  if (existsSync(filePath) || existsSync(manifestPath)) {
    throw new Error('Database backup destination already exists')
  }

  database.prepare('VACUUM INTO ?').run(filePath)

  let verificationDatabase: Database.Database | null = null
  let quickCheck: string[] = []
  let componentSchemaVersions: Record<string, number> = {}
  try {
    verificationDatabase = new Database(filePath, { readonly: true, fileMustExist: true })
    quickCheck = runDatabaseQuickCheck(verificationDatabase)
    componentSchemaVersions = readComponentSchemaVersions(verificationDatabase)
  } finally {
    verificationDatabase?.close()
  }

  const verifiedAt = new Date().toISOString()
  const integrity: DatabaseBackupIntegrity = quickCheckPassed(quickCheck) ? 'ok' : 'failed'
  const manifest: DatabaseBackupManifest = {
    manifestVersion: DATABASE_BACKUP_MANIFEST_VERSION,
    id,
    kind: options.kind,
    createdAt,
    verifiedAt,
    fileName,
    sizeBytes: statSync(filePath).size,
    sha256: fileSha256(filePath),
    integrity,
    quickCheck,
    applicationVersion: options.applicationVersion ?? app.getVersion(),
    applicationSchemaVersion: componentSchemaVersions.application ?? 0,
    componentSchemaVersions,
  }
  writeManifest(manifestPath, manifest)

  const record = toRecord(backupDirectory, manifestPath, manifest)
  if (record.integrity !== 'ok') {
    throw new Error(`Database backup verification failed: ${record.quickCheck.join('; ')}`)
  }
  return record
}

function parseManifest(value: unknown): DatabaseBackupManifest | null {
  if (!isRecord(value)) return null
  const manifestVersion = value.manifestVersion
  if (
    manifestVersion !== DATABASE_BACKUP_MANIFEST_VERSION &&
    manifestVersion !== KNOWLEDGE_MAINTENANCE_BACKUP_MANIFEST_VERSION
  ) {
    return null
  }
  if (typeof value.id !== 'string' || !value.id) return null
  if (!['manual', 'pre-import', 'pre-migration'].includes(String(value.kind))) return null
  if (typeof value.createdAt !== 'string' || typeof value.verifiedAt !== 'string') return null
  if (typeof value.fileName !== 'string' || basename(value.fileName) !== value.fileName) return null
  if (!value.fileName.endsWith('.db')) return null
  if (!Number.isSafeInteger(value.sizeBytes) || Number(value.sizeBytes) < 0) return null
  if (!isSha256(value.sha256)) return null
  if (value.integrity !== 'ok' && value.integrity !== 'failed') return null
  if (
    !Array.isArray(value.quickCheck) ||
    !value.quickCheck.every((item) => typeof item === 'string')
  ) {
    return null
  }
  if (typeof value.applicationVersion !== 'string') return null
  if (!Number.isSafeInteger(value.applicationSchemaVersion)) return null
  if (!isRecord(value.componentSchemaVersions)) return null
  const componentSchemaVersions: Record<string, number> = {}
  for (const [component, version] of Object.entries(value.componentSchemaVersions)) {
    if (!Number.isSafeInteger(version) || Number(version) < 0) return null
    componentSchemaVersions[component] = Number(version)
  }

  let maintenanceBinding: Pick<
    DatabaseBackupManifest,
    | 'maintenanceState'
    | 'sourceDatabasePath'
    | 'sourceDatabaseIdentity'
    | 'sourceDatabaseFullFingerprint'
    | 'backupDatabaseFullFingerprint'
    | 'planSha256'
  > = {}
  if (manifestVersion === KNOWLEDGE_MAINTENANCE_BACKUP_MANIFEST_VERSION) {
    if (!isRecord(value.maintenanceState)) return null
    if (
      typeof value.sourceDatabasePath !== 'string' ||
      !value.sourceDatabasePath ||
      !isAbsolute(value.sourceDatabasePath)
    ) {
      return null
    }
    if (
      !isRecord(value.sourceDatabaseIdentity) ||
      !isRecord(value.sourceDatabaseIdentity.database) ||
      (value.sourceDatabaseIdentity.wal !== null && !isRecord(value.sourceDatabaseIdentity.wal))
    ) {
      return null
    }
    if (
      !isSha256(value.sourceDatabaseFullFingerprint) ||
      !isSha256(value.backupDatabaseFullFingerprint) ||
      !isSha256(value.planSha256)
    ) {
      return null
    }
    if (
      value.sourceDatabaseFullFingerprint.toLowerCase() !==
      value.backupDatabaseFullFingerprint.toLowerCase()
    ) {
      return null
    }
    maintenanceBinding = {
      maintenanceState: value.maintenanceState,
      sourceDatabasePath: value.sourceDatabasePath,
      sourceDatabaseIdentity: value.sourceDatabaseIdentity,
      sourceDatabaseFullFingerprint: value.sourceDatabaseFullFingerprint.toLowerCase(),
      backupDatabaseFullFingerprint: value.backupDatabaseFullFingerprint.toLowerCase(),
      planSha256: value.planSha256.toLowerCase(),
    }
  }

  return {
    manifestVersion,
    id: value.id,
    kind: value.kind as DatabaseBackupKind,
    createdAt: value.createdAt,
    verifiedAt: value.verifiedAt,
    fileName: value.fileName,
    sizeBytes: Number(value.sizeBytes),
    sha256: value.sha256.toLowerCase(),
    integrity: value.integrity,
    quickCheck: value.quickCheck,
    applicationVersion: value.applicationVersion,
    applicationSchemaVersion: Number(value.applicationSchemaVersion),
    componentSchemaVersions,
    ...maintenanceBinding,
  }
}

function verifyCurrentBackupFile(
  filePath: string,
  manifestName: string,
  manifest: DatabaseBackupManifest,
): string | null {
  if (manifest.integrity !== 'ok' || !quickCheckPassed(manifest.quickCheck)) {
    return `Backup manifest reports failed integrity: ${manifestName}`
  }

  const fileStats = lstatSync(filePath)
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    return `Backup path is not a regular file for manifest: ${manifestName}`
  }
  if (fileStats.size !== manifest.sizeBytes) {
    return `Backup size does not match manifest: ${manifestName}`
  }
  if (fileSha256(filePath) !== manifest.sha256) {
    return `Backup SHA-256 does not match manifest: ${manifestName}`
  }

  let verificationDatabase: Database.Database | null = null
  try {
    verificationDatabase = new Database(filePath, { readonly: true, fileMustExist: true })
    const quickCheck = runDatabaseQuickCheck(verificationDatabase)
    if (!quickCheckPassed(quickCheck)) {
      return `Backup failed current SQLite quick_check for manifest ${manifestName}: ${quickCheck.join('; ') || 'no result'}`
    }
  } catch (error) {
    return `Unable to verify backup database for manifest ${manifestName}: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    verificationDatabase?.close()
  }

  return null
}

export function listDatabaseBackups(
  backupDirectory = getDatabaseBackupDirectory(),
): DatabaseBackupListResult {
  const directoryPath = resolve(backupDirectory)
  mkdirSync(directoryPath, { recursive: true })
  const warnings: string[] = []
  const backups: DatabaseBackupRecord[] = []

  for (const name of readdirSync(directoryPath).filter((entry) =>
    entry.endsWith('.manifest.json'),
  )) {
    const manifestPath = join(directoryPath, name)
    let manifest: DatabaseBackupManifest | null
    try {
      manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
    } catch (error) {
      warnings.push(
        `Unable to read backup manifest ${name}: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }
    if (!manifest) {
      warnings.push(`Ignored invalid backup manifest: ${name}`)
      continue
    }

    const filePath = join(directoryPath, manifest.fileName)
    if (dirname(resolve(filePath)) !== directoryPath || !existsSync(filePath)) {
      warnings.push(`Backup file is missing for manifest: ${name}`)
      continue
    }
    try {
      const warning = verifyCurrentBackupFile(filePath, name, manifest)
      if (warning) {
        warnings.push(warning)
        continue
      }
    } catch (error) {
      warnings.push(
        `Unable to verify backup record ${name}: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }
    backups.push(toRecord(directoryPath, manifestPath, manifest))
  }

  backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  return { directoryPath, backups, warnings }
}
