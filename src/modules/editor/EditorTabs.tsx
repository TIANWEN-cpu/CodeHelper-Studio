import { memo, useCallback } from 'react'
import { X, Plus } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

// Memoized individual tab to avoid re-rendering all tabs when one changes
const EditorTabItem = memo(function EditorTabItem({
  tabId,
  filename,
  isActive,
  onSelect,
  onClose,
}: {
  tabId: string
  filename: string
  isActive: boolean
  onSelect: (id: string) => void
  onClose: (id: string) => void
}) {
  return (
    <div
      onClick={() => onSelect(tabId)}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      className={`flex shrink-0 items-center gap-2 border-r px-3 py-2 text-sm glass-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-inset ${
        isActive
          ? 'bg-[var(--theme-bg-app)] text-[var(--theme-text-primary)]'
          : 'text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)]/60'
      }`}
    >
      <span className="max-w-[140px] truncate">{filename}</span>
      <button
        onClick={(event) => {
          event.stopPropagation()
          onClose(tabId)
        }}
        className="rounded p-0.5 opacity-60 hover:bg-[var(--theme-bg-hover)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        aria-label={`关闭 ${filename}`}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  )
})

export function EditorTabs() {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const closeTab = useEditorStore((s) => s.closeTab)
  const addTab = useEditorStore((s) => s.addTab)

  const handleNewTab = useCallback(() => {
    const id = `file-${Date.now()}`
    addTab({
      id,
      filename: `untitled-${tabs.length + 1}.py`,
      language: 'python',
      content: '',
    })
  }, [addTab, tabs.length])

  const handleCloseTab = useCallback((id: string) => closeTab(id), [closeTab])

  const handleSelectTab = useCallback((id: string) => setActiveTab(id), [setActiveTab])

  return (
    <div className="flex items-center overflow-x-auto" role="tablist" aria-label="编辑器标签页">
      {tabs.map((tab) => (
        <EditorTabItem
          key={tab.id}
          tabId={tab.id}
          filename={tab.filename}
          isActive={activeTabId === tab.id}
          onSelect={handleSelectTab}
          onClose={handleCloseTab}
        />
      ))}
      <button
        onClick={handleNewTab}
        className="mx-1 rounded p-1.5 text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)] hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        title="新建文件"
        aria-label="新建文件"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
