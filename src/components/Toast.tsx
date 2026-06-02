import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (type: ToastType, message: string, durationMs?: number) => void
  removeToast: (id: string) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const addToast = useCallback(
    (type: ToastType, message: string, durationMs = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev, { id, type, message }])
      if (durationMs > 0) {
        const timer = setTimeout(() => removeToast(id), durationMs)
        timers.current.set(id, timer)
      }
    },
    [removeToast],
  )

  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      currentTimers.forEach((t) => clearTimeout(t))
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

/**
 * Hook to show toast notifications from any component.
 *
 * @example
 * ```tsx
 * const toast = useToast()
 * toast('success', '已保存')
 * toast('error', '保存失败，请重试')
 * ```
 */
export function useToast(): (type: ToastType, message: string, durationMs?: number) => void {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback: no provider — silently log to console
    return (type, msg) => console.warn(`[toast:${type}] ${msg}`)
  }
  return ctx.addToast
}

// ---------------------------------------------------------------------------
// Container + individual toast
// ---------------------------------------------------------------------------

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: 'var(--theme-success-soft)',
    border: 'var(--theme-success)',
    text: 'var(--theme-success)',
    icon: 'var(--theme-success)',
  },
  error: {
    bg: 'var(--theme-danger-soft)',
    border: 'var(--theme-danger)',
    text: 'var(--theme-danger)',
    icon: 'var(--theme-danger)',
  },
  warning: {
    bg: 'var(--theme-warning-soft)',
    border: 'var(--theme-warning)',
    text: 'var(--theme-warning)',
    icon: 'var(--theme-warning)',
  },
  info: {
    bg: 'var(--theme-info-soft)',
    border: 'var(--theme-info)',
    text: 'var(--theme-info)',
    icon: 'var(--theme-info)',
  },
}

function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[]
  removeToast: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-10 right-5 z-[9999] flex flex-col gap-2"
      role="status"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = ICONS[toast.type]
  const colors = COLORS[toast.type]

  return (
    <div
      className="pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 shadow-lg animate-toast-in"
      role={toast.type === 'error' ? 'alert' : 'status'}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${colors.bg} 92%, #fff 8%), ${colors.bg})`,
        border: `1px solid ${colors.border}`,
        maxWidth: 380,
      }}
    >
      <Icon
        size={16}
        className="mt-0.5 shrink-0"
        style={{ color: colors.icon }}
        aria-hidden="true"
      />
      <p className="flex-1 text-sm leading-5" style={{ color: colors.text }}>
        {toast.message}
      </p>
      <button
        onClick={onClose}
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        style={{ color: colors.icon }}
        aria-label="关闭通知"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
