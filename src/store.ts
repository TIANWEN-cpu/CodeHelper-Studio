import { create } from 'zustand'
import { ViewType } from './types'
import { applyTheme, persistAppearance, type ThemeMode } from './lib/appearance'

interface AppState {
  currentView: ViewType
  showAITutor: boolean
  theme: ThemeMode
  setCurrentView: (view: ViewType) => void
  toggleAITutor: () => void
  setShowAITutor: (show: boolean) => void
  /** 设置主题：写 DOM + 持久化 + 更新状态；手动选主题时关闭"跟随系统"。 */
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  /** 启动时把已解析的主题同步进 store，不重复持久化。 */
  hydrateTheme: (theme: ThemeMode) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'home',
  showAITutor: false,
  theme: 'dark',
  setCurrentView: (view) => set({ currentView: view }),
  toggleAITutor: () => set((state) => ({ showAITutor: !state.showAITutor })),
  setShowAITutor: (show) => set({ showAITutor: show }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
    persistAppearance('theme_mode', theme)
    // 手动选定主题即视为不再跟随系统，避免系统切换把用户选择覆盖。
    persistAppearance('follow_system', 'false')
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  hydrateTheme: (theme) => set({ theme }),
}))
