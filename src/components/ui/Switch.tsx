import { cn } from '@/lib/utils'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** 必填：开关的可访问名称 */
  label: string
  disabled?: boolean
  className?: string
}

/** 开关（提升自原 SettingsView 的 ToggleSwitch，硬编码色已 token 化）。 */
export function Switch({ checked, onChange, label, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative flex h-6 w-10 shrink-0 items-center rounded-[3px] outline-none transition-colors duration-[var(--motion-duration-fast)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-base)]',
        'disabled:pointer-events-none disabled:opacity-50',
        checked ? 'bg-[var(--color-accent-primary)]' : 'bg-[var(--color-bg-active)]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute h-4 w-4 rounded-[2px] bg-white transition-all duration-[var(--motion-duration-fast)]',
          checked ? 'right-1' : 'left-1',
        )}
      />
    </button>
  )
}
