/**
 * FeatureTour - Spotlight/highlight guided tour of key UI elements.
 *
 * Walks the user through: sidebar, editor, AI chat, problems, knowledge.
 * Supports skip and restart via onboardingStore.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  X,
  SkipForward,
  BookOpen,
  Code2,
  Bot,
  Library,
  BarChart3,
} from 'lucide-react'
import { useOnboardingStore } from './onboardingStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TourStep {
  id: string
  /** CSS selector for the spotlight target. */
  target: string
  title: string
  description: string
  icon: typeof BookOpen
  /** Preferred tooltip position relative to the target. */
  position: 'bottom' | 'right' | 'left' | 'top'
}

// ---------------------------------------------------------------------------
// Tour step definitions
// ---------------------------------------------------------------------------

const TOUR_STEPS: TourStep[] = [
  {
    id: 'sidebar',
    target: '[aria-label="主导航"], nav[aria-label="主导航"]',
    title: '侧边导航栏',
    description:
      '通过侧边栏在不同功能模块间快速切换。从上到下依次是：刷题、编辑器、AI 助手、错题本、知识库、统计和搜索。底部是设置入口。',
    icon: BookOpen,
    position: 'right',
  },
  {
    id: 'problems',
    target: '[aria-label="刷题"]',
    title: '刷题系统',
    description: '浏览题库、按难度筛选、查看题目详情。支持自动运行测试用例并记录你的通过情况。',
    icon: BookOpen,
    position: 'right',
  },
  {
    id: 'editor',
    target: '[aria-label="编辑器"]',
    title: '代码编辑器',
    description:
      '内置 Monaco 编辑器，支持 Python 等语言的语法高亮、自动补全和代码运行。你可以在编辑器中编写并测试代码。',
    icon: Code2,
    position: 'right',
  },
  {
    id: 'ai-chat',
    target: '[aria-label="AI助手"]',
    title: 'AI 编程助手',
    description:
      '与 AI 进行实时对话，请教编程问题、获取代码提示、请求思路讲解。支持多会话管理与记忆功能。',
    icon: Bot,
    position: 'right',
  },
  {
    id: 'knowledge',
    target: '[aria-label="知识库"]',
    title: '知识库',
    description: '上传学习笔记和参考资料，构建你的个人知识体系。支持语义搜索，快速找到相关内容。',
    icon: Library,
    position: 'right',
  },
  {
    id: 'stats',
    target: '[aria-label="统计"]',
    title: '统计面板',
    description: '可视化你的学习进度：做题数量、通过率、学习时长等关键指标一目了然。',
    icon: BarChart3,
    position: 'right',
  },
]

// ---------------------------------------------------------------------------
// Tooltip position calculation
// ---------------------------------------------------------------------------

interface TooltipPos {
  top: number
  left: number
  arrow: 'top' | 'bottom' | 'left' | 'right'
}

function calcTooltipPosition(
  rect: DOMRect,
  preferred: TourStep['position'],
  tooltipW: number,
  tooltipH: number,
): TooltipPos {
  const gap = 12
  const vw = window.innerWidth
  const vh = window.innerHeight

  let top: number
  let left: number
  let arrow: TooltipPos['arrow'] = 'top'

  switch (preferred) {
    case 'right':
      left = rect.right + gap
      top = rect.top + rect.height / 2 - tooltipH / 2
      arrow = 'left'
      // Clamp to viewport
      if (left + tooltipW > vw - 16) {
        left = rect.left - gap - tooltipW
        arrow = 'right'
      }
      break
    case 'left':
      left = rect.left - gap - tooltipW
      top = rect.top + rect.height / 2 - tooltipH / 2
      arrow = 'right'
      if (left < 16) {
        left = rect.right + gap
        arrow = 'left'
      }
      break
    case 'top':
      left = rect.left + rect.width / 2 - tooltipW / 2
      top = rect.top - gap - tooltipH
      arrow = 'bottom'
      if (top < 16) {
        top = rect.bottom + gap
        arrow = 'top'
      }
      break
    case 'bottom':
    default:
      left = rect.left + rect.width / 2 - tooltipW / 2
      top = rect.bottom + gap
      arrow = 'top'
      if (top + tooltipH > vh - 16) {
        top = rect.top - gap - tooltipH
        arrow = 'bottom'
      }
      break
  }

  // Final clamp
  left = Math.max(16, Math.min(left, vw - tooltipW - 16))
  top = Math.max(16, Math.min(top, vh - tooltipH - 16))

  return { top, left, arrow }
}

