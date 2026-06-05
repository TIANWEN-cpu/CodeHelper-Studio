import { create } from 'zustand'
import { ViewType } from './types'
import {
  applyAIPetEnabled,
  applyAnimationLevel,
  applyBackgroundStyle,
  applyTheme,
  applyVisualTheme,
  persistAppearance,
  type AnimationLevel,
  type Appearance,
  type BackgroundStyle,
  type ThemeMode,
  type VisualTheme,
} from './lib/appearance'
import { getSetting } from './services/settingsService'
import type { RegionFormat } from './lib/locale'
import { DEFAULT_CODE_THEME } from './lib/codeThemes'

export type WeekStart = 'mon' | 'sun'

/**
 * AI 上下文快照：由各视图写入"当前正在处理的对象"（题目/练习/错题/课程），
 * AI 面板据此把代码与题面组装进提问，使对话真正结合上下文而非孤立聊天。
 */
export interface AIContextSnapshot {
  kind: 'problem' | 'exercise' | 'mistake' | 'lesson'
  title: string
  language?: string
  code?: string
  detail?: string
}

export const AI_PANEL_MIN_WIDTH = 320
export const AI_PANEL_MAX_WIDTH = 720
export const AI_PANEL_DEFAULT_WIDTH = 420
const AI_PANEL_WIDTH_STORAGE_KEY = 'codehelper.aiPanelWidth'

function clampAIPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return AI_PANEL_DEFAULT_WIDTH
  return Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, Math.round(width)))
}

function readPersistedAIPanelWidth(): number {
  if (typeof window === 'undefined') return AI_PANEL_DEFAULT_WIDTH
  try {
    const raw = window.localStorage.getItem(AI_PANEL_WIDTH_STORAGE_KEY)
    return raw ? clampAIPanelWidth(Number(raw)) : AI_PANEL_DEFAULT_WIDTH
  } catch {
    return AI_PANEL_DEFAULT_WIDTH
  }
}

function persistAIPanelWidth(width: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AI_PANEL_WIDTH_STORAGE_KEY, String(width))
  } catch {
    /* Ignore storage failures; resizing should still work in memory. */
  }
}

