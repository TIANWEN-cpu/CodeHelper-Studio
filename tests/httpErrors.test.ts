import { describe, it, expect } from 'vitest'
import {
  friendlyUpstreamError,
  redirectBlockedError,
  isRedirect,
  type UpstreamContext,
} from '../electron/utils/httpErrors'

describe('friendlyUpstreamError', () => {
  describe('scope 随 context 切换', () => {
    it('models 上下文使用"获取模型列表失败"前缀', () => {
      expect(friendlyUpstreamError(500, 'models')).toContain('获取模型列表失败')
    })

    it('chat 上下文使用"AI 请求失败"前缀', () => {
      expect(friendlyUpstreamError(500, 'chat')).toContain('AI 请求失败')
    })
  })

  describe('具体状态码映射', () => {
    const cases: Array<{ status: number; context: UpstreamContext; contains: string }> = [
      { status: 400, context: 'chat', contains: '请求格式' },
      { status: 401, context: 'chat', contains: '鉴权失败' },
      { status: 403, context: 'models', contains: '鉴权失败' },
      { status: 404, context: 'chat', contains: '接口不存在' },
      { status: 408, context: 'chat', contains: '超时' },
      { status: 429, context: 'chat', contains: '频繁或额度不足' },
    ]
    for (const { status, context, contains } of cases) {
      it(`${status} (${context}) 提示含"${contains}"且带状态码`, () => {
        const msg = friendlyUpstreamError(status, context)
        expect(msg).toContain(contains)
        expect(msg).toContain(String(status))
      })
    }
  })

  describe('5xx 服务端错误', () => {
    it('500 归类为 Provider 服务异常', () => {
      expect(friendlyUpstreamError(500, 'chat')).toContain('Provider 服务异常')
    })

    it('502/503/504 同样走 5xx 分支', () => {
      for (const s of [502, 503, 504]) {
        expect(friendlyUpstreamError(s, 'chat')).toContain('服务异常')
      }
    })
  })

  describe('未明确处理的 4xx / 其它码', () => {
    it('418 等未列举状态走默认分支，仍带状态码', () => {
      const msg = friendlyUpstreamError(418, 'chat')
      expect(msg).toContain('418')
    })

    it('200（非错误码）也不崩溃，返回带状态码的默认提示', () => {
      expect(friendlyUpstreamError(200, 'chat')).toContain('200')
    })
  })

  describe('不泄露上游响应体（安全契约）', () => {
    // friendlyUpstreamError 只接收 status，不接触响应体 —— 从设计上保证不泄露。
    it('返回值不含任何响应体内容（仅依赖状态码）', () => {
      const msg = friendlyUpstreamError(400, 'chat')
      expect(msg).not.toContain('<html>')
      expect(msg).not.toContain('Internal Server Error detail')
    })
  })
})

describe('redirectBlockedError', () => {
  it('models 上下文提示含"获取模型列表"', () => {
    const err = redirectBlockedError('models')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('获取模型列表')
    expect(err.message).toContain('重定向')
  })

  it('chat 上下文提示含"AI 请求"', () => {
    expect(redirectBlockedError('chat').message).toContain('AI 请求')
  })

  it('提示引导用户填写 HTTPS Base URL', () => {
    expect(redirectBlockedError('chat').message).toMatch(/HTTPS/)
  })
})

describe('isRedirect', () => {
  it('3xx 为重定向', () => {
    for (const s of [300, 301, 302, 307, 308, 399]) {
      expect(isRedirect(s)).toBe(true)
    }
  })

  it('2xx 不是重定向', () => {
    for (const s of [200, 201, 204, 299]) {
      expect(isRedirect(s)).toBe(false)
    }
  })

  it('4xx/5xx 不是重定向', () => {
    for (const s of [400, 404, 500, 503]) {
      expect(isRedirect(s)).toBe(false)
    }
  })
})