// ---------------------------------------------------------------------------
// Tour Tooltip component
// ---------------------------------------------------------------------------

function TourTooltip({
  step,
  rect,
  current,
  total,
  onNext,
  onPrev,
  onSkip,
  onClose,
}: {
  step: TourStep
  rect: DOMRect
  current: number
  total: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onClose: () => void
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<TooltipPos>({ top: 0, left: 0, arrow: 'top' })

  useEffect(() => {
    const el = tooltipRef.current
    if (!el) return
    const tooltipRect = el.getBoundingClientRect()
    setPos(calcTooltipPosition(rect, step.position, tooltipRect.width, tooltipRect.height))
  }, [rect, step.position])

  const Icon = step.icon
  const isLast = current === total - 1

  const arrowClasses = {
    top: '-top-1.5 left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-[var(--theme-bg-primary)]',
    bottom:
      '-bottom-1.5 left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-[var(--theme-bg-primary)]',
    left: 'top-1/2 -left-1.5 -translate-y-1/2 border-t-transparent border-b-transparent border-r-[var(--theme-bg-primary)]',
    right:
      'top-1/2 -right-1.5 -translate-y-1/2 border-t-transparent border-b-transparent border-l-[var(--theme-bg-primary)]',
  }

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9600] animate-in fade-in duration-200"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="relative bg-[var(--theme-bg-primary)] rounded-xl shadow-2xl border border-[var(--theme-border)] w-80 p-4">
        {/* Arrow */}
        <div
          className={`absolute w-3 h-3 border-8 ${arrowClasses[pos.arrow]}`}
          style={{ borderWidth: 6 }}
        />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)] transition-colors cursor-pointer"
          aria-label="关闭引导"
        >
          <X size={14} />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3 pr-4">
          <div className="w-9 h-9 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0 mt-0.5">
            <Icon size={18} className="text-[var(--theme-accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-[var(--theme-text-primary)] mb-1">
              {step.title}
            </h3>
            <p className="text-xs text-[var(--theme-text-muted)] leading-relaxed">
              {step.description}
            </p>
          </div>
        </div>

        {/* Progress & navigation */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--theme-border)]">
          <div className="flex items-center gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === current ? 'w-4 bg-[var(--theme-accent)]' : 'w-1.5 bg-[var(--theme-border)]'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {current > 0 && (
              <button
                onClick={onPrev}
                className="px-2 py-1 rounded text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer flex items-center gap-0.5"
              >
                <ChevronLeft size={12} /> 上一个
              </button>
            )}
            <button
              onClick={onSkip}
              className="px-2 py-1 rounded text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer flex items-center gap-0.5"
            >
              <SkipForward size={12} /> 跳过
            </button>
            <button
              onClick={onNext}
              className="px-3 py-1.5 rounded-lg bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
            >
              {isLast ? '完成' : '下一个'} <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main FeatureTour component
// ---------------------------------------------------------------------------

