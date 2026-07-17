import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers: Record<string, (...args: unknown[]) => unknown> = {}

const electronMocks = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  openPath: vi.fn(),
}))

const backupMocks = vi.hoisted(() => ({
  createVerifiedDatabaseBackup: vi.fn(),
  getDatabaseBackupDirectory: vi.fn(() => 'C:\\CodeHelper\\backups'),
  listDatabaseBackups: vi.fn(() => ({
    directoryPath: 'C:\\CodeHelper\\backups',
    backups: [],
    warnings: [],
  })),
}))

const databaseMocks = vi.hoisted(() => ({
  database: { prepare: vi.fn() },
  getDatabasePath: vi.fn(() => 'C:\\CodeHelper\\codehelper.db'),
}))

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '2.3.0-test') },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  dialog: { showSaveDialog: electronMocks.showSaveDialog },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
  shell: { openPath: electronMocks.openPath },
}))

vi.mock('../electron/db/databaseBackup', () => backupMocks)
vi.mock('../electron/db/index', () => ({
  getDB: () => databaseMocks.database,
  getDatabasePath: databaseMocks.getDatabasePath,
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  }
})

const { isRecoveryLayerKey, registerMaintenanceIPC, validateRecoveryLayerEntries } =
  await import('../electron/ipc/maintenance')

describe('maintenance IPC', () => {
  const requestRendererFlush = vi.fn()
  let now = 1_000_000

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(handlers).forEach((channel) => delete handlers[channel])
    requestRendererFlush.mockResolvedValue({ ok: true })
    backupMocks.createVerifiedDatabaseBackup.mockReturnValue({
      manifestVersion: 1,
      id: 'manual-test',
      kind: 'manual',
      createdAt: '2026-07-17T00:00:00.000Z',
      verifiedAt: '2026-07-17T00:00:01.000Z',
      filePath: 'C:\\CodeHelper\\backups\\manual.db',
      manifestPath: 'C:\\CodeHelper\\backups\\manual.db.manifest.json',
      sizeBytes: 4096,
      sha256: 'a'.repeat(64),
      integrity: 'ok',
      quickCheck: ['ok'],
      applicationVersion: '2.3.0-test',
      applicationSchemaVersion: 1,
      componentSchemaVersions: { application: 1 },
    })
    now = 1_000_000
    registerMaintenanceIPC({
      requestRendererFlush,
      now: () => now,
      manualBackupCooldownMs: 60_000,
    })
  })

  it('registers the backup and recovery maintenance channels', () => {
    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining([
        'database-backups-list',
        'database-backup-create',
        'database-backups-open-directory',
        'recovery-layer-export',
      ]),
    )
  })

  it('fails closed when any renderer cannot flush before a manual backup', async () => {
    requestRendererFlush.mockResolvedValueOnce({
      ok: false,
      error: 'workspace flush failed',
      recoveryAvailable: true,
    })

    const result = await handlers['database-backup-create']()

    expect(result).toEqual({ success: false, error: 'workspace flush failed' })
    expect(backupMocks.createVerifiedDatabaseBackup).not.toHaveBeenCalled()
  })

  it('creates a verified manual snapshot only after a successful renderer flush', async () => {
    const result = await handlers['database-backup-create']()

    expect(requestRendererFlush).toHaveBeenCalledTimes(1)
    expect(backupMocks.createVerifiedDatabaseBackup).toHaveBeenCalledWith(databaseMocks.database, {
      kind: 'manual',
      databasePath: 'C:\\CodeHelper\\codehelper.db',
      applicationVersion: '2.3.0-test',
    })
    expect(result).toMatchObject({
      success: true,
      backup: { id: 'manual-test', kind: 'manual', integrity: 'ok' },
    })
  })

  it('rejects concurrent and rapid repeated full-database backups in the main process', async () => {
    let releaseFlush: (() => void) | undefined
    requestRendererFlush.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFlush = () => resolve({ ok: true })
        }),
    )

    const first = handlers['database-backup-create']()
    await expect(handlers['database-backup-create']()).resolves.toEqual({
      success: false,
      error: 'A database backup is already in progress',
    })
    releaseFlush?.()
    await expect(first).resolves.toMatchObject({ success: true })

    await expect(handlers['database-backup-create']()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('retry in 60 seconds'),
    })
    expect(backupMocks.createVerifiedDatabaseBackup).toHaveBeenCalledTimes(1)

    now += 60_000
    await expect(handlers['database-backup-create']()).resolves.toMatchObject({ success: true })
    expect(backupMocks.createVerifiedDatabaseBackup).toHaveBeenCalledTimes(2)
  })

  it('accepts only CodeHelper migration and corruption recovery keys', () => {
    expect(isRecoveryLayerKey('codehelper-editor.migration-backup.123')).toBe(true)
    expect(isRecoveryLayerKey('codehelper-editor.corrupt.123')).toBe(true)
    expect(isRecoveryLayerKey('other-editor.migration-backup.123')).toBe(false)
    expect(isRecoveryLayerKey('codehelper-editor-workspace')).toBe(false)
  })

  it('enforces recovery entry count, key, per-entry, duplicate, and total byte limits', () => {
    const validEntry = {
      key: 'codehelper-editor.migration-backup.1',
      value: 'recoverable',
    }
    expect(validateRecoveryLayerEntries([validEntry])).toEqual([validEntry])

    expect(() =>
      validateRecoveryLayerEntries(
        Array.from({ length: 101 }, (_, index) => ({
          key: `codehelper-editor.migration-backup.${index}`,
          value: '',
        })),
      ),
    ).toThrow('limited to 100 entries')
    expect(() =>
      validateRecoveryLayerEntries([
        {
          key: `codehelper-${'x'.repeat(500)}.corrupt.1`,
          value: '',
        },
      ]),
    ).toThrow('key is too large')
    expect(() =>
      validateRecoveryLayerEntries([
        {
          key: 'codehelper-editor.corrupt.1',
          value: 'x'.repeat(2 * 1024 * 1024 + 1),
        },
      ]),
    ).toThrow('per-entry size limit')
    expect(() => validateRecoveryLayerEntries([validEntry, validEntry])).toThrow(
      'keys must be unique',
    )
    expect(() =>
      validateRecoveryLayerEntries(
        Array.from({ length: 4 }, (_, index) => ({
          key: `codehelper-editor.corrupt.${index}`,
          value: 'x'.repeat(2 * 1024 * 1024),
        })),
      ),
    ).toThrow('total size limit')
  })

  it('exports only validated recovery entries as a diagnostic JSON file', async () => {
    const fs = await import('fs')
    electronMocks.showSaveDialog.mockResolvedValueOnce({
      canceled: false,
      filePath: 'C:\\Exports\\recovery.json',
    })
    const entries = [
      { key: 'codehelper-editor.migration-backup.1', value: '{"tabs":[]}' },
      { key: 'codehelper-editor.corrupt.2', value: 'broken-payload' },
    ]

    const result = await handlers['recovery-layer-export'](null, entries)

    expect(result).toEqual({
      success: true,
      filePath: 'C:\\Exports\\recovery.json',
      entryCount: 2,
    })
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
    const written = vi.mocked(fs.writeFileSync).mock.calls[0]
    expect(written[0]).toBe('C:\\Exports\\recovery.json')
    expect(JSON.parse(String(written[1]))).toMatchObject({
      version: 1,
      purpose: 'diagnostic-recovery-layer-export',
      entries,
    })
  })
})
