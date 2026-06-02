import { RefreshCw, AlertCircle } from 'lucide-react'
import { categorizeError, CATEGORY_MESSAGES } from '../utils/errors'

interface ErrorWithRetryProps {
  /** The raw error or error message string. */
  error: unknown
  /** Callback invoked when the user clicks retry. */
  onRetry: () => void
  /** Whether the retry action is currently in progress. */
  retrying?: boolean
}

export function ErrorWithRetry({ error, onRetry, retrying }: ErrorWithRetryProps) {
  const raw = typeof error === 'string' ? error : String(error)
  const category = categorizeError(error)
  const displayMessage =
    raw && raw !== 'undefined' && raw !== 'null' && raw.length < 200
      ? raw
      : CATEGORY_MESSAGES[category] || CATEGORY_MESSAGES.unknown

  return (
    <div className="ui-card mx-auto max-w-lg px-6 py-8 text-center" role="alert">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--theme-danger-soft)] text-[var(--theme-danger)]">
        <AlertCircle size={24} aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-[var(--theme-text-primary)]">出错了</p>
      <p className="mt-2 text-sm leading-6 text-[var(--theme-text-muted)]">{displayMessage}</p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="ui-btn-accent mt-5 flex items-center gap-2 px-5 py-2 text-sm mx-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-2"
      >
        <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
        {retrying ? '重试中...' : '重新加载'}
      </button>
    </div>
  )
}
