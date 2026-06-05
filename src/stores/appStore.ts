import { create } from 'zustand'
import { typedInvoke } from '@/api/ipc'
import { DEFAULT_THEME, THEMES } from '@/constants'

type ModuleId = 'problems' | 'editor' | 'ai-chat' | 'mistakes' | 'knowledge' | 'settings'
type ThemeId = (typeof THEMES)[number]

type AppStore = {
  activeModule: ModuleId
  theme: ThemeId
  sidebarCollapsed: boolean
  setActiveModule: (module: ModuleId) => void
  setTheme: (theme: ThemeId) => Promise<void>
  loadTheme: () => Promise<void>
  toggleSidebar: () => void
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

function isTheme(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

export const useAppStore = create<AppStore>((set, get) => ({
  activeModule: 'problems',
  theme: DEFAULT_THEME,
  sidebarCollapsed: false,
  setActiveModule: (module) => set({ activeModule: module }),
  setTheme: async (theme) => {
    applyTheme(theme)
    set({ theme })
    try {
      await typedInvoke('db-set-setting', 'ui-theme', theme)
    } catch {
      // Local state intentionally remains updated even if persistence fails.
    }
  },
  loadTheme: async () => {
    let theme: ThemeId = DEFAULT_THEME
    try {
      const saved = await typedInvoke<string | null>('db-get-setting', 'ui-theme')
      theme = isTheme(saved) ? saved : DEFAULT_THEME
    } catch (error) {
      console.warn('[AppStore.loadTheme]', error)
    }
    applyTheme(theme)
    set({ theme })
  },
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
}))
