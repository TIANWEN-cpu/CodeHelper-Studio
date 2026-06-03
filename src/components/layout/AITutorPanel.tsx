import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles,
  X,
  MessageSquare,
  Zap,
  BookOpen,
  FileCode,
  Send,
  Loader2,
  Plus,
  Trash2,
  History,
  ChevronDown,
  Bug,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { useAIChat } from '@/hooks/useAIChat'
import { useAppStore } from '@/store'
import type { ViewType } from '@/types'

// 当前页面 -> 中文上下文标签（与 Sidebar 导航保持一致）。
const VIEW_LABELS: Record<ViewType, string> = {
  home: '首页',
  learn: '课程学习',
  practice: '题库练习',
  workspace: '编程工作区',
  'ai-tutor': 'AI 辅导',
  review: '复习与错题',
  knowledge: '知识库',
  settings: '设置',
}

// 通用快捷操作回退项（presets 为空时使用）。不再与具体题目硬耦合。
const FALLBACK_QUICK_ACTIONS = [
  { icon: FileCode, color: '#6366F1', label: '解释这段代码' },
  { icon: Bug, color: '#EF4444', label: '帮我调试' },
  { icon: BookOpen, color: '#F59E0B', label: '出一道练习题' },
  { icon: MessageSquare, color: '#10B981', label: '总结知识点' },
] as const