export function FeatureTour() {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const completeTour = useOnboardingStore((s) => s.completeTour)
  const skipTour = useOnboardingStore((s) => s.skipTour)

  const steps = TOUR_STEPS

  const updateTargetRect = useCallback(() => {
    const step = steps[currentStep]
    if (!step) return
    const el = document.querySelector(step.target)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
      setIsVisible(true)
    } else {
      // If target not found, skip to next or finish
      if (currentStep < steps.length - 1) {
        setCurrentStep((s) => s + 1)
      } else {
        setIsVisible(false)
        void completeTour()
      }
    }
  }, [currentStep, steps, completeTour])

  useEffect(() => {
    if (!isVisible) return
    updateTargetRect()
    const handleResize = () => updateTargetRect()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
    }
  }, [isVisible, updateTargetRect])

  // Initial check: try to start the tour
  useEffect(() => {
    // Small delay to let the DOM render
    const timer = setTimeout(() => {
      updateTargetRect()
    }, 300)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      setIsVisible(false)
      void completeTour()
    }
  }, [currentStep, steps.length, completeTour])

  const handlePrev = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1))
  }, [])

  const handleSkip = useCallback(() => {
    setIsVisible(false)
    void skipTour()
  }, [skipTour])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    void skipTour()
  }, [skipTour])

  // Close tour on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, handleClose])

  if (!isVisible || !targetRect) return null

  const step = steps[currentStep]

  // Spotlight: darken everything except the target
  const spotlightPadding = 6
  const spotlightStyle = {
    top: targetRect.top - spotlightPadding,
    left: targetRect.left - spotlightPadding,
    width: targetRect.width + spotlightPadding * 2,
    height: targetRect.height + spotlightPadding * 2,
  }

  return (
    <div className="fixed inset-0 z-[9500] pointer-events-auto">
      {/* Overlay with cutout - use 4 overlay panels around the spotlight */}
      <div
        className="fixed inset-0 bg-black/60"
        style={{
          clipPath: `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%,
            0% ${spotlightStyle.top}px,
            ${spotlightStyle.left}px ${spotlightStyle.top}px,
            ${spotlightStyle.left}px ${spotlightStyle.top + spotlightStyle.height}px,
            0% ${spotlightStyle.top + spotlightStyle.height}px
          )`,
        }}
        onClick={handleClose}
      />
      {/* Right cutout */}
      <div
        className="fixed inset-0 bg-black/60"
        style={{
          clipPath: `polygon(
            ${spotlightStyle.left + spotlightStyle.width}px ${spotlightStyle.top}px,
            100% ${spotlightStyle.top}px,
            100% ${spotlightStyle.top + spotlightStyle.height}px,
            ${spotlightStyle.left + spotlightStyle.width}px ${spotlightStyle.top + spotlightStyle.height}px
          )`,
        }}
        onClick={handleClose}
      />
      {/* Top strip */}
      <div
        className="fixed inset-0 bg-black/60"
        style={{
          clipPath: `polygon(
            ${spotlightStyle.left}px 0%,
            ${spotlightStyle.left + spotlightStyle.width}px 0%,
            ${spotlightStyle.left + spotlightStyle.width}px ${spotlightStyle.top}px,
            ${spotlightStyle.left}px ${spotlightStyle.top}px
          )`,
        }}
        onClick={handleClose}
      />
      {/* Bottom strip */}
      <div
        className="fixed inset-0 bg-black/60"
        style={{
          clipPath: `polygon(
            ${spotlightStyle.left}px ${spotlightStyle.top + spotlightStyle.height}px,
            ${spotlightStyle.left + spotlightStyle.width}px ${spotlightStyle.top + spotlightStyle.height}px,
            ${spotlightStyle.left + spotlightStyle.width}px 100%,
            ${spotlightStyle.left}px 100%
          )`,
        }}
        onClick={handleClose}
      />

      {/* Spotlight highlight ring */}
      <div
        className="fixed rounded-lg border-2 border-[var(--theme-accent)] shadow-[0_0_12px_var(--theme-glow)] pointer-events-none transition-all duration-300"
        style={spotlightStyle}
      />

      {/* Tooltip */}
      <TourTooltip
        step={step}
        rect={targetRect}
        current={currentStep}
        total={steps.length}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        onClose={handleClose}
      />
    </div>
  )
}
