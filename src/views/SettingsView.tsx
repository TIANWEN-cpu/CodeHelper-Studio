import React from 'react'
import {
  Palette,
  Check,
  RotateCcw,
  Settings,
  Download,
  Upload,
  Info,
  Gauge,
  Wallpaper,
  Wand2,
  Sparkles,
  UserRound,
  ImagePlus,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsData } from '../hooks/useSettingsData'
import { useAppStore } from '../store'
import { CodexPetSprite } from '../components/CodexPetSprite'
import {
  BUILT_IN_FIREFLY_PET,
  DEFAULT_PET_ID,
  importPetFromFile,
  installPetBySlug,
  listInstalledPets,
  persistPetSource,
  readStoredPetSource,
  selectPetDirectory,
  type CodexPetDefinition,
} from '../lib/pets'
import {
  applyThemeColor,
  applyScale,
  applyFontSize,
  applyReduceMotion,
  applyGlassEffect,
  applyHighContrast,
  applyTheme,
  resolveTheme,
  type AnimationLevel,
  type BackgroundStyle,
  type ThemeMode,
  type VisualTheme,
} from '../lib/appearance'
import { AIModelSettings } from './settings/AIModelSettings'
import { REGION_OPTIONS } from '../lib/locale'
import { CODE_THEME_OPTIONS, DEFAULT_CODE_THEME } from '../lib/codeThemes'
import { CodeEditor } from '../components/editor/CodeEditor'
import { clearIpcCache } from '../api/ipc'
import {
  PROFILE_AVATAR_KEY,
  PROFILE_NAME_KEY,
  clearLearningRecords,
  saveUserProfile,
} from '../services/settingsService'

// 代码主题卡片的实时预览片段。
const CODE_THEME_PREVIEW = `def greet(name):
    # 打招呼
    msg = f"Hello, {name}!"
    print(msg)
    return len(msg)

greet("CodeHelper")`

const VISUAL_THEMES: Array<{
  id: VisualTheme
  label: string
  desc: string
  swatches: string[]
}> = [
  {
    id: 'codex',
    label: '深空专注',
    desc: '靛紫科技感，适合长时间编码',
    swatches: ['#6366F1', '#8B5CF6', '#22D3EE'],
  },
  {
    id: 'aurora',
    label: '极光晨雾',
    desc: '青绿与蓝紫的柔和学习氛围',
    swatches: ['#14B8A6', '#3B82F6', '#A78BFA'],
  },
  {
    id: 'nebula',
    label: '星云玫紫',
    desc: '更鲜活的创作感，适合 AI 对话',
    swatches: ['#EC4899', '#8B5CF6', '#F59E0B'],
  },
  {
    id: 'graphite',
    label: '石墨专业',
    desc: '更收敛的工程师工作台风格',
    swatches: ['#64748B', '#38BDF8', '#22C55E'],
  },
]

const BACKGROUND_STYLES: Array<{ id: BackgroundStyle; label: string; desc: string }> = [
  { id: 'soft', label: '柔光', desc: '低干扰的渐变层' },
  { id: 'aurora', label: '极光', desc: '细腻流动的氛围光' },
  { id: 'grid', label: '网格', desc: '轻量工程网格纹理' },
  { id: 'none', label: '纯净', desc: '关闭装饰背景' },
]

const ANIMATION_LEVELS: Array<{ id: AnimationLevel; label: string; desc: string }> = [
  { id: 'calm', label: '克制', desc: '减少装饰运动' },
  { id: 'balanced', label: '均衡', desc: '流畅但不分心' },
  { id: 'expressive', label: '灵动', desc: '桌宠与背景更活泼' },
]

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

type DataActionStatus =
  | { kind: 'idle'; message: '' }
  | { kind: 'loading' | 'success' | 'error' | 'confirm'; message: string }

type PetActionStatus =
  | { kind: 'idle'; message: '' }
  | { kind: 'loading' | 'success' | 'error'; message: string }

function getDataActionError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function SparklesPreview() {
  return (
    <span className="relative inline-flex h-5 w-5 items-center justify-center">
      <span className="absolute h-4 w-4 rounded-full bg-[var(--color-accent-purple)]/25" />
      <span className="h-2 w-2 rounded-full bg-[var(--color-accent-purple)] shadow-[0_0_18px_var(--color-accent-purple)]" />
    </span>
  )
}

const PENDING_SETTINGS_TAB_KEY = 'codehelper.pendingSettingsTab'
const MAX_PROFILE_AVATAR_LENGTH = 9500

function isImageAvatar(value: string) {
  return /^(data:image\/|https?:\/\/|blob:)/i.test(value.trim())
}

