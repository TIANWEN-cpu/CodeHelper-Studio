// database.ts 顶层 import electron(safeStorage)/db/perfMonitor。纯函数 maskApiKey /
// isMaskedApiKey 不依赖这些，mock 掉让模块可加载。
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
}))
vi.mock('../electron/db/index', () => ({ getDB: vi.fn() }))
vi.mock('../electron/utils/perfMonitor', () => ({ trackPerformance: vi.fn() }))

import { describe, it, expect } from 'vitest'
import { maskApiKey, isMaskedApiKey } from '../electron/ipc/database'

describe('maskApiKey', () => {
  it('空串返回空', () => {
    expect(maskApiKey('')).toBe('')
  })

  it('短 key 使用固定长度完全遮蔽', () => {
    expect(maskApiKey('abc')).toBe('********')
    expect(maskApiKey('abcdefghijklmno')).toBe('********')
    expect(maskApiKey('abcdefg').replaceAll('*', '')).not.toContain('abcdefg')
  })

  it('长 key 保留首3位 + 星号 + 末4位', () => {
    // 'sk-abcdef1234567890' (19位)：前3 'sk-' + 星号 + 末4 '7890'
    const masked = maskApiKey('sk-abcdef1234567890')
    expect(masked).toMatch(/^sk-\*+7890$/)
  })

  it('星号数量上限为 8（防止超长 key 生成一长串星号）', () => {
    const masked = maskApiKey('sk-' + 'a'.repeat(100))
    const starCount = (masked.match(/\*/g) ?? []).length
    expect(starCount).toBeLessThanOrEqual(8)
  })

  it('遮蔽后不再包含完整原始 key', () => {
    const key = 'sk-abcdefghijklmnopqrstuvwxyz1234567890'
    const masked = maskApiKey(key)
    // 不应能从遮蔽结果还原出中间的秘密部分
    expect(masked).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })
})

describe('isMaskedApiKey', () => {
  it('只识别本应用生成的遮蔽格式', () => {
    expect(isMaskedApiKey('sk-********7890')).toBe(true)
    expect(isMaskedApiKey('********')).toBe(true)
    expect(isMaskedApiKey('sk-*literal-star')).toBe(false)
  })

  it('不含星号判定为真实 key', () => {
    expect(isMaskedApiKey('sk-abcdef1234567890')).toBe(false)
    expect(isMaskedApiKey('')).toBe(false)
  })
})
