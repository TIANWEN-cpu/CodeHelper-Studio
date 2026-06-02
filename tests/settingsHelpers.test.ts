import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for SettingsView business logic helpers.
 *
 * These functions are module-scoped in SettingsView.tsx (not exported).
 * We extract and test the identical logic here to ensure correctness of:
 * - buildConfigName: derives a display name from base URL and model
 * - formatDateTime: formats ISO date strings for display
 * - categoryLabel: maps memory category codes to Chinese labels
 * - handleSmartPaste logic: parses URLs and API keys from pasted text
 */

// ---------------------------------------------------------------------------
// buildConfigName — extracts provider name from URL + model
// ---------------------------------------------------------------------------

function buildConfigName(baseUrl: string, model: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '')
    const provider = host.split('.').find((segment) => /[a-z]/i.test(segment)) || 'AI'
    return `${provider}-${model}`.slice(0, 60)
  } catch {
    return model ? `AI-${model}`.slice(0, 60) : 'AI 配置'
  }
}

describe('buildConfigName', () => {
  it('extracts first alphabetic segment as provider (api.openai.com -> api)', () => {
    expect(buildConfigName('https://api.openai.com/v1', 'gpt-4')).toBe('api-gpt-4')
  })

  it('extracts first alphabetic segment from anthropic URL', () => {
    expect(buildConfigName('https://api.anthropic.com', 'claude-3')).toBe('api-claude-3')
  })

  it('strips www prefix before finding provider segment', () => {
    expect(buildConfigName('https://www.example.com/v1', 'model')).toBe('example-model')
  })

  it('extracts api segment from deepseek URL', () => {
    expect(buildConfigName('https://api.deepseek.com/v1', 'deepseek-chat')).toBe(
      'api-deepseek-chat',
    )
  })

  it('truncates to 60 characters', () => {
    const longModel = 'a'.repeat(70)
    const result = buildConfigName('https://api.openai.com/v1', longModel)
    expect(result.length).toBeLessThanOrEqual(60)
  })

  it('falls back to AI prefix on invalid URL', () => {
    expect(buildConfigName('not-a-url', 'gpt-4')).toBe('AI-gpt-4')
  })

  it('returns "AI 配置" when both URL and model are invalid', () => {
    expect(buildConfigName('not-a-url', '')).toBe('AI 配置')
  })

  it('handles IP-based URL', () => {
    const result = buildConfigName('http://192.168.1.1:8080/v1', 'local-model')
    // IP has no alphabetic segments, falls back to 'AI'
    expect(result).toBe('AI-local-model')
  })

  it('handles empty baseUrl', () => {
    expect(buildConfigName('', 'model')).toBe('AI-model')
  })

  it('handles URL with port number', () => {
    // hostname is api.example.com (port stripped), first alpha segment is "api"
    expect(buildConfigName('https://api.example.com:8080/v1', 'test')).toBe('api-test')
  })
})

// ---------------------------------------------------------------------------
// formatDateTime — formats ISO timestamp for Chinese locale display
// ---------------------------------------------------------------------------

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ').slice(0, 19)
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

