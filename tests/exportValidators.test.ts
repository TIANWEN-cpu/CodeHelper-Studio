// export.ts 顶层 import electron + fs + db。validators 用到 fs（existsSync），
// 故只 mock electron 与 db，fs 用真实临时目录。
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, dialog: {}, BrowserWindow: {} }))
vi.mock('../electron/db/index', () => ({ getDB: vi.fn() }))

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { validateFilePath, validateExportData } from '../electron/ipc/export'

describe('validateFilePath', () => {
  let tempDir: string
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'expval-'))
  })
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('存在的 .json 文件路径返回 null（通过）', () => {
    const file = join(tempDir, 'export.json')
    expect(validateFilePath(file)).toBeNull()
  })

  it('非字符串或空串返回错误', () => {
    expect(validateFilePath('')).toBe('文件路径无效')
    expect(validateFilePath('   ')).toBe('文件路径无效')
  })

  it('包含 null 字节返回错误', () => {
    expect(validateFilePath(join(tempDir, 'a\0b.json'))).toBe('文件路径包含非法字符')
  })

  it('非 .json 后缀返回错误', () => {
    const file = join(tempDir, 'export.txt')
    writeFileSync(file, 'x')
    expect(validateFilePath(file)).toBe('仅支持 .json 文件')
  })

  it('父目录不存在返回错误', () => {
    expect(validateFilePath(join(tempDir, 'no-such-dir', 'x.json'))).toBe('目标目录不存在')
  })
})

describe('validateExportData', () => {
  const valid = {
    version: 1,
    exportedAt: '2026-07-03T00:00:00Z',
  }

  it('合法最小数据（仅 version + exportedAt）通过', () => {
    expect(validateExportData(valid)).toBe(true)
  })

  it('带合法分类数组通过', () => {
    expect(validateExportData({ ...valid, problems: [{ id: 1 }], settings: [{ k: 'v' }] })).toBe(
      true,
    )
  })

  it('version 缺失或非数字不通过', () => {
    expect(validateExportData({ exportedAt: 'x' })).toBe(false)
    expect(validateExportData({ version: '1', exportedAt: 'x' })).toBe(false)
  })

  it('version < 1 不通过', () => {
    expect(validateExportData({ version: 0, exportedAt: 'x' })).toBe(false)
  })

  it('exportedAt 非字符串不通过', () => {
    expect(validateExportData({ version: 1, exportedAt: 123 })).toBe(false)
  })

  it('分类字段非数组不通过', () => {
    expect(validateExportData({ ...valid, problems: 'not-array' })).toBe(false)
    expect(validateExportData({ ...valid, problems: {} })).toBe(false)
  })

  it('分类数组含非对象元素不通过', () => {
    expect(validateExportData({ ...valid, problems: [1, 2] })).toBe(false)
    expect(validateExportData({ ...valid, problems: [null] })).toBe(false)
    expect(validateExportData({ ...valid, problems: ['str'] })).toBe(false)
  })

  it('null / 原始值 不通过', () => {
    expect(validateExportData(null)).toBe(false)
    expect(validateExportData(undefined)).toBe(false)
    expect(validateExportData('string')).toBe(false)
    expect(validateExportData(123)).toBe(false)
  })

  it('空分类数组通过（允许导出空分类）', () => {
    expect(validateExportData({ ...valid, problems: [] })).toBe(true)
  })
})
