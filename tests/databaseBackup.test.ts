import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sqliteMocks = vi.hoisted(() => ({
  close: vi.fn(),
  quickCheckByPath: new Map<string, string[]>(),
}))

vi.mock('better-sqlite3', () => ({
  default: class VerificationDatabase {
    constructor(private readonly filePath: string) {}

    prepare(sql: string) {
      if (sql.includes('sqlite_master')) return { get: vi.fn(() => ({ present: 1 })) }
      if (sql.includes('schema_migrations')) {
        return {
          all: vi.fn(() => [
            { component: 'application', version: 1 },
            { component: 'editor-workspace', version: 3 },
          ]),
        }
      }
      if (sql === 'PRAGMA quick_check') {
        return {
          all: vi.fn(() =>
            (sqliteMocks.quickCheckByPath.get(this.filePath) ?? ['ok']).map((result) => ({
              quick_check: result,
            })),
          ),
        }
      }
      throw new Error(`Unexpected verification SQL: ${sql}`)
    }

    close() {
      sqliteMocks.close()
    }
  },
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'unused-test-user-data'),
    getVersion: vi.fn(() => '2.3.0-test'),
  },
}))

const { createVerifiedDatabaseBackup, listDatabaseBackups } =
  await import('../electron/db/databaseBackup')

