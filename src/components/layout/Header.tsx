import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Command, ChevronDown, Bell, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ViewType } from '@/types'
import * as settingsService from '@/services/settingsService'
import * as reviewService from '@/services/reviewService'

/** Pages reachable from the command palette. */
const COMMAND_ITEMS: { view: ViewType; label: string }[] = [
  { view: 'home', label: '首页' },
  { view: 'learn', label: '课程' },
  { view: 'practice', label: '练习' },
  { view: 'workspace', label: '工作区' },
  { view: 'review', label: '错题' },
  { view: 'knowledge', label: '知识库' },
  { view: 'settings', label: '设置' },
]

export function Header() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)

  // --- AI model name (real default config) ---
  const [modelName, setModelName] = useState<string | null>(null)

  // --- Pending review count (real due reviews) ---
  const [dueCount, setDueCount] = useState(0)

  // --- Command palette state (component-local) ---
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch the default AI model name. The IPC layer may resolve to null when no
  // config exists, so treat a missing model defensively.
  useEffect(() => {
    let cancelled = false
    settingsService
      .getDefaultAIConfig()
      .then((config) => {
        if (cancelled) return
        setModelName(config && config.model ? config.model : null)
      })
      .catch(() => {
        if (!cancelled) setModelName(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch the number of exercises due for review.
  useEffect(() => {
    let cancelled = false
    reviewService
      .getDueReviews()
      .then((items) => {
        if (!cancelled) setDueCount(Array.isArray(items) ? items.length : 0)
      })
      .catch(() => {
        if (!cancelled) setDueCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMAND_ITEMS
    return COMMAND_ITEMS.filter((item) => item.label.toLowerCase().includes(q))
  }, [query])

  const openPalette = useCallback(() => {
    setQuery('')
    setActiveIndex(0)
    setPaletteOpen(true)
  }, [])

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
  }, [])

  const go = useCallback(
    (view: ViewType) => {
      setCurrentView(view)
      setPaletteOpen(false)
    },
    [setCurrentView],
  )

  // Global Ctrl/Cmd+K to toggle the palette.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => {
          if (prev) return false
          setQuery('')
          setActiveIndex(0)
          return true
        })
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Focus the palette input when it opens; keep the highlight in range.
  useEffect(() => {
    if (paletteOpen) inputRef.current?.focus()
  }, [paletteOpen])

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filteredItems.length - 1)))
  }, [filteredItems.length])

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = filteredItems[activeIndex]
      if (target) go(target.view)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePalette()
    }
  }

  return (
    <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]/80 backdrop-blur-md z-30 relative text-[var(--color-text-primary)]">
      {/* Left / Command launcher */}
      <div className="flex-1 flex items-center">
        <div className="relative group w-full max-w-[200px] md:max-w-xs focus-within:max-w-md transition-all duration-300">
          <Command
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-accent-primary)] group-hover:text-[var(--color-text-secondary)] transition-colors"
          />
          <input
            type="text"
            readOnly
            value=""
            onFocus={openPalette}
            onMouseDown={(e) => {
              // Open the palette instead of placing a caret in this proxy input.
              e.preventDefault()
              openPalette()
            }}
            placeholder="打开命令终端..."
            className="w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg pl-9 pr-12 py-2 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-4 focus:ring-[var(--color-accent-primary)]/10 transition-all hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] focus:bg-[var(--color-bg-panel)] shadow-sm cursor-pointer"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="hidden sm:inline-flex items-center gap-1 bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
              Ctrl K
            </kbd>
          </div>
        </div>
      </div>

      {/* Desktop Right */}
      <div className="flex items-center justify-end gap-3 flex-1">
        {/* Command Palette Button */}
        <button
          onClick={openPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] active:scale-95 transition-all text-sm text-[var(--color-text-secondary)]"
        >
          <Command size={14} />
          <span>命令终端</span>
          <kbd className="bg-[var(--color-bg-base)] rounded px-1 text-xs">⌘K</kbd>
        </button>

        {/* AI Model Switcher */}
        <button
          onClick={() => setCurrentView('settings')}
          title={modelName ? 'AI 模型设置' : '前往设置配置 AI 模型'}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] active:scale-95 transition-all text-sm"
        >
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                modelName ? 'bg-[#10B981]' : 'bg-[var(--color-text-muted)]',
              )}
            ></div>
            <span className={modelName ? 'text-white' : 'text-[var(--color-text-muted)]'}>
              {modelName ?? '未配置模型'}
            </span>
          </div>
          <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
        </button>

        <div className="w-px h-6 bg-[var(--color-border-subtle)] mx-1" />

        {/* Icons */}
        <button
          onClick={() => setCurrentView('review')}
          className="relative p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-hover)] active:scale-95 rounded-md transition-all"
          title={dueCount > 0 ? `${dueCount} 个待复习` : '复习'}
        >
          <Bell size={18} />
          {dueCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-semibold leading-none text-white bg-[#EF4444] rounded-full border border-[var(--color-bg-base)]">
              {dueCount > 99 ? '99+' : dueCount}
            </span>
          )}
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-bg-hover)] active:scale-95 rounded-md transition-all"
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* Command Palette Overlay */}
      <AnimatePresence>
        {paletteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/30 backdrop-blur-[2px]"
            onMouseDown={closePalette}
          >
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="w-full max-w-xl mx-4 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-panel)] shadow-2xl shadow-black/40 ring-1 ring-white/5 overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-4 border-b border-[var(--color-border-subtle)]">
                <Command size={16} className="text-[var(--color-text-muted)]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={onInputKeyDown}
                  placeholder="输入命令或页面名..."
                  className="flex-1 bg-transparent py-3 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
                  Esc
                </kbd>
              </div>
              <ul className="max-h-72 overflow-y-auto py-2">
                {filteredItems.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-[var(--color-text-muted)]">无匹配的页面</li>
                ) : (
                  filteredItems.map((item, index) => (
                    <li key={item.view}>
                      <button
                        onClick={() => go(item.view)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={cn(
                          'w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors',
                          index === activeIndex
                            ? 'bg-[var(--color-bg-hover)] text-white'
                            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                        )}
                      >
                        <span>{item.label}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {item.view}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
