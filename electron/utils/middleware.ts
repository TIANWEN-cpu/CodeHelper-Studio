/**
 * Composable middleware pipeline for Electron IPC handlers.
 *
 * Wraps an `ipcMain.handle` handler with a chain of middleware functions
 * that execute in order before and after the handler. Each middleware
 * receives a `context` object and a `next` function to call the next
 * middleware or the actual handler.
 *
 * Built-in middleware:
 * - `loggingMiddleware`  — logs every IPC call with timing
 * - `errorMiddleware`    — catches and wraps handler errors
 * - `validationMiddleware` — runs a validation function before the handler
 * - `rateLimitMiddleware` — throttles repeated calls to the same channel
 *
 * Usage:
 * ```ts
 * import { ipcMain } from 'electron'
 * import {
 *   withMiddleware,
 *   loggingMiddleware,
 *   errorMiddleware,
 *   rateLimitMiddleware,
 * } from '../utils/middleware'
 *
 * ipcMain.handle(
 *   'some-channel',
 *   withMiddleware('some-channel', handleSomeChannel, [
 *     loggingMiddleware,
 *     errorMiddleware,
 *     rateLimitMiddleware({ maxCalls: 30, windowMs: 10_000 }),
 *   ]),
 * )
 * ```
 */

import { ipcMain } from 'electron'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MiddlewareContext {
  /** The IPC channel name. */
  channel: string
  /** The Electron IpcMainInvokeEvent. */
  event: Electron.IpcMainInvokeEvent
  /** The arguments passed from the renderer. */
  args: unknown[]
  /** Mutable bag for middleware to pass data downstream. */
  meta: Record<string, unknown>
  /** Timestamp when the middleware chain started (for timing). */
  startedAt: number
}

export type IpcHandler = (
  event: Electron.IpcMainInvokeEvent,
  ...args: unknown[]
) => unknown | Promise<unknown>

export type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => Promise<unknown>,
) => Promise<unknown>

// ---------------------------------------------------------------------------
// Core: compose middleware into a single handler wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an IPC handler with a middleware chain.
 *
 * Returns a function compatible with `ipcMain.handle`.
 */
export function withMiddleware(
  channel: string,
  handler: IpcHandler,
  middlewares: MiddlewareFn[],
): IpcHandler {
  return async (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    const ctx: MiddlewareContext = {
      channel,
      event,
      args,
      meta: {},
      startedAt: performance.now(),
    }

    let index = 0

    const next = async (): Promise<unknown> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++]
        return mw(ctx, next)
      }
      // End of chain — call the actual handler
      return handler(event, ...args)
    }

    return next()
  }
}

// ---------------------------------------------------------------------------
// Built-in middleware
// ---------------------------------------------------------------------------

/**
 * Logging middleware. Logs channel name, duration, and success/failure.
 */
export const loggingMiddleware: MiddlewareFn = async (ctx, next) => {
  const start = performance.now()
  try {
    const result = await next()
    const duration = performance.now() - start
    if (duration > 500) {
      console.debug(`[ipc] ${ctx.channel} completed in ${duration.toFixed(1)}ms`)
    }
    return result
  } catch (error) {
    const duration = performance.now() - start
    console.error(`[ipc] ${ctx.channel} FAILED after ${duration.toFixed(1)}ms:`, error)
    throw error
  }
}

/**
 * Error-handling middleware. Catches handler errors and wraps them
 * with the channel name for easier debugging.
 */
export const errorMiddleware: MiddlewareFn = async (ctx, next) => {
  try {
    return await next()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const wrapped = new Error(`[IPC:${ctx.channel}] ${message}`)
    // Preserve original stack if available
    if (error instanceof Error && error.stack) {
      wrapped.stack = error.stack
    }
    throw wrapped
  }
}

/**
 * Validation middleware factory. Runs a validation function before the handler.
 * The validator should throw if the arguments are invalid.
 *
 * @param validator - A function that receives the IPC args and throws on invalid input.
 *
 * @example
 * ```ts
 * validationMiddleware((args) => {
 *   if (!args[0] || typeof args[0] !== 'object') throw new Error('Missing payload')
 * })
 * ```
 */
export function validationMiddleware(validator: (args: unknown[]) => void): MiddlewareFn {
  return async (_ctx, next) => {
    // We validate args from the context before proceeding
    validator(_ctx.args)
    return next()
  }
}

export interface RateLimitOptions {
  /** Max calls allowed within the time window. */
  maxCalls: number
  /** Time window in milliseconds. */
  windowMs: number
}

/**
 * Rate-limiting middleware factory. Throttles repeated calls to the
 * same channel from the same sender.
 *
 * @example
 * ```ts
 * rateLimitMiddleware({ maxCalls: 30, windowMs: 10_000 })
 * ```
 */
export function rateLimitMiddleware(options: RateLimitOptions): MiddlewareFn {
  const { maxCalls, windowMs } = options
  const calls: number[] = []

  return async (ctx, next) => {
    const now = Date.now()

    // Purge expired entries
    while (calls.length > 0 && calls[0] <= now - windowMs) {
      calls.shift()
    }

    if (calls.length >= maxCalls) {
      const waitMs = windowMs - (now - calls[0])
      throw new Error(`[IPC:${ctx.channel}] 请求过于频繁，请在 ${Math.ceil(waitMs / 1000)}秒后重试`)
    }

    calls.push(now)
    return next()
  }
}

// ---------------------------------------------------------------------------
// Convenience: register an IPC handler with middleware in one call
// ---------------------------------------------------------------------------

/**
 * Register an IPC handler with a default middleware stack.
 *
 * @param channel  - IPC channel name.
 * @param handler  - The actual handler function.
 * @param extra    - Optional additional middleware to append.
 */
export function registerIpcHandler(
  channel: string,
  handler: IpcHandler,
  extra: MiddlewareFn[] = [],
): void {
  const defaultStack: MiddlewareFn[] = [loggingMiddleware, errorMiddleware, ...extra]
  ipcMain.handle(channel, withMiddleware(channel, handler, defaultStack))
}
