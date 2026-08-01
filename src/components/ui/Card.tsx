import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** 内边距档位，默认 md */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** 可交互卡片：hover 抬升与高亮边框 */
  interactive?: boolean
}

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
} as const

/** 基础卡片容器：平直色块 + 发丝边框，无圆弧无投影。 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', interactive = false, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]',
        interactive &&
          'cursor-pointer transition-all duration-[var(--motion-duration-fast)] hover:border-[var(--color-accent-primary)]/50 hover:bg-[var(--color-bg-hover)]',
        PADDINGS[padding],
        className,
      )}
      {...rest}
    />
  )
})
