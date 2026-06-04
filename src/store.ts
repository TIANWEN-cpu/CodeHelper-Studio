import { create } from 'zustand'
import { ViewType } from './types'
import { applyTheme, persistAppearance, type ThemeMode } from './lib/appearance'
import { getSetting } from './services/settingsService'
import type { RegionFormat } from './lib/locale'

export type WeekStart = 'mon' | 'sun'

interface AppState {
  currentView: ViewType
  showAITutor: boolean
  sidebarCollapsed: boolean
  bottomPanelCollapsed: boolean
  doubleLineTabs: boolean
  /** 区域格式：驱动绝对日期显示风格（中文/ISO/英文）。 */
  dateRegion: RegionFormat
  /** 每周起始日：驱动学习热力图按星期对齐的首行/列。 */
  weekStart: WeekStart
  theme: ThemeMode
  setCurrentView: (view: ViewType) => void
  toggleAITutor: () => void
  setShowAITutor: (show: boolean) => void
  /** 侧边栏折叠：与设置页"紧凑侧边栏"双向同步并持久化 compact_sidebar。 */
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
  /** 工作区底部面板初始折叠状态，对应设置页"显示底部面板"。 */
  setBottomPanelCollapsed: (v: boolean) => void
  /** 编辑器标签页是否双行换行显示。 */
  setDoubleLineTabs: (v: boolean) => void
  /** 设置区域格式并持久化 region_format。 */
  setDateRegion: (r: RegionFormat) => void
  /** 设置每周起始日并持久化 week_start。 */
  setWeekStart: (w: WeekStart) => void
  /** 设置主题：写 DOM + 持久化 + 更新状态；手动选主题时关闭"跟随系统"。 */
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  /** 启动时把已解析的主题同步进 store，不重复持久化。 */
  hydrateTheme: (theme: ThemeMode) => void
  /** 启动时从数据库读回 UI 偏好（AI 面板/侧边栏/底部面板/标签换行/区域/周起始）。 */
  hydrateLayout: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'home',
  showAITutor: false,
  sidebarCollapsed: false,
  bottomPanelCollapsed: false,
  doubleLineTabs: true,
  dateRegion: 'zh-CN',
  weekStart: 'mon',
  theme: 'dark',
  setCurrentView: (view) => set({ currentView: view }),
  toggleAITutor: () => set((state) => ({ showAITutor: !state.showAITutor })),
  setShowAITutor: (show) => set({ showAITutor: show }),
  setSidebarCollapsed: (v) => {
    persistAppearance('compact_sidebar', String(v))
    set({ sidebarCollapsed: v })
  },
  toggleSidebar: () =>
    set((state) => {
      const v = !state.sidebarCollapsed
      persistAppearance('compact_sidebar', String(v))
      return { sidebarCollapsed: v }
    }),
  setBottomPanelCollapsed: (v) => set({ bottomPanelCollapsed: v }),
  setDoubleLineTabs: (v) => set({ doubleLineTabs: v }),
  setDateRegion: (r) => {
    persistAppearance('region_format', r)
    set({ dateRegion: r })
  },
  setWeekStart: (w) => {
    persistAppearance('week_start', w)
    set({ weekStart: w })
  },
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
    persistAppearance('theme_mode', theme)
    // 手动选定主题即视为不再跟随系统，避免系统切换把用户选择覆盖。
    persistAppearance('follow_system', 'false')
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  hydrateTheme: (theme) => set({ theme }),
  hydrateLayout: async () => {
    try {
      const [ai, collapse, bottom, dbl, region, week] = await Promise.all([
        getSetting('show_ai_panel'),
        getSetting('compact_sidebar'),
        getSetting('show_bottom_panel'),
        getSetting('double_line_tabs'),
        getSetting('region_format'),
        getSetting('week_start'),
      ])
      set({
        showAITutor: ai === 'true',
        sidebarCollapsed: collapse === 'true',
        // "显示底部面板"=false ⇒ 初始折叠；未设置时默认展开。
        bottomPanelCollapsed: bottom === 'false',
        doubleLineTabs: dbl == null ? true : dbl === 'true',
        // region_format：兼容历史值，仅识别 iso/en-US，其余回退中文。
        dateRegion: region === 'iso' || region === 'en-US' ? region : 'zh-CN',
        // week_start：兼容旧的"周日"中文值。
        weekStart: week === 'sun' || week === '周日' ? 'sun' : 'mon',
      })
    } catch {
      /* 读取失败时保持默认布局 */
    }
  },
}))
