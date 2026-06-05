export type ErrorCategory = 'network' | 'auth' | 'timeout' | 'not-found' | 'validation' | 'unknown'

export const CATEGORY_MESSAGES: Record<ErrorCategory, string> = {
  network: '网络连接失败，请检查网络后重试',
  auth: '认证失败，请检查 API 密钥配置',
  timeout: '请求超时，请稍后重试',
  'not-found': '请求的资源不存在',
  validation: '输入数据不合法，请检查后重试',
  unknown: '发生未知错误，请稍后重试',
}

export const CATEGORY_SUGGESTIONS: Record<ErrorCategory, string> = {
  network: '请检查网络连接是否正常，或稍后重试',
  auth: '请前往"设置"页面检查 API 密钥是否正确配置',
  timeout: '服务器响应较慢，请稍后重试或检查 API 服务状态',
  'not-found': '请确认请求的资源是否存在',
  validation: '请检查输入内容是否符合要求',
  unknown: '如果问题持续存在，请尝试重启应用',
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(toErrorMessage(error))
}

export async function safeAsync<T>(fn: () => Promise<T>): Promise<[T, null] | [null, Error]> {
  try {
    return [await fn(), null]
  } catch (error) {
    return [null, toError(error)]
  }
}

export function safeSync<T>(fn: () => T): [T, null] | [null, Error] {
  try {
    return [fn(), null]
  } catch (error) {
    return [null, toError(error)]
  }
}

export function parseJsonSafe<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function categorizeError(error: unknown): ErrorCategory {
  const message = toErrorMessage(error).toLowerCase()
  if (/timeout|timed out|abort/.test(message)) return 'timeout'
  if (/network|fetch|econnrefused|enotfound|connection/.test(message)) return 'network'
  if (/unauthorized|forbidden|401|403|auth|api key|api_key|invalid key/.test(message)) return 'auth'
  if (/not found|404/.test(message)) return 'not-found'
  if (/invalid|validation|required|bad request|400/.test(message)) return 'validation'
  return 'unknown'
}

export function getUserMessage(error: unknown): string {
  const message = toErrorMessage(error)
  if (message && message !== 'undefined' && message !== 'null' && message.length < 160)
    return message
  return CATEGORY_MESSAGES[categorizeError(error)]
}