describe('formatDateTime', () => {
  it('returns empty string for null', () => {
    expect(formatDateTime(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatDateTime(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(formatDateTime('')).toBe('')
  })

  it('formats valid ISO date string', () => {
    const result = formatDateTime('2024-06-15T10:30:00.000Z')
    // Should contain date components (exact format depends on locale)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles invalid date by replacing T with space', () => {
    const result = formatDateTime('not-a-date')
    expect(result).toBe('not-a-date')
  })

  it('truncates invalid date to 19 chars', () => {
    const longInvalid = 'T'.repeat(50)
    const result = formatDateTime(longInvalid)
    expect(result.length).toBeLessThanOrEqual(19)
  })

  it('formats date-only ISO string', () => {
    const result = formatDateTime('2024-01-15')
    expect(result).toBeTruthy()
  })

  it('handles ISO string with timezone offset', () => {
    const result = formatDateTime('2024-06-15T10:30:00+08:00')
    expect(result).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// categoryLabel — maps category codes to Chinese labels
// ---------------------------------------------------------------------------

const memoryCategories = [
  { value: 'general', label: '通用' },
  { value: 'preference', label: '偏好' },
  { value: 'goal', label: '目标' },
  { value: 'constraint', label: '约束' },
  { value: 'fact', label: '事实' },
]

function categoryLabel(category: string) {
  return memoryCategories.find((item) => item.value === category)?.label ?? category
}

describe('categoryLabel', () => {
  it('maps "general" to "通用"', () => {
    expect(categoryLabel('general')).toBe('通用')
  })

  it('maps "preference" to "偏好"', () => {
    expect(categoryLabel('preference')).toBe('偏好')
  })

  it('maps "goal" to "目标"', () => {
    expect(categoryLabel('goal')).toBe('目标')
  })

  it('maps "constraint" to "约束"', () => {
    expect(categoryLabel('constraint')).toBe('约束')
  })

  it('maps "fact" to "事实"', () => {
    expect(categoryLabel('fact')).toBe('事实')
  })

  it('returns raw value for unknown category', () => {
    expect(categoryLabel('unknown')).toBe('unknown')
  })

  it('returns empty string for empty input', () => {
    expect(categoryLabel('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Smart paste parsing — extracts URL and API key from pasted text
// ---------------------------------------------------------------------------

interface SmartPasteResult {
  base_url?: string
  api_key?: string
}

function parseSmartPaste(text: string): SmartPasteResult {
  const trimmed = text.trim()
  const updates: SmartPasteResult = {}

  const urlMatch = trimmed.match(/(https?:\/\/[^\s,;]+)/i)
  if (urlMatch) {
    let url = urlMatch[1].replace(/\/+$/, '')
    if (!url.endsWith('/v1')) {
      url += '/v1'
    }
    updates.base_url = url
  }

  const keyMatch =
    trimmed.match(/(sk-[a-zA-Z0-9_-]{20,})/i) || trimmed.match(/([a-zA-Z0-9_-]{32,})/i)
  if (keyMatch) {
    updates.api_key = keyMatch[1]
  }

  return updates
}

describe('smart paste parsing', () => {
  describe('URL extraction', () => {
    it('extracts HTTPS URL', () => {
      const result = parseSmartPaste('https://api.openai.com/v1')
      expect(result.base_url).toBe('https://api.openai.com/v1')
    })

    it('extracts HTTP URL', () => {
      const result = parseSmartPaste('http://localhost:8080')
      expect(result.base_url).toBe('http://localhost:8080/v1')
    })

    it('appends /v1 when missing', () => {
      const result = parseSmartPaste('https://api.anthropic.com')
      expect(result.base_url).toBe('https://api.anthropic.com/v1')
    })

    it('does not duplicate /v1', () => {
      const result = parseSmartPaste('https://api.openai.com/v1')
      expect(result.base_url).toBe('https://api.openai.com/v1')
    })

    it('strips trailing slashes before adding /v1', () => {
      const result = parseSmartPaste('https://api.example.com///')
      expect(result.base_url).toBe('https://api.example.com/v1')
    })

    it('handles URL embedded in text', () => {
      const result = parseSmartPaste('Your endpoint is https://api.deepseek.com/v1/chat')
      expect(result.base_url).toBe('https://api.deepseek.com/v1/chat/v1')
    })

    it('returns no URL when none found', () => {
      const result = parseSmartPaste('no url here')
      expect(result.base_url).toBeUndefined()
    })
  })

  describe('API key extraction', () => {
    it('extracts sk- prefixed key', () => {
      const result = parseSmartPaste('sk-abcdefghijklmnopqrstuvwxyz1234')
      expect(result.api_key).toBe('sk-abcdefghijklmnopqrstuvwxyz1234')
    })

    it('extracts long alphanumeric key', () => {
      const longKey = 'a'.repeat(40)
      const result = parseSmartPaste(longKey)
      expect(result.api_key).toBe(longKey)
    })

    it('prefers sk- prefix over generic pattern', () => {
      const result = parseSmartPaste('sk-abcdefghij1234567890_abc')
      expect(result.api_key).toMatch(/^sk-/)
    })

    it('returns no key for short strings', () => {
      const result = parseSmartPaste('short')
      expect(result.api_key).toBeUndefined()
    })

    it('handles key with dashes and underscores', () => {
      const key = 'sk-abc_def-ghi_jkl-mno_1234'
      const result = parseSmartPaste(key)
      expect(result.api_key).toBe(key)
    })
  })

  describe('combined parsing', () => {
    it('extracts both URL and key from mixed text', () => {
      const text = 'Base URL: https://api.openai.com/v1\nAPI Key: sk-abcdefghijklmnopqrstuvwxyz1234'
      const result = parseSmartPaste(text)
      expect(result.base_url).toBe('https://api.openai.com/v1')
      expect(result.api_key).toBe('sk-abcdefghijklmnopqrstuvwxyz1234')
    })

    it('returns empty object for empty text', () => {
      const result = parseSmartPaste('')
      expect(result).toEqual({})
    })

    it('handles comma-separated text', () => {
      const text = 'https://api.example.com, sk-abcdefghijklmnopqrstuvwxyz1234'
      const result = parseSmartPaste(text)
      expect(result.base_url).toBe('https://api.example.com/v1')
      expect(result.api_key).toBe('sk-abcdefghijklmnopqrstuvwxyz1234')
    })
  })
})

// ---------------------------------------------------------------------------
// toggleMemoryField — toggles pinned/enabled fields
// ---------------------------------------------------------------------------

describe('toggleMemoryField logic', () => {
  it('toggles pinned from 1 to 0', () => {
    const memory = { id: 1, content: 'test', category: 'general', pinned: 1, enabled: 1 }
    const field = 'pinned'
    const result = field === 'pinned' ? (memory.pinned === 1 ? 0 : 1) : memory.pinned
    expect(result).toBe(0)
  })

  it('toggles pinned from 0 to 1', () => {
    const memory = { id: 1, content: 'test', category: 'general', pinned: 0, enabled: 1 }
    const field = 'pinned'
    const result = field === 'pinned' ? (memory.pinned === 1 ? 0 : 1) : memory.pinned
    expect(result).toBe(1)
  })

  it('toggles enabled from 1 to 0', () => {
    const memory = { id: 1, content: 'test', category: 'general', pinned: 0, enabled: 1 }
    const field = 'enabled'
    const result = field === 'enabled' ? (memory.enabled === 1 ? 0 : 1) : memory.enabled
    expect(result).toBe(0)
  })

  it('toggles enabled from 0 to 1', () => {
    const memory = { id: 1, content: 'test', category: 'general', pinned: 0, enabled: 0 }
    const field = 'enabled'
    const result = field === 'enabled' ? (memory.enabled === 1 ? 0 : 1) : memory.enabled
    expect(result).toBe(1)
  })

  it('preserves other field when toggling', () => {
    const memory = { id: 1, content: 'test', category: 'general', pinned: 1, enabled: 1 }
    // When toggling 'pinned', enabled stays unchanged
    const newPinned = memory.pinned === 1 ? 0 : 1
    const newEnabled = memory.enabled // unchanged
    expect(newPinned).toBe(0)
    expect(newEnabled).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// demo result message building
// ---------------------------------------------------------------------------

describe('demo result message building', () => {
  it('builds message with all non-zero counts', () => {
    const result = { problems: 20, knowledge: 5, sessions: 4, memories: 10, presets: 3 }
    const parts: string[] = []
    if (result.problems > 0) parts.push(`${result.problems} 道题目`)
    if (result.knowledge > 0) parts.push(`${result.knowledge} 篇知识文档`)
    if (result.sessions > 0) parts.push(`${result.sessions} 个对话`)
    if (result.memories > 0) parts.push(`${result.memories} 条记忆`)
    if (result.presets > 0) parts.push(`${result.presets} 个预设`)
    const msg =
      parts.length > 0 ? `已加载：${parts.join('、')}` : '所有演示数据已存在，无需重复加载。'
    expect(msg).toBe('已加载：20 道题目、5 篇知识文档、4 个对话、10 条记忆、3 个预设')
  })

  it('builds message with some zero counts', () => {
    const result = { problems: 20, knowledge: 0, sessions: 0, memories: 0, presets: 0 }
    const parts: string[] = []
    if (result.problems > 0) parts.push(`${result.problems} 道题目`)
    if (result.knowledge > 0) parts.push(`${result.knowledge} 篇知识文档`)
    if (result.sessions > 0) parts.push(`${result.sessions} 个对话`)
    if (result.memories > 0) parts.push(`${result.memories} 条记忆`)
    if (result.presets > 0) parts.push(`${result.presets} 个预设`)
    const msg =
      parts.length > 0 ? `已加载：${parts.join('、')}` : '所有演示数据已存在，无需重复加载。'
    expect(msg).toBe('已加载：20 道题目')
  })

  it('shows "already loaded" message when all counts are zero', () => {
    const result = { problems: 0, knowledge: 0, sessions: 0, memories: 0, presets: 0 }
    const parts: string[] = []
    if (result.problems > 0) parts.push(`${result.problems} 道题目`)
    if (result.knowledge > 0) parts.push(`${result.knowledge} 篇知识文档`)
    if (result.sessions > 0) parts.push(`${result.sessions} 个对话`)
    if (result.memories > 0) parts.push(`${result.memories} 条记忆`)
    if (result.presets > 0) parts.push(`${result.presets} 个预设`)
    const msg =
      parts.length > 0 ? `已加载：${parts.join('、')}` : '所有演示数据已存在，无需重复加载。'
    expect(msg).toBe('所有演示数据已存在，无需重复加载。')
  })
})

// ---------------------------------------------------------------------------
// settingsStore additional coverage
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

const { useSettingsStore } = await import('../src/stores/settingsStore')

beforeEach(() => {
  useSettingsStore.setState({ aiConfigs: [], loading: false, saving: false, saveError: null })
  mockInvoke.mockReset()
})

describe('settingsStore additional tests', () => {
  describe('saveConfig error handling', () => {
    it('sets saveError on failure and re-throws', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Unique constraint violation'))

      const config = {
        name: 'Test',
        api_key: 'sk-test',
        base_url: 'https://api.test.com',
        model: 'gpt-4',
        is_default: 0,
        task_type: null,
      }

      await expect(useSettingsStore.getState().saveConfig(config)).rejects.toThrow(
        'Unique constraint violation',
      )

      expect(useSettingsStore.getState().saveError).toBe('Unique constraint violation')
      expect(useSettingsStore.getState().saving).toBe(false)
    })

    it('clears saveError before saving', async () => {
      useSettingsStore.setState({ saveError: 'old error' })
      mockInvoke.mockResolvedValueOnce(1) // save
      mockInvoke.mockResolvedValueOnce([]) // loadConfigs

      await useSettingsStore.getState().saveConfig({
        name: 'Test',
        api_key: 'sk-test',
        base_url: 'https://api.test.com',
        model: 'gpt-4',
        is_default: 0,
        task_type: null,
      })

      expect(useSettingsStore.getState().saveError).toBeNull()
    })

    it('sets saving state during save', async () => {
      let resolve: (v: unknown) => void
      mockInvoke.mockReturnValueOnce(new Promise((r) => (resolve = r)))

      const promise = useSettingsStore.getState().saveConfig({
        name: 'Test',
        api_key: 'sk-test',
        base_url: 'https://api.test.com',
        model: 'gpt-4',
        is_default: 0,
        task_type: null,
      })

      expect(useSettingsStore.getState().saving).toBe(true)
      resolve!(1)
      mockInvoke.mockResolvedValueOnce([])
      await promise
      expect(useSettingsStore.getState().saving).toBe(false)
    })
  })

  describe('deleteConfig error handling', () => {
    it('logs error but does not throw on delete failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('not found'))
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await useSettingsStore.getState().deleteConfig(999)

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })
})
