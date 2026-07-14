// analytics.ts 顶层 import getDB（DB 副作用）。computeWeekRange 是纯函数，mock 掉 DB。
vi.mock('../electron/db/index', () => ({ getDB: vi.fn() }))

import { describe, it, expect } from 'vitest'
import { computeWeekRange } from '../electron/utils/analytics'

describe('computeWeekRange (UTC 周一到周日边界)', () => {
  it('周三为基准：本周范围是本周一到本周日', () => {
    // 2026-07-01 是周三
    const now = new Date('2026-07-01T15:30:00Z')
    const { startStr, endStr } = computeWeekRange(now, 0)
    expect(startStr).toBe('2026-06-29') // 周一
    expect(endStr).toBe('2026-07-05 23:59:59') // 周日
  })

  it('周日（getUTCDay==0）按 7 处理，落到本周而非下周', () => {
    // 2026-07-05 是周日；周一开始的周里，周日应属于"本周"末尾
    const now = new Date('2026-07-05T10:00:00Z')
    const { startStr, endStr } = computeWeekRange(now, 0)
    expect(startStr).toBe('2026-06-29') // 本周一
    expect(endStr).toBe('2026-07-05 23:59:59') // 本周日（当天）
  })

  it('周一为基准：startStr 就是当天', () => {
    // 2026-06-29 是周一
    const now = new Date('2026-06-29T00:00:00Z')
    expect(computeWeekRange(now, 0).startStr).toBe('2026-06-29')
  })

  it('weekOffset=-1 返回上周范围', () => {
    const now = new Date('2026-07-01T15:30:00Z') // 周三
    const { startStr, endStr } = computeWeekRange(now, -1)
    expect(startStr).toBe('2026-06-22') // 上周一
    expect(endStr).toBe('2026-06-28 23:59:59') // 上周日
  })

  it('weekOffset=1 返回下周范围', () => {
    const now = new Date('2026-07-01T15:30:00Z') // 周三
    const { startStr, endStr } = computeWeekRange(now, 1)
    expect(startStr).toBe('2026-07-06') // 下周一
    expect(endStr).toBe('2026-07-12 23:59:59') // 下周日
  })

  it('跨月边界正确（6月底→7月初）', () => {
    // 2026-07-01 周三 → 本周一是 6-29（跨月）
    const now = new Date('2026-07-01T00:00:00Z')
    const { startStr, endStr } = computeWeekRange(now, 0)
    expect(startStr).toBe('2026-06-29')
    expect(endStr).toBe('2026-07-05 23:59:59')
  })

  it('跨年边界正确（2026→2027）', () => {
    // 2027-01-01 是周五 → 本周一是 2026-12-28
    const now = new Date('2027-01-01T00:00:00Z')
    const { startStr, endStr } = computeWeekRange(now, 0)
    expect(startStr).toBe('2026-12-28')
    expect(endStr).toBe('2027-01-03 23:59:59')
  })

  it('startStr/endStr 都是 UTC 日期（不受本地时区偏移影响）', () => {
    // 即使运行环境是 UTC+8，UTC 边界也应稳定
    const now = new Date('2026-07-01T23:30:00Z') // UTC 23:30
    const { startStr } = computeWeekRange(now, 0)
    expect(startStr).toBe('2026-06-29') // 仍是本周一，不被本地时区吞成次日
  })

  it('endStr 格式始终为 "YYYY-MM-DD 23:59:59"', () => {
    const now = new Date('2026-07-01T00:00:00Z')
    expect(computeWeekRange(now, 0).endStr).toMatch(/^\d{4}-\d{2}-\d{2} 23:59:59$/)
    expect(computeWeekRange(now, -3).endStr).toMatch(/^\d{4}-\d{2}-\d{2} 23:59:59$/)
  })
})
