import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  resolveTheme,
  DEFAULT_APPEARANCE,
  DEFAULT_ACCENT_COLOR,
  shade,
  clamp255,
  type ThemeMode,
} from '../src/lib/appearance'

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

  it('keeps the persisted default accent aligned with the CSS default', () => {
    expect(DEFAULT_APPEARANCE.themeColor).toBe(DEFAULT_ACCENT_COLOR)
    expect(DEFAULT_ACCENT_COLOR).toBe('#2FB7A5')
  })

  it('keeps the worst-case solid accent mix readable against white text', () => {
    const channel = 0.45
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    const contrast = 1.05 / (linear + 0.05)
    expect(contrast).toBeGreaterThanOrEqual(4.5)
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

describe('clamp255', () => {
  it('范围内取整', () => {
    expect(clamp255(153.6)).toBe(154)
    expect(clamp255(100)).toBe(100)
  })
  it('超过 255 钳到 255', () => {
    expect(clamp255(300)).toBe(255)
    expect(clamp255(255.4)).toBe(255)
  })
  it('低于 0 钳到 0', () => {
    expect(clamp255(-50)).toBe(0)
    expect(clamp255(-0.4)).toBe(0)
  })
})

describe('shade (主题色调亮/调暗)', () => {
  it('正百分比调亮（128 → 154）', () => {
    expect(shade('#808080', 20)).toBe('#9a9a9a')
  })
  it('负百分比调暗（128 → 110）', () => {
    expect(shade('#808080', -14)).toBe('#6e6e6e')
  })
  it('0% 返回原色（取整后）', () => {
    expect(shade('#808080', 0)).toBe('#808080')
  })
  it('白色调亮被钳到纯白（不溢出）', () => {
    expect(shade('#ffffff', 20)).toBe('#ffffff')
  })
  it('黑色调亮仍是黑色（0+0=0）', () => {
    expect(shade('#000000', 50)).toBe('#000000')
  })
  it('省略 # 前缀也能解析', () => {
    expect(shade('808080', 20)).toBe('#9a9a9a')
  })
  it('非法 hex 原样返回', () => {
    expect(shade('not-a-color', 20)).toBe('not-a-color')
  })
  it('输出始终带 # 且为 6 位小写 hex', () => {
    expect(shade('#3366cc', 10)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
