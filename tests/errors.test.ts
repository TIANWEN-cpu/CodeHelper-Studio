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
  it('Error 实例返回 message', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('字符串原样返回', () => {
    expect(toErrorMessage('some error')).toBe('some error')
  })

  it('带 message 属性的对象返回 message', () => {
    expect(toErrorMessage({ message: 'obj error' })).toBe('obj error')
  })

  it('null 返回 "null"', () => {
    expect(toErrorMessage(null)).toBe('null')
  })

  it('undefined 返回 "undefined"', () => {
    expect(toErrorMessage(undefined)).toBe('undefined')
  })

  it('数字返回字符串', () => {
    expect(toErrorMessage(42)).toBe('42')
  })
})

describe('safeAsync', () => {
  it('成功时返回 [data, null]', async () => {
    const [data, err] = await safeAsync(async () => 42)
    expect(data).toBe(42)
    expect(err).toBeNull()
  })

  it('Error 实例被捕获', async () => {
    const [data, err] = await safeAsync(async () => {
      throw new Error('fail')
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toBe('fail')
  })

  it('非 Error 值被包装为 Error', async () => {
    const [data, err] = await safeAsync(async () => {
      throw 'string error'
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toBe('string error')
  })
})

describe('safeSync', () => {
  it('成功时返回 [data, null]', () => {
    const [data, err] = safeSync(() => 42)
    expect(data).toBe(42)
    expect(err).toBeNull()
  })

  it('Error 实例被捕获', () => {
    const [data, err] = safeSync(() => {
      throw new Error('fail')
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toBe('fail')
  })

  it('非 Error 值被包装为 Error', () => {
    const [data, err] = safeSync(() => {
      throw 'string error'
    })
    expect(data).toBeNull()
    expect(err).toBeInstanceOf(Error)
  })
})

describe('parseJsonSafe', () => {
  it('合法 JSON 解析成功', () => {
    expect(parseJsonSafe('{"a":1}', {})).toEqual({ a: 1 })
  })

  it('非法 JSON 返回 fallback', () => {
    expect(parseJsonSafe('invalid', { default: true })).toEqual({ default: true })
  })

  it('空字符串返回 fallback', () => {
    expect(parseJsonSafe('', [])).toEqual([])
  })
})

describe('categorizeError', () => {
  it('网络错误', () => {
    expect(categorizeError('ECONNREFUSED')).toBe('network')
    expect(categorizeError('fetch failed')).toBe('network')
  })

  it('认证错误', () => {
    expect(categorizeError('unauthorized')).toBe('auth')
    expect(categorizeError('401')).toBe('auth')
    expect(categorizeError('403 forbidden')).toBe('auth')
  })

  it('超时错误', () => {
    expect(categorizeError('request timed out')).toBe('timeout')
  })

  it('未找到错误', () => {
    expect(categorizeError('404 not found')).toBe('not-found')
  })

  it('验证错误', () => {
    expect(categorizeError('invalid input')).toBe('validation')
    expect(categorizeError('field is required')).toBe('validation')
  })

  it('未知错误', () => {
    expect(categorizeError('something weird')).toBe('unknown')
  })
})

describe('getUserMessage', () => {
  it('返回 Error 消息', () => {
    expect(getUserMessage(new Error('boom'))).toBe('boom')
  })

  it('空/无意义输入使用分类消息', () => {
    const msg = getUserMessage(null)
    expect(msg).toBeTruthy()
  })

  it('有意义的字符串直接返回', () => {
    expect(getUserMessage('网络连接失败，请检查网络后重试')).toBe('网络连接失败，请检查网络后重试')
  })
})
