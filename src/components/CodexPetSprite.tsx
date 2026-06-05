import React, { useEffect, useMemo, useState } from 'react'
import { getPetAtlas, getPetState, type CodexPetDefinition, type CodexPetRow } from '@/lib/pets'

interface CodexPetSpriteProps {
  pet: CodexPetDefinition
  state?: string
  className?: string
  label?: string
  animateIdle?: boolean
  playOnce?: boolean
}

function frameDurationMs(row: CodexPetRow): number {
  if (row.state === 'idle') return row.frames * 150
  if (row.state === 'waiting') return row.frames * 170
  if (row.state === 'running' || row.state.startsWith('running-')) return row.frames * 95
  if (row.state === 'waving' || row.state === 'jumping') return row.frames * 120
  return row.frames * 135
}

export function CodexPetSprite({
  pet,
  state = 'idle',
  className,
  label,
  animateIdle = false,
  playOnce = false,
}: CodexPetSpriteProps) {
  const atlas = getPetAtlas(pet.manifest)
  const row = getPetState(pet.manifest, state)
  const [frameIndex, setFrameIndex] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof document === 'undefined') return false
    return document.documentElement.getAttribute('data-reduce-motion') === 'true'
  })
  const duration = Math.max(480, frameDurationMs(row))
  const activeFrameCount = row.state === 'idle' && !animateIdle ? 1 : Math.max(1, row.frames)
  const frameSteps = Math.max(1, activeFrameCount - 1)
  const frameEndX = (frameSteps / Math.max(1, atlas.columns - 1)) * 100
  const rowPositionY = (row.row / Math.max(1, atlas.rows - 1)) * 100
  const frameInterval = duration / activeFrameCount
  const framePositions = useMemo(
    () =>
      Array.from({ length: activeFrameCount }, (_, frame) => {
        return (frame / Math.max(1, atlas.columns - 1)) * 100
      }),
    [activeFrameCount, atlas.columns],
  )

  useEffect(() => {
    setFrameIndex(0)
  }, [pet.id, row.frames, row.row, row.state])

  useEffect(() => {
    if (typeof window === 'undefined' || reduceMotion || framePositions.length <= 1) {
      setFrameIndex(0)
      return
    }

    const timer = window.setInterval(() => {
      setFrameIndex((frame) => {
        if (playOnce && frame >= framePositions.length - 1) return frame
        return (frame + 1) % framePositions.length
      })
    }, frameInterval)

    return () => window.clearInterval(timer)
  }, [frameInterval, framePositions.length, playOnce, reduceMotion])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return

    const syncMotionPreference = () => {
      setReduceMotion(document.documentElement.getAttribute('data-reduce-motion') === 'true')
    }
    syncMotionPreference()
    const observer = new MutationObserver(syncMotionPreference)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-reduce-motion'],
    })
    return () => observer.disconnect()
  }, [])

  return (
    <span
      role="img"
      aria-label={label || `${pet.displayName} Codex Pet`}
      className={className || 'codex-pet-sprite'}
      data-codex-pet-sprite
      data-codex-pet-id={pet.id}
      data-codex-pet-state={row.state}
      data-codex-pet-animated={framePositions.length > 1}
      style={
        {
          backgroundImage: `url("${pet.spritesheetUrl}")`,
          '--pet-columns': atlas.columns,
          '--pet-rows': atlas.rows,
          '--pet-row': row.row,
          '--pet-frames': activeFrameCount,
          '--pet-frame-steps': frameSteps,
          '--pet-frame-end-x': `${frameEndX}%`,
          '--pet-frame-width': `${atlas.cellWidth}px`,
          '--pet-frame-height': `${atlas.cellHeight}px`,
          '--pet-animation-duration': `${duration}ms`,
          backgroundPositionX: `${framePositions[reduceMotion ? 0 : frameIndex] ?? 0}%`,
          backgroundPositionY: `${rowPositionY}%`,
        } as React.CSSProperties
      }
    />
  )
}
