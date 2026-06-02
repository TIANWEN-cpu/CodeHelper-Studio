/**
 * useKeyboardShortcuts — global keyboard shortcut handler.
 *
 * Registers listeners on mount and cleans up on unmount.
 * Shortcuts only fire when no input/textarea is focused (to avoid
 * interfering with normal text editing).
 */

import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { useChatStore } from '../stores/chatStore'

interface Shortcut {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
}

/**
 * Returns true if the active element is a text input field.
 */
function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable
}

export function useKeyboardShortcuts(): void {
  const setActiveModule = useAppStore((s) => s.setActiveModule)
  const createSession = useChatStore((s) => s.createSession)

  useEffect(() => {
    const shortcuts: Shortcut[] = [
      {
        key: 'n',
        ctrl: true,
        description: '新建对话',
        action: () => {
          setActiveModule('ai-chat')
          void createSession()
        },
      },
      {
        key: 's',
        ctrl: true,
        description: '保存当前文件',
        action: () => {
          // Trigger save via IPC — the editor auto-saves via store,
          // so this is a visual confirmation shortcut
          setActiveModule('editor')
        },
      },
      {
        key: 'Enter',
        ctrl: true,
        description: '运行代码',
        action: () => {
          // Dispatch a custom event that EditorView listens for
          window.dispatchEvent(new CustomEvent('codehelper:run'))
        },
      },
      {
        key: 'p',
        ctrl: true,
        shift: true,
        description: '命令面板',
        action: () => {
          window.dispatchEvent(new CustomEvent('codehelper:command-palette'))
        },
      },
      {
        key: 'f',
        ctrl: true,
        shift: true,
        description: '全局搜索',
        action: () => {
          window.dispatchEvent(new CustomEvent('codehelper:global-search'))
        },
      },
    ]

    const handler = (event: KeyboardEvent) => {
      // Skip shortcuts when typing in input fields (except for the run shortcut)
      const inInput = isInputFocused()

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatch = shortcut.ctrl
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey && !event.metaKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey

        if (keyMatch && ctrlMatch && shiftMatch) {
          // Ctrl+S and Ctrl+Enter should still work in editors
          if (inInput && shortcut.key !== 'Enter' && shortcut.key !== 's') {
            continue
          }
          event.preventDefault()
          shortcut.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveModule, createSession])
}
