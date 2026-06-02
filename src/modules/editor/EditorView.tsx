import { Play } from 'lucide-react'
import { EditorTabs } from './EditorTabs'
import { MonacoEditor } from './MonacoEditor'
import { Console } from './Console'
import { useEditorStore } from '../../stores/editorStore'
import { useCodeExecution } from '../../hooks/useCodeExecution'

export function EditorView() {
  const { output, running, execute } = useCodeExecution()
  const { tabs, activeTabId } = useEditorStore()
  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  const handleRun = () => {
    if (!activeTab || running) {
      return
    }
    void execute(activeTab.content, activeTab.language)
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="ui-toolbar flex items-center border-b">
        <EditorTabs />
        <div className="ml-auto px-2">
          <button
            onClick={handleRun}
            disabled={running || !activeTab}
            className="ui-btn-success flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            <Play size={14} />
            运行
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <MonacoEditor />
      </div>
      <Console output={output} running={running} />
    </div>
  )
}
