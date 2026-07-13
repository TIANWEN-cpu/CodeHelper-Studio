// ============================================================
// 外观应用层 (Appearance)
// 把"设置页"里的主题/主题色/缩放/字号真正落到 DOM 上。
//
// 关键手段：
//  - 主题(dark/light)：在 <html> 上写 data-theme 属性，配合 index.css 里
//    :root[data-theme="light"] 的变量覆盖生效（属性选择器优先级高于 @theme 的 :root）。
//  - 主题色 accent：用 documentElement 的内联 style 覆盖 --color-accent-primary，
//    内联样式优先级最高，能压过 Tailwind @theme 生成的 :root 变量。
//  - 界面缩放：用 Chromium 的 style.zoom（Electron 内核支持），整体缩放最可靠。
//  - 字体大小：调整根 font-size（以 14 为中性基准，14→16px 不变），让 rem 类工具响应。
//
// 持久化走 settingsService 的 db-get-setting / db-set-setting（与设置页同一套 key）。
// ============================================================

import { getSetting, setSetting } from '../services/settingsService'
import { createSerialTaskQueue } from './serialTaskQueue'
export type ThemeMode = 'dark' | 'light'
export type VisualTheme =
  | 'codex'
  | 'aurora'
  | 'nebula'
  | 'graphite'
  | 'deep-space'
  | 'forest'
  | 'anime'
export type BackgroundStyle = 'soft' | 'aurora' | 'grid' | 'none'
export type AnimationLevel = 'calm' | 'balanced' | 'expressive'
export type GlassStyle = 'frosted' | 'layered'

export const DEFAULT_ACCENT_COLOR = '#2FB7A5'

export interface Appearance {
  theme: ThemeMode
  followSystem: boolean
  themeColor: string // accent 主题色，如 "#2FB7A5"
  uiScale: string // 如 "100%"
  fontSize: number // px，范围 12–24，14 为中性基准
  reduceMotion: boolean
  glassEffect: boolean // 毛玻璃（backdrop-blur）开关，默认开
  glassStyle: GlassStyle // 玻璃质感：经典毛玻璃 / iOS 式层次玻璃
  glassBlur: number // px，控制全局玻璃模糊强度
  highContrast: boolean // 高对比度，默认关
  visualTheme: VisualTheme // 视觉主题套装：驱动语义色、背景氛围与组件质感
  backgroundStyle: BackgroundStyle // 全局背景层：轻量 CSS，不加载大图
  animationLevel: AnimationLevel // 动效强度：只影响装饰/桌宠，不改变核心交互
  aiPetEnabled: boolean // AI 桌宠开关
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark',
  followSystem: false,
  themeColor: DEFAULT_ACCENT_COLOR,
  uiScale: '100%',
  fontSize: 14,
  reduceMotion: false,
  glassEffect: true,
  glassStyle: 'layered',
  glassBlur: 18,
  highContrast: false,
  visualTheme: 'codex',
  backgroundStyle: 'soft',
  animationLevel: 'balanced',
  aiPetEnabled: true,
}

const APPEARANCE_ALIGNMENT_KEY = 'appearance_light_theme_alignment_v1'
const APPEARANCE_ALIGNMENT_DONE = 'done'
const appearanceWriteQueue = createSerialTaskQueue()

// ---- 颜色工具：按百分比提亮(正)/加深(负) ----
export function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function shade(hex: string, percent: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return hex
  const int = parseInt(m[1], 16)
  let r = (int >> 16) & 0xff
  let g = (int >> 8) & 0xff
  let b = int & 0xff
  const f = percent / 100
  r = clamp255(r + r * f)
  g = clamp255(g + g * f)
  b = clamp255(b + b * f)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// ---- 系统主题探测 ----
function systemPrefersLight(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  )
}

/** 在"跟随系统"开启时，把逻辑主题解析为实际呈现主题。 */
export function resolveTheme(theme: ThemeMode, followSystem: boolean): ThemeMode {
  if (followSystem) return systemPrefersLight() ? 'light' : 'dark'
  return theme
}

// ---- 单项应用 ----
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

