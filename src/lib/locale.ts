// 区域格式：驱动应用内"绝对日期"的显示风格。
// 与设置页"语言与区域 → 区域格式"开关联动，由全局 store 持有当前值。

import { parseDbTimestamp, utcDateKey } from './datetime'

export type RegionFormat = 'zh-CN' | 'iso' | 'en-US'

export const REGION_OPTIONS: { value: RegionFormat; label: string; sample: string }[] = [
  { value: 'zh-CN', label: '中文', sample: '2026年6月4日' },
  { value: 'iso', label: 'ISO (年-月-日)', sample: '2026-06-04' },
  { value: 'en-US', label: '英文 (US)', sample: 'Jun 4, 2026' },
]

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * 按区域格式渲染日期/时间。
 * - 'iso' 走固定 YYYY-MM-DD（含时间选项时追加 HH:mm），与 Intl 无关、稳定可读；
 * - 其余走 Intl.DateTimeFormat(locale, opts)。
 * 非法输入返回空串，调用方据此回退。
 */
export function formatDate(
  input: string | number | Date,
  region: RegionFormat,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const d =
    input instanceof Date
      ? input
      : typeof input === 'number'
        ? new Date(input)
        : parseDbTimestamp(input)
  if (isNaN(d.getTime())) return ''
  if (region === 'iso') {
    // 取 UTC 日期（与后端 DATE(timestamp) 及全应用 UTC 口径一致）。
    // 修复前用本地 getter（getFullYear/getDate…），在 UTC+8 下会把 UTC 23:30
    // 的日期显示成次日，导致绝对日期比后端少/多一天。
    const base = utcDateKey(d)
    if (opts.hour != null || opts.minute != null) {
      return `${base} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
    }
    return base
  }
  return new Intl.DateTimeFormat(region, opts).format(d)
}
