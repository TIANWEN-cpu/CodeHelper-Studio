import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'neutral' | 'accent' | 'purple' | 'success' | 'danger' | 'warning'

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)]',
  accent: 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]',
  purple: 'bg-[var(--color-accent-purple)]/15 text-[var(--color-accent-purple)]',
  success: 'bg-[var(--color-accent-success)]/15 text-[var(--color-accent-success)]',
  danger: 'bg-[var(--color-accent-danger)]/15 text-[var(--color-accent-danger)]',
  warning: 'bg-[var(--color-accent-warning)]/15 text-[var(--color-accent-warning)]',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

/** 状态/计数徽章。 */
export function Badge({ variant = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}
