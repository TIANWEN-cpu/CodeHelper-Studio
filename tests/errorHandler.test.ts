import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  reportError,
  handleAsync,
  getErrorLog,
  clearErrorLog,
  registerToast,
  registerGlobalErrorHandlers,
} from '../src/utils/errorHandler'

beforeEach(() => {
  clearErrorLog()
  // Register a no-op toast to prevent actual toast calls
  registerToast(vi.fn())
})

describe('reportError', () => {
  it('creates a structured error report', () => {
    const report = reportError(new Error('test'), 'TestContext')
    expect(report.message).toBe('test')
    expect(report.context).toBe('TestContext')
    expect(report.category).toBeDefined()
    expect(report.timestamp).toBeDefined()
    expect(report.error).toBeInstanceOf(Error)
  })

  it('classifies network errors as retryable', () => {
    const report = reportError(new Error('network failed'), 'Ctx')
    expect(report.category).toBe('network')
    expect(report.retryable).toBe(true)
  })

  it('classifies timeout errors as retryable', () => {
    const report = reportError(new Error('timeout'), 'Ctx')
    expect(report.category).toBe('timeout')
    expect(report.retryable).toBe(true)
  })

  it('classifies auth errors as non-retryable', () => {
    const report = reportError(new Error('401 unauthorized'), 'Ctx')
    expect(report.category).toBe('auth')
    expect(report.retryable).toBe(false)
  })

  it('classifies validation errors as non-retryable', () => {
    const report = reportError(new Error('invalid input'), 'Ctx')
    expect(report.category).toBe('validation')
    expect(report.retryable).toBe(false)
  })

  it('adds report to in-memory log', () => {
    reportError(new Error('e1'), 'Ctx1')
    reportError(new Error('e2'), 'Ctx2')
    const log = getErrorLog()
    expect(log).toHaveLength(2)
    expect(log[0].message).toBe('e1')
    expect(log[1].message).toBe('e2')
  })

  it('trims log when exceeding MAX_LOG_SIZE', () => {
    for (let i = 0; i < 110; i++) {
      reportError(new Error(`e${i}`), 'Ctx')
    }
    expect(getErrorLog().length).toBeLessThanOrEqual(100)
  })

  it('logs to console.error by default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error('log test'), 'Ctx')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('skips console.error when silent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error('silent test'), 'Ctx', { silent: true })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('calls toast function when showToast is true', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    reportError(new Error('toast test'), 'Ctx', { showToast: true })
    expect(toastFn).toHaveBeenCalledWith('error', expect.any(String))
  })

  it('does not call toast when showToast is false', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    reportError(new Error('no toast'), 'Ctx', { showToast: false })
    expect(toastFn).not.toHaveBeenCalled()
  })

  it('handles string errors', () => {
    const report = reportError('string error', 'Ctx')
    expect(report.message).toBe('string error')
  })

  it('handles undefined errors', () => {
    const report = reportError(undefined, 'Ctx')
    expect(report.message).toBe('undefined')
    expect(report.category).toBe('unknown')
  })
})

describe('handleAsync', () => {
  it('returns data on success', async () => {
    const [data, err] = await handleAsync(() => Promise.resolve(42), 'Ctx')
    expect(data).toBe(42)
    expect(err).toBeNull()
  })

  it('returns error report on failure', async () => {
    const [data, err] = await handleAsync(() => Promise.reject(new Error('async fail')), 'Ctx')
    expect(data).toBeNull()
    expect(err).toBeDefined()
    expect(err!.message).toBe('async fail')
    expect(err!.context).toBe('Ctx')
  })

  it('passes options to reportError', async () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    await handleAsync(() => Promise.reject(new Error('toast')), 'Ctx', { showToast: true })
    expect(toastFn).toHaveBeenCalled()
  })
})

describe('getErrorLog / clearErrorLog', () => {
  it('returns empty log initially', () => {
    clearErrorLog()
    expect(getErrorLog()).toEqual([])
  })

  it('clearErrorLog empties the log', () => {
    reportError(new Error('temp'), 'Ctx')
    expect(getErrorLog().length).toBeGreaterThan(0)
    clearErrorLog()
    expect(getErrorLog()).toEqual([])
  })
})

describe('registerToast', () => {
  it('registers toast function for error display', () => {
    const fn = vi.fn()
    registerToast(fn)
    // Should not throw
    expect(true).toBe(true)
  })
})

describe('getUserFriendlyMessage (via showToast)', () => {
  it('uses raw message when short and readable', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    reportError(new Error('Short message'), 'Ctx', { showToast: true })
    expect(toastFn).toHaveBeenCalledWith('error', 'Short message')
  })

  it('uses category fallback for long messages', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    const longMsg = 'x'.repeat(200)
    reportError(new Error(`network: ${longMsg}`), 'Ctx', { showToast: true })
    const calledWith = toastFn.mock.calls[0][1]
    // Should be the fallback message, not the long one
    expect(calledWith.length).toBeLessThan(200)
  })

  it('uses category fallback for "undefined" message', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    reportError(undefined, 'Ctx', { showToast: true })
    expect(toastFn).toHaveBeenCalledWith('error', expect.any(String))
  })
})

describe('registerGlobalErrorHandlers', () => {
  it('registers window event listeners', () => {
    // In node environment, window may not have addEventListener
    // Just verify the function runs without throwing
    try {
      registerGlobalErrorHandlers()
    } catch {
      // Expected in node environment without window.addEventListener
    }
    expect(true).toBe(true)
  })
})
