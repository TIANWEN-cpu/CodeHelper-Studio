/**
 * Shared error handling utilities.
 *
 * Provides consistent error normalization, logging, and user-facing
 * message generation across the renderer process.
 */

/**
 * Normalize an unknown thrown value into a human-readable string.
 *
 * Handles Error instances, strings, plain objects, and everything else.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

/**
 * Wrap an async operation with try/catch and return a result tuple.
 *
 * Usage:
 * ```ts
 * const [data, err] = await safeAsync(() => window.api.invoke('foo'))
 * if (err) { handleError(err) }
 * ```
 */
export async function safeAsync<T>(fn: () => Promise<T>): Promise<[T, null] | [null, Error]> {
  try {
    const data = await fn()
    return [data, null]
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(toErrorMessage(error))]
  }
}

/**
 * Wrap a synchronous operation with try/catch and return a result tuple.
 *
 * Usage:
 * ```ts
 * const [data, err] = safeSync(() => JSON.parse(raw))
 * if (err) { handleError(err) }
 * ```
 */
export function safeSync<T>(fn: () => T): [T, null] | [null, Error] {
  try {
    const data = fn()
    return [data, null]
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(toErrorMessage(error))]
  }
}

/**
 * Parse a JSON string safely, returning a fallback on failure.
 */
export function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Common error types for categorizing IPC/network errors.
 */
export type ErrorCategory = 'network' | 'validation' | 'auth' | 'not-found' | 'timeout' | 'unknown'

/**
 * User-facing error messages for common categories.
 *
 * Shared across errorHandler, ErrorToast, and ErrorWithRetry.
 */
export const CATEGORY_MESSAGES: Record<ErrorCategory, string> = {
  network: '网络连接失败，请检查网络后重试',
  auth: '认证失败，请检查 API Key 配置',
  timeout: '请求超时，请稍后重试',
  'not-found': '请求的资源不存在',
  validation: '输入数据不合法，请检查后重试',
  unknown: '发生未知错误，请稍后重试',
}

/**
 * Attempt to categorize an error by inspecting its message.
 */
export function categorizeError(error: unknown): ErrorCategory {
  const msg = toErrorMessage(error).toLowerCase()
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
    return 'network'
  }
  if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) {
    return 'auth'
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'timeout'
  }
  if (msg.includes('not found') || msg.includes('404')) {
    return 'not-found'
  }
  if (msg.includes('invalid') || msg.includes('validation') || msg.includes('required')) {
    return 'validation'
  }
  return 'unknown'
}

/**
 * Get a user-friendly error message, with category-based fallback.
 */
export function getUserMessage(error: unknown): string {
  const direct = toErrorMessage(error)
  const isReadableMessage =
    direct && direct !== 'undefined' && direct !== 'null' && direct !== '[object Object]'
  if (isReadableMessage) {
    return direct
  }
  return CATEGORY_MESSAGES[categorizeError(error)]
}
