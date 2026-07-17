// preload.ts 顶层 import electron（contextBridge/ipcRenderer）。isSerializable 是纯函数，
// mock 掉 electron 即可加载（contextBridge.exposeInMainWorld 会在 import 时执行）。
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}))

import { describe, it, expect } from 'vitest'
import { isSerializable, allowedInvokeChannels, allowedEventChannels } from '../electron/preload'

describe('isSerializable (IPC 安全序列化校验)', () => {
  describe('接受的原始值', () => {
    it('null / undefined', () => {
      expect(isSerializable(null)).toBe(true)
      expect(isSerializable(undefined)).toBe(true)
    })
    it('string / number / boolean', () => {
      expect(isSerializable('x')).toBe(true)
      expect(isSerializable(42)).toBe(true)
      expect(isSerializable(true)).toBe(true)
    })
  })

  describe('拒绝的危险类型', () => {
    it('function', () => {
      expect(isSerializable(() => {})).toBe(false)
    })
    it('symbol', () => {
      expect(isSerializable(Symbol('s'))).toBe(false)
    })
    it('bigint', () => {
      expect(isSerializable(10n)).toBe(false)
    })
  })

  describe('数组', () => {
    it('纯原始值数组通过', () => {
      expect(isSerializable([1, 'a', true])).toBe(true)
    })
    it('含函数的数组拒绝', () => {
      expect(isSerializable([1, () => {}])).toBe(false)
    })
    it('空数组通过', () => {
      expect(isSerializable([])).toBe(true)
    })
    it('嵌套数组递归校验', () => {
      expect(isSerializable([[1, 2], [3]])).toBe(true)
      expect(isSerializable([[1], [Symbol('x')]])).toBe(false)
    })
  })

  describe('普通对象', () => {
    it('纯原始值对象通过', () => {
      expect(isSerializable({ a: 1, b: 'x' })).toBe(true)
    })
    it('嵌套对象递归校验', () => {
      expect(isSerializable({ a: { b: { c: 1 } } })).toBe(true)
      expect(isSerializable({ a: { b: () => {} } })).toBe(false)
    })
    it('含函数的对象拒绝', () => {
      expect(isSerializable({ fn: () => {} })).toBe(false)
    })
  })

  describe('非普通对象（防原型/类实例穿越）', () => {
    it('类实例拒绝', () => {
      class Foo {
        x = 1
      }
      expect(isSerializable(new Foo())).toBe(false)
    })
    it('Error 实例拒绝', () => {
      expect(isSerializable(new Error('x'))).toBe(false)
    })
    it('Map / Set 拒绝', () => {
      expect(isSerializable(new Map())).toBe(false)
      expect(isSerializable(new Set())).toBe(false)
    })
    it('Date 实例拒绝', () => {
      expect(isSerializable(new Date())).toBe(false)
    })
  })

  describe('深度限制', () => {
    it('深度超过 10 层拒绝（防栈耗尽 DoS）', () => {
      // 构造 11 层嵌套对象
      let v: unknown = 1
      for (let i = 0; i < 11; i++) v = { a: v }
      expect(isSerializable(v)).toBe(false)
    })
    it('恰好 10 层嵌套通过', () => {
      let v: unknown = 1
      for (let i = 0; i < 10; i++) v = { a: v }
      expect(isSerializable(v)).toBe(true)
    })
  })
})

describe('IPC 通道白名单', () => {
  it('invoke 白名单包含核心运行/AI/DB 通道', () => {
    // 关键通道必须在白名单内，否则渲染进程调用会被 preload 拒绝
    const core = ['run-code', 'ai-chat', 'db-get-setting', 'db-set-setting']
    for (const ch of core) {
      expect(allowedInvokeChannels.has(ch)).toBe(true)
    }
  })

  it('event 白名单包含 AI 流式事件', () => {
    expect(allowedEventChannels.has('ai-chat-chunk')).toBe(true)
    expect(allowedEventChannels.has('ai-chat-done')).toBe(true)
  })

  it('工作区持久化通道只通过显式白名单暴露', () => {
    const workspaceChannels = [
      'editor-workspace-load',
      'editor-tab-save',
      'editor-tab-update-view-state',
      'editor-tab-close',
      'editor-tab-reopen',
      'editor-tab-delete',
      'editor-workspace-set-active',
    ]
    for (const channel of workspaceChannels) {
      expect(allowedInvokeChannels.has(channel)).toBe(true)
    }
    expect(allowedEventChannels.has('editor-workspace-changed')).toBe(true)
  })

  it('只暴露受约束的数据保护与能力通道，不暴露任意文件路径导入导出', () => {
    const maintenanceChannels = [
      'database-backups-list',
      'database-backup-create',
      'database-backups-open-directory',
      'recovery-layer-export',
      'system-capabilities-get',
    ]
    for (const channel of maintenanceChannels) {
      expect(allowedInvokeChannels.has(channel)).toBe(true)
    }

    expect(allowedInvokeChannels.has('export-data-to-path')).toBe(false)
    expect(allowedInvokeChannels.has('import-data-from-path')).toBe(false)
  })

  it('白名单非空', () => {
    expect(allowedInvokeChannels.size).toBeGreaterThan(10)
    expect(allowedEventChannels.size).toBeGreaterThanOrEqual(2)
  })

  it('未列入白名单的通道被拒绝（白名单语义正确）', () => {
    expect(allowedInvokeChannels.has('arbitrary-evil-channel')).toBe(false)
    expect(allowedEventChannels.has('arbitrary-event')).toBe(false)
  })
})
