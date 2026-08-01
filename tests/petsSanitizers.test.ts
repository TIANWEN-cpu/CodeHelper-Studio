// pets.ts 顶层 import electron/fs/child_process 等（IPC + 文件操作）。
// 这里只测导出的纯校验函数，mock 掉 electron 与 middleware 让模块可加载。
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() }, BrowserWindow: {} }))
vi.mock('../electron/utils/middleware', () => ({
  registerIpcHandler: vi.fn(),
  rateLimitMiddleware: vi.fn(() => async (_ctx: unknown, next: () => unknown) => next()),
}))

import { describe, it, expect } from 'vitest'
import {
  safePetId,
  normalizeSlug,
  manifestId,
  displayName,
  validateZipEntries,
} from '../electron/ipc/pets'
import type { CodexPetManifest } from '../electron/ipc/pets'

describe('safePetId (路径遍历防护)', () => {
  it('接受正常 id', () => {
    expect(safePetId('firefly')).toBe('firefly')
    expect(safePetId('happy-dog')).toBe('happy-dog')
  })

  it('拒绝包含正斜杠的 id（路径分隔）', () => {
    expect(() => safePetId('../etc/passwd')).toThrow('无效')
    expect(() => safePetId('a/b')).toThrow('无效')
  })

  it('拒绝包含反斜杠的 id（Windows 路径分隔）', () => {
    expect(() => safePetId('a\\b')).toThrow('无效')
    expect(() => safePetId('..\\..\\secret')).toThrow('无效')
  })

  it('拒绝 "." 与 ".."', () => {
    expect(() => safePetId('.')).toThrow('无效')
    expect(() => safePetId('..')).toThrow('无效')
  })

  it('空/falsy 值回退到 fallback（默认 pet）', () => {
    expect(safePetId('')).toBe('pet')
    expect(safePetId(null)).toBe('pet')
    expect(safePetId(undefined)).toBe('pet')
    expect(safePetId('', 'default')).toBe('default')
  })

  it('截断超长 id 到 80 字符', () => {
    const long = 'a'.repeat(100)
    expect(safePetId(long)).toHaveLength(80)
  })

  it('trim 首尾空白', () => {
    expect(safePetId('  firefly  ')).toBe('firefly')
  })
})

describe('normalizeSlug', () => {
  it('接受合法 slug（小写字母数字、单连字符）', () => {
    expect(normalizeSlug('firefly')).toBe('firefly')
    expect(normalizeSlug('happy-dog')).toBe('happy-dog')
    expect(normalizeSlug('pet-123')).toBe('pet-123')
  })

  it('大写转小写', () => {
    expect(normalizeSlug('FireFly')).toBe('firefly')
  })

  it('拒绝大写连字符组合外的形式', () => {
    expect(() => normalizeSlug('Happy_Dog')).toThrow('slug')
    expect(() => normalizeSlug('happy dog')).toThrow('slug')
    expect(() => normalizeSlug('happy--dog')).toThrow('slug')
    expect(() => normalizeSlug('-leading')).toThrow('slug')
    expect(() => normalizeSlug('trailing-')).toThrow('slug')
  })

  it('拒绝含路径字符的 slug（额外防线）', () => {
    expect(() => normalizeSlug('../etc')).toThrow('slug')
    expect(() => normalizeSlug('a/b')).toThrow('slug')
  })

  it('空值抛错', () => {
    expect(() => normalizeSlug('')).toThrow('slug')
  })
})

describe('manifestId', () => {
  it('优先取 manifest.id', () => {
    expect(manifestId({ id: 'a', pet_id: 'b', name: 'c' })).toBe('a')
  })

  it('id 缺失时取 pet_id', () => {
    expect(manifestId({ pet_id: 'b', name: 'c' })).toBe('b')
  })

  it('id/pet_id 缺失时取 name', () => {
    expect(manifestId({ name: 'c' })).toBe('c')
  })

  it('全部缺失时用 fallback', () => {
    expect(manifestId({}, 'fallback')).toBe('fallback')
  })

  it('manifest 内的恶意 id 仍受 safePetId 校验', () => {
    expect(() => manifestId({ id: '../evil' })).toThrow('无效')
  })
})

describe('displayName', () => {
  it('优先 displayName', () => {
    const m = { displayName: '流萤', display_name: 'x', name: 'y' } as CodexPetManifest
    expect(displayName(m, 'fb')).toBe('流萤')
  })

  it('displayName 缺失时取 display_name', () => {
    const m = { display_name: '流萤', name: 'y' } as CodexPetManifest
    expect(displayName(m, 'fb')).toBe('流萤')
  })

  it('都缺失时取 name', () => {
    expect(displayName({ name: 'y' } as CodexPetManifest, 'fb')).toBe('y')
  })

  it('全部缺失时用 fallback', () => {
    expect(displayName({} as CodexPetManifest, 'fallback')).toBe('fallback')
  })
})

describe('validateZipEntries (zip-slip 防护)', () => {
  it('接受正常条目', () => {
    expect(() =>
      validateZipEntries(['pet.json', 'spritesheet.webp', 'meta/readme.md']),
    ).not.toThrow()
  })

  it('拒绝 .. 路径段（含反斜杠形式）', () => {
    expect(() => validateZipEntries(['../evil.txt'])).toThrow('ZIP 包包含非法路径')
    expect(() => validateZipEntries(['a/../../secret'])).toThrow('ZIP 包包含非法路径')
    expect(() => validateZipEntries(['a\\..\\..\\secret'])).toThrow('ZIP 包包含非法路径')
  })

  it('拒绝绝对路径条目', () => {
    expect(() => validateZipEntries(['/etc/passwd'])).toThrow('ZIP 包包含非法路径')
    expect(() => validateZipEntries(['/windows/system32/x'])).toThrow('ZIP 包包含非法路径')
  })

  it('拒绝带盘符的条目', () => {
    expect(() => validateZipEntries(['C:\\Windows\\system32'])).toThrow('ZIP 包包含非法路径')
    expect(() => validateZipEntries(['D:/escape.txt'])).toThrow('ZIP 包包含非法路径')
  })

  it('忽略空条目行', () => {
    expect(() => validateZipEntries(['', 'pet.json', ' '])).not.toThrow()
  })
})
