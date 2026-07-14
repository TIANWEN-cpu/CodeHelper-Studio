import { describe, it, expect } from 'vitest'
import { viewForDigit, digitFromShortcutEvent, VIEW_SHORTCUT_ORDER } from '../src/lib/viewShortcuts'

// 测试环境为 node（无 KeyboardEvent 构造器），构造一个最小 duck-typed 对象。
// digitFromShortcutEvent 仅读取 altKey/ctrlKey/metaKey/code 四个属性。
function keyEvent(
  props: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string }>,
): {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  code: string
} {
  return { altKey: false, ctrlKey: false, metaKey: false, code: '', ...props }
}

describe('VIEW_SHORTCUT_ORDER', () => {
  it('包含 8 个主视图，顺序与侧边栏一致', () => {
    expect(VIEW_SHORTCUT_ORDER).toEqual([
      'home',
      'learn',
      'practice',
      'workspace',
      'ai-tutor',
      'review',
      'knowledge',
      'settings',
    ])
  })

  it('id 唯一', () => {
    expect(new Set(VIEW_SHORTCUT_ORDER).size).toBe(VIEW_SHORTCUT_ORDER.length)
  })
})

describe('viewForDigit', () => {
  it('1..8 映射到对应视图（1-based）', () => {
    expect(viewForDigit(1)).toBe('home')
    expect(viewForDigit(2)).toBe('learn')
    expect(viewForDigit(5)).toBe('ai-tutor')
    expect(viewForDigit(8)).toBe('settings')
  })

  it('越界返回 null', () => {
    expect(viewForDigit(0)).toBeNull()
    expect(viewForDigit(9)).toBeNull()
    expect(viewForDigit(100)).toBeNull()
  })

  it('非整数返回 null', () => {
    expect(viewForDigit(1.5)).toBeNull()
    expect(viewForDigit(NaN)).toBeNull()
    expect(viewForDigit(-1)).toBeNull()
  })

  it('支持自定义 order（测试用）', () => {
    expect(viewForDigit(1, ['settings', 'home'])).toBe('settings')
    expect(viewForDigit(2, ['settings', 'home'])).toBe('home')
    expect(viewForDigit(3, ['settings', 'home'])).toBeNull()
  })
})

describe('digitFromShortcutEvent', () => {
  it('Alt + Digit1..8 返回对应数字', () => {
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'Digit1' }))).toBe(1)
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'Digit5' }))).toBe(5)
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'Digit8' }))).toBe(8)
  })

  it('Alt + Numpad（小键盘）也识别', () => {
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'Numpad3' }))).toBe(3)
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'Numpad9' }))).toBe(9)
  })

  it('无 Alt 时不触发（返回 null）', () => {
    expect(digitFromShortcutEvent(keyEvent({ altKey: false, code: 'Digit1' }))).toBeNull()
  })

  it('Ctrl/Cmd + 数字不触发（让位命令面板等其它快捷键）', () => {
    expect(
      digitFromShortcutEvent(keyEvent({ altKey: true, ctrlKey: true, code: 'Digit1' })),
    ).toBeNull()
    expect(
      digitFromShortcutEvent(keyEvent({ altKey: true, metaKey: true, code: 'Digit1' })),
    ).toBeNull()
  })

  it('非数字键返回 null', () => {
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'KeyA' }))).toBeNull()
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'Space' }))).toBeNull()
  })

  it('Digit0 不触发（视图序列从 1 开始）', () => {
    expect(digitFromShortcutEvent(keyEvent({ altKey: true, code: 'Digit0' }))).toBeNull()
  })
})
