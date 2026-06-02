/**
 * Renderer-side memory monitoring utility.
 *
 * Periodically logs memory usage and alerts when thresholds are exceeded.
 * Only active in Electron renderer (has performance.memory).
 *
 * Usage:
 * ```ts
 * import { startMemoryMonitor, stopMemoryMonitor } from '../utils/memoryMonitor'
 *
 * // Start monitoring (typically in App.tsx useEffect)
 * startMemoryMonitor()
 *
 * // Stop monitoring
 * stopMemoryMonitor()
 * ```
 */

const POLL_INTERVAL_MS = 120_000 // every 2 minutes
const ALERT_HEAP_MB = 256 // alert threshold for renderer heap

let monitorTimer: ReturnType<typeof setInterval> | null = null

interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

declare global {
  interface Performance {
    memory?: MemoryInfo
  }
}

function getHeapMB(): number | null {
  if (typeof performance !== 'undefined' && performance.memory) {
    return performance.memory.usedJSHeapSize / 1024 / 1024
  }
  return null
}

function logMemoryUsage(): void {
  const heapMB = getHeapMB()
  if (heapMB !== null) {
    console.debug(`[memory:renderer] Heap: ${heapMB.toFixed(1)} MB`)
    if (heapMB > ALERT_HEAP_MB) {
      console.warn(
        `[memory:renderer] HIGH MEMORY ALERT: Heap at ${heapMB.toFixed(1)} MB (threshold: ${ALERT_HEAP_MB} MB)`,
      )
    }
  }
}

/**
 * Start periodic memory monitoring for the renderer process.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startMemoryMonitor(): void {
  if (monitorTimer !== null) return
  // Log once immediately
  logMemoryUsage()
  monitorTimer = setInterval(logMemoryUsage, POLL_INTERVAL_MS)
}

/**
 * Stop the periodic memory monitor.
 */
export function stopMemoryMonitor(): void {
  if (monitorTimer !== null) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
}
