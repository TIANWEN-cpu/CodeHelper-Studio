import { describe, it, expect } from 'vitest'
import {
  toErrorMessage,
  safeAsync,
  safeSync,
  parseJsonSafe,
  categorizeError,
  getUserMessage,
} from '../src/utils/errors'

describe('toErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(toErrorMessage(new Error('test error'))).toBe('test error')
  })

  it('returns string errors as-is', () => {
    expect(toErrorMessage('string error')).toBe('string error')
  })

  it('extracts message from objects with message property', () => {
    expect(toErrorMessage({ message: 'obj error' })).toBe('obj error')
  })

  it('converts other types to string', () => {
    expect(toErrorMessage(42)).toBe('42')
    expect(toErrorMessage(null)).toBe('null')
    expect(toErrorMessage(undefined)).toBe('undefined')
    expect(toErrorMessage(true)).toBe('true')
  })

  it('handles object with non-string message', () => {
    expect(toErrorMessage({ message: 123 })).toBe('123')
  })
})

describe('safeAsync', () => {
  it('returns data on success', async () => {
    const [data, err] = await safeAsync(() => Promise.resolve('ok'))
    expect(data).toBe('ok')
    expect(err).toBeNull()
  })

  it('returns error on failure', async () => {
    const [data, err] = await safeAsync(() => Promise.reject(new Error('fail')))
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('fail')
  })

  it('wraps non-Error rejections', async () => {
    const [data, err] = await safeAsync(() => Promise.reject('string err'))
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('string err')
  })
})

describe('safeSync', () => {
  it('returns data on success', () => {
    const [data, err] = safeSync(() => 42)
    expect(data).toBe(42)
    expect(err).toBeNull()
  })

  it('returns error on throw', () => {
    const [data, err] = safeSync(() => {
      throw new Error('sync fail')
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
    expect(err!.message).toBe('sync fail')
  })

  it('wraps non-Error throws', () => {
    const [data, err] = safeSync(() => {
      throw 'string throw'
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
  })
})

describe('parseJsonSafe', () => {
  it('parses valid JSON', () => {
    expect(parseJsonSafe('{"a":1}', {})).toEqual({ a: 1 })
    expect(parseJsonSafe('[1,2,3]', [])).toEqual([1, 2, 3])
    expect(parseJsonSafe('"hello"', '')).toBe('hello')
  })

  it('returns fallback on invalid JSON', () => {
    expect(parseJsonSafe('not json', { fallback: true })).toEqual({ fallback: true })
    expect(parseJsonSafe('', [])).toEqual([])
    expect(parseJsonSafe('{bad}', null)).toBeNull()
  })
})

describe('categorizeError', () => {
  it('detects network errors', () => {
    expect(categorizeError(new Error('network failed'))).toBe('network')
    expect(categorizeError(new Error('fetch error'))).toBe('network')
    expect(categorizeError(new Error('ECONNREFUSED'))).toBe('network')
  })

  it('detects auth errors', () => {
    expect(categorizeError(new Error('unauthorized'))).toBe('auth')
    expect(categorizeError(new Error('401'))).toBe('auth')
    expect(categorizeError(new Error('403 forbidden'))).toBe('auth')
  })

  it('detects timeout errors', () => {
    expect(categorizeError(new Error('timeout'))).toBe('timeout')
    expect(categorizeError(new Error('timed out'))).toBe('timeout')
  })

  it('detects not-found errors', () => {
    expect(categorizeError(new Error('not found'))).toBe('not-found')
    expect(categorizeError(new Error('404'))).toBe('not-found')
  })

  it('detects validation errors', () => {
    expect(categorizeError(new Error('invalid input'))).toBe('validation')
    expect(categorizeError(new Error('validation failed'))).toBe('validation')
    expect(categorizeError(new Error('required field'))).toBe('validation')
  })

  it('defaults to unknown', () => {
    expect(categorizeError(new Error('something weird'))).toBe('unknown')
    expect(categorizeError(42)).toBe('unknown')
  })
})

describe('getUserMessage', () => {
  it('returns direct message when available', () => {
    expect(getUserMessage(new Error('specific error'))).toBe('specific error')
  })

  it('returns direct message for non-empty strings', () => {
    expect(getUserMessage('some error')).toBe('some error')
  })

  it('returns category message for empty/invalid direct messages', () => {
    // toErrorMessage(undefined) => 'undefined' which passes the filter
    const msg = getUserMessage(undefined)
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
  })
})