describe('database backup snapshots', () => {
  let rootDirectory: string
  let backupDirectory: string
  let databasePath: string
  let database: Parameters<typeof createVerifiedDatabaseBackup>[0]
  let prepare: ReturnType<typeof vi.fn>
  let vacuumRun: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sqliteMocks.close.mockClear()
    sqliteMocks.quickCheckByPath.clear()
    rootDirectory = mkdtempSync(join(tmpdir(), 'codehelper-database-backup-'))
    backupDirectory = join(rootDirectory, 'backups')
    databasePath = join(rootDirectory, 'codehelper.db')
    vacuumRun = vi.fn((destination: string) => {
      writeFileSync(destination, 'deterministic sqlite snapshot bytes', 'utf8')
    })
    prepare = vi.fn((sql: string) => {
      if (sql === 'VACUUM INTO ?') return { run: vacuumRun }
      throw new Error(`Unexpected source SQL: ${sql}`)
    })
    database = { prepare } as unknown as Parameters<typeof createVerifiedDatabaseBackup>[0]
  })

  afterEach(() => {
    rmSync(rootDirectory, { recursive: true, force: true })
  })

  it('creates and verifies a VACUUM INTO snapshot with a hashed manifest', () => {
    const backup = createVerifiedDatabaseBackup(database, {
      kind: 'manual',
      databasePath,
      backupDirectory,
      applicationVersion: '2.3.0-test',
      now: new Date('2026-07-17T02:03:04.000Z'),
      id: 'manual-test',
    })

    expect(prepare).toHaveBeenCalledWith('VACUUM INTO ?')
    expect(vacuumRun).toHaveBeenCalledWith(backup.filePath)
    expect(backup.kind).toBe('manual')
    expect(backup.integrity).toBe('ok')
    expect(backup.quickCheck).toEqual(['ok'])
    expect(backup.applicationSchemaVersion).toBe(1)
    expect(backup.componentSchemaVersions).toEqual({
      application: 1,
      'editor-workspace': 3,
    })
    expect(backup.sha256).toBe(
      createHash('sha256').update(readFileSync(backup.filePath)).digest('hex'),
    )

    const manifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8')) as Record<
      string,
      unknown
    >
    expect(manifest).toMatchObject({
      manifestVersion: 1,
      id: 'manual-test',
      kind: 'manual',
      createdAt: '2026-07-17T02:03:04.000Z',
      fileName: 'codehelper-manual-2026-07-17T02-03-04-000Z-manual-test.db',
      sizeBytes: backup.sizeBytes,
      sha256: backup.sha256,
      integrity: 'ok',
      quickCheck: ['ok'],
      applicationVersion: '2.3.0-test',
      applicationSchemaVersion: 1,
    })

    expect(readFileSync(backup.filePath, 'utf8')).toBe('deterministic sqlite snapshot bytes')
    expect(sqliteMocks.close).toHaveBeenCalledTimes(1)
  })

  it('lists valid manifests while reporting invalid and missing backup records', () => {
    const backup = createVerifiedDatabaseBackup(database, {
      kind: 'pre-migration',
      databasePath,
      backupDirectory,
      now: new Date('2026-07-17T03:00:00.000Z'),
      id: 'valid-test',
    })
    const validManifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8')) as Record<
      string,
      unknown
    >

    writeFileSync(join(backupDirectory, 'invalid.manifest.json'), '{not-json', 'utf8')
    writeFileSync(
      join(backupDirectory, 'missing.manifest.json'),
      JSON.stringify({
        ...validManifest,
        id: 'missing-test',
        fileName: 'missing.db',
      }),
      'utf8',
    )
    writeFileSync(
      join(backupDirectory, 'traversal.manifest.json'),
      JSON.stringify({
        ...validManifest,
        id: 'traversal-test',
        fileName: '../outside.db',
      }),
      'utf8',
    )

    const result = listDatabaseBackups(backupDirectory)

    expect(result.backups).toHaveLength(1)
    expect(result.backups[0].id).toBe('valid-test')
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Unable to read backup manifest invalid.manifest.json'),
        expect.stringContaining('Backup file is missing for manifest: missing.manifest.json'),
        expect.stringContaining('Ignored invalid backup manifest: traversal.manifest.json'),
      ]),
    )
  })

  it('lists a maintenance manifest v2 while preserving the app v1 writer', () => {
    const backup = createVerifiedDatabaseBackup(database, {
      kind: 'manual',
      databasePath,
      backupDirectory,
      now: new Date('2026-07-17T03:30:00.000Z'),
      id: 'maintenance-v2',
    })
    const appManifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8')) as Record<
      string,
      unknown
    >
    expect(appManifest.manifestVersion).toBe(1)

    const fingerprint = 'a'.repeat(64)
    const planSha256 = 'b'.repeat(64)
    writeFileSync(
      backup.manifestPath,
      JSON.stringify({
        ...appManifest,
        manifestVersion: 2,
        maintenanceState: {
          tables: {
            knowledge_doc_metadata: false,
            knowledge_link_audit: false,
            knowledge_maintenance_runs: false,
            knowledge_maintenance_actions: false,
          },
          metadata_rows: 0,
          metadata_fingerprint: fingerprint,
          link_audit_rows: 0,
          link_audit_fingerprint: fingerprint,
          maintenance_run_rows: 0,
          maintenance_action_rows: 0,
        },
        sourceDatabasePath: databasePath,
        sourceDatabaseIdentity: {
          database: { path: databasePath, sha256: fingerprint },
          wal: null,
        },
        sourceDatabaseFullFingerprint: fingerprint,
        backupDatabaseFullFingerprint: fingerprint,
        planSha256,
      }),
      'utf8',
    )

    const result = listDatabaseBackups(backupDirectory)

    expect(result.warnings).toEqual([])
    expect(result.backups).toHaveLength(1)
    expect(result.backups[0]).toMatchObject({
      id: 'maintenance-v2',
      manifestVersion: 2,
      sourceDatabasePath: databasePath,
      sourceDatabaseFullFingerprint: fingerprint,
      backupDatabaseFullFingerprint: fingerprint,
      planSha256,
    })

    writeFileSync(
      backup.manifestPath,
      JSON.stringify({
        ...JSON.parse(readFileSync(backup.manifestPath, 'utf8')),
        backupDatabaseFullFingerprint: 'c'.repeat(64),
      }),
      'utf8',
    )
    const mismatched = listDatabaseBackups(backupDirectory)
    expect(mismatched.backups).toEqual([])
    expect(mismatched.warnings).toEqual([
      expect.stringContaining('Ignored invalid backup manifest'),
    ])
  })

  it('rejects a maintenance manifest v2 with incomplete binding evidence', () => {
    const backup = createVerifiedDatabaseBackup(database, {
      kind: 'manual',
      databasePath,
      backupDirectory,
      now: new Date('2026-07-17T03:45:00.000Z'),
      id: 'incomplete-maintenance-v2',
    })
    const appManifest = JSON.parse(readFileSync(backup.manifestPath, 'utf8')) as Record<
      string,
      unknown
    >
    writeFileSync(
      backup.manifestPath,
      JSON.stringify({
        ...appManifest,
        manifestVersion: 2,
        maintenanceState: {},
        sourceDatabasePath: databasePath,
        sourceDatabaseIdentity: { database: {}, wal: null },
        sourceDatabaseFullFingerprint: 'a'.repeat(64),
        backupDatabaseFullFingerprint: 'a'.repeat(64),
      }),
      'utf8',
    )

    const result = listDatabaseBackups(backupDirectory)

    expect(result.backups).toEqual([])
    expect(result.warnings).toContain(
      `Ignored invalid backup manifest: ${backup.manifestPath.split(/[\\/]/).pop()}`,
    )
  })

  it('excludes backups whose current size or SHA-256 no longer matches the manifest', () => {
    const sizeMismatch = createVerifiedDatabaseBackup(database, {
      kind: 'manual',
      databasePath,
      backupDirectory,
      now: new Date('2026-07-17T04:00:00.000Z'),
      id: 'size-mismatch',
    })
    writeFileSync(sizeMismatch.filePath, 'short', 'utf8')

    const hashMismatch = createVerifiedDatabaseBackup(database, {
      kind: 'manual',
      databasePath,
      backupDirectory,
      now: new Date('2026-07-17T05:00:00.000Z'),
      id: 'hash-mismatch',
    })
    const original = readFileSync(hashMismatch.filePath)
    const tampered = Buffer.from(original)
    tampered[0] ^= 0xff
    writeFileSync(hashMismatch.filePath, tampered)

    const result = listDatabaseBackups(backupDirectory)

    expect(result.backups).toEqual([])
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Backup size does not match manifest'),
        expect.stringContaining('Backup SHA-256 does not match manifest'),
      ]),
    )
  })

  it('excludes manifests that report failed integrity and backups that fail a current quick_check', () => {
    const manifestFailure = createVerifiedDatabaseBackup(database, {
      kind: 'pre-import',
      databasePath,
      backupDirectory,
      now: new Date('2026-07-17T06:00:00.000Z'),
      id: 'manifest-failure',
    })
    const failedManifest = JSON.parse(readFileSync(manifestFailure.manifestPath, 'utf8')) as Record<
      string,
      unknown
    >
    writeFileSync(
      manifestFailure.manifestPath,
      JSON.stringify({ ...failedManifest, integrity: 'failed' }),
      'utf8',
    )

    const currentFailure = createVerifiedDatabaseBackup(database, {
      kind: 'pre-migration',
      databasePath,
      backupDirectory,
      now: new Date('2026-07-17T07:00:00.000Z'),
      id: 'current-failure',
    })
    sqliteMocks.quickCheckByPath.set(currentFailure.filePath, ['row 17 malformed'])

    const result = listDatabaseBackups(backupDirectory)

    expect(result.backups).toEqual([])
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Backup manifest reports failed integrity'),
        expect.stringContaining('Backup failed current SQLite quick_check'),
      ]),
    )
  })
})
