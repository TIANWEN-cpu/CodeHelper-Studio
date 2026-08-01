import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './IconButton'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 叠加的模态框只有第一个锁定背景、最后一个恢复，避免嵌套 Dialog 提前解锁页面滚动。
let dialogCount = 0
let dialogPreviousBodyOverflow = ''
let dialogBackgroundSnapshot: Array<{ element: Element; ariaHidden: string | null }> | null = null

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** 底部操作区，通常放 Button 组 */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** 点击遮罩关闭，默认 true */
  closeOnOverlay?: boolean
  /** Escape 关闭，默认 true */
  closeOnEscape?: boolean
  /** 隐藏右上角关闭按钮 */
  hideCloseButton?: boolean
  className?: string
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
} as const

/**
 * 通用对话框：portal 到 body，带焦点陷阱、Escape/遮罩关闭、aria-modal。
 * z 轴约定：命令面板 50、知识阅读器 120、Dialog 200、Toast 9999。
 */
export function Dialog({ open, ...rest }: DialogProps) {
  return createPortal(
    <AnimatePresence>{open ? <DialogSurface open={open} {...rest} /> : null}</AnimatePresence>,
    document.body,
  )
}

function DialogSurface({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
  closeOnEscape = true,
  hideCloseButton = false,
  className,
}: Omit<DialogProps, 'open'> & { open: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  // 打开时聚焦面板内第一个可聚焦元素，关闭后还原焦点
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(first ?? panel)?.focus()
    return () => previouslyFocused?.focus?.()
  }, [open])

  // Escape 关闭 + Tab 焦点循环
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (closeOnEscape) {
          e.stopPropagation()
          onClose()
        }
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (items.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [closeOnEscape, onClose])

  // 模态框打开时锁定背景滚动，并把对话框之外的 body 子树标记为 aria-hidden，
  // 使背景内容对辅助技术不可见；多个对话框叠加时只有第一个锁定、最后一个恢复。
  useEffect(() => {
    const isDialogSubtree = (node: Element) =>
      node.getAttribute('role') === 'dialog' || node.querySelector('[role="dialog"]') !== null
    if (dialogCount === 0) {
      dialogPreviousBodyOverflow = document.body.style.overflow
      dialogBackgroundSnapshot = Array.from(document.body.children)
        .filter((child) => !isDialogSubtree(child))
        .map((child) => ({
          element: child,
          ariaHidden: child.getAttribute('aria-hidden'),
        }))
      for (const { element } of dialogBackgroundSnapshot) {
        element.setAttribute('aria-hidden', 'true')
      }
    }
    dialogCount += 1
    document.body.style.overflow = 'hidden'
    return () => {
      dialogCount -= 1
      if (dialogCount === 0) {
        for (const { element, ariaHidden } of dialogBackgroundSnapshot ?? []) {
          if (ariaHidden === null) element.removeAttribute('aria-hidden')
          else element.setAttribute('aria-hidden', ariaHidden)
        }
        dialogBackgroundSnapshot = null
        document.body.style.overflow = dialogPreviousBodyOverflow
      }
    }
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
        className={cn(
          'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] shadow-[var(--shadow-dialog)] outline-none',
          SIZES[size],
          className,
        )}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4">
            <div className="min-w-0">
              {title && (
                <h2
                  id={titleId}
                  className="text-base font-semibold text-[var(--color-text-primary)]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descriptionId}
                  className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]"
                >
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <IconButton label="关闭" onClick={onClose}>
                <X />
              </IconButton>
            )}
          </div>
        )}
        {children && <div className="px-5 py-4">{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3">
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
