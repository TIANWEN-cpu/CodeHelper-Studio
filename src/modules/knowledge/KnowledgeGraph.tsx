/**
 * KnowledgeGraph — interactive concept relationship visualization.
 *
 * Renders a force-directed graph of knowledge concepts extracted from
 * uploaded documents. Users can click nodes to drill into topics and
 * explore related concepts.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Network, ZoomIn, ZoomOut, RotateCcw, Loader2, FileText, ArrowLeft } from 'lucide-react'
import { useKnowledgeStore } from '../../stores/knowledgeStore'
import type { ConceptNode, ConceptEdge } from '../../types/knowledge'
import { Skeleton } from '../../components/LoadingSpinner'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const NODE_RADIUS_BASE = 24
const NODE_RADIUS_MAX = 48
const EDGE_COLOR = 'var(--theme-border)'
const NODE_COLORS: Record<string, string> = {
  algorithm: 'var(--theme-accent)',
  'data-structure': 'var(--theme-info)',
  concept: 'var(--theme-success)',
  technique: 'var(--theme-warning)',
  default: 'var(--theme-text-muted)',
}

// ---------------------------------------------------------------------------
// Force-directed layout (simple spring-electric simulation)
// ---------------------------------------------------------------------------

interface PositionedNode extends ConceptNode {
  x: number
  y: number
  vx: number
  vy: number
}

function initializePositions(
  nodes: ConceptNode[],
  width: number,
  height: number,
): PositionedNode[] {
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.35
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length
    return {
      ...node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    }
  })
}

function runForceLayout(
  nodes: PositionedNode[],
  edges: ConceptEdge[],
  iterations: number,
  width: number,
  height: number,
): PositionedNode[] {
  const result = nodes.map((n) => ({ ...n }))
  const k = Math.sqrt((width * height) / Math.max(result.length, 1)) * 0.6
  const gravity = 0.01
  const repulsion = k * k
  const damping = 0.85

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[i].x - result[j].x
        const dy = result[i].y - result[j].y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const force = repulsion / (dist * dist)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        result[i].vx += fx
        result[i].vy += fy
        result[j].vx -= fx
        result[j].vy -= fy
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const src = result.find((n) => n.id === edge.source)
      const tgt = result.find((n) => n.id === edge.target)
      if (!src || !tgt) continue
      const dx = tgt.x - src.x
      const dy = tgt.y - src.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const force = (dist * dist) / k
      const fx = (dx / dist) * force * edge.weight
      const fy = (dy / dist) * force * edge.weight
      src.vx += fx * 0.5
      src.vy += fy * 0.5
      tgt.vx -= fx * 0.5
      tgt.vy -= fy * 0.5
    }

    // Gravity toward center
    for (const node of result) {
      node.vx += (width / 2 - node.x) * gravity
      node.vy += (height / 2 - node.y) * gravity
    }

    // Apply velocity with damping
    for (const node of result) {
      node.vx *= damping
      node.vy *= damping
      node.x += node.vx
      node.y += node.vy
      // Keep within bounds
      node.x = Math.max(60, Math.min(width - 60, node.x))
      node.y = Math.max(60, Math.min(height - 60, node.y))
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const GraphLegend = memo(function GraphLegend() {
  const categories = Object.entries(NODE_COLORS).filter(([k]) => k !== 'default')
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--theme-text-muted)]">
      {categories.map(([cat, color]) => (
        <div key={cat} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {cat}
        </div>
      ))}
    </div>
  )
})

const ConceptDetailPanel = memo(function ConceptDetailPanel({
  detail,
  onBack,
}: {
  detail: import('../../types/knowledge').ConceptDetail
  onBack: () => void
}) {
  return (
    <div className="ui-card p-4 space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors"
      >
        <ArrowLeft size={12} aria-hidden="true" />
        返回图谱
      </button>

      <div>
        <h3 className="text-base font-semibold text-[var(--theme-text-primary)]">
          {detail.concept.label}
        </h3>
        <span className="mt-1 inline-block rounded-full bg-[var(--theme-accent-soft)] px-2 py-0.5 text-xs text-[var(--theme-accent)]">
          {detail.concept.category}
        </span>
      </div>

      <p className="text-sm leading-7 text-[var(--theme-text-secondary)]">{detail.description}</p>

      {detail.documents.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--theme-text-muted)]">
            相关文档
          </h4>
          <div className="space-y-1.5">
            {detail.documents.map((doc) => (
              <div
                key={doc}
                className="flex items-center gap-2 text-sm text-[var(--theme-text-secondary)]"
              >
                <FileText
                  size={12}
                  className="shrink-0 text-[var(--theme-info)]"
                  aria-hidden="true"
                />
                {doc}
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.relatedConcepts.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--theme-text-muted)]">
            相关概念
          </h4>
          <div className="flex flex-wrap gap-2">
            {detail.relatedConcepts.map((rel) => (
              <span
                key={rel}
                className="rounded-full bg-[var(--theme-bg-hover)] px-2.5 py-1 text-xs text-[var(--theme-text-secondary)]"
              >
                {rel}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// SVG Canvas
// ---------------------------------------------------------------------------

interface GraphCanvasProps {
  nodes: PositionedNode[]
  edges: ConceptEdge[]
  selectedId: string | null
  onSelect: (id: string) => void
  width: number
  height: number
}

const GraphCanvas = memo(function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  width,
  height,
}: GraphCanvasProps) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  return (
    <svg
      width={width}
      height={height}
      className="rounded-xl bg-[var(--theme-bg-card)]"
      role="img"
      aria-label="知识概念关系图谱"
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const src = nodeMap.get(edge.source)
        const tgt = nodeMap.get(edge.target)
        if (!src || !tgt) return null
        return (
          <line
            key={`edge-${i}`}
            x1={src.x}
            y1={src.y}
            x2={tgt.x}
            y2={tgt.y}
            stroke={EDGE_COLOR}
            strokeWidth={Math.max(1, edge.weight * 3)}
            opacity={0.5}
          />
        )
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const r = NODE_RADIUS_BASE + (node.weight / 10) * (NODE_RADIUS_MAX - NODE_RADIUS_BASE)
        const color = NODE_COLORS[node.category] ?? NODE_COLORS.default
        const isSelected = node.id === selectedId
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`概念: ${node.label}`}
            onClick={() => onSelect(node.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(node.id)
              }
            }}
            className="cursor-pointer outline-none"
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={r}
              fill={color}
              opacity={isSelected ? 1 : 0.7}
              stroke={isSelected ? 'var(--theme-text-primary)' : 'transparent'}
              strokeWidth={isSelected ? 2 : 0}
              className="transition-all duration-200"
            />
            <text
              x={node.x}
              y={node.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--theme-accent-contrast)"
              fontSize={Math.max(10, Math.min(13, r * 0.55))}
              fontWeight={isSelected ? 600 : 400}
              pointerEvents="none"
            >
              {node.label.length > 6 ? node.label.slice(0, 6) + '..' : node.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
})

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function KnowledgeGraph() {
  const conceptGraph = useKnowledgeStore((s) => s.conceptGraph)
  const loadingGraph = useKnowledgeStore((s) => s.loadingGraph)
  const loadConceptGraph = useKnowledgeStore((s) => s.loadConceptGraph)
  const selectedConcept = useKnowledgeStore((s) => s.selectedConcept)
  const conceptDetail = useKnowledgeStore((s) => s.conceptDetail)
  const loadingConceptDetail = useKnowledgeStore((s) => s.loadingConceptDetail)
  const selectConcept = useKnowledgeStore((s) => s.selectConcept)
  const clearConceptSelection = useKnowledgeStore((s) => s.clearConceptSelection)

  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 700, height: 500 })
  const [zoom, setZoom] = useState(1)

  // Load graph on mount
  useEffect(() => {
    void loadConceptGraph()
  }, [loadConceptGraph])

  // Measure container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.max(400, Math.floor(entry.contentRect.height)),
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Compute layout
  const positionedNodes = useMemo(() => {
    if (!conceptGraph) return []
    const init = initializePositions(conceptGraph.nodes, dimensions.width, dimensions.height)
    return runForceLayout(init, conceptGraph.edges, 80, dimensions.width, dimensions.height)
  }, [conceptGraph, dimensions])

  const handleSelect = useCallback(
    (id: string) => {
      void selectConcept(id)
    },
    [selectConcept],
  )

  // Loading state
  if (loadingGraph) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-sm text-[var(--theme-text-muted)]">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          正在构建概念图谱...
        </div>
        <Skeleton width="w-full" height="h-80" className="rounded-xl" />
      </div>
    )
  }

  // Empty state
  if (!conceptGraph || conceptGraph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Network size={48} className="mb-4 text-[var(--theme-text-muted)] opacity-30" />
        <p className="text-base font-medium text-[var(--theme-text-primary)]">暂无概念图谱</p>
        <p className="mt-2 max-w-md text-sm text-[var(--theme-text-muted)]">
          上传更多文档后，系统将自动提取概念并生成知识关系图谱。
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4 p-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-[var(--theme-accent)]" aria-hidden="true" />
          <span className="text-sm font-medium text-[var(--theme-text-primary)]">
            概念图谱 ({conceptGraph.nodes.length} 个概念)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 2))}
            aria-label="放大"
            className="ui-btn-ghost flex h-8 w-8 items-center justify-center"
          >
            <ZoomIn size={14} aria-hidden="true" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.4))}
            aria-label="缩小"
            className="ui-btn-ghost flex h-8 w-8 items-center justify-center"
          >
            <ZoomOut size={14} aria-hidden="true" />
          </button>
          <button
            onClick={() => {
              setZoom(1)
              clearConceptSelection()
            }}
            aria-label="重置视图"
            className="ui-btn-ghost flex h-8 w-8 items-center justify-center"
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <GraphLegend />

      {/* Content */}
      <div className="flex gap-4 min-h-0">
        {/* Graph */}
        <div
          className="flex-1 overflow-hidden rounded-xl"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        >
          <GraphCanvas
            nodes={positionedNodes}
            edges={conceptGraph.edges}
            selectedId={selectedConcept}
            onSelect={handleSelect}
            width={dimensions.width}
            height={dimensions.height}
          />
        </div>

        {/* Detail panel */}
        {selectedConcept && (
          <div className="w-72 shrink-0">
            {loadingConceptDetail ? (
              <div className="ui-card p-4 space-y-3">
                <Skeleton width="w-1/2" height="h-4" />
                <Skeleton width="w-full" height="h-16" />
                <Skeleton width="w-2/3" height="h-3" />
              </div>
            ) : conceptDetail ? (
              <ConceptDetailPanel detail={conceptDetail} onBack={clearConceptSelection} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
