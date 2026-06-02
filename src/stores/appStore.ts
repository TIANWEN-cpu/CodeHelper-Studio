import { create } from 'zustand'
import { DEFAULT_THEME, THEMES, THEME_SETTING_KEY } from '../constants'
import { typedInvoke } from '../api/ipc'

export type ModuleId = 'problems' | 'editor' | 'ai-chat' | 'mistakes' | 'knowledge' | 'settings'
export type ThemeId = (typeof THEMES)[number]

interface AppState {
  activeModule: ModuleId
  theme: ThemeId
  setActiveModule: (id: ModuleId) => void
  setTheme: (theme: ThemeId) => Promise<void>
  loadTheme: () => Promise<void>
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'problems',
  theme: DEFAULT_THEME,
  setActiveModule: (id) => set({ activeModule: id }),
  setTheme: async (theme) => {
    applyTheme(theme)
    set({ theme })
    await typedInvoke('db-set-setting', THEME_SETTING_KEY, theme)
  },
  loadTheme: async () => {
    const saved = await typedInvoke('db-get-setting', THEME_SETTING_KEY)
    const theme: ThemeId =
      saved && (THEMES as readonly string[]).includes(saved) ? (saved as ThemeId) : DEFAULT_THEME
    applyTheme(theme)
    set({ theme })
  },
}))
