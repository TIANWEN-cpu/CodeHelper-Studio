import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}

const POSITIONS = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
} as const

/** 轻量 Tooltip：hover 与键盘聚焦均可触发（group-focus-within）。 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[300] whitespace-nowrap rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] px-2 py-1 text-xs text-[var(--color-text-primary)] opacity-0 shadow-[var(--shadow-popover)] transition-opacity duration-[var(--motion-duration-fast)]',
          'group-hover:opacity-100 group-focus-within:opacity-100',
          POSITIONS[side],
          className,
        )}
      >
        {content}
      </span>
    </span>
  )
}
