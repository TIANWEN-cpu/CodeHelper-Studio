import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  /** Icon to display at the top. */
  icon: LucideIcon
  /** Main heading. */
  title: string
  /** Supporting description text. */
  description: string
  /** Optional action button. */
  action?: {
    label: string
    onClick: () => void
  }
}

/**
 * Consistent empty-state placeholder used across modules when no data exists.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="ui-card mx-auto max-w-xl px-8 py-14 text-center" role="status">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
        <Icon size={28} aria-hidden="true" />
      </div>
      <p className="text-lg font-semibold text-[var(--theme-text-primary)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--theme-text-muted)]">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="ui-btn-accent mt-5 px-5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