export function AITutorPanel({ onClose }: { onClose?: () => void }) {
  const {
    sessions,
    currentSession,
    messages,
    loading,
    streaming,
    streamingContent,
    error,
    presets,
    createSession,
    switchSession,
    deleteSession,
    sendMessage,
  } = useAIChat()

  // 真实当前上下文：读取全局 currentView。
  const currentView = useAppStore((s) => s.currentView)
  const contextLabel = VIEW_LABELS[currentView] ?? 'CodeHelper'

  const [inputValue, setInputValue] = useState('')
  const [activeTab, setActiveTab] = useState<'chat' | 'actions'>('chat')
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionMenuRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages or streaming content change.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-resize textarea.
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 128) + 'px'
    }
  }, [inputValue])

  // 点击外部关闭会话下拉菜单。
  useEffect(() => {
    if (!sessionMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sessionMenuOpen])

  const handleSend = useCallback(async () => {
    const content = inputValue.trim()
    if (!content || streaming) return
    setInputValue('')

    // If no session exists, create one first.
    if (!currentSession) {
      const title = content.length > 20 ? content.slice(0, 20) + '...' : content
      await createSession(title)
    }

    sendMessage(content)
  }, [inputValue, streaming, currentSession, createSession, sendMessage])

  const handleQuickAction = useCallback(
    async (prompt: string) => {
      if (streaming) return

      if (!currentSession) {
        const title = prompt.length > 20 ? prompt.slice(0, 20) + '...' : prompt
        await createSession(title)
      }

      sendMessage(prompt)
      setActiveTab('chat')
    },
    [streaming, currentSession, createSession, sendMessage],
  )

  // 新建对话：清空当前会话，由下一条消息触发真正创建（与 handleSend 一致）。
  const handleNewSession = useCallback(async () => {
    if (streaming) return
    setSessionMenuOpen(false)
    setActiveTab('chat')
    await createSession('新对话')
  }, [streaming, createSession])

  const handleSwitchSession = useCallback(
    async (id: string) => {
      if (id === currentSession?.id) {
        setSessionMenuOpen(false)
        return
      }
      setSessionMenuOpen(false)
      setActiveTab('chat')
      await switchSession(id)
    },
    [currentSession?.id, switchSession],
  )

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, id: string) => {
      // 阻止冒泡，避免触发切换。
      e.stopPropagation()
      await deleteSession(id)
    },
    [deleteSession],
  )

  // 快捷操作：优先使用后端 presets，为空时回退到通用项。
  const quickActions = useMemo(
    () =>
      presets.length > 0
        ? presets.map((p) => ({
            id: String(p.id),
            label: p.name,
            prompt: p.prompt,
            icon: Zap,
            color: '#8B5CF6',
          }))
        : FALLBACK_QUICK_ACTIONS.map((a) => ({
            id: a.label,
            label: a.label,
            prompt: a.label,
            icon: a.icon,
            color: a.color,
          })),
    [presets],
  )

  return (
    <motion.div
      initial={{ width: 0, opacity: 0, x: 24 }}
      animate={{ width: 'auto', opacity: 1, x: 0 }}
      exit={{ width: 0, opacity: 0, x: 24 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="flex-shrink-0 h-full overflow-hidden z-20 relative flex"
    >
      <div className="w-[320px] lg:w-[348px] flex-shrink-0 flex flex-col bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)] h-full overflow-hidden shadow-none">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--color-border-subtle)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--color-accent-purple)]" />
            <h2 className="font-semibold text-white">AI Tutor</h2>
          </div>
          <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
            {/* 会话管理下拉 */}
            <div className="relative" ref={sessionMenuRef}>
              <button
                onClick={() => setSessionMenuOpen((v) => !v)}
                className={cn(
                  'flex items-center gap-0.5 p-1.5 rounded transition-colors hover:bg-[var(--color-bg-hover)] hover:text-white',
                  sessionMenuOpen && 'bg-[var(--color-bg-hover)] text-white',
                )}
                title="会话列表"
                aria-haspopup="menu"
                aria-expanded={sessionMenuOpen}
              >
                <History size={16} />
                <ChevronDown
                  size={12}
                  className={cn('transition-transform', sessionMenuOpen && 'rotate-180')}
                />
              </button>

              <AnimatePresence>
                {sessionMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-64 max-h-[360px] flex flex-col bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl shadow-2xl overflow-hidden z-30"
                    role="menu"
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]/60">
                      <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                        会话
                      </span>
                      <button
                        onClick={handleNewSession}
                        disabled={streaming}
                        className="flex items-center gap-1 text-xs text-[var(--color-accent-purple)] hover:text-[#A78BFA] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="新建对话"
                      >
                        <Plus size={14} />
                        新建
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
                      {sessions.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
                          暂无会话，点击「新建」开始
                        </p>
                      ) : (
                        sessions.map((session) => {
                          const isActive = session.id === currentSession?.id
                          return (
                            <div
                              key={session.id}
                              onClick={() => handleSwitchSession(session.id)}
                              className={cn(
                                'group flex items-center gap-2 mx-1 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
                                isActive
                                  ? 'bg-[var(--color-accent-purple)]/15 text-white'
                                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-white',
                              )}
                              role="menuitem"
                            >
                              <MessageSquare
                                size={14}
                                className={cn(
                                  'shrink-0',
                                  isActive
                                    ? 'text-[var(--color-accent-purple)]'
                                    : 'text-[var(--color-text-muted)]',
                                )}
                              />
                              <span className="flex-1 truncate text-sm">
                                {session.title || '未命名会话'}
                              </span>
                              <button
                                onClick={(e) => handleDeleteSession(e, session.id)}
                                className="shrink-0 p-1 rounded text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-all"
                                title="删除会话"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--color-bg-hover)] hover:text-white rounded transition-colors"
              title="关闭"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Context Area —— 真实当前页面上下文 */}
          <div className="p-4 border-b border-[var(--color-border-subtle)]/50">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-3">
              当前上下文
            </p>
            <div className="bg-[var(--color-bg-card)] rounded-lg border border-[var(--color-border-subtle)] p-3">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] rounded-md">
                  <FileCode size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{contextLabel}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {currentSession
                      ? `会话：${currentSession.title || '未命名会话'}`
                      : '正在浏览此页面'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border-subtle)] px-2">
            <button
              onClick={() => setActiveTab('chat')}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-colors',
                activeTab === 'chat'
                  ? 'text-[var(--color-accent-purple)] border-b-2 border-[var(--color-accent-purple)]'
                  : 'text-[var(--color-text-muted)] hover:text-white',
              )}
            >
              对话
            </button>
            <button
              onClick={() => setActiveTab('actions')}
              className={cn(
                'px-4 py-3 text-sm font-medium transition-colors',
                activeTab === 'actions'
                  ? 'text-[var(--color-accent-purple)] border-b-2 border-[var(--color-accent-purple)]'
                  : 'text-[var(--color-text-muted)] hover:text-white',
              )}
            >
              快捷操作
            </button>
          </div>

          {/* Chat Area */}
          {activeTab === 'chat' ? (
            <div className="flex-1 p-4 space-y-6 overflow-y-auto">
              {/* Loading state */}
              {loading && messages.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-[var(--color-accent-purple)]" />
                </div>
              )}

              {/* Empty state */}
              {!loading && messages.length === 0 && !streamingContent && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Sparkles size={28} className="text-[var(--color-accent-purple)] mb-3" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    向 AI 导师提问，获取编程帮助
                  </p>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, idx) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * Math.min(idx, 5) }}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role === 'user' ? (
                    <div className="bg-[var(--color-accent-primary)] text-white px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[#E5E7EB] px-4 py-3.5 rounded-2xl rounded-tl-sm max-w-[90%] text-sm leading-relaxed shadow-sm whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Streaming content */}
              {streaming && streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[#E5E7EB] px-4 py-3.5 rounded-2xl rounded-tl-sm max-w-[90%] text-sm leading-relaxed shadow-sm whitespace-pre-wrap">
                    {streamingContent}
                    <span className="inline-block w-1.5 h-4 bg-[var(--color-accent-purple)] ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                  </div>
                </motion.div>
              )}

              {/* Streaming loading indicator (before first chunk) */}
              {streaming && !streamingContent && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[#E5E7EB] px-4 py-3.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow-sm">
                    <Loader2 size={16} className="animate-spin text-[var(--color-accent-purple)]" />
                  </div>
                </motion.div>
              )}

              {/* Suggestions (show when last message is from assistant and not streaming) */}
              {!streaming &&
                messages.length > 0 &&
                messages[messages.length - 1].role === 'assistant' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="grid grid-cols-2 gap-2 mt-2"
                  >
                    {quickActions.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action.prompt)}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-accent-purple)] hover:text-[var(--color-accent-purple)] active:scale-95 transition-all text-left"
                      >
                        <action.icon
                          size={14}
                          style={{ color: action.color }}
                          className="shrink-0"
                        />
                        <span className="truncate">{action.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}

              {/* Error display */}
              {error && (
                <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          ) : (
            /* Quick Actions Tab */
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-2">
                {quickActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-accent-purple)] hover:text-[var(--color-accent-purple)] active:scale-[0.98] transition-all text-left"
                  >
                    <action.icon size={14} style={{ color: action.color }} className="shrink-0" />
                    <span className="truncate">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] shrink-0">
          <div className="relative flex items-end gap-2 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl focus-within:border-[var(--color-accent-purple)] focus-within:ring-1 focus-within:ring-[var(--color-accent-purple)] transition-all p-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="向 AI 提问，或使用 / 选择操作"
              className="flex-1 max-h-32 min-h-[24px] bg-transparent text-sm text-white resize-none outline-none placeholder-[var(--color-text-muted)] py-1 px-1 custom-scrollbar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={streaming}
            />
            <div className="flex items-center gap-1.5 pb-1 shrink-0">
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || streaming}
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-all shadow-sm',
                  inputValue.trim() && !streaming
                    ? 'bg-[var(--color-accent-primary)] hover:bg-[#4F46E5] active:scale-90 text-white'
                    : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] cursor-not-allowed',
                )}
                title="发送 (Enter)"
              >
                {streaming ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} className="ml-0.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
