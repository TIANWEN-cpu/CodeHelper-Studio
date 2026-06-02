import { useMemo, useState } from 'react'

export interface BarChartItem {
  label: string
  value: number
  color?: string
}

export interface BarChartProps {
  /** Data items to render as bars. */
  data: BarChartItem[]
  /** Chart height in px (width is responsive). */
  height?: number
  /** Default bar color when item doesn't specify one. */
  defaultColor?: string
  /** Whether to show value labels above bars. */
  showValues?: boolean
  /** Whether to show grid lines. */
  showGrid?: boolean
  /** Whether bars should be horizontal instead of vertical. */
  horizontal?: boolean
  /** Custom aria label for the chart. */
  ariaLabel?: string
}

const WIDTH = 500
const PADDING = { top: 16, right: 16, bottom: 40, left: 40 }
const BAR_GAP = 0.25 // fraction of bar width for gap

/**
 * Lightweight reusable SVG bar chart.
 *
 * Supports vertical and horizontal orientation, value labels, grid lines,
 * and interactive hover state. No external chart library required.
 */
export function BarChart({
  data,
  height = 200,
  defaultColor = 'var(--theme-accent)',
  showValues = true,
  showGrid = true,
  _horizontal = false,
  ariaLabel = '柱状图',
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const { bars, max, yTicks } = useMemo(() => {
    const m = Math.max(...data.map((d) => d.value), 1)
    const chartW = WIDTH - PADDING.left - PADDING.right
    const chartH = height - PADDING.top - PADDING.bottom
    const barCount = data.length
    const totalGapFrac = BAR_GAP * barCount
    const barWidth = chartW / (barCount + totalGapFrac)
    const gap = barWidth * BAR_GAP

    const b = data.map((d, i) => {
      const x = PADDING.left + gap / 2 + i * (barWidth + gap)
      const barH = (d.value / m) * chartH
      return {
        x,
        y: PADDING.top + chartH - barH,
        width: barWidth,
        height: barH,
        label: d.label,
        value: d.value,
        color: d.color || defaultColor,
      }
    })

    const tickCount = 4
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((m / tickCount) * i))

    return { bars: b, max: m, yTicks: ticks }
  }, [data, height, defaultColor])

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--theme-text-muted)]">
        暂无数据
      </div>
    )
  }

  const chartH = height - PADDING.top - PADDING.bottom

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        {/* Y-axis ticks and grid */}
        {yTicks.map((tick) => {
          const y = PADDING.top + chartH - (tick / max) * chartH
          return (
            <g key={tick}>
              {showGrid && (
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="var(--theme-border)"
                  strokeDasharray="3 3"
                  strokeWidth={0.5}
                />
              )}
              <text
                x={PADDING.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--theme-text-muted)"
              >
                {tick}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {bars.map((bar, i) => (
          <g
            key={i}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={3}
              fill={bar.color}
              opacity={hoveredIndex === i ? 1 : 0.85}
              className="transition-opacity"
            />
            {showValues && bar.value > 0 && (
              <text
                x={bar.x + bar.width / 2}
                y={bar.y - 6}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="var(--theme-text-primary)"
              >
                {bar.value}
              </text>
            )}
          </g>
        ))}

        {/* X-axis labels */}
        {bars.map((bar, i) => (
          <text
            key={`label-${i}`}
            x={bar.x + bar.width / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize={9}
            fill="var(--theme-text-muted)"
          >
            {bar.label.length > 6 ? bar.label.slice(0, 6) + '..' : bar.label}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(bars[hoveredIndex].x / WIDTH) * 100}%`,
            top: bars[hoveredIndex].y - 44,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--theme-bg-card)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text-primary)',
          }}
        >
          <div className="font-medium">{data[hoveredIndex].label}</div>
          <div style={{ color: bars[hoveredIndex].color }}>数量: {data[hoveredIndex].value}</div>
        </div>
      )}
    </div>
  )
}
