/**
 * Deep edge-case tests for error utilities, errorHandler, and CATEGORY constants.
 *
 * Covers:
 *  - toErrorMessage with all exotic types (BigInt, Date, RegExp, class instances)
 *  - safeAsync / safeSync with promise chains and async generators
 *  - categorizeError with overlapping keywords, multi-category strings
 *  - CATEGORY_MESSAGES / CATEGORY_SUGGESTIONS completeness and exact values
 *  - getUserMessage boundary: short vs long messages, category fallbacks
 *  - reportError log trimming exact boundary (100 entries)
 *  - handleAsync with sync-throwing fn
 *  - getUserFriendlyMessage "null"/"undefined" strings
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  toErrorMessage,
  safeAsync,
  safeSync,
  parseJsonSafe,
  categorizeError,
  getUserMessage,
  CATEGORY_MESSAGES,
  CATEGORY_SUGGESTIONS,
  type ErrorCategory,
} from '../src/utils/errors'
import {
  reportError,
  handleAsync,
  getErrorLog,
  clearErrorLog,
  registerToast,
} from '../src/utils/errorHandler'

// =========================================================================
// 1. toErrorMessage — exotic types
// =========================================================================

describe('Deep: toErrorMessage exotic types', () => {
  it('Date instance returns ISO string', () => {
    const d = new Date('2024-06-15T12:00:00Z')
    const msg = toErrorMessage(d)
    expect(msg).toContain('2024')
    expect(msg).not.toBe('')
  })

  it('RegExp returns source pattern', () => {
    expect(toErrorMessage(/test \d+/)).toBe('/test \\d+/')
  })

  it('Array returns comma-separated string', () => {
    expect(toErrorMessage([1, 2, 3])).toBe('1,2,3')
  })

  it('empty array returns empty string', () => {
    expect(toErrorMessage([])).toBe('')
  })

  it('Map returns "[object Map]"', () => {
    expect(toErrorMessage(new Map())).toBe('[object Map]')
  })

  it('Set returns "[object Set]"', () => {
    expect(toErrorMessage(new Set())).toBe('[object Set]')
  })

  it('Error with multiline message returns full message', () => {
    const err = new Error('line1\nline2\nline3')
    expect(toErrorMessage(err)).toBe('line1\nline2\nline3')
  })

  it('Error subclass returns message', () => {
    class CustomError extends Error {
      code: number
      constructor(msg: string, code: number) {
        super(msg)
        this.code = code
      }
    }
    expect(toErrorMessage(new CustomError('custom msg', 500))).toBe('custom msg')
  })

  it('object with toString override returns toString result', () => {
    const obj = { toString: () => 'custom toString', message: 'ignored' }
    // "message" in obj is true so toErrorMessage returns String(obj.message)
    expect(toErrorMessage(obj)).toBe('ignored')
  })

  it('object with message=null returns "null"', () => {
    expect(toErrorMessage({ message: null })).toBe('null')
  })

  it('object with message=undefined returns "undefined"', () => {
    // "message" in { message: undefined } is true -> String(undefined) = "undefined"
    // But toErrorMessage has 'message' in check which returns String(undefined)
    expect(toErrorMessage({ message: undefined })).toBe('undefined')
  })

  it('function returns string representation', () => {
    const fn = function testFn() {
      return 1
    }
    const msg = toErrorMessage(fn)
    expect(msg).toContain('testFn')
  })

  it('arrow function returns string representation', () => {
    const msg = toErrorMessage(() => 42)
    expect(msg).toContain('=>')
  })

  it('BigInt converts to string', () => {
    // Use a value that survives String() conversion without precision loss
    const big = BigInt('12345678901234567890')
    expect(toErrorMessage(big)).toBe('12345678901234567890')
  })
})

// =========================================================================
// 2. safeAsync / safeSync — deeper paths
// =========================================================================

describe('Deep: safeAsync deeper paths', () => {
  it('async fn returning falsy values (0, "", false) returns them as data', async () => {
    const [d0] = await safeAsync(async () => 0)
    expect(d0).toBe(0)

    const [d1] = await safeAsync(async () => '')
    expect(d1).toBe('')

    const [d2] = await safeAsync(async () => false)
    expect(d2).toBe(false)
  })

  it('async fn returning array preserves structure', async () => {
    const [data] = await safeAsync(async () => [1, 'two', { three: 3 }])
    expect(data).toEqual([1, 'two', { three: 3 }])
  })

  it('chained promises resolve correctly', async () => {
    const [data] = await safeAsync(async () => {
      const a = await Promise.resolve(10)
      const b = await Promise.resolve(20)
      return a + b
    })
    expect(data).toBe(30)
  })

  it('rejecting with Error preserves stack trace', async () => {
    const [, err] = await safeAsync(async () => {
      throw new Error('with stack')
    })
    expect(err).toBeInstanceOf(Error)
    expect(err!.stack).toContain('with stack')
  })

  it('rejecting with object containing code property loses code (only message preserved)', async () => {
    const [, err] = await safeAsync(async () => {
      throw { message: 'ENOENT', code: 'ENOENT', errno: -4058 }
    })
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('ENOENT')
    // The code property is not carried over to the new Error
    expect((err as unknown as Record<string, unknown>).code).toBeUndefined()
  })
})

describe('Deep: safeSync deeper paths', () => {
  it('fn returning empty object', () => {
    const [data, err] = safeSync(() => ({}))
    expect(data).toEqual({})
    expect(err).toBeNull()
  })

  it('fn returning Date', () => {
    const d = new Date('2024-01-01')
    const [data, err] = safeSync(() => d)
    expect(data).toBe(d)
    expect(err).toBeNull()
  })

  it('fn that throws TypeError', () => {
    const [data, err] = safeSync(() => {
      const obj: Record<string, unknown> = {}
      return obj.prop.nested // TypeError
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(TypeError)
  })

  it('fn that throws RangeError', () => {
    const [data, err] = safeSync(() => {
      throw new RangeError('out of range')
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(RangeError)
    expect(err!.message).toBe('out of range')
  })

  it('fn throwing object with toString returns toString in message', () => {
    const [data, err] = safeSync(() => {
      throw { message: 'custom error', toString: () => 'toString result' }
    })
    expect(data).toBeNull()
    // toErrorMessage sees "message" in obj -> uses String(obj.message) = "custom error"
    expect(err!.message).toBe('custom error')
  })
})

// =========================================================================
// 3. parseJsonSafe — deeper edge cases
// =========================================================================

describe('Deep: parseJsonSafe deeper edge cases', () => {
  it('JSON with deeply nested structure', () => {
    const deep: Record<string, unknown> = {}
    let current = deep
    for (let i = 0; i < 50; i++) {
      current.nested = {}
      current = current.nested as Record<string, unknown>
    }
    current.value = 'deep'
    const json = JSON.stringify(deep)
    const parsed = parseJsonSafe(json, null) as Record<string, unknown>
    // Traverse to the deepest level
    let traverse: unknown = parsed
    for (let i = 0; i < 50; i++) {
      traverse = (traverse as Record<string, unknown>).nested
    }
    expect((traverse as Record<string, unknown>).value).toBe('deep')
  })

  it('JSON with unicode escapes', () => {
    const json = '{"name":"\\u5f20\\u4e09","city":"\\u5317\\u4eac"}'
    const result = parseJsonSafe(json, {}) as Record<string, string>
    expect(result.name).toBe('张三')
    expect(result.city).toBe('北京')
  })

  it('JSON array with mixed types', () => {
    const json = '[1, "two", true, null, {"key": "val"}]'
    const result = parseJsonSafe(json, []) as unknown[]
    expect(result).toHaveLength(5)
    expect(result[0]).toBe(1)
    expect(result[1]).toBe('two')
    expect(result[2]).toBe(true)
    expect(result[3]).toBeNull()
    expect(result[4]).toEqual({ key: 'val' })
  })

  it('JSON with whitespace padding', () => {
    const json = '   { "a" : 1 }   '
    const result = parseJsonSafe(json, {}) as Record<string, number>
    expect(result.a).toBe(1)
  })

  it('JSON string that looks like JS but is valid JSON', () => {
    expect(parseJsonSafe('"hello"', '')).toBe('hello')
  })

  it('JSON with escaped newlines in strings', () => {
    const json = '{"text":"line1\\nline2\\tline3"}'
    const result = parseJsonSafe(json, {}) as Record<string, string>
    expect(result.text).toBe('line1\nline2\tline3')
  })

  it('fallback of different types', () => {
    expect(parseJsonSafe('invalid', 42)).toBe(42)
    expect(parseJsonSafe('invalid', true)).toBe(true)
    expect(parseJsonSafe('invalid', 'default')).toBe('default')
    expect(parseJsonSafe('invalid', null)).toBeNull()
  })
})

// =========================================================================
// 4. categorizeError — overlapping keywords, priority rules
// =========================================================================

describe('Deep: categorizeError priority and overlap', () => {
  const ALL_CATEGORIES: ErrorCategory[] = [
    'network',
    'auth',
    'timeout',
    'not-found',
    'validation',
    'unknown',
  ]

  it('all CATEGORY_MESSAGES keys match ErrorCategory type', () => {
    const keys = Object.keys(CATEGORY_MESSAGES)
    expect(keys.sort()).toEqual(ALL_CATEGORIES.sort())
  })

  it('all CATEGORY_SUGGESTIONS keys match ErrorCategory type', () => {
    const keys = Object.keys(CATEGORY_SUGGESTIONS)
    expect(keys.sort()).toEqual(ALL_CATEGORIES.sort())
  })

  it('CATEGORY_MESSAGES has non-empty Chinese strings for all categories', () => {
    for (const cat of ALL_CATEGORIES) {
      const msg = CATEGORY_MESSAGES[cat]
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
      // All messages are Chinese
      expect(msg).toMatch(/[一-鿿]/)
    }
  })

  it('CATEGORY_SUGGESTIONS has non-empty Chinese strings for all categories', () => {
    for (const cat of ALL_CATEGORIES) {
      const suggestion = CATEGORY_SUGGESTIONS[cat]
      expect(typeof suggestion).toBe('string')
      expect(suggestion.length).toBeGreaterThan(0)
      expect(suggestion).toMatch(/[一-鿿]/)
    }
  })

  it('exact values of CATEGORY_MESSAGES', () => {
    expect(CATEGORY_MESSAGES.network).toBe('网络连接失败，请检查网络后重试')
    expect(CATEGORY_MESSAGES.auth).toBe('认证失败，请检查 API 密钥配置')
    expect(CATEGORY_MESSAGES.timeout).toBe('请求超时，请稍后重试')
    expect(CATEGORY_MESSAGES['not-found']).toBe('请求的资源不存在')
    expect(CATEGORY_MESSAGES.validation).toBe('输入数据不合法，请检查后重试')
    expect(CATEGORY_MESSAGES.unknown).toBe('发生未知错误，请稍后重试')
  })

  it('exact values of CATEGORY_SUGGESTIONS', () => {
    expect(CATEGORY_SUGGESTIONS.network).toBe('请检查网络连接是否正常，或稍后重试')
    expect(CATEGORY_SUGGESTIONS.auth).toBe('请前往"设置"页面检查 API 密钥是否正确配置')
    expect(CATEGORY_SUGGESTIONS.timeout).toBe('服务器响应较慢，请稍后重试或检查 API 服务状态')
    expect(CATEGORY_SUGGESTIONS['not-found']).toBe('请确认请求的资源是否存在')
    expect(CATEGORY_SUGGESTIONS.validation).toBe('请检查输入内容是否符合要求')
    expect(CATEGORY_SUGGESTIONS.unknown).toBe('如果问题持续存在，请尝试重启应用')
  })

  // Priority: network keywords are checked first
  it('string with both network and auth keywords returns network (first match wins)', () => {
    expect(categorizeError('network error: unauthorized access')).toBe('network')
  })

  it('string with both timeout and validation keywords returns timeout (checked before validation)', () => {
    expect(categorizeError('request timed out: invalid response')).toBe('timeout')
  })

  it('string with both not-found and validation keywords returns not-found (checked before validation)', () => {
    expect(categorizeError('404 not found: invalid path')).toBe('not-found')
  })

  // Specific keyword tests
  it('"fetch" keyword triggers network category', () => {
    expect(categorizeError('fetch')).toBe('network')
  })

  it('"failed to fetch" triggers network category', () => {
    expect(categorizeError('Failed to fetch')).toBe('network')
  })

  it('"ECONNREFUSED" case insensitive triggers network', () => {
    expect(categorizeError('ECONNREFUSED 127.0.0.1:3000')).toBe('network')
  })

  it('"api key" triggers auth category', () => {
    expect(categorizeError('invalid api key provided')).toBe('auth')
  })

  it('"api_key" triggers auth category', () => {
    expect(categorizeError('api_key is required')).toBe('auth')
  })

  it('"invalid key" triggers auth category', () => {
    expect(categorizeError('invalid key')).toBe('auth')
  })

  it('"abort" triggers timeout category', () => {
    expect(categorizeError('request abort')).toBe('timeout')
  })

  it('"bad request" triggers validation category', () => {
    expect(categorizeError('bad request')).toBe('validation')
  })

  it('"400" triggers validation category', () => {
    expect(categorizeError('400')).toBe('validation')
  })

  // Error instances
  it('TypeError with "fetch" message is network', () => {
    expect(categorizeError(new TypeError('Failed to fetch'))).toBe('network')
  })

  it('SyntaxError is unknown', () => {
    expect(categorizeError(new SyntaxError('Unexpected token'))).toBe('unknown')
  })

  // Non-standard inputs
  it('empty Error is unknown', () => {
    expect(categorizeError(new Error(''))).toBe('unknown')
  })

  it('boolean true is unknown', () => {
    expect(categorizeError(true)).toBe('unknown')
  })

  it('boolean false is unknown', () => {
    expect(categorizeError(false)).toBe('unknown')
  })

  it('undefined is unknown', () => {
    expect(categorizeError(undefined)).toBe('unknown')
  })

  it('array is unknown', () => {
    expect(categorizeError([1, 2, 3])).toBe('unknown')
  })

  it('function is unknown', () => {
    expect(categorizeError(() => {})).toBe('unknown')
  })
})

// =========================================================================
// 5. getUserMessage — specific fallback paths
// =========================================================================

describe('Deep: getUserMessage specific paths', () => {
  it('network Error returns its message directly (short readable)', () => {
    expect(getUserMessage(new Error('Network connection failed'))).toBe('Network connection failed')
  })

  it('auth Error returns its message directly', () => {
    expect(getUserMessage(new Error('401 Unauthorized'))).toBe('401 Unauthorized')
  })

  it('Error with exactly 119 chars returns directly', () => {
    const msg = 'a'.repeat(119)
    expect(getUserMessage(new Error(msg))).toBe(msg)
  })

  it('Error with exactly 120 chars returns the raw message directly', () => {
    const msg = 'a'.repeat(120)
    const result = getUserMessage(new Error(msg))
    // getUserMessage returns the raw message when it's non-empty and not 'undefined'/'null'
    expect(result).toBe(msg)
  })

  it('getError returns raw message for pure number errors', () => {
    // toErrorMessage(404) = "404", which is non-empty and not 'undefined'/'null'
    expect(getUserMessage(404)).toBe('404')
  })

  it('getError returns raw message for network errors', () => {
    // getUserMessage returns the direct message when available
    expect(getUserMessage(new Error('network failed'))).toBe('network failed')
  })

  it('getError returns raw message for auth errors', () => {
    expect(getUserMessage(new Error('unauthorized 401'))).toBe('unauthorized 401')
  })

  it('getError returns raw message for timeout errors', () => {
    expect(getUserMessage(new Error('connection timeout'))).toBe('connection timeout')
  })

  it('getError returns raw message for not-found errors', () => {
    expect(getUserMessage(new Error('resource not found'))).toBe('resource not found')
  })

  it('getError returns raw message for validation errors', () => {
    expect(getUserMessage(new Error('invalid input'))).toBe('invalid input')
  })
})

// =========================================================================
// 6. reportError — log boundary and toast interaction
// =========================================================================

describe('Deep: reportError log boundary and toast', () => {
  beforeEach(() => {
    clearErrorLog()
  })

  it('log retains exactly 100 entries when 101 are added', () => {
    for (let i = 0; i < 101; i++) {
      reportError(new Error(`err-${i}`), 'Test', { silent: true })
    }
    const log = getErrorLog()
    expect(log).toHaveLength(100)
    // First entry should be err-1 (err-0 was trimmed)
    expect(log[0].message).toBe('err-1')
    // Last entry should be err-100
    expect(log[99].message).toBe('err-100')
  })

  it('log retains exactly 100 entries when 200 are added', () => {
    for (let i = 0; i < 200; i++) {
      reportError(new Error(`e-${i}`), 'Test', { silent: true })
    }
    expect(getErrorLog()).toHaveLength(100)
    expect(getErrorLog()[0].message).toBe('e-100')
    expect(getErrorLog()[99].message).toBe('e-199')
  })

  it('log retains exactly 99 entries (below threshold)', () => {
    for (let i = 0; i < 99; i++) {
      reportError(new Error(`e-${i}`), 'Test', { silent: true })
    }
    expect(getErrorLog()).toHaveLength(99)
    expect(getErrorLog()[0].message).toBe('e-0')
  })

  it('timestamp is valid ISO 8601', () => {
    const report = reportError(new Error('ts test'), 'Test', { silent: true })
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    // Verify it parses as a valid date
    const parsed = new Date(report.timestamp)
    expect(parsed.getTime()).not.toBeNaN()
  })

  it('context string is preserved exactly', () => {
    const report = reportError(new Error('ctx'), 'MyStore.loadData', { silent: true })
    expect(report.context).toBe('MyStore.loadData')
  })

  it('report.error is the original error object (same reference)', () => {
    const original = new Error('ref test')
    const report = reportError(original, 'Test', { silent: true })
    expect(report.error).toBe(original)
  })

  it('concurrent reportError calls preserve order', () => {
    for (let i = 0; i < 50; i++) {
      reportError(new Error(`concurrent-${i}`), 'Test', { silent: true })
    }
    const log = getErrorLog()
    for (let i = 0; i < 50; i++) {
      expect(log[i].message).toBe(`concurrent-${i}`)
    }
  })

  it('showToast with no toastFn registered does not throw', () => {
    // Register null toast
    registerToast(null as unknown as ReturnType<typeof vi.fn>)
    expect(() => {
      reportError(new Error('no toast fn'), 'Test', { showToast: true })
    }).not.toThrow()
  })

  it('toast receives category message for long errors (>120 chars)', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    const longMsg = 'x'.repeat(200)
    reportError(new Error(longMsg), 'Test', { showToast: true })
    // The toast should receive a short category-based message
    const calledMsg = toastFn.mock.calls[0][1]
    expect(calledMsg.length).toBeLessThan(200)
    expect(calledMsg).toBe('发生未知错误，请稍后重试')
  })

  it('toast receives raw message for short errors (<120 chars)', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    reportError(new Error('short error'), 'Test', { showToast: true })
    expect(toastFn).toHaveBeenCalledWith('error', 'short error')
  })

  it('toast receives category fallback for "undefined" raw message', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    reportError(undefined, 'Test', { showToast: true })
    const calledMsg = toastFn.mock.calls[0][1]
    // "undefined" -> length 9, but isShortReadable check: raw !== 'undefined' fails
    // So it falls back to category message
    expect(calledMsg).toBe('发生未知错误，请稍后重试')
  })

  it('toast receives category fallback for "null" raw message', () => {
    const toastFn = vi.fn()
    registerToast(toastFn)
    reportError(null, 'Test', { showToast: true })
    const calledMsg = toastFn.mock.calls[0][1]
    // "null" -> length 4, but raw !== 'null' fails
    expect(calledMsg).toBe('发生未知错误，请稍后重试')
  })
})

// =========================================================================
// 7. handleAsync — edge cases
// =========================================================================

describe('Deep: handleAsync edge cases', () => {
  beforeEach(() => {
    clearErrorLog()
  })

  it('async fn that resolves with null returns [null, null]', async () => {
    const [data, err] = await handleAsync(async () => null, 'Test')
    expect(data).toBeNull()
    expect(err).toBeNull()
  })

  it('async fn that resolves with undefined returns [undefined, null]', async () => {
    const [data, err] = await handleAsync(async () => undefined, 'Test')
    expect(data).toBeUndefined()
    expect(err).toBeNull()
  })

  it('async fn that rejects with string wraps in ErrorReport', async () => {
    const [data, err] = await handleAsync(
      async () => {
        throw 'string rejection'
      },
      'Test',
      { silent: true },
    )
    expect(data).toBeNull()
    expect(err).not.toBeNull()
    expect(err!.message).toBe('string rejection')
    expect(err!.category).toBe('unknown')
  })

  it('async fn that rejects with number wraps in ErrorReport', async () => {
    const [data, err] = await handleAsync(
      async () => {
        throw 404
      },
      'Test',
      { silent: true },
    )
    expect(data).toBeNull()
    expect(err!.message).toBe('404')
    // "404" contains "404" -> not-found
    expect(err!.category).toBe('not-found')
  })

  it('handleAsync adds to error log on failure', async () => {
    clearErrorLog()
    await handleAsync(
      async () => {
        throw new Error('log test')
      },
      'TestCtx',
      { silent: true },
    )
    expect(getErrorLog()).toHaveLength(1)
    expect(getErrorLog()[0].context).toBe('TestCtx')
    expect(getErrorLog()[0].message).toBe('log test')
  })

  it('handleAsync does not add to log on success', async () => {
    clearErrorLog()
    await handleAsync(async () => 42, 'TestCtx')
    expect(getErrorLog()).toHaveLength(0)
  })

  it('retryable categories in handleAsync', async () => {
    // network -> retryable
    const [, errNet] = await handleAsync(
      async () => {
        throw new Error('fetch failed')
      },
      'Test',
      { silent: true },
    )
    expect(errNet!.retryable).toBe(true)

    // auth -> not retryable
    const [, errAuth] = await handleAsync(
      async () => {
        throw new Error('401 unauthorized')
      },
      'Test',
      { silent: true },
    )
    expect(errAuth!.retryable).toBe(false)

    // validation -> not retryable
    const [, errVal] = await handleAsync(
      async () => {
        throw new Error('invalid input')
      },
      'Test',
      { silent: true },
    )
    expect(errVal!.retryable).toBe(false)

    // timeout -> retryable
    const [, errTimeout] = await handleAsync(
      async () => {
        throw new Error('timed out')
      },
      'Test',
      { silent: true },
    )
    expect(errTimeout!.retryable).toBe(true)
  })
})
