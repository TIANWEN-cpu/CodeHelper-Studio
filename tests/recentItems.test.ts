import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getRecentRefs, recordRecent, type RecentRef } from '../src/lib/recentItems'

// node 环境无 DOM：手搓最小 window.localStorage 走真实存储路径。
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

const g = globalThis as unknown as { window?: unknown }

beforeEach(() => {
  g.window = { localStorage: new FakeStorage() }
})

afterEach(() => {
  delete g.window
})

const lesson = (id: string): RecentRef => ({ kind: 'lesson', id })

describe('recentItems', () => {
  it('returns empty when nothing recorded', () => {
    expect(getRecentRefs()).toEqual([])
  })

  it('records and reads back a reference', () => {
    recordRecent(lesson('l1'))
    expect(getRecentRefs()).toEqual([lesson('l1')])
  })

  it('puts the most recent first', () => {
    recordRecent(lesson('l1'))
    recordRecent({ kind: 'exercise', id: 'e1' })
    expect(getRecentRefs()).toEqual([{ kind: 'exercise', id: 'e1' }, lesson('l1')])
  })

  it('dedupes by kind+id, moving the repeat to the front', () => {
    recordRecent(lesson('l1'))
    recordRecent(lesson('l2'))
    recordRecent(lesson('l1'))
    expect(getRecentRefs()).toEqual([lesson('l1'), lesson('l2')])
  })

  it('distinguishes same id across kinds', () => {
    recordRecent(lesson('x'))
    recordRecent({ kind: 'knowledge', id: 'x' })
    expect(getRecentRefs()).toHaveLength(2)
  })

  it('caps the list at 8 entries', () => {
    for (let i = 0; i < 12; i++) recordRecent(lesson(`l${i}`))
    const refs = getRecentRefs()
    expect(refs).toHaveLength(8)
    // 最新的 l11 在最前
    expect(refs[0]).toEqual(lesson('l11'))
  })

  it('ignores malformed stored data', () => {
    ;(g.window as { localStorage: FakeStorage }).localStorage.setItem(
      'codehelper.recentItems',
      '{not json',
    )
    expect(getRecentRefs()).toEqual([])
  })

  it('filters out entries with unknown kinds', () => {
    ;(g.window as { localStorage: FakeStorage }).localStorage.setItem(
      'codehelper.recentItems',
      JSON.stringify([{ kind: 'bogus', id: 'x' }, lesson('l1')]),
    )
    expect(getRecentRefs()).toEqual([lesson('l1')])
  })

  it('no-ops without a window', () => {
    delete g.window
    expect(() => recordRecent(lesson('l1'))).not.toThrow()
    expect(getRecentRefs()).toEqual([])
  })
})
