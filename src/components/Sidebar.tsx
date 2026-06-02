import { useAppStore, type ModuleId } from '../stores/appStore'
import { Code2, BookOpen, Bot, XCircle, Library, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const topItems: { id: ModuleId; icon: LucideIcon; label: string }[] = [
  { id: 'problems', icon: BookOpen, label: '刷题' },
  { id: 'editor', icon: Code2, label: '编辑器' },
  { id: 'ai-chat', icon: Bot, label: 'AI助手' },
  { id: 'mistakes', icon: XCircle, label: '错题本' },
  { id: 'knowledge', icon: Library, label: '知识库' },
]

export function Sidebar() {
  const { activeModule, setActiveModule } = useAppStore()

  const btn = (id: ModuleId, Icon: LucideIcon, label: string) => (
    <button
      key={id}
      title={label}
      onClick={() => setActiveModule(id)}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
        activeModule === id
          ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-[0_0_0_1px_var(--theme-glow)]'
          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)]'
      }`}
    >
      <Icon size={18} />
    </button>
  )

  return (
    <div className="w-12 bg-[var(--theme-bg-sidebar)] flex flex-col items-center py-3 gap-2 border-r border-[var(--theme-border)]">
      {topItems.map(({ id, icon, label }) => btn(id, icon, label))}
      <div className="mt-auto">{btn('settings', Settings, '设置')}</div>
    </div>
  )
}
