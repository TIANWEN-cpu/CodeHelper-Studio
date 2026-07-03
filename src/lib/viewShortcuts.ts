// 视图切换快捷键：Alt+1..8 快速跳转到各主视图。
// 顺序与侧边栏导航一致（src/components/layout/Sidebar.tsx 的 navItems）。
// 抽成纯函数 viewForDigit 便于单测映射逻辑，hook 仅负责绑定按键。

import type { ViewType } from '../types'

/**
 * 侧边栏主视图顺序（与 Sidebar navItems 对应，profile 不在主序列）。
 * Alt+1 → home，Alt+2 → learn，依此类推。
 */
export const VIEW_SHORTCUT_ORDER: readonly ViewType[] = [
  'home',
  'learn',
  'practice',
  'workspace',
  'ai-tutor',
  'review',
  'knowledge',
  'settings',
] as const

/**
 * 把按键数字（1..N）映射到对应主视图；越界或非正整数返回 null。
 *
 * @param digit  用户按下的数字（1-based）
 * @param order  可选的自定义视图顺序（测试用）
 */
export function viewForDigit(
  digit: number,
  order: readonly ViewType[] = VIEW_SHORTCUT_ORDER,
): ViewType | null {
  if (!Number.isInteger(digit) || digit < 1 || digit > order.length) return null
  return order[digit - 1]
}

/** 判断一个键盘事件是否为视图切换快捷键（Alt+1..8）。返回对应数字或 null。 */
export function digitFromShortcutEvent(e: KeyboardEvent): number | null {
  // 仅响应 Alt + 数字；忽略 Ctrl/Cmd/Meta 组合（留给命令面板等其它快捷键）。
  if (!e.altKey || e.ctrlKey || e.metaKey) return null
  const code = e.code
  // Digit1..Digit8（主键盘）与 Numpad1..Numpad8（数字小键盘）都支持。
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code)
  return match ? Number(match[1]) : null
}
