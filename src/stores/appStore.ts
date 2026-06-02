import { create } from 'zustand'
import { DEFAULT_THEME, THEMES, THEME_SETTING_KEY } from '../constants'
import { typedInvoke } from '../api/ipc'
import { toErrorMessage } from '../utils/errors'
import { eventBus } from '../utils/eventBus'

export type ModuleId =
  | 'problems'
  | 'editor'
  | 'ai-chat'
  | 'mistakes'
  | 'knowledge'
  | 'settings'
  | 'stats'
  | 'search'
export type ThemeId = (typeof THEMES)[number]

interface AppState {
  activeModule: ModuleId
  theme: ThemeId
  sidebarCollapsed: boolean
  setActiveModule: (id: ModuleId) => void
  setTheme: (theme: ThemeId) => Promise<void>
  loadTheme: () => Promise<void>
  toggleSidebar: () => void
}

function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'problems',
  theme: DEFAULT_THEME,
  sidebarCollapsed: false,
  setActiveModule: (id) => {
    set({ activeModule: id })
  },
  setTheme: async (theme) => {
    applyTheme(theme)
    set({ theme })
    eventBus.emit('theme:changed', theme)
    try {
      await typedInvoke('db-set-setting', THEME_SETTING_KEY, theme)
    } catch (error) {
      console.warn('[AppStore.setTheme] Failed to persist theme:', toErrorMessage(error))
    }
  },
  loadTheme: async () => {
    try {
      const saved = await typedInvoke('db-get-setting', THEME_SETTING_KEY)
      const theme: ThemeId =
        saved && (THEMES as readonly string[]).includes(saved) ? (saved as ThemeId) : DEFAULT_THEME
      applyTheme(theme)
      set({ theme })
    } catch (error) {
      console.warn(
        '[AppStore.loadTheme] Failed to load theme, using default:',
        toErrorMessage(error),
      )
      applyTheme(DEFAULT_THEME)
      set({ theme: DEFAULT_THEME })
    }
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}))
