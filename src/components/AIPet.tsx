import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EyeOff, MessageCircle, Move, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { CodexPetSprite } from '@/components/CodexPetSprite'
import {
  BUILT_IN_FIREFLY_PET,
  listInstalledPets,
  readStoredPetSource,
  type CodexPetDefinition,
} from '@/lib/pets'

const PET_POSITION_STORAGE_KEY = 'codehelper.aiPetPosition'
const PET_WIDTH = 176
const PET_HEIGHT = 238
const PET_MARGIN = 16
const PET_DESKTOP_SAFE_LEFT = 260
const PET_SAFE_TOP = 148
const PET_PROFILE_WIDTH = 96
const PET_PROFILE_HEIGHT = 130
const PET_PROFILE_DOCK_MARGIN = 8
const PET_MOBILE_BREAKPOINT = 720

interface PetPosition {
  x: number
  y: number
}

function defaultPosition(): PetPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const minX = getPetMinX()
  return {
    x: Math.max(minX, window.innerWidth - PET_WIDTH - 28),
    y: Math.max(PET_SAFE_TOP, window.innerHeight - PET_HEIGHT - 28),
  }
}

function getPetMinX(): number {
  if (typeof window === 'undefined') return PET_MARGIN
  return window.innerWidth <= PET_MOBILE_BREAKPOINT ? PET_MARGIN : PET_DESKTOP_SAFE_LEFT
}

function getPetFootprint(view?: string) {
  return view === 'profile'
    ? { width: PET_PROFILE_WIDTH, height: PET_PROFILE_HEIGHT, margin: PET_PROFILE_DOCK_MARGIN }
    : { width: PET_WIDTH, height: PET_HEIGHT, margin: PET_MARGIN }
}

function clampPosition(pos: PetPosition, view?: string): PetPosition {
  if (typeof window === 'undefined') return pos
  const minX = getPetMinX()
  const footprint = getPetFootprint(view)
  const maxX = Math.max(minX, window.innerWidth - footprint.width - footprint.margin)
  const maxY = Math.max(PET_SAFE_TOP, window.innerHeight - footprint.height - footprint.margin)
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(pos.x))),
    y: Math.min(maxY, Math.max(PET_SAFE_TOP, Math.round(pos.y))),
  }
}

function getViewDockPosition(view: string): PetPosition | null {
  if (typeof window === 'undefined' || view !== 'profile') return null
  const footprint = getPetFootprint(view)
  return {
    x: Math.max(getPetMinX(), window.innerWidth - footprint.width - footprint.margin),
    y: Math.max(PET_SAFE_TOP, window.innerHeight - footprint.height - footprint.margin),
  }
}

function shouldDockForView(view: string): boolean {
  return getViewDockPosition(view) != null
}

function readStoredPosition(): PetPosition {
  if (typeof window === 'undefined') return defaultPosition()
  try {
    const raw = window.localStorage.getItem(PET_POSITION_STORAGE_KEY)
    if (!raw) return defaultPosition()
    const parsed = JSON.parse(raw) as Partial<PetPosition>
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return defaultPosition()
    return clampPosition({ x: Number(parsed.x), y: Number(parsed.y) })
  } catch {
    return defaultPosition()
  }
}

function persistPosition(pos: PetPosition) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PET_POSITION_STORAGE_KEY, JSON.stringify(pos))
  } catch {
    /* Position persistence is a convenience; the pet should keep working without it. */
  }
}

