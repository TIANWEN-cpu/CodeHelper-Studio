import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const FIELD_BASE =
  'w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-50'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 校验失败态：红色边框与焦点环 */
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        'h-9 px-3',
        invalid &&
          'border-[var(--color-accent-danger)] focus:border-[var(--color-accent-danger)] focus:ring-[var(--color-accent-danger)]/25',
        className,
      )}
      {...rest}
    />
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        'min-h-[80px] resize-y px-3 py-2',
        invalid &&
          'border-[var(--color-accent-danger)] focus:border-[var(--color-accent-danger)] focus:ring-[var(--color-accent-danger)]/25',
        className,
      )}
      {...rest}
    />
  )
})
