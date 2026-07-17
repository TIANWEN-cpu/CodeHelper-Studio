import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EyeOff, MessageCircle, Move, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { CodexPetSprite } from '@/components/CodexPetSprite'
import { ACTIVITY_EVENT } from '@/services/analyticsService'
import { getPetReaction, pickIdleAnimation } from '@/lib/petReactions'
import { clampAIPetSize, DEFAULT_AI_PET_SIZE } from '@/lib/appearance'
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
const PET_COMPACT_WIDTH = 64
const PET_COMPACT_HEIGHT = 88
const PET_COMPACT_MARGIN = 8
const PET_COMPACT_BREAKPOINT = 1920
const PET_COMPACT_HEIGHT_BREAKPOINT = 820
const PET_MOBILE_BREAKPOINT = 720
const PET_MOBILE_WIDTH = 64
const PET_MOBILE_HEIGHT = 88
const PET_MOBILE_MARGIN = 8
const PET_MOBILE_SAFE_LEFT = 76

interface PetPosition {
  x: number
  y: number
}

interface StoredPetPosition extends PetPosition {
  viewportWidth: number
  viewportHeight: number
  petSize?: number
}

function defaultPosition(petSize = DEFAULT_AI_PET_SIZE): PetPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  const minX = getPetMinX()
  const footprint = getPetFootprint(undefined, petSize)
  return clampPosition(
    {
      x: Math.max(minX, window.innerWidth - footprint.width - footprint.margin),
      y: Math.max(PET_SAFE_TOP, window.innerHeight - footprint.height - footprint.margin),
    },
    undefined,
    petSize,
  )
}

function getPetMinX(): number {
  if (typeof window === 'undefined') return PET_MARGIN
  return window.innerWidth <= PET_MOBILE_BREAKPOINT ? PET_MOBILE_SAFE_LEFT : PET_DESKTOP_SAFE_LEFT
}

function isCompactPetViewport(
  width = typeof window !== 'undefined' ? window.innerWidth : Number.POSITIVE_INFINITY,
  height = typeof window !== 'undefined' ? window.innerHeight : Number.POSITIVE_INFINITY,
): boolean {
  return width <= PET_COMPACT_BREAKPOINT || height <= PET_COMPACT_HEIGHT_BREAKPOINT
}

function scalePetFootprint(
  footprint: { width: number; height: number; margin: number },
  petSize: number,
) {
  const scale = clampAIPetSize(petSize) / 100
  return {
    width: Math.round(footprint.width * scale),
    height: Math.round(footprint.height * scale),
    margin: footprint.margin,
  }
}

export function getPetFootprintForViewport(
  width: number,
  height: number,
  view?: string,
  petSize = DEFAULT_AI_PET_SIZE,
) {
  if (view === 'profile') {
    return scalePetFootprint(
      { width: PET_PROFILE_WIDTH, height: PET_PROFILE_HEIGHT, margin: PET_PROFILE_DOCK_MARGIN },
      petSize,
    )
  }
  if (width <= PET_MOBILE_BREAKPOINT) {
    return scalePetFootprint(
      { width: PET_MOBILE_WIDTH, height: PET_MOBILE_HEIGHT, margin: PET_MOBILE_MARGIN },
      petSize,
    )
  }
  if (isCompactPetViewport(width, height)) {
    return scalePetFootprint(
      { width: PET_COMPACT_WIDTH, height: PET_COMPACT_HEIGHT, margin: PET_COMPACT_MARGIN },
      petSize,
    )
  }
  return scalePetFootprint({ width: PET_WIDTH, height: PET_HEIGHT, margin: PET_MARGIN }, petSize)
}

function getPetFootprint(view?: string, petSize = DEFAULT_AI_PET_SIZE) {
  if (typeof window === 'undefined') return getPetFootprintForViewport(1920, 1080, view, petSize)
  return getPetFootprintForViewport(window.innerWidth, window.innerHeight, view, petSize)
}

