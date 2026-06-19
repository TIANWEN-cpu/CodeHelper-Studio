import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requestDeepLink, consumePendingDeepLink, subscribeDeepLink } from '../src/lib/deepLink'

// 测试环境是 node，没有 DOM。手搓一个最小 window（EventTarget + sessionStorage）
// 以便走真实的 storage/事件路径，而非仅测无 window 的降级分支。
class FakeStorage {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

const g = globalThis as unknown as { window?: unknown; CustomEvent?: unknown }

beforeEach(() => {
  if (typeof g.CustomEvent === 'undefined') {
    g.CustomEvent = class<T> extends Event {
      detail: T
      constructor(type: string, init?: { detail?: T }) {
        super(type)
        this.detail = init?.detail as T
      }
    }
  }
  g.window = Object.assign(new EventTarget(), { sessionStorage: new FakeStorage() })
})

afterEach(() => {
  delete g.window
})

describe('deepLink with a window', () => {
  it('round-trips a pending target of the matching kind', () => {
    requestDeepLink({ kind: 'lesson', id: 'l42' })
    expect(consumePendingDeepLink('lesson')).toBe('l42')
  })

  it('consuming clears the pending target', () => {
    requestDeepLink({ kind: 'lesson', id: 'l42' })
    expect(consumePendingDeepLink('lesson')).toBe('l42')
    expect(consumePendingDeepLink('lesson')).toBeNull()
  })

  it('does not consume a target of a different kind', () => {
    requestDeepLink({ kind: 'exercise', id: 'e1' })
    expect(consumePendingDeepLink('lesson')).toBeNull()
    // 仍保留给对应视图
    expect(consumePendingDeepLink('exercise')).toBe('e1')
  })

  it('delivers live events to matching subscribers only', () => {
    const lessons: string[] = []
    const exercises: string[] = []
    const off1 = subscribeDeepLink('lesson', (id) => lessons.push(id))
    const off2 = subscribeDeepLink('exercise', (id) => exercises.push(id))
    requestDeepLink({ kind: 'lesson', id: 'l1' })
    requestDeepLink({ kind: 'exercise', id: 'e1' })
    off1()
    off2()
    expect(lessons).toEqual(['l1'])
    expect(exercises).toEqual(['e1'])
  })

  it('stops delivering after unsubscribe', () => {
    const seen: string[] = []
    const off = subscribeDeepLink('lesson', (id) => seen.push(id))
    off()
    requestDeepLink({ kind: 'lesson', id: 'l1' })
    expect(seen).toEqual([])
  })

  it('treats a corrupted pending record as empty and clears it', () => {
    ;(g.window as { sessionStorage: FakeStorage }).sessionStorage.setItem(
      'codehelper.pendingDeepLink',
      '{not json',
    )
    expect(consumePendingDeepLink('lesson')).toBeNull()
    // 脏数据已被清除
    expect(consumePendingDeepLink('lesson')).toBeNull()
  })
})

describe('deepLink without a window', () => {
  beforeEach(() => {
    delete g.window
  })

  it('no-ops safely', () => {
    expect(() => requestDeepLink({ kind: 'lesson', id: 'x' })).not.toThrow()
    expect(consumePendingDeepLink('lesson')).toBeNull()
    const off = subscribeDeepLink('lesson', () => {})
    expect(() => off()).not.toThrow()
  })
})