interface AppState {
  currentView: ViewType
  showAITutor: boolean
  sidebarCollapsed: boolean
  aiPanelWidth: number
  bottomPanelCollapsed: boolean
  doubleLineTabs: boolean
  /** 区域格式：驱动绝对日期显示风格（中文/ISO/英文）。 */
  dateRegion: RegionFormat
  /** 每周起始日：驱动学习热力图按星期对齐的首行/列。 */
  weekStart: WeekStart
  /** 代码主题 id：驱动工作区 CodeMirror 编辑器语法高亮配色。 */
  codeTheme: string
  /** 当前 AI 上下文（正在处理的题目/练习/错题/课程），供 AI 面板组装提问。 */
  aiContext: AIContextSnapshot | null
  /** 待 AI 面板消费的一次性对话请求：display 入气泡，send 实际发给模型（如运行报错诊断）。 */
  pendingAIPrompt: { display: string; send: string } | null
  theme: ThemeMode
  visualTheme: VisualTheme
  backgroundStyle: BackgroundStyle
  animationLevel: AnimationLevel
  aiPetEnabled: boolean
  setCurrentView: (view: ViewType) => void
  toggleAITutor: () => void
  setShowAITutor: (show: boolean) => void
  setAIPanelWidth: (width: number, options?: { persist?: boolean }) => void
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
  /** 设置代码主题并持久化 code_theme。 */
  setCodeTheme: (id: string) => void
  /** 写入/清空当前 AI 上下文（视图挂载时设置、卸载时传 null）。 */
  setAIContext: (ctx: AIContextSnapshot | null) => void
  /** 请求 AI 对话：打开面板并投递一次性消息，由 AI 面板消费发送。 */
  requestAIChat: (display: string, send: string) => void
  /** AI 面板取走待发送请求后清空。 */
  consumeAIPrompt: () => void
  /** 设置主题：写 DOM + 持久化 + 更新状态；手动选主题时关闭"跟随系统"。 */
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setVisualTheme: (theme: VisualTheme) => void
  setBackgroundStyle: (style: BackgroundStyle) => void
  setAnimationLevel: (level: AnimationLevel) => void
  setAIPetEnabled: (enabled: boolean) => void
  /** 启动时把已解析的主题同步进 store，不重复持久化。 */
  hydrateTheme: (theme: ThemeMode) => void
  hydrateAppearanceControls: (
    appearance: Pick<
      Appearance,
      'visualTheme' | 'backgroundStyle' | 'animationLevel' | 'aiPetEnabled'
    >,
  ) => void
  /** 启动时从数据库读回 UI 偏好（AI 面板/侧边栏/底部面板/标签换行/区域/周起始）。 */
  hydrateLayout: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'home',
  showAITutor: false,
  sidebarCollapsed: false,
  aiPanelWidth: readPersistedAIPanelWidth(),
  bottomPanelCollapsed: false,
  doubleLineTabs: true,
  dateRegion: 'zh-CN',
  weekStart: 'mon',
  codeTheme: DEFAULT_CODE_THEME,
  aiContext: null,
  pendingAIPrompt: null,
  theme: 'dark',
  visualTheme: 'codex',
  backgroundStyle: 'soft',
  animationLevel: 'balanced',
  aiPetEnabled: true,
  setCurrentView: (view) => set({ currentView: view }),
  toggleAITutor: () => set((state) => ({ showAITutor: !state.showAITutor })),
  setShowAITutor: (show) => set({ showAITutor: show }),
  setAIPanelWidth: (width, options) => {
    const next = clampAIPanelWidth(width)
    if (options?.persist !== false) persistAIPanelWidth(next)
    set({ aiPanelWidth: next })
  },
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
  setCodeTheme: (id) => {
    persistAppearance('code_theme', id)
    set({ codeTheme: id })
  },
  setAIContext: (ctx) =>
    set((state) => {
      if (ctx) return { aiContext: ctx }
      if (state.currentView === 'ai-tutor' || state.showAITutor) return {}
      return { aiContext: null }
    }),
  requestAIChat: (display, send) => set({ pendingAIPrompt: { display, send }, showAITutor: true }),
  consumeAIPrompt: () => set({ pendingAIPrompt: null }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
    persistAppearance('theme_mode', theme)
    // 手动选定主题即视为不再跟随系统，避免系统切换把用户选择覆盖。
    persistAppearance('follow_system', 'false')
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setVisualTheme: (theme) => {
    applyVisualTheme(theme)
    persistAppearance('visual_theme', theme)
    set({ visualTheme: theme })
  },
  setBackgroundStyle: (style) => {
    applyBackgroundStyle(style)
    persistAppearance('background_style', style)
    set({ backgroundStyle: style })
  },
  setAnimationLevel: (level) => {
    applyAnimationLevel(level)
    persistAppearance('animation_level', level)
    set({ animationLevel: level })
  },
  setAIPetEnabled: (enabled) => {
    applyAIPetEnabled(enabled)
    persistAppearance('ai_pet_enabled', String(enabled))
    set({ aiPetEnabled: enabled })
  },
  hydrateTheme: (theme) => set({ theme }),
  hydrateAppearanceControls: (appearance) => set(appearance),
  hydrateLayout: async () => {
    try {
      const [ai, collapse, bottom, dbl, region, week, codeTheme] = await Promise.all([
        getSetting('show_ai_panel'),
        getSetting('compact_sidebar'),
        getSetting('show_bottom_panel'),
        getSetting('double_line_tabs'),
        getSetting('region_format'),
        getSetting('week_start'),
        getSetting('code_theme'),
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
        // code_theme：空值回退默认主题。
        codeTheme: codeTheme || DEFAULT_CODE_THEME,
      })
    } catch {
      /* 读取失败时保持默认布局 */
    }
  },
}))
