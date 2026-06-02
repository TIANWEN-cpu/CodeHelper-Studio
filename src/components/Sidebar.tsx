import { memo, useCallback, useMemo } from 'react'
import { useAppStore, type ModuleId } from '../stores/appStore'
import {
  Code2,
  BookOpen,
  Bot,
  XCircle,
  Library,
  Settings,
  PanelLeftClose,
  PanelLeft,
  BarChart3,
  Search,
  Activity,
} from 'lucide-react'
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
  { id: 'stats', icon: BarChart3, label: '统计' },
  { id: 'analytics', icon: Activity, label: '分析' },
  { id: 'search', icon: Search, label: '搜索' },
  { id: 'settings', icon: Settings, label: '设置', bottom: true },
]

// Memoized sidebar button to avoid re-rendering all buttons when active module changes
const SidebarButton = memo(function SidebarButton({
  id,
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  id: ModuleId
  icon: LucideIcon
  label: string
  isActive: boolean
  onClick: (id: ModuleId) => void
}) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onClick(id)}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-1 ${
        isActive
          ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-[0_0_0_1px_var(--theme-glow)]'
          : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)]'
      }`}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  )
})

export function Sidebar() {
  const activeModule = useAppStore((s) => s.activeModule)
  const setActiveModule = useAppStore((s) => s.setActiveModule)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  // Memoize filtered lists since SIDEBAR_NAV_ITEMS is static
  const topItems = useMemo(() => SIDEBAR_NAV_ITEMS.filter((item) => !item.bottom), [])
  const bottomItems = useMemo(() => SIDEBAR_NAV_ITEMS.filter((item) => item.bottom), [])

  const handleNavClick = useCallback((id: ModuleId) => setActiveModule(id), [setActiveModule])

  return (
    <div
      role="navigation"
      aria-label={collapsed ? '侧栏已收起' : '侧栏导航'}
      className={`sidebar-transition bg-[var(--theme-bg-sidebar)] flex flex-col items-center py-3 gap-2 border-r border-[var(--theme-border)] overflow-hidden ${
        collapsed ? 'w-10' : 'w-12'
      }`}
    >
      {collapsed ? (
        <div className="mt-auto">
          <button
            title="展开侧栏"
            aria-label="展开侧栏"
            aria-expanded="false"
            onClick={toggleSidebar}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-1"
          >
            <PanelLeft size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <>
          {topItems.map((item) => (
            <SidebarButton
              key={item.id}
              id={item.id}
              icon={item.icon}
              label={item.label}
              isActive={activeModule === item.id}
              onClick={handleNavClick}
            />
          ))}
          <div className="mt-auto flex flex-col items-center gap-2">
            {bottomItems.map((item) => (
              <SidebarButton
                key={item.id}
                id={item.id}
                icon={item.icon}
                label={item.label}
                isActive={activeModule === item.id}
                onClick={handleNavClick}
              />
            ))}
            <button
              title="收起侧栏"
              aria-label="收起侧栏"
              aria-expanded="true"
              onClick={toggleSidebar}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-1"
            >
              <PanelLeftClose size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
