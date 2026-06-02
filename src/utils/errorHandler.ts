/**
 * Centralized error handler for the renderer process.
 *
 * Integrates error classification, logging, toast display, and optional
 * retry actions into a single entry point. Used by stores and views
 * to report errors consistently.
 */

import { toErrorMessage, categorizeError, CATEGORY_MESSAGES, type ErrorCategory } from './errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorReport {
  /** Original error value. */
  error: unknown
  /** Human-readable message (from the error or generated from category). */
  message: string
  /** Classified error category. */
  category: ErrorCategory
  /** Context tag for logging (e.g. store name, component name). */
  context: string
  /** ISO timestamp. */
  timestamp: string
  /** Whether the user should be offered a retry action. */
  retryable: boolean
}

/** Callback signature for showing error toasts. */
export type ErrorToastFn = (type: 'error', message: string, durationMs?: number) => void

/** Optional retry callback. */
export type RetryFn = () => void | Promise<void>

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let toastFn: ErrorToastFn | null = null
const errorLog: ErrorReport[] = []
const MAX_LOG_SIZE = 100

/** Retryable error categories — the user can meaningfully retry these. */
const RETRYABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set(['network', 'timeout', 'unknown'])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the toast function so `reportError` can display toasts.
 * Called once from the component tree (e.g. App or ToastProvider).
 */
export function registerToast(fn: ErrorToastFn): void {
  toastFn = fn
}

/**
 * Core error reporting function.
 *
 * 1. Classifies the error
 * 2. Builds a structured report
 * 3. Logs to the in-memory error log
 * 4. Emits a console error
 * 5. Optionally shows a toast notification
 *
 * @param error   - The caught error value.
 * @param context - A short tag for logging (e.g. 'ChatStore.loadSessions').
 * @param options - Additional options.
 */
export function reportError(
  error: unknown,
  context: string,
  options: { showToast?: boolean; silent?: boolean } = {},
): ErrorReport {
  const { showToast = false, silent = false } = options
  const message = toErrorMessage(error)
  const category = categorizeError(error)

  const report: ErrorReport = {
    error,
    message,
    category,
    context,
    timestamp: new Date().toISOString(),
    retryable: RETRYABLE_CATEGORIES.has(category),
  }

  // Append to in-memory log
  errorLog.push(report)
  if (errorLog.length > MAX_LOG_SIZE) {
    errorLog.splice(0, errorLog.length - MAX_LOG_SIZE)
  }

  // Console logging (unless silent)
  if (!silent) {
    console.error(`[${context}] (${category}) ${message}`)
  }

  // Toast display
  if (showToast && toastFn) {
    const userMsg = getUserFriendlyMessage(category, message)
    toastFn('error', userMsg)
  }

  return report
}

/**
 * Convenience wrapper: handle an async operation with centralized error
 * reporting. Returns `[data, null]` on success or `[null, report]` on error.
 *
 * @example
 * ```ts
 * const [data, errReport] = await handleAsync(
 *   () => typedInvoke('problems-list', filters),
 *   'ProblemStore.loadProblems',
 *   { showToast: true },
 * )
 * ```
 */
export async function handleAsync<T>(
  fn: () => Promise<T>,
  context: string,
  options: { showToast?: boolean; silent?: boolean } = {},
): Promise<[T, null] | [null, ErrorReport]> {
  try {
    const data = await fn()
    return [data, null]
  } catch (error) {
    const report = reportError(error, context, options)
    return [null, report]
  }
}

/**
 * Get the full in-memory error log (for diagnostics / debug panel).
 */
export function getErrorLog(): ReadonlyArray<ErrorReport> {
  return errorLog
}

/**
 * Clear the in-memory error log.
 */
export function clearErrorLog(): void {
  errorLog.length = 0
}

/**
 * Format a user-friendly message based on error category.
 * Falls back to the raw error message when it is short and readable.
 */
function getUserFriendlyMessage(category: ErrorCategory, raw: string): string {
  // If the raw message is already short and readable, use it directly
  if (raw && raw.length < 120 && raw !== 'undefined' && raw !== 'null') {
    return raw
  }

  return CATEGORY_MESSAGES[category]
}

/**
 * Register global error handlers for the renderer process.
 * Should be called once at app startup (e.g. in main.tsx).
 */
export function registerGlobalErrorHandlers(): void {
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, 'UnhandledRejection', { showToast: true })
    // Prevent the default browser console error (we already logged it)
    event.preventDefault()
  })

  // Catch uncaught exceptions
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, 'UncaughtError', { showToast: true })
  })
}
