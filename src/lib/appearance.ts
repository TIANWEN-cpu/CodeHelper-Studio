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

export type ThemeMode = 'dark' | 'light'

export interface Appearance {
  theme: ThemeMode
  followSystem: boolean
  themeColor: string // accent 主题色，如 "#6366F1"
  uiScale: string // 如 "100%"
  fontSize: number // px，范围 12–24，14 为中性基准
  reduceMotion: boolean
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark',
  followSystem: false,
  themeColor: '#6366F1',
  uiScale: '100%',
  fontSize: 14,
  reduceMotion: false,
}

// ---- 颜色工具：按百分比提亮(正)/加深(负) ----
function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function shade(hex: string, percent: number): string {
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
const DEFAULT_ACCENT = '#6366f1'

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
  if (c.toLowerCase() === DEFAULT_ACCENT) {
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

/** 一次性应用整组外观设置（启动时与重置时用）。 */
export function applyAll(a: Appearance): void {
  applyTheme(resolveTheme(a.theme, a.followSystem))
  applyThemeColor(a.themeColor)
  applyScale(a.uiScale)
  applyFontSize(a.fontSize)
  applyReduceMotion(a.reduceMotion)
}

/** 从数据库读回已持久化的外观设置（失败回退默认值）。 */
export async function loadAppearance(): Promise<Appearance> {
  try {
    const [theme, follow, color, scale, font, rm] = await Promise.all([
      getSetting('theme_mode'),
      getSetting('follow_system'),
      getSetting('theme_color'),
      getSetting('ui_scale'),
      getSetting('font_size'),
      getSetting('reduce_motion'),
    ])
    const parsedFont = font ? parseInt(font, 10) : NaN
    return {
      theme: theme === 'light' ? 'light' : 'dark',
      followSystem: follow === 'true',
      themeColor: color || DEFAULT_APPEARANCE.themeColor,
      uiScale: scale || DEFAULT_APPEARANCE.uiScale,
      fontSize: Number.isFinite(parsedFont) ? parsedFont : DEFAULT_APPEARANCE.fontSize,
      reduceMotion: rm === 'true',
    }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

/** 持久化单个外观 key（与设置页 save 同一通道）。 */
export function persistAppearance(key: string, value: string): void {
  setSetting(key, value).catch(() => {})
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
