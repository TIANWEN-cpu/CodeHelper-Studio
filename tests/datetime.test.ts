import { describe, it, expect } from 'vitest'
import { parseDbTimestamp, utcDateKey } from '../src/lib/datetime'

describe('parseDbTimestamp', () => {
  it('parses a SQLite UTC timestamp (no zone) as UTC, not local', () => {
    const d = parseDbTimestamp('2026-06-19 23:00:00')
    expect(d.getTime()).toBe(Date.UTC(2026, 5, 19, 23, 0, 0))
  })

  it('parses a date-only string as UTC midnight', () => {
    const d = parseDbTimestamp('2026-06-19')
    expect(d.getTime()).toBe(Date.UTC(2026, 5, 19, 0, 0, 0))
  })

  it('respects an explicit Z zone', () => {
    const d = parseDbTimestamp('2026-06-19T23:00:00Z')
    expect(d.getTime()).toBe(Date.UTC(2026, 5, 19, 23, 0, 0))
  })

  it('respects an explicit numeric offset', () => {
    const d = parseDbTimestamp('2026-06-19T23:00:00+08:00')
    expect(d.getTime()).toBe(Date.UTC(2026, 5, 19, 15, 0, 0))
  })

  it('returns an invalid date for empty input', () => {
    expect(isNaN(parseDbTimestamp('').getTime())).toBe(true)
  })
})

describe('utcDateKey', () => {
  it('formats the UTC date with zero-padding', () => {
    expect(utcDateKey(new Date(Date.UTC(2026, 0, 5, 12, 0, 0)))).toBe('2026-01-05')
  })

  it('returns empty string for an invalid date', () => {
    expect(utcDateKey(new Date(NaN))).toBe('')
  })

  it('keys a late-UTC instant to its UTC day (the off-by-one regression)', () => {
    // 23:00 UTC on the 19th: a local +08:00 reading would roll to the 20th.
    // The whole point of the fix is that the key stays on the UTC day.
    expect(utcDateKey(parseDbTimestamp('2026-06-19 23:00:00'))).toBe('2026-06-19')
  })

  it('round-trips a backend timestamp to its backend DATE() bucket', () => {
    // Backend buckets via DATE(timestamp) in UTC; the heatmap must look up the same key.
    const ts = '2026-06-19 16:30:00'
    expect(utcDateKey(parseDbTimestamp(ts))).toBe('2026-06-19')
  })
})