// 默认招牌靛色：选它时回到 @theme 原始的"靛(primary)→紫(purple)"双色，不做内联覆盖。
export function applyThemeColor(color: string): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const clearAccent = () => {
    root.style.removeProperty('--color-accent-primary')
    root.style.removeProperty('--color-accent-hover')
    root.style.removeProperty('--color-accent-purple')
  }
  const raw = (color || '').trim()
  // 非法值 / 选中默认靛色：清除内联覆盖，回退 @theme 招牌靛紫双色，保证未自定义时观感与初始一致。
  if (!/^#?[0-9a-fA-F]{6}$/.test(raw)) {
    clearAccent()
    return
  }
  const c = raw.startsWith('#') ? raw : `#${raw}`
  if (c.toLowerCase() === DEFAULT_ACCENT_COLOR.toLowerCase()) {
    clearAccent()
    return
  }
  // 自定义主题色：primary / purple / hover 全部跟随同色系，
  // token 化后所有 accent-primary / accent-purple 用法（渐变、徽章、激活态、图标）一并随之变色。
  root.style.setProperty('--color-accent-primary', c)
  root.style.setProperty('--color-accent-hover', shade(c, -14))
  root.style.setProperty('--color-accent-purple', shade(c, 20))
}

export function applyScale(scale: string): void {
  if (typeof document === 'undefined') return
  const pct = parseInt(scale, 10)
  const z = Number.isFinite(pct) && pct > 0 ? pct / 100 : 1
  // Chromium 私有属性，Electron 支持；TS 的 CSSStyleDeclaration 未声明 zoom。
  ;(document.documentElement.style as unknown as { zoom: string }).zoom = String(z)
}

export function applyFontSize(px: number): void {
  if (typeof document === 'undefined') return
  const n = Number.isFinite(px) ? Math.min(24, Math.max(12, px)) : 14
  // 以 14 为中性基准（浏览器默认根字号 16px），14→16px 不改变现有观感。
  document.documentElement.style.fontSize = `${(n / 14) * 16}px`
}

export function applyReduceMotion(on: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-reduce-motion', on ? 'true' : 'false')
}

/** 毛玻璃效果：关闭时在 <html> 标记 data-glass="off"，index.css 据此禁用 backdrop-blur。 */
export function applyGlassEffect(on: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-glass', on ? 'on' : 'off')
}

export function applyGlassStyle(style: GlassStyle): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-glass-style', style)
}

export function applyGlassBlur(value: number): void {
  if (typeof document === 'undefined') return
  const blur = Number.isFinite(value) ? Math.min(32, Math.max(6, Math.round(value))) : 18
  const root = document.documentElement
  root.style.setProperty('--glass-blur', `${blur}px`)
  root.style.setProperty('--glass-blur-soft', `${Math.max(4, Math.round(blur * 0.56))}px`)
  root.style.setProperty('--glass-blur-strong', `${Math.min(42, Math.round(blur * 1.34))}px`)
  root.setAttribute('data-glass-blur', String(blur))
}

/** 高对比度：开启时标记 data-contrast="high"，index.css 据此调亮边框与次要文字。 */
export function applyHighContrast(on: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-contrast', on ? 'high' : 'normal')
}

export function applyVisualTheme(theme: VisualTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-visual-theme', theme)
}

export function applyBackgroundStyle(style: BackgroundStyle): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-background-style', style)
}

export function applyAnimationLevel(level: AnimationLevel): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-animation-level', level)
}

export function applyAIPetEnabled(on: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-ai-pet', on ? 'on' : 'off')
}

/** 一次性应用整组外观设置（启动时与重置时用）。 */
export function applyAll(a: Appearance): void {
  applyTheme(resolveTheme(a.theme, a.followSystem))
  applyThemeColor(a.themeColor)
  applyScale(a.uiScale)
  applyFontSize(a.fontSize)
  applyReduceMotion(a.reduceMotion)
  applyGlassEffect(a.glassEffect)
  applyGlassStyle(a.glassStyle)
  applyGlassBlur(a.glassBlur)
  applyHighContrast(a.highContrast)
  applyVisualTheme(a.visualTheme)
  applyBackgroundStyle(a.backgroundStyle)
  applyAnimationLevel(a.animationLevel)
  applyAIPetEnabled(a.aiPetEnabled)
}

function parseVisualTheme(value: string | null): VisualTheme {
  return value === 'aurora' ||
    value === 'nebula' ||
    value === 'graphite' ||
    value === 'deep-space' ||
    value === 'forest' ||
    value === 'anime'
    ? value
    : 'codex'
}

function parseBackgroundStyle(value: string | null): BackgroundStyle {
  return value === 'aurora' || value === 'grid' || value === 'none' ? value : 'soft'
}

function parseAnimationLevel(value: string | null): AnimationLevel {
  return value === 'calm' || value === 'expressive' ? value : 'balanced'
}

