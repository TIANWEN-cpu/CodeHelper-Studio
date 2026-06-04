import React from 'react'
import { Monitor, Palette, Check, RotateCcw, Settings, Download, Upload, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsData } from '../hooks/useSettingsData'
import { useAppStore } from '../store'
import {
  applyThemeColor,
  applyScale,
  applyFontSize,
  applyReduceMotion,
  applyTheme,
  resolveTheme,
  type ThemeMode,
} from '../lib/appearance'
import { AIModelSettings } from './settings/AIModelSettings'

// ---- Helper: Toggle Switch ----

function ToggleSwitch({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-10 h-6 rounded-full relative flex items-center shrink-0 transition-colors',
        active ? 'bg-[var(--color-accent-purple)]' : 'bg-[#3A405A]',
      )}
    >
      <div
        className={cn(
          'w-4 h-4 bg-white rounded-full absolute transition-all',
          active ? 'right-1' : 'left-1',
        )}
      />
    </button>
  )
}

// ---- Component ----

export function SettingsView() {
  const { getSetting, setSetting, platformInfo, exportData, importData } = useSettingsData()

  // 主题(dark/light)由全局 store 统一管理，使侧边栏/Header/设置页三处同步。
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  const [activeTab, setActiveTab] = React.useState('appearance')
  const [loaded, setLoaded] = React.useState(false)

  // ---- Appearance ----
  // 默认招牌靛色：与 @theme 的 --color-accent-primary 一致；选它时 applyThemeColor 回退原始靛→紫双色。
  const [themeColor, setThemeColor] = React.useState('#6366F1')
  const [followSystem, setFollowSystem] = React.useState(false)

  // ---- Layout ----
  const [showAIPanel, setShowAIPanel] = React.useState(true)
  const [showBottomPanel, setShowBottomPanel] = React.useState(true)
  const [compactSidebar, setCompactSidebar] = React.useState(false)
  const [doubleLineTabs, setDoubleLineTabs] = React.useState(true)

  // ---- Code / Display ----
  const [codeTheme, setCodeTheme] = React.useState('One Dark Pro')
  const [uiScale, setUiScale] = React.useState('100%')
  const [fontSize, setFontSize] = React.useState(14)
  const [regionFormat, setRegionFormat] = React.useState('中国 (UTC+8)')
  const [weekStart, setWeekStart] = React.useState('周一')

  // ---- Effects ----
  const [animations, setAnimations] = React.useState(true)
  const [glassEffect, setGlassEffect] = React.useState(true)
  const [highContrast, setHighContrast] = React.useState(false)
  const [reduceMotion, setReduceMotion] = React.useState(false)

  // ---- Load all settings on mount ----
  React.useEffect(() => {
    let cancelled = false

    async function loadAll() {
      try {
        const keys = [
          'theme_mode',
          'theme_color',
          'follow_system',
          'show_ai_panel',
          'show_bottom_panel',
          'compact_sidebar',
          'double_line_tabs',
          'code_theme',
          'ui_scale',
          'font_size',
          'region_format',
          'week_start',
          'animations',
          'glass_effect',
          'high_contrast',
          'reduce_motion',
        ]

        const results = await Promise.all(keys.map((k) => getSetting(k)))
        if (cancelled) return

        const vals: Record<string, string | null> = {}
        keys.forEach((k, i) => (vals[k] = results[i]))

        if (vals.theme_color) setThemeColor(vals.theme_color)
        if (vals.follow_system) setFollowSystem(vals.follow_system === 'true')
        if (vals.show_ai_panel) setShowAIPanel(vals.show_ai_panel === 'true')
        if (vals.show_bottom_panel) setShowBottomPanel(vals.show_bottom_panel === 'true')
        if (vals.compact_sidebar) setCompactSidebar(vals.compact_sidebar === 'true')
        if (vals.double_line_tabs) setDoubleLineTabs(vals.double_line_tabs === 'true')
        if (vals.code_theme) setCodeTheme(vals.code_theme)
        if (vals.ui_scale) setUiScale(vals.ui_scale)
        if (vals.font_size) {
          const n = parseInt(vals.font_size, 10)
          if (!isNaN(n)) setFontSize(n)
        }
        if (vals.region_format) setRegionFormat(vals.region_format)
        if (vals.week_start) setWeekStart(vals.week_start)
        if (vals.animations) setAnimations(vals.animations === 'true')
        if (vals.glass_effect) setGlassEffect(vals.glass_effect === 'true')
        if (vals.high_contrast) setHighContrast(vals.high_contrast === 'true')
        if (vals.reduce_motion) setReduceMotion(vals.reduce_motion === 'true')
      } catch {
        // useDefaults
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    loadAll()
    return () => {
      cancelled = true
    }
  }, [getSetting])

  // ---- Persist helper ----
  const save = React.useCallback(
    (key: string, value: string) => {
      setSetting(key, value).catch(() => {})
    },
    [setSetting],
  )

  // ---- Constants ----
  const tabs = [
    { id: 'appearance', label: '外观', icon: Palette },
    { id: 'ai', label: 'AI 模型', icon: Settings },
    { id: 'data', label: '数据与同步', icon: Download },
    { id: 'about', label: '关于', icon: Info },
  ]

  const themeColors = ['#6366F1', '#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#EC4899']

  const scaleOptions = ['90%', '100%', '110%', '125%', '150%']
  const regionOptions = ['中国 (UTC+8)']
  const weekStartOptions = ['周一', '周日']

  const codeThemeOptions = ['One Dark Pro', 'Github Dark', 'Dracula']
  const codeThemeColors: Record<
    string,
    {
      bg: string
      border: string
      keyword: string
      func: string
      string: string
      text: string
    }
  > = {
    'One Dark Pro': {
      bg: '#1E1E1E',
      border: '#333',
      keyword: '#569CD6',
      func: '#DCDCAA',
      string: '#C586C0',
      text: '#D4D4D4',
    },
    'Github Dark': {
      bg: '#0D1117',
      border: '#21262D',
      keyword: '#FF7B72',
      func: '#D2A8FF',
      string: '#A5D6FF',
      text: '#C9D1D9',
    },
    Dracula: {
      bg: '#282A36',
      border: '#44475A',
      keyword: '#FF79C6',
      func: '#50FA7B',
      string: '#F1FA8C',
      text: '#F8F8F2',
    },
  }

  // ---- Handlers ----
  const handleToggle = (
    key: string,
    value: boolean,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    const next = !value
    setter(next)
    save(key, String(next))
    // 已知的需要即时作用到 DOM 的开关
    if (key === 'reduce_motion') applyReduceMotion(next)
  }

  const handleThemeMode = (mode: ThemeMode) => {
    setTheme(mode) // store 内部：写 DOM + 持久化 theme_mode + follow_system=false
    setFollowSystem(false)
  }

  const handleFollowSystem = () => {
    const next = !followSystem
    setFollowSystem(next)
    save('follow_system', String(next))
    // 跟随系统时按系统偏好应用；关闭时回到用户选定主题。
    applyTheme(next ? resolveTheme(theme, true) : theme)
  }

  const handleThemeColor = (color: string) => {
    setThemeColor(color)
    save('theme_color', color)
    applyThemeColor(color)
  }

  const handleScale = (scale: string) => {
    setUiScale(scale)
    save('ui_scale', scale)
    applyScale(scale)
  }

  const handleFontSize = (value: number) => {
    const clamped = Math.min(24, Math.max(12, value))
    setFontSize(clamped)
    save('font_size', String(clamped))
    applyFontSize(clamped)
  }

  const handleRegion = (value: string) => {
    setRegionFormat(value)
    save('region_format', value)
  }

  const handleWeekStart = (value: string) => {
    setWeekStart(value)
    save('week_start', value)
  }

  const handleCodeTheme = (value: string) => {
    setCodeTheme(value)
    save('code_theme', value)
  }

  const handleResetDefaults = () => {
    setTheme('dark')
    setThemeColor('#6366F1')
    setFollowSystem(false)
    setShowAIPanel(true)
    setShowBottomPanel(true)
    setCompactSidebar(false)
    setDoubleLineTabs(true)
    setCodeTheme('One Dark Pro')
    setUiScale('100%')
    setFontSize(14)
    setRegionFormat('中国 (UTC+8)')
    setWeekStart('周一')
    setAnimations(true)
    setGlassEffect(true)
    setHighContrast(false)
    setReduceMotion(false)

    const defaults: Record<string, string> = {
      theme_mode: 'dark',
      theme_color: '#6366F1',
      follow_system: 'false',
      show_ai_panel: 'true',
      show_bottom_panel: 'true',
      compact_sidebar: 'false',
      double_line_tabs: 'true',
      code_theme: 'One Dark Pro',
      ui_scale: '100%',
      font_size: '14',
      region_format: '中国 (UTC+8)',
      week_start: '周一',
      animations: 'true',
      glass_effect: 'true',
      high_contrast: 'false',
      reduce_motion: 'false',
    }
    Object.entries(defaults).forEach(([k, v]) => save(k, v))
    // 立即把默认外观应用到 DOM
    applyThemeColor('#6366F1')
    applyScale('100%')
    applyFontSize(14)
    applyReduceMotion(false)
  }

  const handleSave = () => {
    // 各项已即时持久化并应用；此处再整体重应用一次，作为"保存"的明确反馈。
    applyTheme(followSystem ? resolveTheme(theme, true) : theme)
    applyThemeColor(themeColor)
    applyScale(uiScale)
    applyFontSize(fontSize)
    applyReduceMotion(reduceMotion)
  }

  // ---- Layout settings data ----
  const layoutSettings = [
    {
      title: '显示右侧 AI 面板',
      desc: '',
      key: 'show_ai_panel',
      value: showAIPanel,
      setter: setShowAIPanel,
    },
    {
      title: '显示底部面板',
      desc: '',
      key: 'show_bottom_panel',
      value: showBottomPanel,
      setter: setShowBottomPanel,
    },
    {
      title: '紧凑侧边栏',
      desc: '减少侧边栏宽度，显示更多内容',
      key: 'compact_sidebar',
      value: compactSidebar,
      setter: setCompactSidebar,
    },
    {
      title: '标签页双行显示',
      desc: '在空间不足时使用双行标签',
      key: 'double_line_tabs',
      value: doubleLineTabs,
      setter: setDoubleLineTabs,
    },
  ]

  const effectSettings = [
    {
      title: '动画效果',
      desc: '开启界面过渡动画效果',
      key: 'animations',
      value: animations,
      setter: setAnimations,
    },
    {
      title: '毛玻璃效果',
      desc: '为部分面板启用毛玻璃效果',
      key: 'glass_effect',
      value: glassEffect,
      setter: setGlassEffect,
    },
    {
      title: '高对比度模式',
      desc: '增强界面对比度，适合视力敏感用户',
      key: 'high_contrast',
      value: highContrast,
      setter: setHighContrast,
    },
    {
      title: '减少动态效果',
      desc: '减少不必要的动画，提升性能',
      key: 'reduce_motion',
      value: reduceMotion,
      setter: setReduceMotion,
    },
  ]

  // ---- Code preview ----
  const currentThemeColors = codeThemeColors[codeTheme] || codeThemeColors['One Dark Pro']

  // ---- Render ----
  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-y-auto">
      <div className="max-w-[1000px] w-full mx-auto p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">设置</h1>
          <p className="text-sm text-[var(--color-text-muted)]">自定义你的学习与编程环境</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[var(--color-border-subtle)] overflow-x-auto pb-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap',
                activeTab === tab.id
                  ? 'text-[var(--color-accent-purple)] border-[var(--color-accent-purple)]'
                  : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]',
              )}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Settings Content */}
        {activeTab === 'appearance' && (
          <div className="space-y-6 pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column 1 */}
              <div className="space-y-6">
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <h3 className="font-semibold text-white text-[15px] mb-4">主题模式</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    选择应用的整体主题风格
                  </p>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                      onClick={() => handleThemeMode('dark')}
                      className={cn(
                        'relative rounded-lg overflow-hidden border-2 text-left transition-all',
                        theme === 'dark'
                          ? 'border-[var(--color-accent-purple)]'
                          : 'border-[var(--color-border-subtle)]',
                      )}
                    >
                      <div className="bg-[#1C2030] h-20 w-full p-2 flex flex-col gap-1.5">
                        <div className="w-full h-3 bg-[#2A2F45] rounded-sm"></div>
                        <div className="w-2/3 h-2 bg-[#2A2F45] rounded-sm"></div>
                        <div className="w-full h-8 bg-[#2A2F45] rounded-sm mt-auto"></div>
                      </div>
                      <div className="p-3 bg-[var(--color-bg-panel)]">
                        <p className="text-sm font-medium text-white mb-0.5">深色模式</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">护眼舒适</p>
                      </div>
                      {theme === 'dark' && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-[var(--color-accent-purple)] rounded-full flex items-center justify-center text-white">
                          <Check size={12} />
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => handleThemeMode('light')}
                      className={cn(
                        'relative rounded-lg overflow-hidden border-2 text-left transition-all',
                        theme === 'light'
                          ? 'border-[var(--color-accent-purple)]'
                          : 'border-[var(--color-border-subtle)]',
                      )}
                    >
                      <div className="bg-gray-100 h-20 w-full p-2 flex flex-col gap-1.5">
                        <div className="w-full h-3 bg-white rounded-sm border border-gray-200"></div>
                        <div className="w-2/3 h-2 bg-white rounded-sm border border-gray-200"></div>
                        <div className="w-full h-8 bg-white rounded-sm mt-auto border border-gray-200"></div>
                      </div>
                      <div className="p-3 bg-[var(--color-bg-panel)]">
                        <p className="text-sm font-medium text-white mb-0.5">浅色模式</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">清爽明亮</p>
                      </div>
                      {theme === 'light' && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-[var(--color-accent-purple)] rounded-full flex items-center justify-center text-white">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">跟随系统</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        自动跟随系统的深色/浅色模式
                      </p>
                    </div>
                    <ToggleSwitch active={followSystem} onToggle={handleFollowSystem} />
                  </div>
                </div>

                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <h3 className="font-semibold text-white text-[15px] mb-4">布局设置</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">自定义工作台布局</p>

                  <div className="space-y-4">
                    {layoutSettings.map((setting) => (
                      <div key={setting.key} className="flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 text-[var(--color-accent-purple)]">
                            <Monitor size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{setting.title}</p>
                            {setting.desc && (
                              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                                {setting.desc}
                              </p>
                            )}
                          </div>
                        </div>
                        <ToggleSwitch
                          active={setting.value}
                          onToggle={() => handleToggle(setting.key, setting.value, setting.setter)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-6">
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <h3 className="font-semibold text-white text-[15px] mb-4">主题色</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    选择你喜欢的主题色彩
                  </p>

                  <div className="flex flex-wrap gap-3 mb-6">
                    {themeColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => handleThemeColor(color)}
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                          themeColor === color
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--color-bg-card)]'
                            : 'hover:scale-110',
                        )}
                        style={{ backgroundColor: color }}
                      >
                        {themeColor === color && <Check size={14} className="text-white" />}
                      </button>
                    ))}
                    <button className="w-8 h-8 rounded-full border border-[var(--color-border-subtle)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-white transition-colors">
                      <span className="text-lg leading-none mb-0.5">+</span>
                    </button>
                  </div>

                  <h3 className="font-semibold text-white text-[15px] mb-4">界面缩放</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    调整界面整体缩放比例
                  </p>
                  <div className="flex bg-[var(--color-bg-panel)] rounded-lg p-1 mb-6 border border-[var(--color-border-subtle)]">
                    {scaleOptions.map((scale) => (
                      <button
                        key={scale}
                        onClick={() => handleScale(scale)}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                          uiScale === scale
                            ? 'bg-[var(--color-accent-purple)] text-white shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-white',
                        )}
                      >
                        {scale}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-white text-[15px]">字体大小</h3>
                    <span className="text-xs text-[var(--color-text-muted)]">{fontSize}px</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">设置界面字体大小</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--color-text-muted)]">A</span>
                    <input
                      type="range"
                      min={12}
                      max={24}
                      value={fontSize}
                      onChange={(e) => handleFontSize(parseInt(e.target.value, 10))}
                      className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--color-accent-purple) 0%, var(--color-accent-purple) ${((fontSize - 12) / 12) * 100}%, #2A2F45 ${((fontSize - 12) / 12) * 100}%, #2A2F45 100%)`,
                        accentColor: 'var(--color-accent-purple)',
                      }}
                    />
                    <span className="text-base text-[var(--color-text-muted)]">A</span>
                  </div>
                </div>

                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <h3 className="font-semibold text-white text-[15px] mb-4">语言与区域</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    设置应用语言和区域偏好
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                        区域格式
                      </label>
                      <select
                        value={regionFormat}
                        onChange={(e) => handleRegion(e.target.value)}
                        className="w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-accent-purple)] appearance-none"
                      >
                        {regionOptions.map((opt) => (
                          <option key={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                        每周起始日
                      </label>
                      <select
                        value={weekStart}
                        onChange={(e) => handleWeekStart(e.target.value)}
                        className="w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-accent-purple)] appearance-none"
                      >
                        {weekStartOptions.map((opt) => (
                          <option key={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 3 */}
              <div className="space-y-6">
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <h3 className="font-semibold text-white text-[15px] mb-4">代码主题</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    选择编辑器的代码配色方案
                  </p>

                  <select
                    value={codeTheme}
                    onChange={(e) => handleCodeTheme(e.target.value)}
                    className="w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-accent-purple)] appearance-none mb-4"
                  >
                    {codeThemeOptions.map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>

                  <div
                    className="rounded-lg p-4 font-mono text-xs overflow-hidden border"
                    style={{
                      backgroundColor: currentThemeColors.bg,
                      borderColor: currentThemeColors.border,
                    }}
                  >
                    <pre className="leading-relaxed" style={{ color: currentThemeColors.text }}>
                      <span style={{ color: currentThemeColors.keyword }}>def</span>{' '}
                      <span style={{ color: currentThemeColors.func }}>two_sum</span>
                      (nums, target): hash_map = {'{'} {'}'}
                      <span style={{ color: currentThemeColors.keyword }}>for</span> i, num{' '}
                      <span style={{ color: currentThemeColors.keyword }}>in</span>{' '}
                      <span style={{ color: currentThemeColors.func }}>enumerate</span>
                      (nums): complement = target - num{' '}
                      <span style={{ color: currentThemeColors.keyword }}>if</span> complement{' '}
                      <span style={{ color: currentThemeColors.keyword }}>in</span> hash_map:{' '}
                      <span style={{ color: currentThemeColors.keyword }}>return</span>{' '}
                      [hash_map[complement], i] hash_map[num] = i
                    </pre>
                  </div>

                  <div className="mt-4 text-right">
                    <button className="text-xs text-[var(--color-accent-purple)] hover:text-[#7C3AED] transition-colors">
                      在编辑器中预览 →
                    </button>
                  </div>
                </div>

                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <h3 className="font-semibold text-white text-[15px] mb-4">其他外观设置</h3>

                  <div className="space-y-4">
                    {effectSettings.map((setting) => (
                      <div key={setting.key} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{setting.title}</p>
                          {setting.desc && (
                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                              {setting.desc}
                            </p>
                          )}
                        </div>
                        <ToggleSwitch
                          active={setting.value}
                          onToggle={() => handleToggle(setting.key, setting.value, setting.setter)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6 pb-24">
            <AIModelSettings />
          </div>
        )}

        {activeTab === 'data' && (
          <div className="space-y-6 pb-24">
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-white text-[15px] mb-4">数据管理</h3>
              <p className="text-xs text-[var(--color-text-muted)] mb-6">
                导出和导入你的学习数据与配置
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => exportData().catch(() => {})}
                  className="flex items-center gap-3 p-4 rounded-lg border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-purple)] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-purple)]/10 flex items-center justify-center">
                    <Download size={18} className="text-[var(--color-accent-purple)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">导出数据</p>
                    <p className="text-xs text-[var(--color-text-muted)]">将数据保存为备份文件</p>
                  </div>
                </button>

                <button
                  onClick={() => importData().catch(() => {})}
                  className="flex items-center gap-3 p-4 rounded-lg border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-purple)] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-purple)]/10 flex items-center justify-center">
                    <Upload size={18} className="text-[var(--color-accent-purple)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">导入数据</p>
                    <p className="text-xs text-[var(--color-text-muted)]">从备份文件恢复数据</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="space-y-6 pb-24">
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-white text-[15px] mb-4">关于</h3>

              {platformInfo && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-muted)]">应用版本</span>
                    <span className="text-sm text-white font-mono">{platformInfo.appVersion}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-muted)]">Electron</span>
                    <span className="text-sm text-white font-mono">
                      {platformInfo.electronVersion}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-muted)]">Chrome</span>
                    <span className="text-sm text-white font-mono">
                      {platformInfo.chromeVersion}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-muted)]">Node.js</span>
                    <span className="text-sm text-white font-mono">{platformInfo.nodeVersion}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[var(--color-border-subtle)]">
                    <span className="text-sm text-[var(--color-text-muted)]">系统平台</span>
                    <span className="text-sm text-white font-mono">
                      {platformInfo.platform} ({platformInfo.arch})
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-[var(--color-text-muted)]">系统版本</span>
                    <span className="text-sm text-white font-mono">{platformInfo.osVersion}</span>
                  </div>
                </div>
              )}

              {!loaded && <p className="text-sm text-[var(--color-text-muted)]">加载中...</p>}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]/80 backdrop-blur-md flex items-center justify-between">
        <button
          onClick={handleResetDefaults}
          className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors"
        >
          <RotateCcw size={16} />
          重置为默认设置
        </button>
        <button
          onClick={handleSave}
          className="bg-[var(--color-accent-purple)] hover:bg-[#7C3AED] text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
        >
          <Check size={16} />
          保存设置
        </button>
      </div>
    </div>
  )
}
