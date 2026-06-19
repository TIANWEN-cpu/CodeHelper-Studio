import { describe, it, expect } from 'vitest'
import { buildCommandResults, MAX_PER_GROUP, type CommandSources } from '../src/lib/commandPalette'

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
})
