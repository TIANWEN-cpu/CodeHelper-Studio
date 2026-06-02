import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { useAppStore } from '../stores/appStore'
import { EditorView } from '../modules/editor/EditorView'
import { SettingsView } from '../modules/settings/SettingsView'
import { ChatView } from '../modules/ai-chat/ChatView'
import { ProblemsView } from '../modules/problems/ProblemsView'
import { MistakesView } from '../modules/mistakes/MistakesView'
import { KnowledgeView } from '../modules/knowledge/KnowledgeView'

export function Layout() {
  const activeModule = useAppStore((s) => s.activeModule)

  const renderModule = () => {
    switch (activeModule) {
      case 'problems':
        return <ProblemsView />
      case 'editor':
        return <EditorView />
      case 'settings':
        return <SettingsView />
      case 'ai-chat':
        return <ChatView />
      case 'mistakes':
        return <MistakesView />
      case 'knowledge':
        return <KnowledgeView />
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--theme-bg-app)] text-[var(--theme-text-primary)]">
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex min-h-0 flex-col overflow-hidden">{renderModule()}</div>
      </div>
      <StatusBar />
    </div>
  )
}