export function AIPet() {
  const aiPetEnabled = useAppStore((s) => s.aiPetEnabled)
  const animationLevel = useAppStore((s) => s.animationLevel)
  const currentView = useAppStore((s) => s.currentView)
  const setShowAITutor = useAppStore((s) => s.setShowAITutor)
  const setAIPetEnabled = useAppStore((s) => s.setAIPetEnabled)
  const requestAIChat = useAppStore((s) => s.requestAIChat)

  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [position, setPosition] = useState<PetPosition>(() => readStoredPosition())
  const [pet, setPet] = useState<CodexPetDefinition>(BUILT_IN_FIREFLY_PET)
  const [petState, setPetState] = useState('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const reactionTimerRef = useRef<number | null>(null)
  const latestPositionRef = useRef(position)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    origin: PetPosition
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const refreshPet = () => {
      listInstalledPets()
        .then((pets) => {
          if (cancelled) return
          const selectedId = readStoredPetSource()
          setPet(pets.find((item) => item.id === selectedId) || BUILT_IN_FIREFLY_PET)
        })
        .catch(() => {
          if (!cancelled) setPet(BUILT_IN_FIREFLY_PET)
        })
    }
    refreshPet()
    window.addEventListener('codehelper:pet-changed', refreshPet)
    return () => {
      cancelled = true
      window.removeEventListener('codehelper:pet-changed', refreshPet)
    }
  }, [])

  const viewLabel = useMemo(() => {
    const labels: Record<string, string> = {
      home: '首页',
      learn: '课程',
      practice: '题库',
      workspace: '工作区',
      review: '复习',
      knowledge: '知识库',
      settings: '设置',
      profile: '个人页',
      'ai-tutor': 'AI 助手',
    }
    return labels[currentView] ?? '当前页面'
  }, [currentView])

  const applyTransform = useCallback((next: PetPosition) => {
    if (!rootRef.current) return
    rootRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
  }, [])

  const scheduleTransform = useCallback(
    (next: PetPosition) => {
      latestPositionRef.current = clampPosition(next, currentView)
      if (frameRef.current != null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        applyTransform(latestPositionRef.current)
      })
    },
    [applyTransform, currentView],
  )

  useEffect(() => {
    latestPositionRef.current = position
    applyTransform(position)
  }, [applyTransform, position])

  useEffect(() => {
    setPosition((prev) => {
      const next = shouldDockForView(currentView)
        ? clampPosition(getViewDockPosition(currentView) ?? prev, currentView)
        : clampPosition(prev, currentView)
      if (next.x === prev.x && next.y === prev.y) return prev
      latestPositionRef.current = next
      applyTransform(next)
      persistPosition(next)
      return next
    })
  }, [applyTransform, currentView])

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const next = shouldDockForView(currentView)
          ? clampPosition(getViewDockPosition(currentView) ?? prev, currentView)
          : clampPosition(prev, currentView)
        latestPositionRef.current = next
        applyTransform(next)
        persistPosition(next)
        return next
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [applyTransform, currentView])

  useEffect(
    () => () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current)
      if (reactionTimerRef.current != null) window.clearTimeout(reactionTimerRef.current)
    },
    [],
  )

  const playReaction = useCallback((state: string, duration = 680) => {
    if (reactionTimerRef.current != null) window.clearTimeout(reactionTimerRef.current)
    setPetState(state)
    reactionTimerRef.current = window.setTimeout(() => {
      reactionTimerRef.current = null
      setPetState('idle')
    }, duration)
  }, [])

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      if (reactionTimerRef.current != null) {
        window.clearTimeout(reactionTimerRef.current)
        reactionTimerRef.current = null
      }
      const deltaX = event.clientX - drag.startX
      const movementX = event.clientX - drag.lastX
      const movementY = event.clientY - drag.lastY
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      if (Math.abs(movementX) >= 3) setPetState(movementX > 0 ? 'running-right' : 'running-left')
      else if (Math.abs(movementY) >= 3) setPetState('running')
      scheduleTransform({
        x: drag.origin.x + deltaX,
        y: drag.origin.y + event.clientY - drag.startY,
      })
    },
    [scheduleTransform],
  )

  const finishDrag = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      const next = latestPositionRef.current
      dragRef.current = null
      setDragging(false)
      setPetState('idle')
      setPosition(next)
      persistPosition(next)
      rootRef.current?.releasePointerCapture?.(event.pointerId)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
    },
    [handlePointerMove],
  )

  const handleDragStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.currentTarget.focus()
      rootRef.current?.setPointerCapture?.(event.pointerId)
      setDragging(true)
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        origin: latestPositionRef.current,
      }
      setPetState('running')
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', finishDrag)
      window.addEventListener('pointercancel', finishDrag)
    },
    [finishDrag, handlePointerMove],
  )

  const openTutorPanel = () => {
    setExpanded(false)
    setPetState('idle')
    setShowAITutor(true)
  }

  const askAboutCurrentView = () => {
    setExpanded(false)
    requestAIChat(
      `帮我梳理${viewLabel}`,
      `请结合我正在查看的「${viewLabel}」，用简洁步骤告诉我下一步最值得做什么。`,
    )
  }

  if (!aiPetEnabled) return null

  return (
    <div
      ref={rootRef}
      data-ai-pet-root
      data-codex-pet-root
      data-active-pet-id={pet.id}
      data-animation-level={animationLevel}
      data-current-view={currentView}
      className={cn(
        'ai-pet fixed left-0 top-0 z-40',
        expanded && 'is-expanded',
        dragging && 'is-dragging',
      )}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      {expanded && (
        <div className="ai-pet-card" data-ai-pet-actions>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{pet.displayName}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                我在「{viewLabel}」待命。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ai-pet-icon-button"
              aria-label="收起 AI 桌宠菜单"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={openTutorPanel} className="ai-pet-action">
              <MessageCircle size={14} />
              打开 AI
            </button>
            <button type="button" onClick={askAboutCurrentView} className="ai-pet-action">
              <Sparkles size={14} />
              指点一下
            </button>
          </div>
        </div>
      )}

      <div className="ai-pet-avatar-wrap">
        <button
          type="button"
          onPointerDown={() => playReaction('waving')}
          onClick={() => setExpanded((v) => !v)}
          className="ai-pet-avatar"
          aria-label={expanded ? '收起 AI 桌宠' : '展开 AI 桌宠'}
        >
          <span className="ai-pet-glow" aria-hidden="true" />
          <CodexPetSprite
            pet={pet}
            state={petState}
            className="ai-pet-image codex-pet-sprite"
            label={`AI 桌宠${pet.displayName}`}
            animateIdle={animationLevel !== 'calm'}
            playOnce={petState === 'waving'}
          />
        </button>

        <div className="ai-pet-toolbar" aria-label="AI 桌宠工具">
          <button
            type="button"
            onPointerDown={handleDragStart}
            className="ai-pet-tool-button cursor-grab active:cursor-grabbing"
            aria-label="拖动 AI 桌宠"
            title="拖动"
          >
            <Move size={13} />
          </button>
          <button
            type="button"
            onClick={() => setAIPetEnabled(false)}
            className="ai-pet-tool-button"
            aria-label="隐藏 AI 桌宠"
            title="隐藏"
          >
            <EyeOff size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
