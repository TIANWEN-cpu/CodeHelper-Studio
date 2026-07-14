import { describe, expect, it, vi } from 'vitest'
import { bindDraftFlushLifecycle } from '../src/utils/draftLifecycle'

class FakeTarget {
  visibilityState = 'visible'
  private listeners = new Map<string, Set<() => void>>()

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }
}

describe('practice draft lifecycle flush', () => {
  it('starts a flush immediately for pagehide and beforeunload', () => {
    const page = new FakeTarget()
    const visibility = new FakeTarget()
    const flush = vi.fn(async () => undefined)
    bindDraftFlushLifecycle(flush, page, visibility)

    page.dispatch('pagehide')
    page.dispatch('beforeunload')

    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('flushes only when a visibility change makes the document hidden', () => {
    const page = new FakeTarget()
    const visibility = new FakeTarget()
    const flush = vi.fn(async () => undefined)
    bindDraftFlushLifecycle(flush, page, visibility)

    visibility.dispatch('visibilitychange')
    expect(flush).not.toHaveBeenCalled()
    visibility.visibilityState = 'hidden'
    visibility.dispatch('visibilitychange')

    expect(flush).toHaveBeenCalledOnce()
  })

  it('removes every listener on hook cleanup', () => {
    const page = new FakeTarget()
    const visibility = new FakeTarget()
    const flush = vi.fn(async () => undefined)
    const cleanup = bindDraftFlushLifecycle(flush, page, visibility)

    cleanup()
    page.dispatch('pagehide')
    page.dispatch('beforeunload')
    visibility.visibilityState = 'hidden'
    visibility.dispatch('visibilitychange')

    expect(flush).not.toHaveBeenCalled()
  })
})
