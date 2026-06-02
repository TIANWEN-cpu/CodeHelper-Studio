import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localStorage
const localStorageStore: Record<string, string> = {}
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key]
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(localStorageStore)) delete localStorageStore[key]
  }),
}

vi.stubGlobal('localStorage', mockLocalStorage)

// Mock the dependencies
vi.mock('../src/stores/editorStore', () => ({
  useEditorStore: { getState: vi.fn() },
}))

vi.mock('../src/stores/appStore', () => ({
  useAppStore: { getState: vi.fn() },
}))

vi.mock('../src/theme/monacoThemes', () => ({
  monacoThemeByAppTheme: {
    'midnight-ocean': 'codehelper-dark',
    'forest-green': 'codehelper-forest',
    'sunset-gold': 'codehelper-warm',
    'classic-light': 'vs',
  },
  registerMonacoThemes: vi.fn(),
}))

vi.mock('../src/constants', () => ({
  DEFAULT_EDITOR_FONT_SIZE: 14,
  EDITOR_FONT_FAMILY: "'JetBrains Mono', monospace",
  EDITOR_TAB_SIZE: 2,
}))

const {
  getMinimapEnabled,
  setMinimapEnabled,
  getDefaultEditorOptions,
  resolveMonacoTheme,
  invalidateEditorOptionsCache,
} = await import('../src/utils/monacoConfig')

beforeEach(() => {
  for (const key of Object.keys(localStorageStore)) delete localStorageStore[key]
  mockLocalStorage.getItem.mockClear()
  mockLocalStorage.setItem.mockClear()
  invalidateEditorOptionsCache()
})

// ---------------------------------------------------------------------------
// getMinimapEnabled
// ---------------------------------------------------------------------------

describe('getMinimapEnabled', () => {
  it('returns false when no value stored (default off)', () => {
    expect(getMinimapEnabled()).toBe(false)
  })

  it('returns true when stored value is "true"', () => {
    localStorageStore['codehelper-minimap-enabled'] = 'true'
    expect(getMinimapEnabled()).toBe(true)
  })

  it('returns false when stored value is "false"', () => {
    localStorageStore['codehelper-minimap-enabled'] = 'false'
    expect(getMinimapEnabled()).toBe(false)
  })

  it('returns false for any other stored value', () => {
    localStorageStore['codehelper-minimap-enabled'] = 'yes'
    expect(getMinimapEnabled()).toBe(false)
  })

  it('reads from correct localStorage key', () => {
    getMinimapEnabled()
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('codehelper-minimap-enabled')
  })
})

// ---------------------------------------------------------------------------
// setMinimapEnabled
// ---------------------------------------------------------------------------

describe('setMinimapEnabled', () => {
  it('saves "true" to localStorage when enabled', () => {
    setMinimapEnabled(true)
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('codehelper-minimap-enabled', 'true')
  })

  it('saves "false" to localStorage when disabled', () => {
    setMinimapEnabled(false)
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('codehelper-minimap-enabled', 'false')
  })

  it('round-trips correctly', () => {
    setMinimapEnabled(true)
    expect(getMinimapEnabled()).toBe(true)

    setMinimapEnabled(false)
    expect(getMinimapEnabled()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getDefaultEditorOptions
// ---------------------------------------------------------------------------

describe('getDefaultEditorOptions', () => {
  it('returns an object with expected editor options', () => {
    const opts = getDefaultEditorOptions()
    expect(opts).toBeDefined()
    expect(opts.fontSize).toBe(14)
    expect(opts.fontFamily).toContain('JetBrains Mono')
    expect(opts.tabSize).toBe(2)
    expect(opts.scrollBeyondLastLine).toBe(false)
    expect(opts.automaticLayout).toBe(true)
    expect(opts.wordWrap).toBe('on')
    expect(opts.smoothScrolling).toBe(true)
    expect(opts.folding).toBe(true)
  })

  it('includes minimap configuration', () => {
    const opts = getDefaultEditorOptions()
    expect(opts.minimap).toBeDefined()
    expect(typeof opts.minimap?.enabled).toBe('boolean')
  })

  it('includes bracket pair colorization', () => {
    const opts = getDefaultEditorOptions()
    expect(opts.bracketPairColorization).toEqual({ enabled: true })
  })

  it('enables large file optimizations', () => {
    const opts = getDefaultEditorOptions()
    expect(opts.largeFileOptimizations).toBe(true)
  })

  it('caches the base options object', () => {
    const opts1 = getDefaultEditorOptions()
    const opts2 = getDefaultEditorOptions()
    expect(opts1).toBe(opts2) // same reference
  })

  it('returns new cache after invalidation', () => {
    const opts1 = getDefaultEditorOptions()
    invalidateEditorOptionsCache()
    const opts2 = getDefaultEditorOptions()
    expect(opts1).not.toBe(opts2) // different reference
    expect(opts1).toEqual(opts2) // same values
  })
})

// ---------------------------------------------------------------------------
// resolveMonacoTheme
// ---------------------------------------------------------------------------

describe('resolveMonacoTheme', () => {
  it('resolves midnight-ocean to codehelper-dark', () => {
    expect(resolveMonacoTheme('midnight-ocean')).toBe('codehelper-dark')
  })

  it('resolves forest-green to codehelper-forest', () => {
    expect(resolveMonacoTheme('forest-green')).toBe('codehelper-forest')
  })

  it('resolves sunset-gold to codehelper-warm', () => {
    expect(resolveMonacoTheme('sunset-gold')).toBe('codehelper-warm')
  })

  it('resolves classic-light to vs', () => {
    expect(resolveMonacoTheme('classic-light')).toBe('vs')
  })
})
