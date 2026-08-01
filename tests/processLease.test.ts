import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireProcessLease, getProcessLeasePath } from '../electron/utils/processLease'

const roots: string[] = []

function temporaryDatabasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'codehelper-process-lease-'))
  roots.push(root)
  return join(root, 'codehelper.db')
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('cross-process database lease', () => {
  it('allows only one app or maintenance owner at a time', () => {
    const databasePath = temporaryDatabasePath()
    const appLease = acquireProcessLease(databasePath, 'app')

    expect(() => acquireProcessLease(databasePath, 'maintenance')).toThrow(/held by app pid/)

    appLease.release()
    const maintenanceLease = acquireProcessLease(databasePath, 'maintenance')
    expect(JSON.parse(readFileSync(maintenanceLease.path, 'utf8'))).toMatchObject({
      kind: 'maintenance',
      pid: process.pid,
    })
    maintenanceLease.release()
  })

  it('atomically removes an old marker and expired cleanup tombstone whose owner is dead', () => {
    const databasePath = temporaryDatabasePath()
    const path = getProcessLeasePath(databasePath)
    writeFileSync(
      path,
      JSON.stringify({
        pid: 999_999,
        kind: 'maintenance',
        startedAt: '2020-01-01T00:00:00.000Z',
        token: 'stale-token',
      }),
    )
    utimesSync(path, new Date(0), new Date(0))
    writeFileSync(`${path}.cleanup`, '')
    utimesSync(`${path}.cleanup`, new Date(0), new Date(0))

    const lease = acquireProcessLease(databasePath, 'app', {
      now: () => 1_000_000,
      staleAfterMs: 1,
      isProcessAlive: () => false,
    })
    expect(lease.marker.token).not.toBe('stale-token')
    lease.release()
  })

  it('removes a fresh marker immediately when its owner pid is dead', () => {
    const databasePath = temporaryDatabasePath()
    const path = getProcessLeasePath(databasePath)
    writeFileSync(
      path,
      JSON.stringify({
        pid: 999_999,
        kind: 'app',
        startedAt: new Date().toISOString(),
        token: 'fresh-dead-token',
      }),
    )

    const lease = acquireProcessLease(databasePath, 'app', {
      staleAfterMs: Number.MAX_SAFE_INTEGER,
      isProcessAlive: () => false,
    })
    expect(lease.marker.token).not.toBe('fresh-dead-token')
    lease.release()
  })

  it('fails closed for a fresh marker whose owner is still alive', () => {
    const databasePath = temporaryDatabasePath()
    const path = getProcessLeasePath(databasePath)
    writeFileSync(
      path,
      JSON.stringify({
        pid: 999_999,
        kind: 'maintenance',
        startedAt: new Date().toISOString(),
        token: 'fresh-token',
      }),
    )

    expect(() =>
      acquireProcessLease(databasePath, 'app', {
        now: () => Date.now(),
        staleAfterMs: 60_000,
        isProcessAlive: () => true,
      }),
    ).toThrow(/held by maintenance pid/)
  })

  it('fails closed for a recent partial marker that may still be owned by a live writer', () => {
    const databasePath = temporaryDatabasePath()
    const path = getProcessLeasePath(databasePath)
    writeFileSync(path, '{"pid": 1234, "kind": "ap')

    expect(() =>
      acquireProcessLease(databasePath, 'app', {
        staleAfterMs: 60_000,
      }),
    ).toThrow(/unreadable/)
    expect(existsSync(path)).toBe(true)
  })

  it('self-heals an unreadable marker only after its stale timeout', () => {
    const databasePath = temporaryDatabasePath()
    const path = getProcessLeasePath(databasePath)
    writeFileSync(path, '')
    utimesSync(path, new Date(0), new Date(0))

    const lease = acquireProcessLease(databasePath, 'app', {
      now: () => 1_000_000,
      staleAfterMs: 1,
    })
    expect(lease.marker.pid).toBe(process.pid)
    lease.release()
    expect(existsSync(path)).toBe(false)
  })
})
