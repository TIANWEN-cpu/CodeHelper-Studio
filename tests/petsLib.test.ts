import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getPetAtlas,
  getPetState,
  readStoredPetSource,
  persistPetSource,
  DEFAULT_PET_ID,
  PET_SOURCE_STORAGE_KEY,
  type CodexPetManifest,
} from '../src/lib/pets'

// 注意：本文件测 src/lib/pets.ts 的纯函数 getPetAtlas / getPetState /
// readStoredPetSource / persistPetSource。与 tests/petReactions.ts（行为触发）区分开。

function manifest(partial: Partial<CodexPetManifest> = {}): CodexPetManifest {
  return { ...partial } as CodexPetManifest
}

describe('getPetAtlas', () => {
  it('使用 manifest 提供的 atlas 尺寸', () => {
    const m = manifest({
      atlas: { columns: 4, rows: 5, cell_width: 100, cell_height: 120 },
    })
    expect(getPetAtlas(m)).toEqual({
      columns: 4,
      rows: 5,
      cellWidth: 100,
      cellHeight: 120,
    })
  })

  it('atlas 字段缺失时回退到默认 8/9/192/208', () => {
    expect(getPetAtlas(manifest())).toEqual({
      columns: 8,
      rows: 9,
      cellWidth: 192,
      cellHeight: 208,
    })
  })

  it('atlas 为 undefined 时也回退到默认', () => {
    expect(getPetAtlas(manifest({ atlas: undefined }))).toMatchObject({
      columns: 8,
      rows: 9,
    })
  })

  it('部分字段缺失时混合使用默认值', () => {
    const m = manifest({ atlas: { columns: 6 } }) // rows/cell_* 缺失
    expect(getPetAtlas(m)).toEqual({
      columns: 6,
      rows: 9, // 默认
      cellWidth: 192, // 默认
      cellHeight: 208, // 默认
    })
  })
})

describe('getPetState', () => {
  it('返回匹配 preferred state 的行', () => {
    const m = manifest({
      rows: [
        { state: 'idle', row: 0, frames: 6 },
        { state: 'happy', row: 2, frames: 8 },
      ],
    })
    expect(getPetState(m, 'happy')).toEqual({ state: 'happy', row: 2, frames: 8 })
  })

  it('preferred 不匹配时回退到 idle 行', () => {
    const m = manifest({
      rows: [
        { state: 'idle', row: 0, frames: 6 },
        { state: 'happy', row: 2, frames: 8 },
      ],
    })
    // 请求一个不存在的 state，应回退 idle
    expect(getPetState(m, 'celebrate')).toEqual({ state: 'idle', row: 0, frames: 6 })
  })

  it('preferred 默认为 idle', () => {
    const m = manifest({
      rows: [{ state: 'idle', row: 0, frames: 6 }],
    })
    expect(getPetState(m)).toEqual({ state: 'idle', row: 0, frames: 6 })
  })

  it('rows 为空或缺失时返回硬编码默认 idle 行', () => {
    expect(getPetState(manifest())).toEqual({ state: 'idle', row: 0, frames: 6 })
    expect(getPetState(manifest({ rows: [] }))).toEqual({ state: 'idle', row: 0, frames: 6 })
  })

  it('无 idle 行也无匹配时仍返回硬编码默认', () => {
    const m = manifest({ rows: [{ state: 'happy', row: 2, frames: 8 }] })
    // preferred（默认 idle）不匹配、也没有 idle 行 → 硬编码默认
    expect(getPetState(m)).toEqual({ state: 'idle', row: 0, frames: 6 })
  })
})

describe('readStoredPetSource / persistPetSource', () => {
  const store: Record<string, string> = {}
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn((k: string) => store[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          store[k] = v
        }),
      },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未存储时返回默认 pet id', () => {
    expect(readStoredPetSource()).toBe(DEFAULT_PET_ID)
  })

  it('读取已存储的 pet id', () => {
    store[PET_SOURCE_STORAGE_KEY] = 'custom-pet'
    expect(readStoredPetSource()).toBe('custom-pet')
  })

  it('空串视为未设置，回退默认', () => {
    store[PET_SOURCE_STORAGE_KEY] = ''
    expect(readStoredPetSource()).toBe(DEFAULT_PET_ID)
  })

  it('persist 后能读回', () => {
    persistPetSource('happy-dog')
    expect(readStoredPetSource()).toBe('happy-dog')
  })

  it('localStorage 抛错时 read 回退默认（不崩溃）', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied')
        },
      },
    })
    expect(readStoredPetSource()).toBe(DEFAULT_PET_ID)
  })

  it('localStorage 抛错时 persist 静默忽略（不崩溃）', () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new Error('denied')
        },
      },
    })
    expect(() => persistPetSource('x')).not.toThrow()
  })
})
