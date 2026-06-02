/**
 * Barrel export for shared utilities.
 */

export {
  toErrorMessage,
  safeAsync,
  safeSync,
  parseJsonSafe,
  categorizeError,
  getUserMessage,
  CATEGORY_MESSAGES,
  type ErrorCategory,
} from './errors'

export {
  registerToast,
  reportError,
  handleAsync,
  getErrorLog,
  clearErrorLog,
  registerGlobalErrorHandlers,
  type ErrorReport,
  type ErrorToastFn,
  type RetryFn,
} from './errorHandler'

export {
  parseJsonArray,
  sourceLabel,
  platformLabel,
  modeLabel,
  trackLabel,
  examStyleLabel,
  DIFF_COLORS,
  DIFF_LABELS,
  LANGUAGE_OPTIONS,
} from './labels'
