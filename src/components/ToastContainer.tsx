import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToastStore, type ToastType } from '@/stores/toastStore'

const ICONS: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

const COLORS: Record<ToastType, string> = {
  success: 'text-[var(--color-accent-success)]',
  error: 'text-[var(--color-accent-danger)]',
  info: 'text-[var(--color-accent-purple)]',
}

/**
 * 全局通知容器：挂在应用根部，监听 toastStore。
 * 错误处理器（registerToast 桥接）与成就解锁等都经此呈现。
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              role="status"
              className="pointer-events-auto flex items-start gap-3 min-w-[260px] max-w-[360px] rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-4 py-3 shadow-[var(--shadow-popover)]"
            >
              <Icon size={18} className={cn('mt-0.5 shrink-0', COLORS[t.type])} />
              <p className="flex-1 text-sm text-[var(--color-text-primary)] leading-snug break-words">
                {t.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="关闭通知"
                className="shrink-0 rounded-md p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
