import { RefreshCw } from 'lucide-react'

interface LoadingSpinnerProps {
  /** Size of the spinner icon in pixels. */
  size?: number
  /** Optional label shown next to the spinner. */
  label?: string
  /** Center the spinner in its parent container. */
  centered?: boolean
}

/**
 * Animated spinner used during data loading.
 * Uses the existing `animate-spin` Tailwind utility plus theme accent color.
 */
export function LoadingSpinner({ size = 20, label, centered }: LoadingSpinnerProps) {
  const wrapper = centered
    ? 'flex flex-col items-center justify-center gap-3 py-12'
    : 'flex items-center gap-2'

  return (
    <div className={wrapper} role="status" aria-label={label || '加载中'}>
      <RefreshCw
        size={size}
        className="animate-spin text-[var(--theme-accent)]"
        aria-hidden="true"
      />
      {label && <span className="text-sm text-[var(--theme-text-muted)]">{label}</span>}
      <span className="sr-only">{label || '加载中'}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

interface SkeletonProps {
  /** Tailwind width class, e.g. 'w-full', 'w-2/3'. */
  width?: string
  /** Tailwind height class, e.g. 'h-4', 'h-20'. */
  height?: string
  /** Extra classes. */
  className?: string
}

/**
 * Single pulsing bar placeholder.
 */
export function Skeleton({ width = 'w-full', height = 'h-4', className = '' }: SkeletonProps) {
  return (
    <div
      className={`${width} ${height} animate-pulse rounded-xl bg-[var(--theme-bg-hover)] ${className}`}
    />
  )
}

/**
 * Skeleton card that mimics the ProblemList / SessionList item layout.
 */
export function SkeletonCard() {
  return (
    <div className="mb-2 rounded-2xl border border-transparent px-3 py-3">
      <div className="flex items-start gap-3">
        <Skeleton width="w-4" height="h-4" className="mt-0.5 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton width="w-3/4" height="h-4" />
          <div className="flex gap-2">
            <Skeleton width="w-10" height="h-3" />
            <Skeleton width="w-14" height="h-3" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Renders N skeleton cards for list loading placeholders.
 */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="px-2 py-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
