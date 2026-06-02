import { useCallback, useEffect, useState } from 'react'
import { Play, Columns, Terminal, Map } from 'lucide-react'
import { EditorTabs } from './EditorTabs'
import { MonacoEditor } from './MonacoEditor'
import { Console } from './Console'
import { TerminalPanel } from './TerminalPanel'
import { useEditorStore } from '../../stores/editorStore'
import { useCodeExecution } from '../../hooks/useCodeExecution'
import { getMinimapEnabled, setMinimapEnabled } from '../../utils/monacoConfig'

function toolbarBtnClass(active: boolean): string {
  const base =
    'flex items-center gap-1 rounded px-2 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]'
  return active
    ? `${base} bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]`
    : `${base} text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)]`
}

export function EditorView() {
  const { output, running, execute } = useCodeExecution()
  // Only subscribe to activeTabId — avoid re-rendering on every keystroke
  // when content changes. The active tab content is read from store.getState()
  // inside the run handler instead.
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const hasActiveTab = activeTabId !== null

  const [splitView, setSplitView] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [minimapEnabled, setMinimapState] = useState(getMinimapEnabled)

  const handleRun = useCallback(() => {
    if (!hasActiveTab || running) {
      return
    }
    // Read tab content directly from store to avoid subscribing to tabs array
    const { tabs, activeTabId: tabId } = useEditorStore.getState()
    const activeTab = tabs.find((tab) => tab.id === tabId)
    if (activeTab) {
      void execute(activeTab.content, activeTab.language)
    }
  }, [hasActiveTab, running, execute])

  // Listen for keyboard shortcut run event
  useEffect(() => {
    const handler = () => handleRun()
    window.addEventListener('codehelper:run', handler)
    return () => window.removeEventListener('codehelper:run', handler)
  }, [handleRun])

  // Listen for toggle events from command palette
  useEffect(() => {
    const splitHandler = () => setSplitView((v) => !v)
    const terminalHandler = () => setTerminalOpen((v) => !v)
    const minimapHandler = () => {
      setMinimapState((prev) => {
        const next = !prev
        setMinimapEnabled(next)
        return next
      })
    }
    window.addEventListener('codehelper:toggle-split', splitHandler)
    window.addEventListener('codehelper:toggle-terminal', terminalHandler)
    window.addEventListener('codehelper:toggle-minimap', minimapHandler)
    return () => {
      window.removeEventListener('codehelper:toggle-split', splitHandler)
      window.removeEventListener('codehelper:toggle-terminal', terminalHandler)
      window.removeEventListener('codehelper:toggle-minimap', minimapHandler)
    }
  }, [])

  const handleToggleMinimap = useCallback(() => {
    setMinimapState((prev) => {
      const next = !prev
      setMinimapEnabled(next)
      return next
    })
  }, [])

  const handleToggleSplit = useCallback(() => setSplitView((v) => !v), [])
  const handleToggleTerminal = useCallback(() => setTerminalOpen((v) => !v), [])

  return (
    <div className="flex flex-1 flex-col">
      <div className="ui-toolbar flex items-center border-b">
        <EditorTabs />
        <div className="ml-auto flex items-center gap-1 px-2">
          <button
            onClick={handleToggleMinimap}
            aria-pressed={minimapEnabled}
            aria-label="切换 Minimap"
            className={toolbarBtnClass(minimapEnabled)}
            title="切换 Minimap"
          >
            <Map size={14} aria-hidden="true" />
          </button>

          <button
            onClick={handleToggleSplit}
            aria-pressed={splitView}
            aria-label="切换分屏编辑"
            className={toolbarBtnClass(splitView)}
            title="分屏编辑"
          >
            <Columns size={14} aria-hidden="true" />
          </button>

          <button
            onClick={handleToggleTerminal}
            aria-pressed={terminalOpen}
            aria-label="切换终端面板"
            className={toolbarBtnClass(terminalOpen)}
            title="终端面板"
          >
            <Terminal size={14} aria-hidden="true" />
          </button>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running || !hasActiveTab}
            aria-label="运行代码"
            className="ui-btn-success flex items-center gap-1.5 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-2"
          >
            <Play size={14} aria-hidden="true" />
            运行
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div
        className={`flex flex-1 min-h-0 ${splitView ? 'divide-x divide-[var(--theme-border)]' : ''}`}
      >
        {/* Primary editor */}
        <div className={splitView ? 'flex-1 min-w-0' : 'flex-1 min-w-0'}>
          <MonacoEditor />
        </div>

        {/* Secondary editor (split view) */}
        {splitView && (
          <div className="flex-1 min-w-0">
            <MonacoEditor />
          </div>
        )}
      </div>

      {/* Bottom panels */}
      {terminalOpen ? (
        <TerminalPanel onClose={() => setTerminalOpen(false)} />
      ) : (
        <Console output={output} running={running} />
      )}
    </div>
  )
}
