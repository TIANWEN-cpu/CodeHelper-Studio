import { useMemo, useState } from 'react'

export interface HeatMapCell {
  /** ISO date string (YYYY-MM-DD). */
  date: string
  /** Numeric value representing intensity. */
  value: number
}

export interface HeatMapProps {
  /** Array of date-value pairs. */
  data: HeatMapCell[]
  /** Number of weeks to display (default: 52). */
  weeks?: number
  /** Cell size in px. */
  cellSize?: number
  /** Gap between cells in px. */
  cellGap?: number
  /** Color levels from empty to max intensity. */
  levels?: [string, string, string, string, string]
  /** Max value for scaling (auto-calculated if omitted). */
  maxValue?: number
  /** Custom aria label. */
  ariaLabel?: string
}

const DEFAULT_LEVELS: [string, string, string, string, string] = [
  'var(--theme-bg-hover)',
  'color-mix(in srgb, var(--theme-accent) 25%, var(--theme-bg-hover))',
  'color-mix(in srgb, var(--theme-accent) 50%, var(--theme-bg-hover))',
  'color-mix(in srgb, var(--theme-accent) 75%, var(--theme-bg-hover))',
  'var(--theme-accent)',
]

const DAY_LABELS = ['', '一', '', '三', '', '五', '']
const MONTH_NAMES = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
]

/**
 * Contribution-style heatmap (like GitHub's contribution graph).
 *
 * Renders a grid of colored squares based on date-value pairs.
 * Each column represents a week, each row a day of the week.
 * Supports tooltips, responsive sizing, and theme-aware coloring.
 */
export function HeatMap({
  data,
  weeks = 52,
  cellSize = 14,
  cellGap = 3,
  levels = DEFAULT_LEVELS,
  maxValue,
  ariaLabel = '活跃热力图',
}: HeatMapProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    date: string
    value: number
    x: number
    y: number
  } | null>(null)

  const { grid, computedMax, monthHeaders } = useMemo(() => {
    // Build a lookup map from date -> value
    const lookup = new Map<string, number>()
    for (const d of data) {
      lookup.set(d.date, d.value)
    }

    const m = maxValue ?? Math.max(...data.map((d) => d.value), 1)

    // Generate date grid: columns = weeks, rows = days (Sun=0..Sat=6)
    const today = new Date()
    const endDate = new Date(today)
    // Go to the end of the current week (Saturday)
    endDate.setDate(today.getDate() + (6 - today.getDay()))

    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - (weeks * 7 - 1))

    const cells: Array<{
      date: string
      value: number
      week: number
      day: number
    }> = []

    const monthHeaders: Array<{ label: string; week: number }> = []
    let lastMonth = -1

    const cursor = new Date(startDate)
    while (cursor <= endDate) {
      const dateStr = cursor.toISOString().slice(0, 10)
      const dayOfWeek = cursor.getDay() // 0=Sun
      const weekIndex = Math.floor((cursor.getTime() - startDate.getTime()) / (7 * 86400000))

      // Track month boundaries
      const month = cursor.getMonth()
      if (month !== lastMonth) {
        lastMonth = month
        monthHeaders.push({ label: MONTH_NAMES[month], week: weekIndex })
      }

      cells.push({
        date: dateStr,
        value: lookup.get(dateStr) ?? 0,
        week: weekIndex,
        day: dayOfWeek,
      })

      cursor.setDate(cursor.getDate() + 1)
    }

    return { grid: cells, computedMax: m, monthHeaders }
  }, [data, weeks, maxValue])

  const marginLeft = 24 // space for day labels
  const marginTop = 20 // space for month labels
  const totalW = marginLeft + weeks * (cellSize + cellGap)
  const totalH = marginTop + 7 * (cellSize + cellGap)

  function getLevel(value: number): number {
    if (value === 0) return 0
    const ratio = value / computedMax
    if (ratio <= 0.25) return 1
    if (ratio <= 0.5) return 2
    if (ratio <= 0.75) return 3
    return 4
  }

  return (
    <div className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        className="w-full"
        style={{ minWidth: totalW > 600 ? totalW : undefined }}
        role="img"
        aria-label={ariaLabel}
      >
        {/* Month headers */}
        {monthHeaders.map((mh) => (
          <text
            key={mh.label + mh.week}
            x={marginLeft + mh.week * (cellSize + cellGap)}
            y={12}
            fontSize={10}
            fill="var(--theme-text-muted)"
          >
            {mh.label}
          </text>
        ))}

        {/* Day labels */}
        {DAY_LABELS.map((label, i) =>
          label ? (
            <text
              key={i}
              x={marginLeft - 6}
              y={marginTop + i * (cellSize + cellGap) + cellSize - 2}
              textAnchor="end"
              fontSize={10}
              fill="var(--theme-text-muted)"
            >
              {label}
            </text>
          ) : null,
        )}

        {/* Cells */}
        {grid.map((cell) => {
          const x = marginLeft + cell.week * (cellSize + cellGap)
          const y = marginTop + cell.day * (cellSize + cellGap)
          const level = getLevel(cell.value)

          return (
            <rect
              key={cell.date}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={levels[level]}
              onMouseEnter={() =>
                setHoveredCell({
                  date: cell.date,
                  value: cell.value,
                  x: x + cellSize / 2,
                  y: y - 8,
                })
              }
              onMouseLeave={() => setHoveredCell(null)}
              className="transition-transform hover:scale-125 origin-center"
            />
          )
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--theme-text-muted)]">
        <span>少</span>
        {levels.map((color, i) => (
          <div key={i} className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
        ))}
        <span>多</span>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: hoveredCell.x,
            top: hoveredCell.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--theme-bg-card)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text-primary)',
          }}
        >
          <div className="font-medium">{hoveredCell.date}</div>
          <div style={{ color: 'var(--theme-accent)' }}>
            {hoveredCell.value === 0 ? '无活动' : `${hoveredCell.value} 项活动`}
          </div>
        </div>
      )}
    </div>
  )
}
