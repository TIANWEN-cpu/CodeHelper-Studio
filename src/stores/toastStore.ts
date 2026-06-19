import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  type: ToastType
  message: string
}

/** 默认自动消失时长（毫秒）；传 0 表示常驻直到手动关闭。 */
const DEFAULT_DURATION = 4000

type ToastStore = {
  toasts: Toast[]
  /** 推入一条通知，返回其 id；与现有同类型同文案的通知去重。 */
  push: (type: ToastType, message: string, duration?: number) => number
  dismiss: (id: number) => void
  clear: () => void
}

let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (type, message, duration = DEFAULT_DURATION) => {
    // 去重：避免重复的网络错误等连环弹出刷屏。
    const existing = get().toasts.find((t) => t.type === type && t.message === message)
    if (existing) {
      // 重复出现时重置自动消失计时，让仍在发生的同一错误保持可见。
      const prev = timers.get(existing.id)
      if (prev) {
        clearTimeout(prev)
        timers.delete(existing.id)
      }
      if (duration > 0 && typeof setTimeout !== 'undefined') {
        timers.set(
          existing.id,
          setTimeout(() => get().dismiss(existing.id), duration),
        )
      }
      return existing.id
    }

    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }))
    if (duration > 0 && typeof setTimeout !== 'undefined') {
      timers.set(
        id,
        setTimeout(() => get().dismiss(id), duration),
      )
    }
    return id
  },
  dismiss: (id) => {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
  clear: () => {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
    set({ toasts: [] })
  },
}))

/**
 * 给非 React 调用方（errorHandler 桥接、service 层）的命令式入口。
 * 组件内可直接用 useToastStore 选择 toasts/dismiss。
 */
export const toast = {
  success: (message: string, duration?: number) =>
    useToastStore.getState().push('success', message, duration),
  error: (message: string, duration?: number) =>
    useToastStore.getState().push('error', message, duration),
  info: (message: string, duration?: number) =>
    useToastStore.getState().push('info', message, duration),
}
