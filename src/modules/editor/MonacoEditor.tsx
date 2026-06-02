import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import { useEditorStore } from '../../stores/editorStore'
import {
  useActiveTab,
  useMonacoTheme,
  getDefaultEditorOptions,
  registerMonacoThemes,
  getMinimapEnabled,
  setMinimapEnabled as saveMinimapSetting,
} from '../../utils/monacoConfig'
import { LoadingSpinner } from '../../components/LoadingSpinner'

// AI Code Intelligence action types
export type AIAction = 'explain' | 'review' | 'findBugs' | 'optimize'

interface AISelectionEvent {
  action: AIAction
  code: string
  language: string
}

// Dispatch a custom event for AI code intelligence actions
function dispatchAIAction(action: AIAction, code: string, language: string): void {
  window.dispatchEvent(
    new CustomEvent<AISelectionEvent>('codehelper:ai-code-action', {
      detail: { action, code, language },
    }),
  )
}

// Memoized Monaco Editor to prevent unnecessary re-renders
// The editor is expensive to re-initialize
export const MonacoEditor = memo(function MonacoEditor() {
  const updateContent = useEditorStore((s) => s.updateContent)
  const updateCursorPosition = useEditorStore((s) => s.updateCursorPosition)
  const updateScrollTop = useEditorStore((s) => s.updateScrollTop)
  const activeTab = useActiveTab()
  const theme = useMonacoTheme()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const editorDisposables = useRef<Array<{ dispose: () => void }>>([])
  const [minimapEnabled, setMinimapEnabled] = useState(getMinimapEnabled)

  // Listen for minimap toggle events
  useEffect(() => {
    const handler = () => {
      setMinimapEnabled((prev) => {
        const next = !prev
        saveMinimapSetting(next)
        // Update editor option directly without re-render
        if (editorRef.current) {
          editorRef.current.updateOptions({ minimap: { enabled: next } })
        }
        return next
      })
    }
    window.addEventListener('codehelper:toggle-minimap', handler)
    return () => window.removeEventListener('codehelper:toggle-minimap', handler)
  }, [])

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (activeTab) {
        updateContent(activeTab.id, value ?? '')
      }
    },
    [activeTab, updateContent],
  )

  // Clean up Monaco disposables on unmount
  useEffect(() => {
    return () => {
      for (const d of editorDisposables.current) {
        try {
          d.dispose()
        } catch {
          /* ignore */
        }
      }
      editorDisposables.current = []
    }
  }, [])

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      // Dispose any previous subscriptions (e.g. tab switch re-mount)
      for (const d of editorDisposables.current) {
        try {
          d.dispose()
        } catch {
          /* ignore */
        }
      }
      editorDisposables.current = []

      editorRef.current = editor

      // Restore cursor position
      if (activeTab?.cursorPosition) {
        editor.setPosition(activeTab.cursorPosition)
        editor.revealPositionInCenter(activeTab.cursorPosition)
      }

      // Restore scroll position
      if (activeTab?.scrollTop) {
        editor.setScrollPosition({ scrollTop: activeTab.scrollTop })
      }

      // Track cursor position changes — store disposable for cleanup
      const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
        if (activeTab) {
          updateCursorPosition(activeTab.id, e.position.lineNumber, e.position.column)
        }
      })

      // Track scroll position changes (debounced via requestAnimationFrame)
      let scrollTimer: ReturnType<typeof requestAnimationFrame>
      const scrollDisposable = editor.onDidScrollChange(() => {
        cancelAnimationFrame(scrollTimer)
        scrollTimer = requestAnimationFrame(() => {
          if (activeTab) {
            const scrollTop = editor.getScrollTop()
            updateScrollTop(activeTab.id, scrollTop)
          }
        })
      })

      // Store disposables for cleanup on unmount or re-mount
      editorDisposables.current.push(cursorDisposable, scrollDisposable)
    },
    [activeTab, updateCursorPosition, updateScrollTop],
  )

  // Memoize editor options to avoid creating new object reference each render
  // The base options are cached in monacoConfig; only minimap changes here
  const editorOptions = useMemo(
    () => ({
      ...getDefaultEditorOptions(),
      minimap: { enabled: minimapEnabled },
    }),
    [minimapEnabled],
  )

  if (!activeTab) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--theme-text-muted)]">
        没有打开的文件
      </div>
    )
  }

  return (
    <Editor
      key={activeTab.id}
      beforeMount={registerMonacoThemes}
      onMount={handleEditorMount}
      theme={theme}
      language={activeTab.language}
      value={activeTab.content}
      onChange={handleChange}
      options={editorOptions}
      loading={
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    />
  )
})
