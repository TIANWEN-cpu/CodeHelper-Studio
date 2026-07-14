import { describe, it, expect } from 'vitest'
import { formatDate, REGION_OPTIONS, type RegionFormat } from '../src/lib/locale'

describe('REGION_OPTIONS', () => {
  it('包含 zh-CN / iso / en-US 三种区域', () => {
    const values = REGION_OPTIONS.map((o) => o.value).sort()
    expect(values).toEqual(['en-US', 'iso', 'zh-CN'])
  })

  it('每个选项都有展示用的 sample', () => {
    for (const o of REGION_OPTIONS) {
      expect(o.label).toBeTruthy()
      expect(o.sample).toBeTruthy()
    }
  })
})

describe('formatDate', () => {
  describe('非法输入', () => {
    it('空串返回空', () => {
      expect(formatDate('', 'iso')).toBe('')
    })

    it('乱码返回空', () => {
      expect(formatDate('not-a-date', 'iso')).toBe('')
    })

    it('NaN 数字返回空', () => {
      expect(formatDate(NaN, 'iso')).toBe('')
    })

    it('Invalid Date 对象返回空', () => {
      expect(formatDate(new Date(NaN), 'iso')).toBe('')
    })
  })

  describe('iso 区域（关键：必须按 UTC 日期，不随本地时区偏移）', () => {
    // 后端 SQLite 存 CURRENT_TIMESTAMP（UTC 无标记）。parseDbTimestamp 会把它当 UTC 解析。
    // iso 分支渲染日期时也必须取 UTC 日期，否则在 UTC+8 会把 23:30 的 UTC 日期显示成次日。
    it('UTC 边界时间 23:30 的日期不被本地时区吞掉（UTC 口径显示当天）', () => {
      // 后端 "2026-06-19 23:30:00" 是 UTC；按 UTC 口径应显示 2026-06-19。
      // （修复前在 UTC+8 会返回 2026-06-20）
      expect(formatDate('2026-06-19 23:30:00', 'iso')).toBe('2026-06-19')
    })

    it('纯日期 YYYY-MM-DD 按 UTC 零点解析', () => {
      expect(formatDate('2026-06-19', 'iso')).toBe('2026-06-19')
    })

    it('已带 Z 时区标记的时间戳原样按 UTC 解析', () => {
      expect(formatDate('2026-06-19T23:30:00Z', 'iso')).toBe('2026-06-19')
    })

    it('带 hour/minute 选项时追加 HH:mm（UTC 时分）', () => {
      expect(formatDate('2026-06-19 23:30:00', 'iso', { hour: '2-digit', minute: '2-digit' })).toBe(
        '2026-06-19 23:30',
      )
    })

    it('只给 date 时不追加时间部分', () => {
      expect(formatDate('2026-06-19 09:05:00', 'iso')).toBe('2026-06-19')
    })
  })

  describe('zh-CN / en-US 区域（走 Intl）', () => {
    it('zh-CN 返回本地化日期', () => {
      const out = formatDate('2026-06-19', 'zh-CN' as RegionFormat)
      expect(out).toContain('2026')
      expect(out).toMatch(/6|06/)
      expect(out).toContain('19')
    })

    it('en-US 返回英文月份', () => {
      const out = formatDate('2026-06-19', 'en-US' as RegionFormat)
      expect(out).toContain('2026')
      expect(out).toMatch(/Jun/i)
    })
  })

  describe('不同输入类型', () => {
    it('接受 Date 对象', () => {
      // UTC 2026-06-19T12:00:00Z → iso 显示 2026-06-19
      expect(formatDate(new Date('2026-06-19T12:00:00Z'), 'iso')).toBe('2026-06-19')
    })

    it('接受毫秒时间戳', () => {
      // 2026-06-19T12:00:00Z = 1781870400000
      expect(formatDate(1781870400000, 'iso')).toBe('2026-06-19')
    })
  })
})
