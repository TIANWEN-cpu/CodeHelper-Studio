import { describe, it, expect } from 'vitest'
import {
  buildCommandResults,
  MAX_PER_GROUP,
  MAX_RECENTS,
  type CommandSources,
} from '../src/lib/commandPalette'

const PAGES = [
  { view: 'home' as const, label: '首页' },
  { view: 'learn' as const, label: '课程' },
  { view: 'practice' as const, label: '练习' },
]

const sources: CommandSources = {
  pages: PAGES,
  lessons: [
    { id: 'l1', title: '双指针入门', trackTitle: '算法', moduleTitle: '数组' },
    { id: 'l2', title: '递归与分治', trackTitle: '算法', moduleTitle: '递归' },
  ],
  exercises: [
    { id: 'e1', title: '两数之和', difficulty: '简单', trackId: 'algo' },
    { id: 'e2', title: '双指针求和', difficulty: '中等', trackId: 'algo' },
  ],
  knowledge: [
    { id: '1', title: '数据库系统', sublabel: 'PKU/cs' },
    { id: '2', title: '斐波那契数列', sublabel: 'CyC2018' },
  ],
}

describe('buildCommandResults', () => {
  it('returns only pages when the query is empty', () => {
    const results = buildCommandResults('', sources)
    expect(results).toHaveLength(PAGES.length)
    expect(results.every((r) => r.kind === 'page')).toBe(true)
  })

  it('does not deep-link page results', () => {
    const results = buildCommandResults('', sources)
    expect(results.every((r) => r.target === undefined)).toBe(true)
  })

  it('matches pages, lessons and exercises by substring', () => {
    const results = buildCommandResults('双', sources)
    const labels = results.map((r) => r.label)
    expect(labels).toContain('双指针入门') // lesson
    expect(labels).toContain('双指针求和') // exercise
    expect(results.find((r) => r.label === '双指针入门')?.kind).toBe('lesson')
  })

  it('orders results pages → lessons → exercises', () => {
    const withPageMatch: CommandSources = {
      pages: [{ view: 'learn', label: '课程' }],
      lessons: [{ id: 'l1', title: '课程导论' }],
      exercises: [{ id: 'e1', title: '课程练习' }],
    }
    const kinds = buildCommandResults('课程', withPageMatch).map((r) => r.kind)
    expect(kinds).toEqual(['page', 'lesson', 'exercise'])
  })

  it('carries deep-link targets for lessons and exercises', () => {
    const results = buildCommandResults('双指针', sources)
    const lesson = results.find((r) => r.kind === 'lesson')
    const exercise = results.find((r) => r.kind === 'exercise')
    expect(lesson?.target).toEqual({ kind: 'lesson', id: 'l1' })
    expect(exercise?.target).toEqual({ kind: 'exercise', id: 'e2' })
    expect(lesson?.view).toBe('learn')
    expect(exercise?.view).toBe('practice')
  })

  it('builds a sublabel from track/module context', () => {
    const lesson = buildCommandResults('双指针入门', sources).find((r) => r.kind === 'lesson')
    expect(lesson?.sublabel).toBe('算法 · 数组')
  })

  it('caps each content group at MAX_PER_GROUP', () => {
    const many = Array.from({ length: MAX_PER_GROUP + 5 }, (_, i) => ({
      id: `x${i}`,
      title: `测试课程 ${i}`,
    }))
    const results = buildCommandResults('测试课程', { pages: [], lessons: many })
    expect(results.filter((r) => r.kind === 'lesson')).toHaveLength(MAX_PER_GROUP)
  })

  it('produces unique keys across kinds sharing an id', () => {
    const results = buildCommandResults('x', {
      pages: [],
      lessons: [{ id: 'same', title: 'x lesson' }],
      exercises: [{ id: 'same', title: 'x exercise' }],
    })
    const keys = results.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is case-insensitive', () => {
    const results = buildCommandResults('LEARN', {
      pages: [{ view: 'learn', label: 'Learn' }],
    })
    expect(results).toHaveLength(1)
  })

  it('matches knowledge docs and carries a knowledge deep-link', () => {
    const results = buildCommandResults('数据库', sources)
    const kb = results.find((r) => r.kind === 'knowledge')
    expect(kb?.label).toBe('数据库系统')
    expect(kb?.target).toEqual({ kind: 'knowledge', id: '1' })
    expect(kb?.view).toBe('knowledge')
  })

  it('matches knowledge by sublabel too', () => {
    const results = buildCommandResults('CyC2018', sources)
    expect(results.some((r) => r.kind === 'knowledge' && r.label === '斐波那契数列')).toBe(true)
  })

  it('orders content groups page → lesson → exercise → knowledge', () => {
    const all: CommandSources = {
      pages: [{ view: 'learn', label: '通' }],
      lessons: [{ id: 'l', title: '通用课' }],
      exercises: [{ id: 'e', title: '通用练习' }],
      knowledge: [{ id: 'k', title: '通用知识' }],
    }
    expect(buildCommandResults('通', all).map((r) => r.kind)).toEqual([
      'page',
      'lesson',
      'exercise',
      'knowledge',
    ])
  })
})

describe('buildCommandResults recents', () => {
  it('resolves recent refs ahead of pages on an empty query', () => {
    const results = buildCommandResults('', {
      ...sources,
      recentRefs: [
        { kind: 'exercise', id: 'e2' },
        { kind: 'lesson', id: 'l1' },
      ],
    })
    expect(results[0]).toMatchObject({ kind: 'exercise', label: '双指针求和', badge: '最近' })
    expect(results[1]).toMatchObject({ kind: 'lesson', label: '双指针入门', badge: '最近' })
    // pages still follow the recents
    expect(results.slice(2).every((r) => r.kind === 'page')).toBe(true)
  })

  it('skips recent refs whose content is not loaded', () => {
    const results = buildCommandResults('', {
      pages: [],
      lessons: [],
      recentRefs: [{ kind: 'lesson', id: 'missing' }],
    })
    expect(results).toEqual([])
  })

  it('ignores recents when the query is non-empty', () => {
    const results = buildCommandResults('双指针', {
      ...sources,
      recentRefs: [{ kind: 'lesson', id: 'l2' }],
    })
    expect(results.every((r) => r.badge !== '最近')).toBe(true)
  })

  it('caps recents at MAX_RECENTS', () => {
    const lessons = Array.from({ length: MAX_RECENTS + 4 }, (_, i) => ({
      id: `r${i}`,
      title: `最近课 ${i}`,
    }))
    const recentRefs = lessons.map((l) => ({ kind: 'lesson' as const, id: l.id }))
    const results = buildCommandResults('', { pages: [], lessons, recentRefs })
    expect(results.filter((r) => r.badge === '最近')).toHaveLength(MAX_RECENTS)
  })
})
