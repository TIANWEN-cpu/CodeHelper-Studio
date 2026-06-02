import { create } from 'zustand'

export type ModuleId = 'problems' | 'editor' | 'ai-chat' | 'mistakes' | 'knowledge' | 'settings'
export type ThemeId = 'mocha' | 'fjord' | 'ember'

interface AppState {
  activeModule: ModuleId
  theme: ThemeId
  setActiveModule: (id: ModuleId) => void
  setTheme: (theme: ThemeId) => Promise<void>
  loadTheme: () => Promise<void>
}

const THEME_SETTING_KEY = 'ui-theme'

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: 'problems',
  theme: 'mocha',
  setActiveModule: (id) => set({ activeModule: id }),
  setTheme: async (theme) => {
    applyTheme(theme)
    set({ theme })
    await window.api.invoke('db-set-setting', THEME_SETTING_KEY, theme)
  },
  loadTheme: async () => {
    const saved = (await window.api.invoke('db-get-setting', THEME_SETTING_KEY)) as ThemeId | null
    const theme = saved && ['mocha', 'fjord', 'ember'].includes(saved) ? saved : 'mocha'
    applyTheme(theme)
    set({ theme })
  },
}))