function renderAvatarPreview(avatar: string, name: string, sizeClass = 'h-20 w-20') {
  const trimmedAvatar = avatar.trim()
  const fallback = name.trim().slice(0, 1).toUpperCase() || '同'

  if (isImageAvatar(trimmedAvatar)) {
    return (
      <img
        src={trimmedAvatar}
        alt={`${name || '同学'}的头像预览`}
        className={cn(sizeClass, 'rounded-full object-cover')}
      />
    )
  }

  if (trimmedAvatar) {
    return (
      <span className={cn(sizeClass, 'flex items-center justify-center rounded-full text-3xl')}>
        {trimmedAvatar.slice(0, 2)}
      </span>
    )
  }

  return (
    <span
      className={cn(
        sizeClass,
        'flex items-center justify-center rounded-full bg-[var(--color-accent-purple)]/15 text-2xl font-bold text-[var(--color-accent-purple)]',
      )}
    >
      {fallback}
    </span>
  )
}

async function fileToCompactAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择 PNG、JPG 或 WebP 图片。')
  }

  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('头像图片读取失败。'))
      img.src = imageUrl
    })

    const maxSize = 160
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前环境无法处理头像图片。')
    ctx.drawImage(image, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/webp', 0.72)
    if (dataUrl.length > MAX_PROFILE_AVATAR_LENGTH) {
      throw new Error('头像图片仍然过大，请换一张更小的图片，或使用字符头像。')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

// ---- Component ----

export function SettingsView() {
  const { getSetting, setSetting, platformInfo, exportData, importData } = useSettingsData()

  // 主题(dark/light)由全局 store 统一管理，使侧边栏/Header/设置页三处同步。
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  // 布局偏好同样由全局 store 管理：此处开关写的是"启动默认值"并持久化，
  // 侧边栏折叠键 / 工作区底部面板等运行时控件读同一份 store 状态。
  const showAITutor = useAppStore((s) => s.showAITutor)
  const setShowAITutor = useAppStore((s) => s.setShowAITutor)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed)
  const bottomPanelCollapsed = useAppStore((s) => s.bottomPanelCollapsed)
  const setBottomPanelCollapsed = useAppStore((s) => s.setBottomPanelCollapsed)
  const doubleLineTabs = useAppStore((s) => s.doubleLineTabs)
  const setDoubleLineTabs = useAppStore((s) => s.setDoubleLineTabs)
  const dateRegion = useAppStore((s) => s.dateRegion)
  const setDateRegion = useAppStore((s) => s.setDateRegion)
  const weekStart = useAppStore((s) => s.weekStart)
  const setWeekStart = useAppStore((s) => s.setWeekStart)
  const codeTheme = useAppStore((s) => s.codeTheme)
  const setCodeTheme = useAppStore((s) => s.setCodeTheme)
  const visualTheme = useAppStore((s) => s.visualTheme)
  const setVisualTheme = useAppStore((s) => s.setVisualTheme)
  const backgroundStyle = useAppStore((s) => s.backgroundStyle)
  const setBackgroundStyle = useAppStore((s) => s.setBackgroundStyle)
  const animationLevel = useAppStore((s) => s.animationLevel)
  const setAnimationLevel = useAppStore((s) => s.setAnimationLevel)
  const aiPetEnabled = useAppStore((s) => s.aiPetEnabled)
  const setAIPetEnabled = useAppStore((s) => s.setAIPetEnabled)

  const [activeTab, setActiveTab] = React.useState(() => {
    try {
      return window.sessionStorage.getItem(PENDING_SETTINGS_TAB_KEY) || 'appearance'
    } catch {
      return 'appearance'
    }
  })
  const [loaded, setLoaded] = React.useState(false)
  const [dataActionStatus, setDataActionStatus] = React.useState<DataActionStatus>({
    kind: 'idle',
    message: '',
  })
  const [profileName, setProfileName] = React.useState('')
  const [profileAvatar, setProfileAvatar] = React.useState('')
  const [profileActionStatus, setProfileActionStatus] = React.useState<DataActionStatus>({
    kind: 'idle',
    message: '',
  })
  const [clearLearningConfirm, setClearLearningConfirm] = React.useState(false)
  const [clearLearningStatus, setClearLearningStatus] = React.useState<DataActionStatus>({
    kind: 'idle',
    message: '',
  })
  const [availablePets, setAvailablePets] = React.useState<CodexPetDefinition[]>([
    BUILT_IN_FIREFLY_PET,
  ])
  const [selectedPetId, setSelectedPetId] = React.useState(DEFAULT_PET_ID)
  const [petSlug, setPetSlug] = React.useState('firefly')
  const [petActionStatus, setPetActionStatus] = React.useState<PetActionStatus>({
    kind: 'idle',
    message: '',
  })

  // ---- Appearance ----
  // 默认招牌靛色：与 @theme 的 --color-accent-primary 一致；选它时 applyThemeColor 回退原始靛→紫双色。
  const [themeColor, setThemeColor] = React.useState('#6366F1')
  const [followSystem, setFollowSystem] = React.useState(false)

  // ---- Code / Display ----
  const [uiScale, setUiScale] = React.useState('100%')
  const [fontSize, setFontSize] = React.useState(14)

  // ---- Effects ----
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
          'ui_scale',
          'font_size',
          'glass_effect',
          'high_contrast',
          'reduce_motion',
          'visual_theme',
          'background_style',
          'animation_level',
          'ai_pet_enabled',
          PROFILE_NAME_KEY,
          PROFILE_AVATAR_KEY,
        ]

        const results = await Promise.all(keys.map((k) => getSetting(k)))
        if (cancelled) return

        const vals: Record<string, string | null> = {}
        keys.forEach((k, i) => (vals[k] = results[i]))

        if (vals.theme_color) setThemeColor(vals.theme_color)
        if (vals.follow_system) setFollowSystem(vals.follow_system === 'true')
        if (vals.ui_scale) setUiScale(vals.ui_scale)
        if (vals.font_size) {
          const n = parseInt(vals.font_size, 10)
          if (!isNaN(n)) setFontSize(n)
        }
        if (vals.glass_effect) setGlassEffect(vals.glass_effect === 'true')
        if (vals.high_contrast) setHighContrast(vals.high_contrast === 'true')
        if (vals.reduce_motion) setReduceMotion(vals.reduce_motion === 'true')
        if (VISUAL_THEMES.some((item) => item.id === vals.visual_theme)) {
          setVisualTheme(vals.visual_theme as VisualTheme)
        }
        if (BACKGROUND_STYLES.some((item) => item.id === vals.background_style)) {
          setBackgroundStyle(vals.background_style as BackgroundStyle)
        }
        if (ANIMATION_LEVELS.some((item) => item.id === vals.animation_level)) {
          setAnimationLevel(vals.animation_level as AnimationLevel)
        }
        if (vals.ai_pet_enabled != null) setAIPetEnabled(vals.ai_pet_enabled === 'true')
        setProfileName(vals[PROFILE_NAME_KEY]?.trim() || '')
        setProfileAvatar(vals[PROFILE_AVATAR_KEY]?.trim() || '')
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
  }, [getSetting, setAIPetEnabled, setAnimationLevel, setBackgroundStyle, setVisualTheme])

  React.useEffect(() => {
    const applySettingsTab = (tab: unknown) => {
      if (
        typeof tab === 'string' &&
        ['account', 'appearance', 'ai', 'data', 'about'].includes(tab)
      ) {
        setActiveTab(tab)
      }
    }

    try {
      const pendingTab = window.sessionStorage.getItem(PENDING_SETTINGS_TAB_KEY)
      if (pendingTab) {
        applySettingsTab(pendingTab)
        window.sessionStorage.removeItem(PENDING_SETTINGS_TAB_KEY)
      }
    } catch {
      /* The custom event path below covers browser storage failures. */
    }

    const handleSettingsTab = (event: Event) => {
      applySettingsTab((event as CustomEvent).detail)
    }

    window.addEventListener('codehelper:settings-tab', handleSettingsTab)
    return () => window.removeEventListener('codehelper:settings-tab', handleSettingsTab)
  }, [])

  const refreshPets = React.useCallback(async () => {
    const pets = await listInstalledPets()
    const stored = readStoredPetSource()
    setAvailablePets(pets)
    setSelectedPetId(pets.some((pet) => pet.id === stored) ? stored : DEFAULT_PET_ID)
  }, [])

  React.useEffect(() => {
    refreshPets().catch(() => {})
  }, [refreshPets])

  // ---- Persist helper ----
  const save = React.useCallback(
    (key: string, value: string) => {
      setSetting(key, value).catch(() => {})
    },
    [setSetting],
  )

  // ---- Constants ----
  const tabs = [
    { id: 'account', label: '账户', icon: UserRound },
    { id: 'appearance', label: '外观', icon: Palette },
    { id: 'ai', label: 'AI 模型', icon: Settings },
    { id: 'data', label: '数据', icon: Download },
    { id: 'about', label: '关于', icon: Info },
  ]

  const themeColors = ['#6366F1', '#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#EC4899']

  const scaleOptions = ['90%', '100%', '110%', '125%', '150%']

  // ---- Handlers ----
  const handleToggle = (
    key: string,
    value: boolean,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    const next = !value
    setter(next)
    save(key, String(next))
    // 即时作用到 DOM 的开关
    if (key === 'reduce_motion') applyReduceMotion(next)
    else if (key === 'glass_effect') applyGlassEffect(next)
    else if (key === 'high_contrast') applyHighContrast(next)
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

  const handleResetDefaults = () => {
    setTheme('dark')
    setThemeColor('#6366F1')
    setFollowSystem(false)
    setUiScale('100%')
    setFontSize(14)
    setGlassEffect(true)
    setHighContrast(false)
    setReduceMotion(false)
    setVisualTheme('codex')
    setBackgroundStyle('soft')
    setAnimationLevel('balanced')
    setAIPetEnabled(true)
    // 布局默认值（同步 store + 持久化）
    setShowAITutor(false)
    setBottomPanelCollapsed(false)
    setSidebarCollapsed(false) // 内部持久化 compact_sidebar
    setDoubleLineTabs(true)
    setDateRegion('zh-CN') // 内部持久化 region_format
    setWeekStart('mon') // 内部持久化 week_start
    setCodeTheme(DEFAULT_CODE_THEME) // 内部持久化 code_theme

    const defaults: Record<string, string> = {
      theme_mode: 'dark',
      theme_color: '#6366F1',
      follow_system: 'false',
      ui_scale: '100%',
      font_size: '14',
      glass_effect: 'true',
      high_contrast: 'false',
      reduce_motion: 'false',
      visual_theme: 'codex',
      background_style: 'soft',
      animation_level: 'balanced',
      ai_pet_enabled: 'true',
      show_ai_panel: 'false',
      show_bottom_panel: 'true',
      compact_sidebar: 'false',
      double_line_tabs: 'true',
    }
    Object.entries(defaults).forEach(([k, v]) => save(k, v))
    // 立即把默认外观应用到 DOM
    applyThemeColor('#6366F1')
    applyScale('100%')
    applyFontSize(14)
    applyReduceMotion(false)
    applyGlassEffect(true)
    applyHighContrast(false)
  }

  const handleSaveProfile = React.useCallback(async () => {
    const name = profileName.trim().slice(0, 40)
    const avatar = profileAvatar.trim().slice(0, MAX_PROFILE_AVATAR_LENGTH)
    setProfileActionStatus({ kind: 'loading', message: '正在保存账户资料...' })
    try {
      await saveUserProfile({ name, avatar })
      setProfileName(name)
      setProfileAvatar(avatar)
      setProfileActionStatus({ kind: 'success', message: '账户资料已保存。' })
      window.dispatchEvent(new Event('codehelper:profile-changed'))
    } catch (error) {
      setProfileActionStatus({
        kind: 'error',
        message: getDataActionError(error, '保存账户资料失败。'),
      })
    }
  }, [profileAvatar, profileName])

  const handleAvatarFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      setProfileActionStatus({ kind: 'loading', message: '正在处理头像图片...' })
      try {
        const dataUrl = await fileToCompactAvatarDataUrl(file)
        setProfileAvatar(dataUrl)
        setProfileActionStatus({ kind: 'success', message: '头像已载入，保存后生效。' })
      } catch (error) {
        setProfileActionStatus({
          kind: 'error',
          message: getDataActionError(error, '头像处理失败。'),
        })
      }
    },
    [],
  )

  const handleClearLearningRecords = React.useCallback(async () => {
    if (!clearLearningConfirm) {
      setClearLearningConfirm(true)
      setClearLearningStatus({
        kind: 'confirm',
        message: '再次点击确认清空学习记录。',
      })
      return
    }

    setClearLearningStatus({ kind: 'loading', message: '正在清空学习记录...' })
    try {
      const result = await clearLearningRecords()
      const changedRows = Object.values(result.changed ?? {}).reduce((sum, value) => sum + value, 0)
      setClearLearningConfirm(false)
      setClearLearningStatus({
        kind: 'success',
        message:
          changedRows > 0
            ? `已清空学习记录，共重置/删除 ${changedRows} 条记录。`
            : '学习记录已是空的。',
      })
      clearIpcCache()
      window.dispatchEvent(new Event('codehelper:learning-records-cleared'))
    } catch (error) {
      setClearLearningStatus({
        kind: 'error',
        message: getDataActionError(error, '清空学习记录失败。'),
      })
    }
  }, [clearLearningConfirm])

  const handleSave = async () => {
    if (activeTab === 'account') {
      await handleSaveProfile()
      return
    }
    // 各项已即时持久化并应用；此处再整体重应用一次，作为"保存"的明确反馈。
    applyTheme(followSystem ? resolveTheme(theme, true) : theme)
    applyThemeColor(themeColor)
    applyScale(uiScale)
    applyFontSize(fontSize)
    applyReduceMotion(reduceMotion)
    applyGlassEffect(glassEffect)
    applyHighContrast(highContrast)
    setVisualTheme(visualTheme)
    setBackgroundStyle(backgroundStyle)
    setAnimationLevel(animationLevel)
    setAIPetEnabled(aiPetEnabled)
  }

  const handleSelectPet = (id: string) => {
    setSelectedPetId(id)
    persistPetSource(id)
    window.dispatchEvent(new Event('codehelper:pet-changed'))
  }

  const handleInstallPetSlug = async () => {
    const slug = petSlug.trim().toLowerCase()
    if (!slug) return
    setPetActionStatus({ kind: 'loading', message: `正在安装 ${slug}...` })
    const result = await installPetBySlug(slug)
    if (!result.ok || !result.pet) {
      setPetActionStatus({ kind: 'error', message: result.error || '安装失败' })
      return
    }
    await refreshPets()
    handleSelectPet(result.pet.id)
    setPetActionStatus({ kind: 'success', message: `已安装 ${result.pet.displayName}` })
  }

  const handleImportPet = async (mode: 'file' | 'directory') => {
    setPetActionStatus({ kind: 'loading', message: '正在导入桌宠...' })
    const result = mode === 'file' ? await importPetFromFile() : await selectPetDirectory()
    if (!result.ok || !result.pet) {
      setPetActionStatus({ kind: 'error', message: result.error || '导入失败' })
      return
    }
    await refreshPets()
    handleSelectPet(result.pet.id)
    setPetActionStatus({ kind: 'success', message: `已导入 ${result.pet.displayName}` })
  }

  const handleExportData = React.useCallback(async () => {
    setDataActionStatus({ kind: 'loading', message: '正在导出数据...' })
    try {
      await exportData()
      setDataActionStatus({ kind: 'success', message: '数据导出完成。' })
    } catch (error) {
      setDataActionStatus({
        kind: 'error',
        message: getDataActionError(error, '导出数据失败。'),
      })
    }
  }, [exportData])

  const handleImportData = React.useCallback(async () => {
    setDataActionStatus({ kind: 'loading', message: '正在导入数据...' })
    try {
      await importData()
      setDataActionStatus({ kind: 'success', message: '数据导入完成。' })
    } catch (error) {
      setDataActionStatus({
        kind: 'error',
        message: getDataActionError(error, '导入数据失败。'),
      })
    }
  }, [importData])

  const effectSettings = [
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
      desc: '优先关闭背景和桌宠动效，提升性能',
      key: 'reduce_motion',
      value: reduceMotion,
      setter: setReduceMotion,
    },
  ]

  // 布局开关：直接读写全局 store（运行时控件与之同步），并把"启动默认"持久化到数据库。
  const layoutSettings = [
    {
      title: '显示右侧 AI 面板',
      desc: '启动时自动展开 AI 辅导面板',
      active: showAITutor,
      onToggle: () => {
        const next = !showAITutor
        setShowAITutor(next)
        save('show_ai_panel', String(next))
      },
    },
    {
      title: '显示底部面板',
      desc: '进入工作区时默认展开运行输出面板',
      active: !bottomPanelCollapsed,
      onToggle: () => {
        // active 表示"显示"；当前折叠 ⇒ 切换为显示。
        const nextShown = bottomPanelCollapsed
        setBottomPanelCollapsed(!nextShown)
        save('show_bottom_panel', String(nextShown))
      },
    },
    {
      title: '紧凑侧边栏',
      desc: '默认收起左侧导航栏，仅显示图标',
      active: sidebarCollapsed,
      // setSidebarCollapsed 内部已持久化 compact_sidebar。
      onToggle: () => setSidebarCollapsed(!sidebarCollapsed),
    },
    {
      title: '标签页双行显示',
      desc: '编辑器标签分两行显示文件名与语言信息',
      active: doubleLineTabs,
      onToggle: () => {
        const next = !doubleLineTabs
        setDoubleLineTabs(next)
        save('double_line_tabs', String(next))
      },
    },
  ]

  // ---- Render ----
  return (
    <div className="settings-view h-full flex flex-col bg-[var(--color-bg-base)] overflow-y-auto">
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
        {activeTab === 'account' && (
          <div className="space-y-6 pb-24">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)]">
                    <UserRound size={19} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                      账户资料
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      自定义个人页展示的昵称和头像
                    </p>
                  </div>
                </div>

                {profileActionStatus.kind !== 'idle' && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={cn(
                      'mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                      profileActionStatus.kind === 'error'
                        ? 'border-red-500/40 bg-red-500/10 text-red-200'
                        : profileActionStatus.kind === 'success'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)]',
                    )}
                  >
                    {profileActionStatus.kind === 'success' ? (
                      <Check size={14} />
                    ) : (
                      <Info size={14} />
                    )}
                    <span>{profileActionStatus.message}</span>
                  </div>
                )}

                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">
                      显示名称
                    </span>
                    <input
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value.slice(0, 40))}
                      placeholder="同学"
                      maxLength={40}
                      className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-purple)]"
                      data-profile-name-input
                    />
                  </label>

                  <div>
                    <span className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]">
                      头像
                    </span>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                      <div
                        className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]"
                        data-profile-avatar-preview
                      >
                        {renderAvatarPreview(profileAvatar, profileName, 'h-24 w-24')}
                      </div>

                      <div className="space-y-3">
                        <input
                          value={profileAvatar}
                          onChange={(event) =>
                            setProfileAvatar(event.target.value.slice(0, MAX_PROFILE_AVATAR_LENGTH))
                          }
                          placeholder="输入一个字符、emoji，或粘贴图片 URL"
                          className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent-purple)]"
                          data-profile-avatar-input
                        />
                        <div className="flex flex-wrap gap-2">
                          {['同', '学', '码', 'AI', '✨'].map((avatar) => (
                            <button
                              key={avatar}
                              type="button"
                              onClick={() => setProfileAvatar(avatar)}
                              className={cn(
                                'h-9 min-w-9 rounded-lg border px-2 text-sm transition-colors',
                                profileAvatar === avatar
                                  ? 'settings-soft-selected border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 text-[var(--color-text-primary)]'
                                  : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                              )}
                            >
                              {avatar}
                            </button>
                          ))}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">
                            <ImagePlus size={14} />
                            选择图片
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={handleAvatarFileChange}
                              className="sr-only"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setProfileAvatar('')}
                            className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                          >
                            清除头像
                          </button>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                          图片会在本地压缩后保存；如果图片过大，可以改用字符头像。
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={profileActionStatus.kind === 'loading'}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent-purple)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                    data-profile-save-button
                  >
                    <Check size={16} />
                    保存账户资料
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <p className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]">
                    个人页预览
                  </p>
                  <div className="flex flex-col items-center rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-5 text-center">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--color-bg-base)]">
                      {renderAvatarPreview(profileAvatar, profileName)}
                    </div>
                    <p className="mt-3 text-base font-semibold text-[var(--color-text-primary)]">
                      {profileName.trim() || '同学'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      账户资料会同步到个人主页
                    </p>
                  </div>
                </div>

                <div className="bg-[var(--color-bg-card)] border border-red-500/25 rounded-xl p-5 shadow-sm">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-300">
                      <AlertTriangle size={17} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        学习记录
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                        清空课程进度、刷题提交、错题、复习计划、XP、连续天数、热力图、练习草稿和计时。
                      </p>
                    </div>
                  </div>
                  <p className="mb-4 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                    不会删除题库、知识库、AI 配置、账户资料和课堂笔记。
                  </p>

                  {clearLearningStatus.kind !== 'idle' && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={cn(
                        'mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                        clearLearningStatus.kind === 'error'
                          ? 'border-red-500/40 bg-red-500/10 text-red-200'
                          : clearLearningStatus.kind === 'success'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-200',
                      )}
                    >
                      {clearLearningStatus.kind === 'success' ? (
                        <Check size={14} />
                      ) : (
                        <Info size={14} />
                      )}
                      <span>{clearLearningStatus.message}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleClearLearningRecords}
                      disabled={clearLearningStatus.kind === 'loading'}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        clearLearningConfirm
                          ? 'bg-red-600 hover:bg-red-500'
                          : 'bg-red-500/80 hover:bg-red-500',
                      )}
                      data-clear-learning-records-button
                    >
                      <Trash2 size={15} />
                      {clearLearningConfirm ? '确认清空学习记录' : '一键清空学习记录'}
                    </button>
                    {clearLearningConfirm && (
                      <button
                        type="button"
                        onClick={() => {
                          setClearLearningConfirm(false)
                          setClearLearningStatus({ kind: 'idle', message: '' })
                        }}
                        className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-6 pb-24">
            <div className="overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] shadow-sm">
              <div className="relative p-5 lg:p-6">
                <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_12%_10%,rgba(139,92,246,0.18),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(34,211,238,0.12),transparent_30%)]" />
                <div className="relative flex flex-col gap-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-[var(--color-accent-purple)]">
                        <Wand2 size={16} />
                        <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                          主题设置
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-white">视觉体验中心</h3>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        统一控制主题套装、背景氛围、动效强度和 AI 桌宠。
                      </p>
                    </div>
                    <div className="hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]/80 px-3 py-2 text-xs text-[var(--color-text-secondary)] sm:flex sm:items-center sm:gap-2">
                      <SparklesPreview />
                      即时预览
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <Palette size={15} className="text-[var(--color-accent-purple)]" />
                      <p className="text-sm font-semibold text-white">主题套装</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {VISUAL_THEMES.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          data-visual-theme-option={item.id}
                          onClick={() => setVisualTheme(item.id)}
                          className={cn(
                            'rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5',
                            visualTheme === item.id
                              ? 'border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 shadow-[0_12px_36px_rgba(139,92,246,0.18)]'
                              : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]/70 hover:border-[var(--color-border-default)]',
                          )}
                        >
                          <div className="mb-4 flex items-center gap-1.5">
                            {item.swatches.map((color) => (
                              <span
                                key={color}
                                className="h-5 w-5 rounded-full border border-white/20"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">{item.label}</p>
                            {visualTheme === item.id && (
                              <Check size={15} className="text-[var(--color-accent-purple)]" />
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                            {item.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Wallpaper size={15} className="text-[var(--color-accent-purple)]" />
                        <p className="text-sm font-semibold text-white">背景氛围</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {BACKGROUND_STYLES.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            data-background-style-option={item.id}
                            onClick={() => setBackgroundStyle(item.id)}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-left transition-colors',
                              backgroundStyle === item.id
                                ? 'settings-soft-selected border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 text-[var(--color-text-primary)]'
                                : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                            )}
                          >
                            <p className="text-xs font-semibold">{item.label}</p>
                            <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                              {item.desc}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Gauge size={15} className="text-[var(--color-accent-purple)]" />
                        <p className="text-sm font-semibold text-white">动画强度</p>
                      </div>
                      <div className="flex rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] p-1">
                        {ANIMATION_LEVELS.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            data-animation-level-option={item.id}
                            onClick={() => setAnimationLevel(item.id)}
                            className={cn(
                              'flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors',
                              animationLevel === item.id
                                ? 'bg-[var(--color-accent-purple)] text-white shadow-sm'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                            )}
                            title={item.desc}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                        “减少动态效果”开启时会覆盖为最低动效。
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]/70 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Sparkles size={15} className="text-[var(--color-accent-purple)]" />
                            <p className="text-sm font-semibold text-white">AI 桌宠</p>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                            默认使用流萤，兼容 pet.json + spritesheet.webp 的通用桌宠格式。
                          </p>
                        </div>
                        <ToggleSwitch
                          active={aiPetEnabled}
                          onToggle={() => setAIPetEnabled(!aiPetEnabled)}
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {availablePets.slice(0, 4).map((pet) => (
                          <button
                            type="button"
                            key={pet.id}
                            data-pet-option={pet.id}
                            onClick={() => handleSelectPet(pet.id)}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
                              selectedPetId === pet.id
                                ? 'settings-soft-selected border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 text-[var(--color-text-primary)]'
                                : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                            )}
                          >
                            <CodexPetSprite
                              pet={pet}
                              className="settings-pet-sprite codex-pet-sprite"
                              label={`${pet.displayName} 预览`}
                              animateIdle={animationLevel !== 'calm'}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold">
                                {pet.displayName}
                              </span>
                              <span className="block truncate text-[10px] text-[var(--color-text-muted)]">
                                {pet.source === 'built-in' ? '内置' : '已导入'}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <input
                          value={petSlug}
                          onChange={(event) => setPetSlug(event.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-accent-purple)]"
                          placeholder="firefly"
                          aria-label="桌宠 slug"
                        />
                        <button
                          type="button"
                          onClick={handleInstallPetSlug}
                          disabled={petActionStatus.kind === 'loading'}
                          className="rounded-lg bg-[var(--color-accent-purple)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7C3AED] disabled:opacity-60"
                        >
                          安装
                        </button>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleImportPet('file')}
                          disabled={petActionStatus.kind === 'loading'}
                          className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-60"
                        >
                          导入包
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImportPet('directory')}
                          disabled={petActionStatus.kind === 'loading'}
                          className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-60"
                        >
                          选文件夹
                        </button>
                      </div>
                      {petActionStatus.kind !== 'idle' && (
                        <p
                          className={cn(
                            'mt-2 text-[11px]',
                            petActionStatus.kind === 'error'
                              ? 'text-red-300'
                              : petActionStatus.kind === 'success'
                                ? 'text-emerald-300'
                                : 'text-[var(--color-text-muted)]',
                          )}
                        >
                          {petActionStatus.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
                  <h3 className="font-semibold text-white text-[15px] mb-1">语言与区域</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    界面语言为中文；可调整日期显示格式与每周起始日
                  </p>

                  <p className="text-sm font-medium text-white mb-2">区域格式</p>
                  <div className="flex flex-col gap-2 mb-5">
                    {REGION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setDateRegion(opt.value)}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors',
                          dateRegion === opt.value
                            ? 'settings-soft-selected border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 text-[var(--color-text-primary)]'
                            : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                        )}
                      >
                        <span>{opt.label}</span>
                        <span className="text-xs text-[var(--color-text-muted)] font-mono">
                          {opt.sample}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p className="text-sm font-medium text-white mb-2">每周起始日</p>
                  <div className="flex bg-[var(--color-bg-panel)] rounded-lg p-1 border border-[var(--color-border-subtle)]">
                    {(
                      [
                        ['mon', '周一'],
                        ['sun', '周日'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setWeekStart(val)}
                        className={cn(
                          'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                          weekStart === val
                            ? 'bg-[var(--color-accent-purple)] text-white shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-2">
                    影响首页学习热力图的星期排列
                  </p>
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
                    <label
                      className="w-8 h-8 rounded-full border border-[var(--color-border-subtle)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-purple)] transition-colors cursor-pointer"
                      title="自定义颜色"
                    >
                      <span className="text-lg leading-none mb-0.5">+</span>
                      <input
                        type="color"
                        value={themeColor}
                        onChange={(e) => handleThemeColor(e.target.value)}
                        className="sr-only"
                      />
                    </label>
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
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
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
                  <h3 className="font-semibold text-white text-[15px] mb-1">代码主题</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    工作区编辑器的语法高亮配色
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {CODE_THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setCodeTheme(opt.id)}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors',
                          codeTheme === opt.id
                            ? 'settings-soft-selected border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/10 text-[var(--color-text-primary)]'
                            : 'border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        <span
                          className={cn(
                            'w-2.5 h-2.5 rounded-full shrink-0 ml-2',
                            opt.dark
                              ? 'bg-[#1C2030] border border-white/25'
                              : 'bg-white border border-black/20',
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  {/* 实时预览：直接复用工作区编辑器（只读），随选择即时换肤 */}
                  <div className="rounded-lg overflow-hidden border border-[var(--color-border-subtle)] h-[150px]">
                    <CodeEditor
                      value={CODE_THEME_PREVIEW}
                      onChange={() => {}}
                      language="python"
                      themeId={codeTheme}
                      readOnly
                    />
                  </div>
                </div>
              </div>

              {/* Column 3 */}
              <div className="space-y-6">
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

                <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
                  <h3 className="font-semibold text-white text-[15px] mb-1">布局设置</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mb-4">
                    控制启动时的界面布局；侧边栏折叠键与工作区面板会与此同步
                  </p>
                  <div className="space-y-4">
                    {layoutSettings.map((setting) => (
                      <div key={setting.title} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{setting.title}</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            {setting.desc}
                          </p>
                        </div>
                        <ToggleSwitch active={setting.active} onToggle={setting.onToggle} />
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

              {dataActionStatus.kind !== 'idle' && (
                <div
                  role="status"
                  aria-live="polite"
                  className={cn(
                    'mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
                    dataActionStatus.kind === 'error'
                      ? 'border-red-500/40 bg-red-500/10 text-red-200'
                      : dataActionStatus.kind === 'success'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)]',
                  )}
                >
                  {dataActionStatus.kind === 'success' ? <Check size={14} /> : <Info size={14} />}
                  <span>{dataActionStatus.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={handleExportData}
                  disabled={dataActionStatus.kind === 'loading'}
                  className="flex items-center gap-3 p-4 rounded-lg border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-purple)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
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
                  onClick={handleImportData}
                  disabled={dataActionStatus.kind === 'loading'}
                  className="flex items-center gap-3 p-4 rounded-lg border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-purple)] transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
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
          className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
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
