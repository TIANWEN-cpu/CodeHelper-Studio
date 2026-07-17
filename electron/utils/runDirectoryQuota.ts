import { lstat, opendir } from 'fs/promises'
import { join } from 'path'

const DEFAULT_MAX_ENTRIES = 20_000

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

/**
 * Count regular-file bytes below a run directory without traversing links.
 * The byte limit allows scans to stop as soon as a violation is known.
 */
export async function measureRunDirectoryBytes(
  directory: string,
  stopAfterBytes = Number.POSITIVE_INFINITY,
  maxEntries = DEFAULT_MAX_ENTRIES,
): Promise<number> {
  const pending = [directory]
  let totalBytes = 0
  let visitedEntries = 0

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue

    let handle
    try {
      handle = await opendir(current)
    } catch (error) {
      if (isMissingPath(error)) continue
      throw error
    }

    for await (const entry of handle) {
      visitedEntries++
      if (visitedEntries > maxEntries) {
        throw new Error(`Run directory contains more than ${maxEntries} entries`)
      }

      // Junctions and symlinks must not let a run escape the temporary root.
      if (entry.isSymbolicLink()) continue

      const entryPath = join(current, entry.name)
      let stats
      try {
        stats = await lstat(entryPath)
      } catch (error) {
        if (isMissingPath(error)) continue
        throw error
      }

      // Re-check after enumeration to reduce link-swap race exposure.
      if (stats.isSymbolicLink()) continue
      if (stats.isDirectory()) {
        pending.push(entryPath)
        continue
      }
      if (!stats.isFile()) continue

      totalBytes += stats.size
      if (totalBytes > stopAfterBytes) return totalBytes
    }
  }

  return totalBytes
}

export type RunDirectoryQuotaViolation =
  | { kind: 'size'; actualBytes: number }
  | { kind: 'scan-error'; error: Error }

export interface RunDirectoryQuotaMonitor {
  checkNow: () => Promise<void>
  stop: () => void
}

interface RunDirectoryQuotaOptions {
  directory: string
  maxBytes: number
  intervalMs: number
  onViolation: (violation: RunDirectoryQuotaViolation) => void
}

/** Start a non-overlapping, fail-closed quota monitor for one run directory. */
export function startRunDirectoryQuotaMonitor({
  directory,
  maxBytes,
  intervalMs,
  onViolation,
}: RunDirectoryQuotaOptions): RunDirectoryQuotaMonitor {
  let stopped = false
  let scanInFlight: Promise<void> | null = null

  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }

  const checkNow = (): Promise<void> => {
    if (stopped) return Promise.resolve()
    if (scanInFlight) return scanInFlight

    scanInFlight = measureRunDirectoryBytes(directory, maxBytes)
      .then((actualBytes) => {
        if (stopped || actualBytes <= maxBytes) return
        stop()
        onViolation({ kind: 'size', actualBytes })
      })
      .catch((error: unknown) => {
        if (stopped) return
        stop()
        onViolation({
          kind: 'scan-error',
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })
      .finally(() => {
        scanInFlight = null
      })

    return scanInFlight
  }

  const timer = setInterval(() => void checkNow(), Math.max(25, intervalMs))
  timer.unref?.()
  void checkNow()

  return { checkNow, stop }
}
