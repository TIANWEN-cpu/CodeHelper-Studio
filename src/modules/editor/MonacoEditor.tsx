import Editor from '@monaco-editor/react'
import { useEditorStore } from '../../stores/editorStore'
import {
  useActiveTab,
  useMonacoTheme,
  defaultEditorOptions,
  registerMonacoThemes,
} from '../../utils/monacoConfig'

export function MonacoEditor() {
  const updateContent = useEditorStore((s) => s.updateContent)
  const activeTab = useActiveTab()
  const theme = useMonacoTheme()

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
      theme={theme}
      language={activeTab.language}
      value={activeTab.content}
      onChange={(value) => updateContent(activeTab.id, value ?? '')}
      options={defaultEditorOptions}
    />
  )
}
