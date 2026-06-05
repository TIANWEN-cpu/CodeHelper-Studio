import { categorizeError, getUserMessage, toErrorMessage, type ErrorCategory } from './errors'

export type ErrorReport = {
  message: string
  context: string
  category: ErrorCategory
  retryable: boolean
  timestamp: string
  error: Error
}

type ToastFn = (type: 'error', message: string) => void
type ReportOptions = {
  silent?: boolean
  showToast?: boolean
}

const MAX_LOG_SIZE = 100
let errorLog: ErrorReport[] = []
let toastFn: ToastFn | null = null

function ensureError(error: unknown): Error {
  return error instanceof Error ? error : new Error(toErrorMessage(error))
}

function toastMessage(error: unknown): string {
  const message = getUserMessage(error)
  return message.length < 160 ? message : getUserMessage(new Error(''))
}

export function reportError(
  error: unknown,
  context: string,
  options: ReportOptions = {},
): ErrorReport {
  const err = ensureError(error)
  const category = categorizeError(err)
  const report: ErrorReport = {
    message: toErrorMessage(error),
    context,
    category,
    retryable: category === 'network' || category === 'timeout',
    timestamp: new Date().toISOString(),
    error: err,
  }
  errorLog.push(report)
  if (errorLog.length > MAX_LOG_SIZE) errorLog = errorLog.slice(-MAX_LOG_SIZE)
  if (!options.silent) console.error('[ErrorHandler]', report)
  if (options.showToast && toastFn) toastFn('error', toastMessage(error))
  return report
}

export async function handleAsync<T>(
  fn: () => Promise<T>,
  context: string,
  options?: ReportOptions,
): Promise<[T, null] | [null, ErrorReport]> {
  try {
    return [await fn(), null]
  } catch (error) {
    return [null, reportError(error, context, options)]
  }
}

export function getErrorLog(): ErrorReport[] {
  return [...errorLog]
}

export function clearErrorLog(): void {
  errorLog = []
}

export function registerToast(fn: ToastFn): void {
  toastFn = fn
}

export function registerGlobalErrorHandlers(): void {
  if (typeof window === 'undefined' || !window.addEventListener) return
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'window'))
  window.addEventListener('unhandledrejection', (event) =>
    reportError(event.reason, 'unhandledrejection'),
  )
}
