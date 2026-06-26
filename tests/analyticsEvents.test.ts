import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAll = vi.fn((..._args: unknown[]) => [] as unknown[])
const mockPrepare = vi.fn(() => ({ all: mockAll }))

vi.mock('../electron/db/index', () => ({ getDB: () => ({ prepare: mockPrepare }) }))

const { getEvents } = await import('../electron/utils/analytics')

beforeEach(() => {
  mockPrepare.mockClear()
  mockAll.mockClear()
})

describe('getEvents limit', () => {
  it('appends a LIMIT clause with the default cap (200) when unspecified', () => {
    getEvents()
    const sql = mockPrepare.mock.calls[0][0] as string
    expect(sql).toContain('LIMIT ?')
    // all(...params) 是 spread 调用，最后一次实参即 LIMIT 绑定值。
    const lastArg = mockAll.mock.calls[0].at(-1)
    expect(lastArg).toBe(200)
  })

  it('honors an explicit smaller limit as the bound parameter', () => {
    getEvents(undefined, undefined, undefined, 10)
    expect(mockAll.mock.calls[0].at(-1)).toBe(10)
    getEvents(undefined, undefined, undefined, 1)
    expect(mockAll.mock.calls[1].at(-1)).toBe(1)
  })

  it('clamps an oversized limit to 1000', () => {
    getEvents(undefined, undefined, undefined, 99999)
    expect(mockAll.mock.calls[0].at(-1)).toBe(1000)
  })

  it('ignores non-positive / non-finite limits (falls back to default)', () => {
    getEvents(undefined, undefined, undefined, 0)
    expect(mockAll.mock.calls[0].at(-1)).toBe(200)
    getEvents(undefined, undefined, undefined, -5)
    expect(mockAll.mock.calls[1].at(-1)).toBe(200)
    getEvents(undefined, undefined, undefined, NaN)
    expect(mockAll.mock.calls[2].at(-1)).toBe(200)
  })

  it('builds optional filters before the LIMIT in order', () => {
    getEvents('code_run', '2026-06-01', '2026-06-30', 5)
    const sql = mockPrepare.mock.calls[0][0] as string
    expect(sql).toMatch(/ORDER BY timestamp DESC[\s\S]*LIMIT \?$/)
    expect(mockAll.mock.calls[0]).toEqual(['code_run', '2026-06-01', '2026-06-30', 5])
  })
})