function clampPosition(
  pos: PetPosition,
  view?: string,
  petSize = DEFAULT_AI_PET_SIZE,
): PetPosition {
  if (typeof window === 'undefined') return pos
  const footprint = getPetFootprint(view, petSize)
  const minX = Math.min(
    getPetMinX(),
    Math.max(footprint.margin, window.innerWidth - footprint.width - footprint.margin),
  )
  const minY = Math.min(
    PET_SAFE_TOP,
    Math.max(footprint.margin, window.innerHeight - footprint.height - footprint.margin),
  )
  const maxX = Math.max(minX, window.innerWidth - footprint.width - footprint.margin)
  const maxY = Math.max(minY, window.innerHeight - footprint.height - footprint.margin)
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(pos.x))),
    y: Math.min(maxY, Math.max(minY, Math.round(pos.y))),
  }
}

function getViewDockPosition(view: string, petSize = DEFAULT_AI_PET_SIZE): PetPosition | null {
  if (typeof window === 'undefined' || view !== 'profile') return null
  const footprint = getPetFootprint(view, petSize)
  return {
    x: Math.max(getPetMinX(), window.innerWidth - footprint.width - footprint.margin),
    y: Math.max(PET_SAFE_TOP, window.innerHeight - footprint.height - footprint.margin),
  }
}

function shouldDockForView(view: string): boolean {
  return getViewDockPosition(view) != null
}

function readStoredPosition(petSize = DEFAULT_AI_PET_SIZE): PetPosition {
  if (typeof window === 'undefined') return defaultPosition(petSize)
  try {
    const raw = window.localStorage.getItem(PET_POSITION_STORAGE_KEY)
    if (!raw) return defaultPosition(petSize)
    const parsed = JSON.parse(raw) as Partial<StoredPetPosition>
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return defaultPosition(petSize)
    const stored = { x: Number(parsed.x), y: Number(parsed.y) }
    const hasStoredViewport =
      Number.isFinite(parsed.viewportWidth) && Number.isFinite(parsed.viewportHeight)
    const footprint = getPetFootprint(undefined, petSize)
    if (hasStoredViewport) {
      const previousWidth = Number(parsed.viewportWidth)
      const previousHeight = Number(parsed.viewportHeight)
      const previousPetSize = Number.isFinite(parsed.petSize)
        ? clampAIPetSize(Number(parsed.petSize))
        : petSize
      const previousFootprint = getPetFootprintForViewport(
        previousWidth,
        previousHeight,
        undefined,
        previousPetSize,
      )
      const wasDockedRight =
        stored.x >= previousWidth - previousFootprint.width - previousFootprint.margin - 24
      const wasDockedBottom =
        stored.y >= previousHeight - previousFootprint.height - previousFootprint.margin - 24
      if (wasDockedRight) stored.x = window.innerWidth - footprint.width - footprint.margin
      if (wasDockedBottom) stored.y = window.innerHeight - footprint.height - footprint.margin
    } else if (isCompactPetViewport()) {
      stored.x = window.innerWidth - footprint.width - footprint.margin
      stored.y = window.innerHeight - footprint.height - footprint.margin
    }
    return clampPosition(stored, undefined, petSize)
  } catch {
    return defaultPosition(petSize)
  }
}

