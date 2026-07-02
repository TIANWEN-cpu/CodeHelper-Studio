// preload.ts 顶层 import electron（contextBridge/ipcRenderer）。isSerializable 是纯函数，
// mock 掉 electron 即可加载（contextBridge.exposeInMainWorld 会在 import 时执行）。
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}))

import { describe, it, expect } from 'vitest'
import { isSerializable } from '../electron/preload'

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
