let intervalId: ReturnType<typeof setInterval> | null = null
const INTERVAL_MS = 120_000
const HIGH_MEMORY_MB = 256

function readMemory(): { usedJSHeapSize: number } | undefined {
  return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
}

function logMemory(): void {
  const memory = readMemory()
  if (!memory) return
  const usedMb = memory.usedJSHeapSize / 1024 / 1024
  console.debug(`[memory] ${usedMb.toFixed(1)} MB used`)
  if (usedMb > HIGH_MEMORY_MB) {
    console.warn(`HIGH MEMORY ALERT: ${usedMb.toFixed(1)} MB used; threshold ${HIGH_MEMORY_MB} MB`)
  }
}

export function startMemoryMonitor(): void {
  if (intervalId) return
  logMemory()
  intervalId = setInterval(logMemory, INTERVAL_MS)
}

export function stopMemoryMonitor(): void {
  if (!intervalId) return
  clearInterval(intervalId)
  intervalId = null
}
