import { describe, it, expect, beforeEach, vi } from 'vitest'
import { eventBus } from '../src/utils/eventBus'

// eventBus 是模块级单例，测试间状态共享。每个 describe/it 前彻底清空。
describe('eventBus', () => {
  beforeEach(() => {
    eventBus.off() // 清空所有监听器
  })

  describe('on / emit', () => {
    it('注册监听器后 emit 会以 payload 调用它', () => {
      const spy = vi.fn()
      eventBus.on('test:event', spy)
      eventBus.emit('test:event', { a: 1 })
      expect(spy).toHaveBeenCalledWith({ a: 1 })
    })

    it('同一事件多个监听器都会被调用', () => {
      const a = vi.fn()
      const b = vi.fn()
      eventBus.on('e', a)
      eventBus.on('e', b)
      eventBus.emit('e', 'x')
      expect(a).toHaveBeenCalledWith('x')
      expect(b).toHaveBeenCalledWith('x')
    })

    it('无监听器的事件 emit 不抛错', () => {
      expect(() => eventBus.emit('nobody-listens')).not.toThrow()
    })

    it('on 返回的取消函数可移除该监听器', () => {
      const spy = vi.fn()
      const off = eventBus.on('e', spy)
      off()
      eventBus.emit('e')
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('once', () => {
    it('监听器只触发一次', () => {
      const spy = vi.fn()
      eventBus.once('e', spy)
      eventBus.emit('e', 1)
      eventBus.emit('e', 2)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(1)
    })

    it('once 的监听器被移除后 listenerCount 归零', () => {
      eventBus.once('e', () => {})
      expect(eventBus.listenerCount('e')).toBe(1)
      eventBus.emit('e')
      expect(eventBus.listenerCount('e')).toBe(0)
    })

    it('once 返回的取消函数可在触发前撤销', () => {
      const spy = vi.fn()
      const off = eventBus.once('e', spy)
      off()
      eventBus.emit('e')
      expect(spy).not.toHaveBeenCalled()
    })

    it('once 内部 off 不会误删其它同名监听器', () => {
      const onceSpy = vi.fn()
      const normalSpy = vi.fn()
      eventBus.once('e', onceSpy)
      eventBus.on('e', normalSpy)
      eventBus.emit('e')
      expect(onceSpy).toHaveBeenCalledTimes(1)
      expect(normalSpy).toHaveBeenCalledTimes(1)
      // 第二次 emit：once 已移除，普通监听器仍在
      eventBus.emit('e')
      expect(onceSpy).toHaveBeenCalledTimes(1)
      expect(normalSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('off', () => {
    it('off(event, listener) 只移除指定监听器', () => {
      const a = vi.fn()
      const b = vi.fn()
      eventBus.on('e', a)
      eventBus.on('e', b)
      eventBus.off('e', a)
      eventBus.emit('e')
      expect(a).not.toHaveBeenCalled()
      expect(b).toHaveBeenCalled()
    })

    it('off(event) 移除该事件全部监听器', () => {
      const a = vi.fn()
      const b = vi.fn()
      eventBus.on('e', a)
      eventBus.on('e', b)
      eventBus.off('e')
      eventBus.emit('e')
      expect(a).not.toHaveBeenCalled()
      expect(b).not.toHaveBeenCalled()
    })

    it('off() 清空所有事件的所有监听器', () => {
      eventBus.on('a', vi.fn())
      eventBus.on('b', vi.fn())
      eventBus.off()
      expect(eventBus.listenerCount('a')).toBe(0)
      expect(eventBus.listenerCount('b')).toBe(0)
    })

    it('off 移除最后一个监听器后清空事件的 Set', () => {
      const a = vi.fn()
      eventBus.on('e', a)
      eventBus.off('e', a)
      expect(eventBus.listenerCount('e')).toBe(0)
      // 再 emit 不报错（Set 已被 delete）
      expect(() => eventBus.emit('e')).not.toThrow()
    })
  })

  describe('错误隔离', () => {
    it('一个监听器抛错不影响其它监听器执行', () => {
      const ok = vi.fn()
      eventBus.on('e', () => {
        throw new Error('boom')
      })
      eventBus.on('e', ok)
      expect(() => eventBus.emit('e')).not.toThrow()
      expect(ok).toHaveBeenCalled()
    })
  })

  describe('listenerCount / hasListeners', () => {
    it('正确计数', () => {
      expect(eventBus.hasListeners('e')).toBe(false)
      eventBus.on('e', vi.fn())
      eventBus.on('e', vi.fn())
      expect(eventBus.listenerCount('e')).toBe(2)
      expect(eventBus.hasListeners('e')).toBe(true)
    })

    it('未知事件计数为 0', () => {
      expect(eventBus.listenerCount('never')).toBe(0)
    })
  })
})
