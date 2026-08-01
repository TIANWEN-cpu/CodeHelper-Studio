import type { ReactNode } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮为红色 */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 确认对话框，用于替代 window.confirm。
 * 默认焦点落在右上角关闭按钮（首个可聚焦元素），确认按钮需用户主动移焦，防止危险操作误触。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    />
  )
}
