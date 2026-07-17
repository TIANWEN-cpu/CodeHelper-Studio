import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/settingsService', () => ({
  exportData: vi.fn(),
  importData: vi.fn(),
}))

vi.mock('../src/services/maintenanceService', () => ({
  createDatabaseBackup: vi.fn(),
  exportRecoveryLayer: vi.fn(),
  listDatabaseBackups: vi.fn(),
  openDatabaseBackupDirectory: vi.fn(),
}))

const { DataProtectionSettings } = await import('../src/views/settings/DataProtectionSettings')

describe('DataProtectionSettings', () => {
  beforeEach(() => {
    const entries = new Map<string, string>([
      ['codehelper-editor.migration-backup.2026-07-17', '{"tabs":[]}'],
      ['codehelper-editor-workspace', 'ordinary-live-state'],
      ['foreign-editor.corrupt.2026-07-17', 'outside-boundary'],
    ])
    vi.stubGlobal('window', {
      localStorage: {
        get length() {
          return entries.size
        },
        key(index: number) {
          return [...entries.keys()][index] ?? null
        },
        getItem(key: string) {
          return entries.get(key) ?? null
        },
      },
    })
  })

  it('clearly separates complete backups, portable JSON subsets, and recovery data', () => {
    const html = renderToStaticMarkup(createElement(DataProtectionSettings))

    expect(html).toContain('完整数据库备份')
    expect(html).toContain('包含全部已提交的 SQLite 数据')
    expect(html).toContain('quick_check')
    expect(html).toContain('SHA-256')
    expect(html).toContain('备份列表尚未成功读取')

    expect(html).toContain('便携数据子集')
    expect(html).toContain('JSON 仅用于跨设备迁移')
    expect(html).toContain('不包含工作区、练习草稿、课程进度、Agent 审计或 AI 密钥')

    expect(html).toContain('临时恢复层')
    expect(html).toContain('不属于完整数据库备份')
    expect(html).toContain('不会在此自动删除或恢复')
  })

  it('shows only migration and corruption entries inside the CodeHelper recovery boundary', () => {
    const html = renderToStaticMarkup(createElement(DataProtectionSettings))

    expect(html).toContain('codehelper-editor.migration-backup.2026-07-17')
    expect(html).not.toContain('codehelper-editor-workspace')
    expect(html).not.toContain('foreign-editor.corrupt.2026-07-17')
    expect(html).not.toContain('ordinary-live-state')
  })
})
