// middleware.ts 顶层 import 了 electron（仅 registerIpcHandler 使用 ipcMain），
// 其余导出都是纯函数。mock 掉 electron 以便在 Node 测试环境导入。
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withMiddleware,
  loggingMiddleware,
  errorMiddleware,
  validationMiddleware,
  rateLimitMiddleware,
  type MiddlewareFn,
} from '../electron/utils/middleware'

// ---------------------------------------------------------------------------
// 测试辅助：构造一个最小的 IpcMainInvokeEvent 与中间件上下文。
// ---------------------------------------------------------------------------
function makeEvent(): Electron.IpcMainInvokeEvent {
  return { sender: {} } as unknown as Electron.IpcMainInvokeEvent
}

/** 把一个中间件 + 末态 handler 包成一个可直接调用的函数，便于单测。 */
function runWith(
  channel: string,
  middlewares: MiddlewareFn[],
  handler: (...args: unknown[]) => unknown,
  args: unknown[] = [],
): Promise<unknown> {
  return withMiddleware(channel, handler, middlewares)(makeEvent(), ...args)
}

// ===========================================================================
// withMiddleware：核心组合逻辑
// ===========================================================================
describe('withMiddleware', () => {
  it('无中间件时直接调用 handler 并返回结果', async () => {
    const result = await runWith('ch', [], () => 42)
    expect(result).toBe(42)
  })

  it('把 event 与 args 透传给 handler', async () => {
    const handler = vi.fn((...a: unknown[]) => a)
    await runWith('ch', [], handler, ['x', 1])
    expect(handler).toHaveBeenCalledTimes(1)
    // handler 收到 (event, 'x', 1)
    expect(handler.mock.calls[0][1]).toBe('x')
    expect(handler.mock.calls[0][2]).toBe(1)
  })

  it('中间件按声明顺序执行（洋葱模型）', async () => {
    const order: string[] = []
    const mw =
      (tag: string): MiddlewareFn =>
      async (_ctx, next) => {
        order.push(`${tag}:before`)
        const r = await next()
        order.push(`${tag}:after`)
        return r
      }
    await runWith('ch', [mw('A'), mw('B'), mw('C')], () => {
      order.push('handler')
      return 'done'
    })
    expect(order).toEqual([
      'A:before',
      'B:before',
      'C:before',
      'handler',
      'C:after',
      'B:after',
      'A:after',
    ])
  })

  it('支持异步 handler 与异步中间件', async () => {
    const mw: MiddlewareFn = async (_ctx, next) => {
      const r = await next()
      return `wrapped(${r})`
    }
    const result = await runWith('ch', [mw], async () => 'value')
    expect(result).toBe('wrapped(value)')
  })

  it('中间件可通过 ctx.meta 向下游传递数据', async () => {
    const producer: MiddlewareFn = async (ctx, next) => {
      ctx.meta.greeting = 'hello'
      return next()
    }
    let seen: unknown
    const reader: MiddlewareFn = async (ctx, next) => {
      seen = ctx.meta.greeting
      return next()
    }
    await runWith('ch', [producer, reader], () => 'ok')
    expect(seen).toBe('hello')
  })
})

