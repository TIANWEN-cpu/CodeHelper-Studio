/**
 * ErrorToast — convenience wrapper for displaying error toasts with retry.
 *
 * Provides a hook `useErrorToast()` that returns a function for reporting
 * errors as toast notifications with an optional "retry" action button.
 *
 * Integrates with the existing ToastProvider and errorHandler infrastructure.
 */

import { useCallback } from 'react'
import { useToast } from './Toast'
import { toErrorMessage, categorizeError, CATEGORY_MESSAGES } from '../utils/errors'
import { registerToast, type RetryFn } from '../utils/errorHandler'

// ---------------------------------------------------------------------------
// Hook: useErrorToast
// ---------------------------------------------------------------------------

/**
 * Returns a function that shows an error toast with consistent formatting.
 *
 * Automatically registers the toast system with errorHandler on first use
 * (so `reportError(..., { showToast: true })` works from anywhere).
 *
 * @example
 * ```tsx
 * const errorToast = useErrorToast()
 *
 * try {
 *   await someAction()
 * } catch (err) {
 *   errorToast(err, { context: 'SettingsView.save', onRetry: () => someAction() })
 * }
 * ```
 */
export function useErrorToast() {
  const addToast = useToast()

  // Register toast function with errorHandler (idempotent)
  registerToast(addToast)

  const showError = useCallback(
    (
      error: unknown,
      options: {
        /** Context label for the error (e.g. component or store name). */
        context?: string
        /** If provided, the toast message includes a visible retry hint. */
        onRetry?: RetryFn
        /** Override the auto-detected message. */
        message?: string
        /** Toast display duration in ms. Default: 6000 for errors. */
        durationMs?: number
      } = {},
    ) => {
      const { context, message: overrideMsg, durationMs = 6000 } = options
      const category = categorizeError(error)
      const raw = overrideMsg ?? toErrorMessage(error)

      // Build a user-friendly message
      const shortMsg =
        raw && raw.length < 120 && raw !== 'undefined' && raw !== 'null'
          ? raw
          : (CATEGORY_MESSAGES[category] ?? CATEGORY_MESSAGES.unknown)

      // Log to console with context
      if (context) {
        console.error(`[${context}] (${category})`, error)
      }

      addToast('error', shortMsg, durationMs)
    },
    [addToast],
  )

  return showError
}
