import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore, toast } from '../src/stores/toastStore'

beforeEach(() => {
  useToastStore.getState().clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('toastStore', () => {
  it('pushes a toast and returns its id', () => {
    const id = useToastStore.getState().push('info', 'hello', 0)
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ id, type: 'info', message: 'hello' })
  })

  it('dedupes identical type+message and returns the existing id', () => {
    const first = useToastStore.getState().push('error', 'boom', 0)
    const second = useToastStore.getState().push('error', 'boom', 0)
    expect(second).toBe(first)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('treats different types as distinct even with same message', () => {
    useToastStore.getState().push('error', 'same', 0)
    useToastStore.getState().push('info', 'same', 0)
    expect(useToastStore.getState().toasts).toHaveLength(2)
  })

  it('dismiss removes a toast by id', () => {
    const id = useToastStore.getState().push('success', 'done', 0)
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses after the duration', () => {
    vi.useFakeTimers()
    useToastStore.getState().push('info', 'temp', 1000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('duration 0 keeps the toast until dismissed', () => {
    vi.useFakeTimers()
    useToastStore.getState().push('info', 'sticky', 0)
    vi.advanceTimersByTime(100000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('clear removes all toasts and cancels timers', () => {
    vi.useFakeTimers()
    useToastStore.getState().push('info', 'a', 1000)
    useToastStore.getState().push('error', 'b', 1000)
    useToastStore.getState().clear()
    expect(useToastStore.getState().toasts).toHaveLength(0)
    // 计时器被清理：推进时间不应抛错或复活通知
    vi.advanceTimersByTime(2000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('imperative helper maps to the right type', () => {
    toast.success('s', 0)
    toast.error('e', 0)
    toast.info('i', 0)
    const types = useToastStore.getState().toasts.map((t) => t.type)
    expect(types).toEqual(['success', 'error', 'info'])
  })
})
