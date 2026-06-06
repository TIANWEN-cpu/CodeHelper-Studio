import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'motion/react'
import {
  Home,
  BookOpen,
  PenTool,
  FolderCode,
  Sparkles,
  RotateCcw,
  Library,
  Settings,
  Moon,
  Sun,
  LayoutPanelLeft,
  Code,
  CircleUser,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import * as homeService from '@/services/homeService'
import type { HomeOverview } from '@/services/homeService'
import type { ViewType } from '@/types'

export function Sidebar() {
  const {
    currentView,
    setCurrentView,
    showAITutor,
    toggleAITutor,
    theme,
    toggleTheme,
    sidebarCollapsed: collapsed,
    toggleSidebar,
  } = useAppStore()
  const [overview, setOverview] = useState<HomeOverview | null>(null)
  const mountedRef = useRef(false)

  const refreshOverview = useCallback(() => {
    homeService
      .getOverview()
      .then((data) => {
        if (mountedRef.current) setOverview(data)
      })
      .catch(() => {
        // 加载失败时保持骨架占位，不显示假数据
      })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refreshOverview()
    return () => {
      mountedRef.current = false
    }
  }, [refreshOverview])

  useEffect(() => {
    window.addEventListener('codehelper:profile-changed', refreshOverview)
    window.addEventListener('codehelper:learning-records-cleared', refreshOverview)
    return () => {
      window.removeEventListener('codehelper:profile-changed', refreshOverview)
      window.removeEventListener('codehelper:learning-records-cleared', refreshOverview)
    }
  }, [refreshOverview])

  useEffect(() => {
    if (currentView === 'profile') refreshOverview()
  }, [currentView, refreshOverview])

  // 根据等级显示称号（替代写死的 Pro 徽章）
  const levelTitle =
    overview == null
      ? null
      : overview.level >= 20
        ? 'Master'
        : overview.level >= 10
          ? 'Pro'
          : overview.level >= 5
            ? 'Adept'
            : 'Novice'

  // 经验条百分比（按真实数据，做除零与边界保护）
  const xpPercent =
    overview && overview.xpForNextLevel > 0
      ? Math.min(100, Math.max(0, Math.round((overview.xpInLevel / overview.xpForNextLevel) * 100)))
      : 0

  const navItems: Array<{
    id: ViewType
    label: string
    icon: React.ComponentType<{ size?: number; className?: string }>
    color?: string
  }> = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'learn', label: '课程学习', icon: BookOpen },
    { id: 'practice', label: '题库练习', icon: PenTool },
    { id: 'workspace', label: '编程工作区', icon: FolderCode },
    {
      id: 'ai-tutor',
      label: 'AI 助手',
      icon: Sparkles,
      color: 'text-[var(--color-accent-purple)]',
    },
    { id: 'review', label: '复习与错题', icon: RotateCcw },
    { id: 'knowledge', label: '知识库', icon: Library },
    { id: 'settings', label: '设置', icon: Settings },
  ] as const

  return (
    <motion.div
      initial={false}
      animate={{ width: collapsed ? 72 : 240 }}
      className="flex-shrink-0 flex flex-col bg-[var(--color-bg-panel)] border-r border-[var(--color-border-subtle)] overflow-hidden h-full z-20"
    >
      {/* Logo Area */}
      <div
        className={cn(
          'h-16 flex items-center mb-4 transition-all duration-300',
          collapsed ? 'justify-center px-0' : 'px-6',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] flex items-center justify-center text-white shrink-0 shadow-sm">
            <Code size={18} strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1 className="font-bold text-[15px] tracking-wide text-white leading-tight">
                CodeHelper
              </h1>
              <p className="text-[10px] text-[var(--color-text-muted)] font-medium">
                AI 编程学习工作台
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          'flex-1 space-y-1 overflow-y-auto hide-scrollbar',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentView === item.id
          const showActiveIndicator = isActive

          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                'w-full flex items-center rounded-lg text-sm font-medium transition-colors group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-panel)]',
                collapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2.5',
                showActiveIndicator
                  ? 'bg-gradient-to-r from-[var(--color-accent-primary)]/10 to-[var(--color-accent-purple)]/10 text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={18}
                className={cn(
                  'shrink-0 transition-colors',
                  showActiveIndicator
                    ? 'text-[var(--color-accent-purple)]'
                    : item.color ||
                        'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)]',
                )}
              />

              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}

              {showActiveIndicator && !collapsed && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-r-full bg-gradient-to-b from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] shadow-[2px_0_10px_rgba(139,92,246,0.3)]"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}

              {showActiveIndicator && collapsed && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 rounded-r-md bg-gradient-to-b from-[var(--color-accent-primary)] to-[var(--color-accent-purple)]"></div>
              )}
            </button>
          )
        })}
      </nav>

      {/* User Profile */}
      <div
        className={cn(
          'border-t border-[var(--color-border-subtle)] mt-auto transition-all',
          collapsed ? 'p-3' : 'p-4',
        )}
      >
        {!collapsed ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCurrentView('profile')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setCurrentView('profile')
              }
            }}
            className="flex items-center gap-3 mb-4 cursor-pointer hover:bg-[var(--color-bg-hover)] p-2 rounded-xl -mx-2 transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]"
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#2A2F45] overflow-hidden flex items-center justify-center">
                <CircleUser size={24} className="text-[#9CA3AF]" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-[#10B981] w-3.5 h-3.5 rounded-full border-2 border-[var(--color-bg-panel)]"></div>
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between">
                {overview ? (
                  <p className="text-sm font-medium text-white truncate">{overview.greetingName}</p>
                ) : (
                  <div className="h-4 w-20 rounded bg-[var(--color-bg-base)] animate-pulse" />
                )}
                {levelTitle && (
                  <span className="text-[10px] font-bold bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)] px-1.5 py-0.5 rounded">
                    {levelTitle}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                {overview ? (
                  <>
                    <p className="text-xs text-[var(--color-text-muted)]">Lv.{overview.level}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {overview.xpInLevel}/{overview.xpForNextLevel} XP
                    </p>
                  </>
                ) : (
                  <>
                    <div className="h-3 w-10 rounded bg-[var(--color-bg-base)] animate-pulse" />
                    <div className="h-2.5 w-14 rounded bg-[var(--color-bg-base)] animate-pulse" />
                  </>
                )}
              </div>
              <div className="w-full h-1 bg-[var(--color-bg-base)] rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] transition-[width] duration-500"
                  style={{ width: `${xpPercent}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCurrentView('profile')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setCurrentView('profile')
              }
            }}
            className="flex items-center justify-center mb-6 mt-2 relative cursor-pointer group focus-visible:outline-none"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-[#2A2F45] overflow-hidden flex items-center justify-center group-hover:ring-2 ring-[var(--color-accent-primary)]/50 transition-all">
                <CircleUser size={18} className="text-[#9CA3AF]" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 bg-[#10B981] w-2.5 h-2.5 rounded-full border border-[var(--color-bg-panel)]"></div>
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex text-[var(--color-text-muted)]',
            collapsed ? 'flex-col items-center gap-4' : 'items-center justify-between',
          )}
        >
          <button
            onClick={toggleTheme}
            className="p-1.5 hover:text-white hover:bg-[var(--color-bg-hover)] rounded-md transition-colors"
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={toggleSidebar}
            className="p-1.5 hover:text-white hover:bg-[var(--color-bg-hover)] rounded-md transition-colors"
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <LayoutPanelLeft
              size={16}
              className={collapsed ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className="p-1.5 hover:text-white hover:bg-[var(--color-bg-hover)] rounded-md transition-colors"
            title="设置"
          >
            <Settings size={16} />
          </button>
        </div>
        <button
          type="button"
          data-ai-panel-sidebar-entry
          onClick={toggleAITutor}
          aria-pressed={showAITutor}
          className={cn(
            'group relative isolate mt-3 overflow-hidden rounded-xl border border-[var(--color-accent-purple)]/45 bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-purple)] text-white shadow-lg shadow-[var(--color-accent-purple)]/20 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(139,92,246,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-purple)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-panel)]',
            collapsed
              ? 'flex h-10 w-10 items-center justify-center'
              : 'flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold',
            showAITutor &&
              'ring-2 ring-[var(--color-accent-purple)]/60 ring-offset-2 ring-offset-[var(--color-bg-panel)]',
          )}
          title={showAITutor ? '关闭当前页 AI 面板' : '打开当前页 AI 面板'}
        >
          <span className="absolute inset-0 -z-10 bg-white/0 transition-colors group-hover:bg-white/10" />
          <Sparkles size={collapsed ? 18 : 16} className="shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">当前页 AI</span>}
        </button>
      </div>
    </motion.div>
  )
}
