import { describe, it, expect } from 'vitest'
import { CODE_THEME_OPTIONS, DEFAULT_CODE_THEME } from '../src/lib/codeThemes'

describe('CODE_THEME_OPTIONS', () => {
  it('每个选项都有 id/label/dark 三字段', () => {
    for (const opt of CODE_THEME_OPTIONS) {
      expect(typeof opt.id).toBe('string')
      expect(opt.id.length).toBeGreaterThan(0)
      expect(typeof opt.label).toBe('string')
      expect(opt.label.length).toBeGreaterThan(0)
      expect(typeof opt.dark).toBe('boolean')
    }
  })

  it('id 唯一（防止设置页选择器与持久化键冲突）', () => {
    const ids = CODE_THEME_OPTIONS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('至少包含一个 dark 和一个 light 主题', () => {
    expect(CODE_THEME_OPTIONS.some((o) => o.dark)).toBe(true)
    expect(CODE_THEME_OPTIONS.some((o) => !o.dark)).toBe(true)
  })
})

describe('DEFAULT_CODE_THEME', () => {
  it('默认主题存在于选项列表中', () => {
    expect(CODE_THEME_OPTIONS.some((o) => o.id === DEFAULT_CODE_THEME)).toBe(true)
  })

  it('默认主题为 dracula', () => {
    expect(DEFAULT_CODE_THEME).toBe('dracula')
  })
})