function parseGlassStyle(value: string | null): GlassStyle {
  return value === 'frosted' ? 'frosted' : 'layered'
}

function parseGlassBlur(value: string | null): number {
  const parsed = value ? parseInt(value, 10) : NaN
  return Number.isFinite(parsed) ? Math.min(32, Math.max(6, parsed)) : DEFAULT_APPEARANCE.glassBlur
}

function isLegacyLightThemeState(a: Appearance, marker: string | null): boolean {
  return (
    marker !== APPEARANCE_ALIGNMENT_DONE &&
    a.theme === 'light' &&
    a.visualTheme === 'nebula' &&
    a.backgroundStyle === 'none' &&
    a.animationLevel === 'expressive'
  )
}

/** 从数据库读回已持久化的外观设置（失败回退默认值）。 */
export async function loadAppearance(): Promise<Appearance> {
  try {
    const [
      theme,
      follow,
      color,
      scale,
      font,
      rm,
      glass,
      glassStyle,
      glassBlur,
      contrast,
      visualTheme,
      backgroundStyle,
      animationLevel,
      aiPet,
      alignmentMarker,
    ] = await Promise.all([
      getSetting('theme_mode'),
      getSetting('follow_system'),
      getSetting('theme_color'),
      getSetting('ui_scale'),
      getSetting('font_size'),
      getSetting('reduce_motion'),
      getSetting('glass_effect'),
      getSetting('glass_style'),
      getSetting('glass_blur'),
      getSetting('high_contrast'),
      getSetting('visual_theme'),
      getSetting('background_style'),
      getSetting('animation_level'),
      getSetting('ai_pet_enabled'),
      getSetting(APPEARANCE_ALIGNMENT_KEY),
    ])
    const parsedFont = font ? parseInt(font, 10) : NaN
    const appearance: Appearance = {
      theme: theme === 'light' ? 'light' : 'dark',
      followSystem: follow === 'true',
      themeColor: color || DEFAULT_APPEARANCE.themeColor,
      uiScale: scale || DEFAULT_APPEARANCE.uiScale,
      fontSize: Number.isFinite(parsedFont) ? parsedFont : DEFAULT_APPEARANCE.fontSize,
      reduceMotion: rm === 'true',
      glassEffect: glass == null ? DEFAULT_APPEARANCE.glassEffect : glass === 'true',
      glassStyle: parseGlassStyle(glassStyle),
      glassBlur: parseGlassBlur(glassBlur),
      highContrast: contrast === 'true',
      visualTheme: parseVisualTheme(visualTheme),
      backgroundStyle: parseBackgroundStyle(backgroundStyle),
      animationLevel: parseAnimationLevel(animationLevel),
      aiPetEnabled: aiPet == null ? DEFAULT_APPEARANCE.aiPetEnabled : aiPet === 'true',
    }
    if (isLegacyLightThemeState(appearance, alignmentMarker)) {
      const aligned: Appearance = {
        ...appearance,
        visualTheme: DEFAULT_APPEARANCE.visualTheme,
        backgroundStyle: DEFAULT_APPEARANCE.backgroundStyle,
        animationLevel: DEFAULT_APPEARANCE.animationLevel,
      }
      await Promise.all([
        setSetting('visual_theme', aligned.visualTheme),
        setSetting('background_style', aligned.backgroundStyle),
        setSetting('animation_level', aligned.animationLevel),
        setSetting(APPEARANCE_ALIGNMENT_KEY, APPEARANCE_ALIGNMENT_DONE),
      ])
      return aligned
    }
    if (alignmentMarker !== APPEARANCE_ALIGNMENT_DONE) {
      await setSetting(APPEARANCE_ALIGNMENT_KEY, APPEARANCE_ALIGNMENT_DONE)
    }
    return appearance
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

/** Persist appearance and layout settings through one ordered queue. */
export function persistAppearance(key: string, value: string): Promise<void> {
  return appearanceWriteQueue.enqueue(() => setSetting(key, value))
}

export function flushAppearanceWrites(): Promise<void> {
  return appearanceWriteQueue.drain()
}

/** 监听系统主题变化（仅在"跟随系统"开启时使用）。返回取消函数。 */
export function watchSystemTheme(onChange: (theme: ThemeMode) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const handler = () => onChange(mq.matches ? 'light' : 'dark')
  // Safari 旧版用 addListener；现代用 addEventListener。
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }
  mq.addListener(handler)
  return () => mq.removeListener(handler)
}
