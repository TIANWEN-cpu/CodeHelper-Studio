import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to manipulate the module-level timer and performance.memory.
// Stub global performance before importing the module.

const mockMemory = { usedJSHeapSize: 0, totalJSHeapSize: 0, jsHeapSizeLimit: 0 }

// Create a minimal fake performance that has .memory but also real timer methods
const fakePerformance = {
  now: performance.now.bind(performance),
  timeOrigin: performance.timeOrigin,
  get memory() {
    return mockMemory
  },
}

vi.stubGlobal('performance', fakePerformance)

// Spy on console methods
const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

// Must import after stubbing globals
const { startMemoryMonitor, stopMemoryMonitor } = await import('../src/utils/memoryMonitor')

describe('memoryMonitor', () => {
  beforeEach(() => {
    // Only fake setTimeout/setInterval, NOT performance
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearInterval', 'clearTimeout'] })
    stopMemoryMonitor() // ensure clean state
    consoleDebugSpy.mockClear()
    consoleWarnSpy.mockClear()
    mockMemory.usedJSHeapSize = 0
  })

  afterEach(() => {
    stopMemoryMonitor()
    vi.useRealTimers()
  })

  describe('startMemoryMonitor', () => {
    it('logs memory immediately on start', () => {
      mockMemory.usedJSHeapSize = 50 * 1024 * 1024 // 50 MB
      startMemoryMonitor()
      expect(consoleDebugSpy).toHaveBeenCalledOnce()
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('50.0 MB')
    })

    it('logs on interval (every 120s)', () => {
      mockMemory.usedJSHeapSize = 10 * 1024 * 1024
      startMemoryMonitor()
      consoleDebugSpy.mockClear()

      // Advance 120 seconds
      vi.advanceTimersByTime(120_000)
      expect(consoleDebugSpy).toHaveBeenCalledOnce()
      expect(consoleDebugSpy.mock.calls[0][0]).toContain('10.0 MB')
    })

    it('does not create duplicate timers when called twice', () => {
      mockMemory.usedJSHeapSize = 10 * 1024 * 1024
      startMemoryMonitor()
      consoleDebugSpy.mockClear()
      startMemoryMonitor() // second call should be no-op

      vi.advanceTimersByTime(120_000)
      // Only one log entry, not two
      expect(consoleDebugSpy).toHaveBeenCalledOnce()
    })

    it('does not warn when memory is below threshold', () => {
      mockMemory.usedJSHeapSize = 100 * 1024 * 1024 // 100 MB < 256 MB
      startMemoryMonitor()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('warns when memory exceeds 256 MB threshold', () => {
      mockMemory.usedJSHeapSize = 300 * 1024 * 1024 // 300 MB > 256 MB
      startMemoryMonitor()
      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('HIGH MEMORY ALERT')
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('300.0 MB')
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('256 MB')
    })

    it('warns at exact threshold boundary (just over)', () => {
      mockMemory.usedJSHeapSize = (256 + 0.1) * 1024 * 1024
      startMemoryMonitor()
      expect(consoleWarnSpy).toHaveBeenCalledOnce()
    })

    it('does not warn at exact threshold boundary (just under)', () => {
      mockMemory.usedJSHeapSize = (256 - 0.1) * 1024 * 1024
      startMemoryMonitor()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })

  describe('stopMemoryMonitor', () => {
    it('stops logging after stop', () => {
      mockMemory.usedJSHeapSize = 10 * 1024 * 1024
      startMemoryMonitor()
      stopMemoryMonitor()
      consoleDebugSpy.mockClear()

      vi.advanceTimersByTime(240_000) // 4 minutes
      expect(consoleDebugSpy).not.toHaveBeenCalled()
    })

    it('is safe to call when not started', () => {
      expect(() => stopMemoryMonitor()).not.toThrow()
    })

    it('is safe to call multiple times', () => {
      mockMemory.usedJSHeapSize = 10 * 1024 * 1024
      startMemoryMonitor()
      stopMemoryMonitor()
      expect(() => stopMemoryMonitor()).not.toThrow()
    })

    it('allows restart after stop', () => {
      mockMemory.usedJSHeapSize = 10 * 1024 * 1024
      startMemoryMonitor()
      stopMemoryMonitor()

      consoleDebugSpy.mockClear()
      startMemoryMonitor()
      expect(consoleDebugSpy).toHaveBeenCalledOnce()
    })
  })

  describe('when performance.memory is unavailable', () => {
    it('does not log when memory API missing', () => {
      // Override the getter to return undefined
      Object.defineProperty(fakePerformance, 'memory', {
        get() {
          return undefined
        },
        configurable: true,
      })

      startMemoryMonitor()
      expect(consoleDebugSpy).not.toHaveBeenCalled()

      // Restore
      Object.defineProperty(fakePerformance, 'memory', {
        get() {
          return mockMemory
        },
        configurable: true,
      })
    })
  })
})
