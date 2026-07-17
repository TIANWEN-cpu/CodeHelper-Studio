import { describe, expect, it } from 'vitest'
import {
  DATABASE_RECOVERY_NOTICE_VERSION,
  parseDatabaseRecoveryNotice,
  serializeDatabaseRecoveryNotice,
  type DatabaseRecoveryNotice,
} from '../src/shared/databaseRecoveryContract'

function notice(): DatabaseRecoveryNotice {
  return {
    version: DATABASE_RECOVERY_NOTICE_VERSION,
    reason: 'SQLITE_CORRUPT',
    detectedAt: '2026-07-15T12:00:00.000Z',
    databasePath: 'C:\\Users\\test\\codehelper.db',
    backupPath: 'C:\\Users\\test\\codehelper.db.corrupt.1',
    isolatedFiles: [
      {
        sourcePath: 'C:\\Users\\test\\codehelper.db',
        backupPath: 'C:\\Users\\test\\codehelper.db.corrupt.1',
      },
    ],
    quickCheckResult: ['database disk image is malformed'],
  }
}

describe('database recovery notice contract', () => {
  it('round-trips a valid structured recovery notice', () => {
    const value = notice()
    expect(parseDatabaseRecoveryNotice(serializeDatabaseRecoveryNotice(value))).toEqual(value)
  })

  it('rejects empty, malformed, future, and incomplete notices', () => {
    expect(parseDatabaseRecoveryNotice(null)).toBeNull()
    expect(parseDatabaseRecoveryNotice('{broken')).toBeNull()
    expect(
      parseDatabaseRecoveryNotice(
        JSON.stringify({ ...notice(), version: DATABASE_RECOVERY_NOTICE_VERSION + 1 }),
      ),
    ).toBeNull()
    expect(
      parseDatabaseRecoveryNotice(JSON.stringify({ ...notice(), isolatedFiles: [] })),
    ).toBeNull()
  })
})
