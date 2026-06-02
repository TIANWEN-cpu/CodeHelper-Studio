import { useAppStore, type ModuleId } from '../stores/appStore'
import { Code2, BookOpen, Bot, XCircle, Library, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Navigation items for the sidebar.
 * Extracted from the component so it can be iterated, tested, or extended
 * without modifying the Sidebar component itself.
 */
export interface NavItem {
  id: ModuleId
  icon: LucideIcon
  label: string
  /** If true, this item is pinned to the bottom of the sidebar. */
  bottom?: boolean
}

export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  { id: 'problems', icon: BookOpen, label: '刷题' },
  { id: 'editor', icon: Code2, label: '编辑器' },
  { id: 'ai-chat', icon: Bot, label: 'AI助手' },
  { id: 'mistakes', icon: XCircle, label: '错题本' },
  { id: 'knowledge', icon: Library, label: '知识库' },
  { id: 'settings', icon: Settings, label: '设置', bottom: true },
]

export function Sidebar() {
  const activeModule = useAppStore((s) => s.activeModule)
  const setActiveModule = useAppStore((s) => s.setActiveModule)

  const topItems = SIDEBAR_NAV_ITEMS.filter((item) => !item.bottom)
  const bottomItems = SIDEBAR_NAV_ITEMS.filter((item) => item.bottom)

  const renderButton = (item: NavItem) => {
    const Icon = item.icon
    return (
      <button
        key={item.id}
        title={item.label}
        onClick={() => setActiveModule(item.id)}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
          activeModule === item.id
            ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-[0_0_0_1px_var(--theme-glow)]'
            : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)]'
        }`}
      >
        <Icon size={18} />
      </button>
    )
  }

  return (
    <div className="w-12 bg-[var(--theme-bg-sidebar)] flex flex-col items-center py-3 gap-2 border-r border-[var(--theme-border)]">
      {topItems.map(renderButton)}
      <div className="mt-auto">{bottomItems.map(renderButton)}</div>
    </div>
  )
}
