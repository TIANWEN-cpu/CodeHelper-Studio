/**
 * Performance monitoring utilities for the Electron main process.
 *
 * - Logs slow IPC operations (threshold configurable, default 1s)
 * - Tracks IPC call frequency for diagnostics
 */

const SLOW_OP_THRESHOLD_MS = 1000
/** Maximum number of tracked channels to prevent unbounded growth. */
const MAX_TRACKED_CHANNELS = 100

interface IpcStats {
  callCount: number
  totalDuration: number
  slowCalls: number
  lastCalledAt: number
}

const ipcStatsMap = new Map<string, IpcStats>()

/**
 * Wrap an IPC handler to measure execution time and log slow operations.
 *
 * Usage:
 * ```ts
 * ipcMain.handle('channel', trackPerformance('channel', (_e, arg) => { ... }))
 * ```
 */
export function trackPerformance<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => TResult | Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const start = performance.now()
    try {
      const result = await handler(...args)
      return result
    } finally {
      const duration = performance.now() - start
      recordIpcCall(channel, duration)
      if (duration > SLOW_OP_THRESHOLD_MS) {
        console.warn(
          `[perf] Slow IPC "${channel}": ${duration.toFixed(1)}ms (threshold: ${SLOW_OP_THRESHOLD_MS}ms)`,
        )
      }
    }
  }
}

function recordIpcCall(channel: string, duration: number): void {
  let stats = ipcStatsMap.get(channel)
  if (!stats) {
    // Evict oldest entries if we hit the cap
    if (ipcStatsMap.size >= MAX_TRACKED_CHANNELS) {
      const oldest = ipcStatsMap.keys().next()
      if (!oldest.done) ipcStatsMap.delete(oldest.value)
    }
    stats = { callCount: 0, totalDuration: 0, slowCalls: 0, lastCalledAt: 0 }
    ipcStatsMap.set(channel, stats)
  }
  stats.callCount++
  stats.totalDuration += duration
  stats.lastCalledAt = Date.now()
  if (duration > SLOW_OP_THRESHOLD_MS) {
    stats.slowCalls++
  }
}

/**
 * Return a snapshot of all IPC call statistics.
 */
export function getIpcStats(): Record<
  string,
  { calls: number; avgMs: number; slowCalls: number; lastCalledAt: number }
> {
  const result: Record<
    string,
    { calls: number; avgMs: number; slowCalls: number; lastCalledAt: number }
  > = {}
  for (const [channel, stats] of ipcStatsMap) {
    result[channel] = {
      calls: stats.callCount,
      avgMs: stats.callCount > 0 ? stats.totalDuration / stats.callCount : 0,
      slowCalls: stats.slowCalls,
      lastCalledAt: stats.lastCalledAt,
    }
  }
  return result
}

/**
 * Log a summary of IPC call statistics to the console.
 */
export function logIpcStatsSummary(): void {
  const stats = getIpcStats()
  const entries = Object.entries(stats).sort((a, b) => b[1].calls - a[1].calls)

  if (entries.length === 0) {
    console.log('[perf] No IPC calls recorded yet.')
    return
  }

  console.log('[perf] IPC Call Statistics:')
  console.log('  Channel                  | Calls | Avg (ms) | Slow | Last Called')
  console.log('  -------------------------|-------|----------|------|------------')
  for (const [channel, s] of entries) {
    const ch = channel.padEnd(25)
    const calls = String(s.calls).padStart(5)
    const avg = s.avgMs.toFixed(1).padStart(8)
    const slow = String(s.slowCalls).padStart(4)
    const last = s.lastCalledAt > 0 ? new Date(s.lastCalledAt).toISOString().slice(11, 19) : '-'
    console.log(`  ${ch} | ${calls} | ${avg} | ${slow} | ${last}`)
  }
}
