import { randomUUID } from 'crypto'
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'

export const PROCESS_LEASE_SUFFIX = '.process-lease.json'
export const PROCESS_LEASE_STALE_MS = 5 * 60 * 1000

export type ProcessLeaseKind = 'app' | 'maintenance'

export interface ProcessLeaseMarker {
  pid: number
  kind: ProcessLeaseKind
  startedAt: string
  token: string
}

export interface ProcessLease {
  path: string
  marker: ProcessLeaseMarker
  release: () => void
}

interface AcquireProcessLeaseOptions {
  pid?: number
  now?: () => number
  isProcessAlive?: (pid: number) => boolean
  staleAfterMs?: number
}

export function getProcessLeasePath(databasePath: string): string {
  return `${databasePath}${PROCESS_LEASE_SUFFIX}`
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readMarker(path: string): ProcessLeaseMarker {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Process lease marker is unreadable: ${path}`, { cause: error })
  }
  const marker = value as Partial<ProcessLeaseMarker>
  if (
    !Number.isSafeInteger(marker.pid) ||
    Number(marker.pid) <= 0 ||
    !['app', 'maintenance'].includes(String(marker.kind)) ||
    typeof marker.startedAt !== 'string' ||
    !marker.startedAt ||
    typeof marker.token !== 'string' ||
    !marker.token
  ) {
    throw new Error(`Process lease marker is malformed: ${path}`)
  }
  return marker as ProcessLeaseMarker
}

function removeStaleMarker(
  path: string,
  options: Required<Pick<AcquireProcessLeaseOptions, 'now' | 'isProcessAlive' | 'staleAfterMs'>>,
): boolean {
  const marker = readMarker(path)
  if (options.isProcessAlive(marker.pid)) return false

  const cleanupPath = `${path}.cleanup`
  let cleanupDescriptor: number | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      cleanupDescriptor = openSync(cleanupPath, 'wx', 0o600)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (attempt > 0) return false
      let cleanupAgeMs: number
      try {
        cleanupAgeMs = options.now() - statSync(cleanupPath).mtimeMs
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw statError
      }
      if (
        !Number.isFinite(cleanupAgeMs) ||
        cleanupAgeMs < 0 ||
        cleanupAgeMs < options.staleAfterMs
      ) {
        return false
      }
      try {
        unlinkSync(cleanupPath)
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') return false
      }
    }
  }
  if (cleanupDescriptor === null) return false
  let removed = false
  let cleanupError: unknown
  try {
    closeSync(cleanupDescriptor)
    const current = readMarker(path)
    if (current.token === marker.token && !options.isProcessAlive(current.pid)) {
      unlinkSync(path)
      removed = true
    }
  } finally {
    try {
      unlinkSync(cleanupPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') cleanupError = error
    }
  }
  if (cleanupError) throw cleanupError
  return removed
}

export function acquireProcessLease(
  databasePath: string,
  kind: ProcessLeaseKind,
  options: AcquireProcessLeaseOptions = {},
): ProcessLease {
  const path = getProcessLeasePath(databasePath)
  const now = options.now ?? Date.now
  const marker: ProcessLeaseMarker = {
    pid: options.pid ?? process.pid,
    kind,
    startedAt: new Date(now()).toISOString(),
    token: randomUUID(),
  }
  const encoded = `${JSON.stringify(marker)}\n`
  const staleOptions = {
    now,
    isProcessAlive: options.isProcessAlive ?? isProcessAlive,
    staleAfterMs: options.staleAfterMs ?? PROCESS_LEASE_STALE_MS,
  }
  if (Number.isNaN(staleOptions.staleAfterMs) || staleOptions.staleAfterMs < 0) {
    throw new Error('Process lease stale timeout must be non-negative')
  }

  let descriptor: number | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      descriptor = openSync(path, 'wx', 0o600)
      writeFileSync(descriptor, encoded, { encoding: 'utf8' })
      fsyncSync(descriptor)
      break
    } catch (error) {
      if (descriptor !== null) {
        closeSync(descriptor)
        descriptor = null
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!removeStaleMarker(path, staleOptions)) {
        const existing = readMarker(path)
        throw new Error(`Process lease is held by ${existing.kind} pid ${existing.pid}: ${path}`)
      }
    }
  }
  if (descriptor === null) throw new Error(`Unable to acquire process lease: ${path}`)

  let released = false
  return {
    path,
    marker,
    release: () => {
      if (released) return
      released = true
      closeSync(descriptor)
      try {
        if (readMarker(path).token === marker.token) unlinkSync(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    },
  }
}
