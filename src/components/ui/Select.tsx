import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

/** 原生 select 的统一样式封装（保留键盘与无障碍语义）。 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative inline-flex w-full items-center', className)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] pl-3 pr-8 text-sm text-[var(--color-text-primary)] outline-none transition-colors',
          'focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--ring-focus)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid && 'border-[var(--color-accent-danger)]',
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2.5 text-[var(--color-text-muted)]"
      />
    </div>
  )
})
