import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveTheme, DEFAULT_APPEARANCE, type ThemeMode } from '../src/lib/appearance'

// appearance.ts 顶层 import 了 settingsService（浏览器端服务），但 resolveTheme /
// systemPrefersLight 不依赖它。我们只测这两个纯/半纯函数 + DEFAULT_APPEARANCE 形状。

// matchMedia mock：控制 prefers-color-scheme 的返回值。
function setSystemPrefersLight(prefersLight: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({
      matches: prefersLight,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

describe('DEFAULT_APPEARANCE', () => {
  it('默认主题为 dark', () => {
    expect(DEFAULT_APPEARANCE.theme).toBe('dark')
  })

  it('默认不跟随系统', () => {
    expect(DEFAULT_APPEARANCE.followSystem).toBe(false)
  })

  it('包含必要的视觉字段', () => {
    expect(DEFAULT_APPEARANCE).toHaveProperty('visualTheme')
    expect(DEFAULT_APPEARANCE).toHaveProperty('backgroundStyle')
    expect(DEFAULT_APPEARANCE).toHaveProperty('animationLevel')
  })
})

describe('resolveTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('followSystem=false 时直接返回传入的 theme', () => {
    setSystemPrefersLight(true) // 即使系统是 light，也不跟随
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('followSystem=true 且系统偏好 light 时返回 light', () => {
    setSystemPrefersLight(true)
    expect(resolveTheme('dark' as ThemeMode, true)).toBe('light')
  })

  it('followSystem=true 且系统偏好 dark 时返回 dark', () => {
    setSystemPrefersLight(false)
    expect(resolveTheme('light' as ThemeMode, true)).toBe('dark')
  })

  it('无 window 环境下不抛错（系统守卫），followSystem 时回退为 dark', () => {
    // systemPrefersLight 在无 window 时返回 false → 解析为 dark，不崩溃。
    vi.stubGlobal('window', undefined as unknown as Window)
    expect(() => resolveTheme('dark', true)).not.toThrow()
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('有 window 但无 matchMedia 时也不抛错', () => {
    vi.stubGlobal('window', {} as unknown as Window)
    expect(() => resolveTheme('light', true)).not.toThrow()
    expect(resolveTheme('light', true)).toBe('dark')
  })
})
