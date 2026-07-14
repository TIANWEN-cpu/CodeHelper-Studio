// datetime.ts
// 统一处理后端时间戳的时区问题。后端 SQLite 的 CURRENT_TIMESTAMP 存的是 UTC 的
// "YYYY-MM-DD HH:MM:SS"（无时区标记），而 Chromium 的 new Date() 会把这种无时区
// 字符串按**本地时区**解析——在 UTC+8 下整整偏 8 小时，并导致按天分桶错位一天。
// 全应用按天/相对时间的口径都应通过这里，保持与后端 DATE(timestamp)（UTC）一致。
// 参见记忆：codehelper date UTC convention。

/**
 * 把后端时间戳解析为正确的 Date：
 * - 已带时区（Z 或 ±HH:MM）的原样解析；
 * - 纯日期 "YYYY-MM-DD" 按 UTC 零点；
 * - "YYYY-MM-DD HH:MM:SS"（UTC 无标记）补 T 与 Z 后按 UTC 解析。
 */
export function parseDbTimestamp(ts: string): Date {
  if (!ts) return new Date(NaN)
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) return new Date(ts)
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return new Date(`${ts}T00:00:00Z`)
  return new Date(`${ts.replace(' ', 'T')}Z`)
}

/** 取某个时刻的 UTC 日期键 "YYYY-MM-DD"，与后端 DATE(timestamp) 对齐。 */
export function utcDateKey(d: Date): string {
  if (isNaN(d.getTime())) return ''
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return `${d.getUTCFullYear()}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`
}
