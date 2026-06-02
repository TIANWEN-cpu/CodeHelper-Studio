import { useMemo, useState } from 'react'

export interface LineChartPoint {
  label: string
  value: number
}

export interface LineChartProps {
  /** Data points to render. */
  data: LineChartPoint[]
  /** Chart height in px (width is responsive). */
  height?: number
  /** Y-axis label shown above the chart. */
  yLabel?: string
  /** Primary line color (CSS value). */
  color?: string
  /** Whether to show area fill under the line. */
  showArea?: boolean
  /** Whether to show grid lines. */
  showGrid?: boolean
  /** Whether to show dots on each data point. */
  showDots?: boolean
  /** Custom aria label for the chart. */
  ariaLabel?: string
}

const DEFAULT_COLOR = 'var(--theme-accent)'
const WIDTH = 500
const PADDING = { top: 16, right: 16, bottom: 32, left: 40 }

/**
 * Lightweight reusable SVG line chart.
 *
 * Supports area fill, grid lines, interactive tooltips, and responsive sizing.
 * No external chart library required.
 */
export function LineChart({
  data,
  height = 180,
  yLabel,
  color = DEFAULT_COLOR,
  showArea = true,
  showGrid = true,
  showDots = true,
  ariaLabel = '折线图',
}: LineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const { chartW, chartH, max, points, yTicks } = useMemo(() => {
    const cw = WIDTH - PADDING.left - PADDING.right
    const ch = height - PADDING.top - PADDING.bottom
    const m = Math.max(...data.map((d) => d.value), 1)

    const pts = data.map((d, i) => ({
      x: PADDING.left + (i / Math.max(data.length - 1, 1)) * cw,
      y: PADDING.top + ch - (d.value / m) * ch,
    }))

    // Nice round Y ticks
    const tickCount = 4
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((m / tickCount) * i))

    return { chartW: cw, chartH: ch, max: m, points: pts, yTicks: ticks }
  }, [data, height])

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--theme-text-muted)]">
        暂无数据
      </div>
    )
  }

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  const areaD = showArea
    ? `${pathD} L ${points[points.length - 1].x} ${PADDING.top + chartH} L ${points[0].x} ${PADDING.top + chartH} Z`
    : ''

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

        {/* Area fill */}
        {showArea && <path d={areaD} fill={color} opacity={0.08} />}

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {showDots &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 4.5 : 3}
              fill={color}
              className="transition-all"
            />
          ))}

        {/* Hover columns (invisible hit areas) */}
        {points.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={p.x - chartW / data.length / 2}
            y={PADDING.top}
            width={chartW / data.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}

        {/* X-axis labels */}
        {data
          .filter((_, i) => i % Math.ceil(data.length / 8) === 0 || i === data.length - 1)
          .map((d) => {
            const idx = data.indexOf(d)
            return (
              <text
                key={idx}
                x={PADDING.left + (idx / Math.max(data.length - 1, 1)) * chartW}
                y={height - 6}
                textAnchor="middle"
                fontSize={9}
                fill="var(--theme-text-muted)"
              >
                {d.label.slice(5)}
              </text>
            )
          })}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(points[hoveredIndex].x / WIDTH) * 100}%`,
            top: points[hoveredIndex].y - 40,
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--theme-bg-card)',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-text-primary)',
          }}
        >
          <div className="font-medium">{data[hoveredIndex].label}</div>
          <div style={{ color }}>
            {yLabel ? `${yLabel}: ` : ''}
            {data[hoveredIndex].value}
          </div>
        </div>
      )}
    </div>
  )
}
