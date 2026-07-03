import { useEffect } from 'react'
import { useAppStore } from '../store'
import { toast } from '../stores/toastStore'
import { digitFromShortcutEvent, viewForDigit, VIEW_SHORTCUT_ORDER } from '../lib/viewShortcuts'

// 视图标签：用于切换时的轻量 toast 反馈。
const VIEW_LABELS: Record<string, string> = {
  home: '首页',
  learn: '课程学习',
  practice: '题库练习',
  workspace: '编程工作区',
  'ai-tutor': 'AI 助手',
  review: '复习与错题',
  knowledge: '知识库',
  settings: '设置',
}

/** 当焦点在可编辑控件时，不触发视图切换快捷键，避免与输入冲突。 */
function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    t.isContentEditable ||
    // CodeMirror 6 的可编辑视口挂在 .cm-content / .cm-editor
    t.closest('.cm-content') !== null
  )
}

/**
 * 绑定 Alt+1..8 切换主视图（与侧边栏顺序一致）。
 * 在 App 根挂载一次即可。焦点在输入框/编辑器/下拉时自动让位。
 */
export function useViewShortcuts(): void {
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return
      const digit = digitFromShortcutEvent(e)
      if (digit === null) return
      const view = viewForDigit(digit)
      if (!view) return
      e.preventDefault()
      setCurrentView(view)
      const label = VIEW_LABELS[view] ?? view
      toast.info(`切换到「${label}」`, 1200)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setCurrentView])
}

/** 导出顺序，便于在侧栏或帮助文档复用 / 展示快捷键提示。 */
export { VIEW_SHORTCUT_ORDER }