// ===========================================================================
// loggingMiddleware
// ===========================================================================
describe('loggingMiddleware', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('成功时透传结果', async () => {
    const result = await runWith('ch', [loggingMiddleware], () => 'ok')
    expect(result).toBe('ok')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('handler 抛错时打印错误日志并重新抛出', async () => {
    await expect(
      runWith('ch', [loggingMiddleware], () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('成功时不调用 error 日志（无论耗时）', async () => {
    await runWith('ch', [loggingMiddleware], () => 'ok')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// errorMiddleware
// ===========================================================================
describe('errorMiddleware', () => {
  it('用 channel 名包装 Error 消息', async () => {
    await expect(
      runWith('my-channel', [errorMiddleware], () => {
        throw new Error('原始错误')
      }),
    ).rejects.toThrow('[IPC:my-channel] 原始错误')
  })

  it('非 Error 抛出值也包装为带 channel 的消息', async () => {
    await expect(
      runWith('ch', [errorMiddleware], () => {
        throw '字符串错误'
      }),
    ).rejects.toThrow('[IPC:ch] 字符串错误')
  })

  it('保留原始 Error 的 stack', async () => {
    const original = new Error('原始错误')
    const caught = await runWith('ch', [errorMiddleware], () => {
      throw original
    }).catch((e) => e)
    expect(caught).toBeInstanceOf(Error)
    // wrapped.stack 应来自原始 error
    expect((caught as Error).stack).toBe(original.stack)
  })

  it('成功时直接透传，不抛出', async () => {
    const result = await runWith('ch', [errorMiddleware], () => 123)
    expect(result).toBe(123)
  })
})

// ===========================================================================
// validationMiddleware
// ===========================================================================
describe('validationMiddleware', () => {
  it('validator 通过时透传到 handler', async () => {
    const validator = vi.fn()
    const result = await runWith('ch', [validationMiddleware(validator)], () => 'ok', ['arg'])
    expect(result).toBe('ok')
    expect(validator).toHaveBeenCalledWith(['arg'])
  })

  it('validator 抛出时阻止 handler 执行', async () => {
    const handler = vi.fn(() => 'should-not-run')
    await expect(
      runWith(
        'ch',
        [
          validationMiddleware(() => {
            throw new Error('非法参数')
          }),
        ],
        handler,
        ['bad'],
      ),
    ).rejects.toThrow('非法参数')
    expect(handler).not.toHaveBeenCalled()
  })

  it('把 ctx.args 传给 validator（而非 handler 的展开参数）', async () => {
    let received: unknown[] = []
    await runWith(
      'ch',
      [
        validationMiddleware((args) => {
          received = args
        }),
      ],
      () => 'ok',
      [1, 2, 3],
    )
    expect(received).toEqual([1, 2, 3])
  })
})

// ===========================================================================
// rateLimitMiddleware
// ===========================================================================
describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('未超限时放行并透传结果', async () => {
    const mw = rateLimitMiddleware({ maxCalls: 5, windowMs: 10_000 })
    const result = await runWith('ch', [mw], () => 'ok')
    expect(result).toBe('ok')
  })

  it('在窗口内达到上限后再次调用会抛出限流错误', async () => {
    const mw = rateLimitMiddleware({ maxCalls: 3, windowMs: 10_000 })
    // 前 3 次放行
    await runWith('ch', [mw], () => 'ok')
    await runWith('ch', [mw], () => 'ok')
    await runWith('ch', [mw], () => 'ok')
    // 第 4 次应被限流
    await expect(runWith('ch', [mw], () => 'ok')).rejects.toThrow(/请求过于频繁/)
  })

  it('限流错误消息包含 channel 与剩余等待秒数', async () => {
    const mw = rateLimitMiddleware({ maxCalls: 1, windowMs: 10_000 })
    await runWith('ch', [mw], () => 'ok') // 用掉唯一配额

    // 推进 3 秒，剩余约 7 秒
    vi.advanceTimersByTime(3_000)
    await expect(runWith('ch', [mw], () => 'ok')).rejects.toThrow(
      /\[IPC:ch\] 请求过于频繁，请在 7秒后重试/,
    )
  })

  it('窗口过期后旧记录被清除，调用重新放行', async () => {
    const mw = rateLimitMiddleware({ maxCalls: 1, windowMs: 10_000 })
    await runWith('ch', [mw], () => 'ok') // 用掉配额

    // 超过窗口，旧记录应被 purge
    vi.advanceTimersByTime(10_001)
    const result = await runWith('ch', [mw], () => 'recovered')
    expect(result).toBe('recovered')
  })

  it('每个 rateLimitMiddleware 实例的计数相互独立', async () => {
    const mwA = rateLimitMiddleware({ maxCalls: 1, windowMs: 10_000 })
    const mwB = rateLimitMiddleware({ maxCalls: 1, windowMs: 10_000 })
    await runWith('ch-a', [mwA], () => 'ok')
    await runWith('ch-b', [mwB], () => 'ok') // 不同实例，不受 mwA 影响
    // 同一实例 mwA 再次调用应限流
    await expect(runWith('ch-a', [mwA], () => 'ok')).rejects.toThrow(/请求过于频繁/)
  })
})

// ===========================================================================
// 组合：errorMiddleware 包裹下游错误
// ===========================================================================
describe('中间件组合', () => {
  it('errorMiddleware 能捕获 validationMiddleware 抛出的校验错误', async () => {
    await expect(
      runWith(
        'ch',
        [
          errorMiddleware,
          validationMiddleware(() => {
            throw new Error('校验失败')
          }),
        ],
        () => 'unreached',
      ),
    ).rejects.toThrow('[IPC:ch] 校验失败')
  })

  it('多层中间件 + 异步 handler 正常返回最终值', async () => {
    const trace: string[] = []
    const result = await runWith(
      'ch',
      [
        loggingMiddleware,
        errorMiddleware,
        async (_ctx, next) => {
          trace.push('mw1')
          const r = await next()
          trace.push(`mw1:got:${r}`)
          return r
        },
      ],
      async () => {
        trace.push('handler')
        return 'final'
      },
    )
    expect(result).toBe('final')
    expect(trace).toEqual(['mw1', 'handler', 'mw1:got:final'])
  })
})
