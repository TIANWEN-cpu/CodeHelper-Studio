import { useMemo, useState } from 'react'

export interface PieChartItem {
  label: string
  value: number
  color: string
}

export interface PieChartProps {
  /** Data items to render as pie slices. */
  data: PieChartItem[]
  /** Diameter of the pie in px (viewBox is always square). */
  size?: number
  /** Inner radius ratio (0 = full pie, 0.5 = donut). */
  innerRadius?: number
  /** Whether to show a legend alongside the chart. */
  showLegend?: boolean
  /** Whether to show percentage labels on slices. */
  showPercent?: boolean
  /** Center label (e.g., total count). */
  centerLabel?: string
  /** Center sub-label. */
  centerSub?: string
  /** Custom aria label for the chart. */
  ariaLabel?: string
}

/**
 * Lightweight reusable SVG pie / donut chart.
 *
 * Supports donut mode, interactive hover, legend, center label, and percent
 * annotations. No external chart library required.
 */
export function PieChart({
  data,
  size = 200,
  innerRadius = 0,
  showLegend = true,
  showPercent = false,
  centerLabel,
  centerSub,
  ariaLabel = '饼图',
}: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data])

  const slices = useMemo(() => {
    if (total === 0) return []

    const cx = size / 2
    const cy = size / 2
    const outerR = size / 2 - 4
    const innerR = outerR * innerRadius

    let cumulative = 0
    return data.map((d, i) => {
      const startAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2
      cumulative += d.value
      const endAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2

      const largeArc = d.value / total > 0.5 ? 1 : 0

      // Outer arc
      const x1o = cx + outerR * Math.cos(startAngle)
      const y1o = cy + outerR * Math.sin(startAngle)
      const x2o = cx + outerR * Math.cos(endAngle)
      const y2o = cy + outerR * Math.sin(endAngle)

      // Inner arc (for donut)
      const x1i = cx + innerR * Math.cos(endAngle)
      const y1i = cy + innerR * Math.sin(endAngle)
      const x2i = cx + innerR * Math.cos(startAngle)
      const y2i = cy + innerR * Math.sin(startAngle)

      const pathD =
        innerR > 0
          ? `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i} Z`
          : `M ${cx} ${cy} L ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o} Z`

      // Label position (midpoint of arc)
      const midAngle = (startAngle + endAngle) / 2
      const labelR = (outerR + innerR) / 2
      const labelX = cx + labelR * Math.cos(midAngle)
      const labelY = cy + labelR * Math.sin(midAngle)

      return {
        pathD,
        color: d.color,
        label: d.label,
        value: d.value,
        pct: ((d.value / total) * 100).toFixed(1),
        labelX,
        labelY,
      }
    })
  }, [data, total, size, innerRadius])

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--theme-text-muted)]">
        暂无数据
      </div>
    )
  }

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full"
          role="img"
          aria-label={ariaLabel}
        >
          {slices.map((s, i) => (
            <path
              key={i}
              d={s.pathD}
              fill={s.color}
              opacity={hoveredIndex !== null && hoveredIndex !== i ? 0.5 : 1}
              stroke="var(--theme-bg-app)"
              strokeWidth={2}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="transition-opacity"
            />
          ))}

          {/* Percent labels on slices */}
          {showPercent &&
            slices.map((s, i) => {
              const pct = parseFloat(s.pct)
              if (pct < 5) return null // Don't show on tiny slices
              return (
                <text
                  key={`pct-${i}`}
                  x={s.labelX}
                  y={s.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="white"
                  style={{ pointerEvents: 'none' }}
                >
                  {pct.toFixed(0)}%
                </text>
              )
            })}

          {/* Center label (for donut mode) */}
          {innerRadius > 0 && centerLabel && (
            <text
              x={size / 2}
              y={size / 2 - (centerSub ? 6 : 0)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={innerRadius > 0.3 ? 18 : 14}
              fontWeight={700}
              fill="var(--theme-text-primary)"
            >
              {centerLabel}
            </text>
          )}
          {innerRadius > 0 && centerSub && (
            <text
              x={size / 2}
              y={size / 2 + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--theme-text-muted)"
            >
              {centerSub}
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="space-y-2">
          {data.map((d, i) => (
            <div
              key={d.label}
              className="flex items-center gap-2 text-sm cursor-default"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                opacity: hoveredIndex !== null && hoveredIndex !== i ? 0.5 : 1,
              }}
            >
              <div className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="text-[var(--theme-text-secondary)]">{d.label}</span>
              <span className="ml-auto font-medium text-[var(--theme-text-primary)]">
                {d.value}
              </span>
              <span className="text-[10px] text-[var(--theme-text-muted)] w-10 text-right">
                {((d.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
