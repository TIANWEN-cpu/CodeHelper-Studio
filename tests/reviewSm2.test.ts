import { describe, it, expect } from 'vitest'

// review.ts 顶层 import electron / db，这些纯函数被单独导出以便测试。
// 通过 mock electron + db 让模块可被加载（注册函数不会被调用）。
import { vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../electron/db/index', () => ({ getDB: vi.fn() }))

const { addDays, computeSM2, todayISO } = await import('../electron/ipc/review')

describe('addDays (UTC-consistent, timezone-safe)', () => {
  it('adds a single day across a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })

  it('adds one day without being swallowed by UTC offset (regression: UTC+8)', () => {
    // 旧实现在 UTC+8 下会返回 '2026-06-19'（同一天）——这里必须真正 +1 天。
    expect(addDays('2026-06-19', 1)).toBe('2026-06-20')
  })

  it('rounds fractional intervals before adding', () => {
    expect(addDays('2026-01-01', 6.8)).toBe('2026-01-08') // round(6.8)=7
    expect(addDays('2026-01-01', 2.2)).toBe('2026-01-03') // round(2.2)=2
  })

  it('handles a 0-day delta as the same date', () => {
    expect(addDays('2026-03-15', 0)).toBe('2026-03-15')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('computeSM2', () => {
  it('first success: interval 1 day, repetitions 1', () => {
    const r = computeSM2(5, 0, 2.5, 1)
    expect(r.interval).toBe(1)
    expect(r.repetitions).toBe(1)
    expect(r.easeFactor).toBeGreaterThan(2.5)
  })

  it('second success: interval 6 days', () => {
    const r = computeSM2(4, 1, 2.5, 1)
    expect(r.interval).toBe(6)
    expect(r.repetitions).toBe(2)
  })

  it('third+ success: interval scales by ease factor', () => {
    const r = computeSM2(5, 2, 2.5, 6)
    expect(r.interval).toBeCloseTo(6 * r.easeFactor, 5)
    expect(r.repetitions).toBe(3)
  })

  it('failure (quality < 3) resets repetitions and interval', () => {
    const r = computeSM2(1, 5, 2.6, 30)
    expect(r.repetitions).toBe(0)
    expect(r.interval).toBe(1)
  })

  it('ease factor never drops below the 1.3 floor', () => {
    let ef = 2.5
    for (let i = 0; i < 20; i++) ef = computeSM2(0, 3, ef, 10).easeFactor
    expect(ef).toBeGreaterThanOrEqual(1.3)
  })

  it('ease factor decreases on low-quality success', () => {
    const r = computeSM2(3, 2, 2.5, 6)
    expect(r.easeFactor).toBeLessThan(2.5)
  })

  // --- 边界与精确值补充 ---

  it('quality=3 仍计入成功（>=3 阈值，repetitions 递增）', () => {
    // quality=3 是"勉强正确"，按 SM-2 标准算通过，不应重置。
    const r = computeSM2(3, 0, 2.5, 1)
    expect(r.repetitions).toBe(1) // 不是 0（失败才重置）
    expect(r.interval).toBe(1)
  })

  it('quality=2 进入失败路径（<3 阈值，重置）', () => {
    const r = computeSM2(2, 3, 2.5, 15)
    expect(r.repetitions).toBe(0)
    expect(r.interval).toBe(1)
  })

  it('quality=5 时 ease 恰好上升 +0.1', () => {
    const r = computeSM2(5, 1, 2.5, 1)
    expect(r.easeFactor).toBeCloseTo(2.6, 5)
  })

  it('quality=4 时 ease 保持不变（+0）', () => {
    const r = computeSM2(4, 1, 2.5, 1)
    expect(r.easeFactor).toBeCloseTo(2.5, 5)
  })

  it('quality=3 时 ease 下降 -0.14（精确公式值）', () => {
    // 0.1 - 2*(0.08 + 2*0.02) = 0.1 - 0.24 = -0.14
    const r = computeSM2(3, 1, 2.5, 1)
    expect(r.easeFactor).toBeCloseTo(2.36, 5)
  })

  it('第二次成功（repetitions=1）走 interval=6 固定档', () => {
    const r = computeSM2(5, 1, 2.5, 1)
    expect(r.interval).toBe(6) // 不受 currentInterval 影响
    expect(r.repetitions).toBe(2)
  })

  it('失败后再次复习时从 interval=1 重新爬升', () => {
    // 模拟：失败 → 重新答对，应进入首次成功的轨道
    const failed = computeSM2(1, 5, 2.6, 30)
    expect(failed.repetitions).toBe(0)
    const recovered = computeSM2(5, failed.repetitions, failed.easeFactor, failed.interval)
    expect(recovered.repetitions).toBe(1)
    expect(recovered.interval).toBe(1)
  })
})

describe('todayISO', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