function persistPosition(pos: PetPosition, petSize = DEFAULT_AI_PET_SIZE) {
  if (typeof window === 'undefined') return
  try {
    const stored: StoredPetPosition = {
      ...pos,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      petSize: clampAIPetSize(petSize),
    }
    window.localStorage.setItem(PET_POSITION_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    /* Position persistence is a convenience; the pet should keep working without it. */
  }
}

export function AIPet() {
  const aiPetEnabled = useAppStore((s) => s.aiPetEnabled)
  const aiPetSize = useAppStore((s) => s.aiPetSize)
  const animationLevel = useAppStore((s) => s.animationLevel)
  const currentView = useAppStore((s) => s.currentView)
  const setShowAITutor = useAppStore((s) => s.setShowAITutor)
  const setAIPetEnabled = useAppStore((s) => s.setAIPetEnabled)
  const requestAIChat = useAppStore((s) => s.requestAIChat)

  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [position, setPosition] = useState<PetPosition>(() => readStoredPosition(aiPetSize))
  const [pet, setPet] = useState<CodexPetDefinition>(BUILT_IN_FIREFLY_PET)
  const [petState, setPetState] = useState('idle')
  const [bubble, setBubble] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const reactionTimerRef = useRef<number | null>(null)
  const bubbleTimerRef = useRef<number | null>(null)
  const idleTimerRef = useRef<number | null>(null)
  // 空闲调度器在触发时读这里的最新值，从而不必把这些频繁变化的量列进定时器依赖
  // （否则每次导航/拖动/展开都会重置 12~28s 的计时）。
  const liveRef = useRef({ dragging, expanded, currentView, aiPetEnabled, petState })
  liveRef.current = { dragging, expanded, currentView, aiPetEnabled, petState }
  const latestPositionRef = useRef(position)
  const previousPetSizeRef = useRef(aiPetSize)
  const viewportRef = useRef({ width: window.innerWidth, height: window.innerHeight })
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

  const applyTransform = useCallback(
    (next: PetPosition) => {
      if (!rootRef.current) return
      rootRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${aiPetSize / 100})`
    },
    [aiPetSize],
  )

  const scheduleTransform = useCallback(
    (next: PetPosition) => {
      latestPositionRef.current = clampPosition(next, currentView, aiPetSize)
      if (frameRef.current != null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        applyTransform(latestPositionRef.current)
      })
    },
    [aiPetSize, applyTransform, currentView],
  )

  useEffect(() => {
    latestPositionRef.current = position
    applyTransform(position)
  }, [applyTransform, position])

  useEffect(() => {
    setPosition((prev) => {
      const next = shouldDockForView(currentView)
        ? clampPosition(getViewDockPosition(currentView, aiPetSize) ?? prev, currentView, aiPetSize)
        : clampPosition(prev, currentView, aiPetSize)
      if (next.x === prev.x && next.y === prev.y) return prev
      latestPositionRef.current = next
      applyTransform(next)
      persistPosition(next, aiPetSize)
      return next
    })
  }, [aiPetSize, applyTransform, currentView])

  useEffect(() => {
    const previousSize = previousPetSizeRef.current
    previousPetSizeRef.current = aiPetSize
    if (previousSize === aiPetSize) return

    setPosition((prev) => {
      const previousFootprint = getPetFootprintForViewport(
        window.innerWidth,
        window.innerHeight,
        currentView,
        previousSize,
      )
      const nextFootprint = getPetFootprint(currentView, aiPetSize)
      const wasDockedRight =
        prev.x >= window.innerWidth - previousFootprint.width - previousFootprint.margin - 24
      const wasDockedBottom =
        prev.y >= window.innerHeight - previousFootprint.height - previousFootprint.margin - 24
      const resizedPosition = {
        x: wasDockedRight ? window.innerWidth - nextFootprint.width - nextFootprint.margin : prev.x,
        y: wasDockedBottom
          ? window.innerHeight - nextFootprint.height - nextFootprint.margin
          : prev.y,
      }
      const next = shouldDockForView(currentView)
        ? clampPosition(
            getViewDockPosition(currentView, aiPetSize) ?? resizedPosition,
            currentView,
            aiPetSize,
          )
        : clampPosition(resizedPosition, currentView, aiPetSize)
      latestPositionRef.current = next
      applyTransform(next)
      persistPosition(next, aiPetSize)
      return next
    })
  }, [aiPetSize, applyTransform, currentView])

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const previousViewport = viewportRef.current
        const previousFootprint = getPetFootprintForViewport(
          previousViewport.width,
          previousViewport.height,
          currentView,
          aiPetSize,
        )
        const wasDockedRight =
          prev.x >= previousViewport.width - previousFootprint.width - previousFootprint.margin - 24
        const wasDockedBottom =
          prev.y >=
          previousViewport.height - previousFootprint.height - previousFootprint.margin - 24
        viewportRef.current = { width: window.innerWidth, height: window.innerHeight }
        const footprint = getPetFootprint(currentView, aiPetSize)
        const resizedPosition = {
          x: wasDockedRight ? window.innerWidth - footprint.width - footprint.margin : prev.x,
          y: wasDockedBottom ? window.innerHeight - footprint.height - footprint.margin : prev.y,
        }
        const next = shouldDockForView(currentView)
          ? clampPosition(
              getViewDockPosition(currentView, aiPetSize) ?? prev,
              currentView,
              aiPetSize,
            )
          : clampPosition(resizedPosition, currentView, aiPetSize)
        latestPositionRef.current = next
        applyTransform(next)
        persistPosition(next, aiPetSize)
        return next
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [aiPetSize, applyTransform, currentView])

  useEffect(
    () => () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current)
      if (reactionTimerRef.current != null) window.clearTimeout(reactionTimerRef.current)
      if (bubbleTimerRef.current != null) window.clearTimeout(bubbleTimerRef.current)
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current)
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

  // 学习里程碑（解题成功、完成课程等）触发桌宠庆祝动画 + 气泡。
  useEffect(() => {
    const onActivity = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string }>).detail
      const reaction = detail?.type ? getPetReaction(detail.type) : null
      if (!reaction) return
      playReaction(reaction.state, reaction.duration)
      if (reaction.message) {
        if (bubbleTimerRef.current != null) window.clearTimeout(bubbleTimerRef.current)
        setBubble(reaction.message)
        bubbleTimerRef.current = window.setTimeout(() => {
          bubbleTimerRef.current = null
          setBubble(null)
        }, reaction.duration + 1200)
      }
    }
    window.addEventListener(ACTIVITY_EVENT, onActivity)
    return () => window.removeEventListener(ACTIVITY_EVENT, onActivity)
  }, [playReaction])

  // 空闲时每隔一段随机时间播放一个小动作，让桌宠静置时也有生气。
  // 仅依赖 animationLevel/aiPetEnabled 重建；导航、拖动、展开等通过 liveRef 在触发时判断，
  // 不会重置 12~28s 的计时（否则频繁切换视图的用户几乎看不到空闲动作）。
  useEffect(() => {
    if (animationLevel === 'calm' || !aiPetEnabled) return
    let timer: number | null = null
    const schedule = () => {
      const delay = 12000 + Math.random() * 16000 // 12~28s
      timer = window.setTimeout(() => {
        const live = liveRef.current
        const reduceMotion =
          typeof document !== 'undefined' &&
          document.documentElement.getAttribute('data-reduce-motion') === 'true'
        if (
          !reduceMotion &&
          !live.dragging &&
          !live.expanded &&
          live.currentView !== 'settings' &&
          live.petState === 'idle'
        ) {
          const move = pickIdleAnimation(Math.random())
          playReaction(move.state, move.duration)
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      if (timer != null) window.clearTimeout(timer)
    }
  }, [animationLevel, aiPetEnabled, playReaction])

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
      persistPosition(next, aiPetSize)
      rootRef.current?.releasePointerCapture?.(event.pointerId)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
    },
    [aiPetSize, handlePointerMove],
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

  if (!aiPetEnabled || currentView === 'settings') return null

  return (
    <div
      ref={rootRef}
      data-ai-pet-root
      data-codex-pet-root
      data-active-pet-id={pet.id}
      data-ai-pet-size={aiPetSize}
      data-animation-level={animationLevel}
      data-current-view={currentView}
      className={cn(
        'ai-pet fixed left-0 top-0 z-40',
        expanded && 'is-expanded',
        dragging && 'is-dragging',
      )}
      style={
        {
          '--ai-pet-inverse-scale': String(100 / aiPetSize),
          transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${aiPetSize / 100})`,
          transformOrigin: 'top left',
        } as React.CSSProperties
      }
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

      <div className="ai-pet-avatar-wrap relative">
        {bubble && !dragging && (
          <div
            role="status"
            className="ai-pet-bubble pointer-events-none absolute left-1/2 -top-1 z-10 whitespace-nowrap rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            {bubble}
          </div>
        )}
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
