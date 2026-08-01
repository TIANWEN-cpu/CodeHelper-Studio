import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 14,
  md: 18,
  lg: 24,
} as const

export interface SpinnerProps {
  size?: keyof typeof SIZES
  className?: string
  label?: string
}

/** 加载指示器（统一替代散落的 Loader2 animate-spin 内联写法）。 */
export function Spinner({ size = 'md', className, label = '加载中' }: SpinnerProps) {
  return (
    <Loader2
      size={SIZES[size]}
      role="status"
      aria-label={label}
      className={cn('animate-spin text-[var(--color-text-muted)]', className)}
    />
  )
}

export interface SkeletonProps {
  className?: string
}

/** 骨架屏占位块。 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-[var(--color-bg-hover)]', className)}
    />
  )
}
