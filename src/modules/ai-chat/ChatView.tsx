import { useState, useEffect, useCallback, useMemo } from 'react'
import { Send, Bot, Settings, Brain, AlertCircle, RefreshCw } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAppStore } from '../../stores/appStore'
import { useAIStream } from '../../hooks/useAIStream'
import { SessionList } from './SessionList'
import { MessageBubble } from './MessageBubble'

export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const error = useChatStore((s) => s.error)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const loadSessions = useChatStore((s) => s.loadSessions)
  const loadPresets = useChatStore((s) => s.loadPresets)
  const loadMemories = useChatStore((s) => s.loadMemories)
  const memories = useChatStore((s) => s.memories)

  const aiConfigs = useSettingsStore((s) => s.aiConfigs)
  const loadConfigs = useSettingsStore((s) => s.loadConfigs)

  const setActiveModule = useAppStore((s) => s.setActiveModule)

  const { scrollRef: messagesEndRef } = useAIStream()

  const [input, setInput] = useState('')
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null)
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null)

  useEffect(() => {
    void loadConfigs().catch((err) => console.error('[ChatView.loadConfigs]', err))
    void loadSessions().catch((err) => console.error('[ChatView.loadSessions]', err))
    void loadPresets().catch((err) => console.error('[ChatView.loadPresets]', err))
    void loadMemories().catch((err) => console.error('[ChatView.loadMemories]', err))
  }, [loadConfigs, loadSessions, loadPresets, loadMemories])

  useEffect(() => {
    if (aiConfigs.length > 0 && !selectedConfigId) {
      const defaultConfig = aiConfigs.find((config) => config.is_default === 1) ?? aiConfigs[0]
      if (defaultConfig?.id) {
        setSelectedConfigId(defaultConfig.id)
      }
    }
  }, [aiConfigs, selectedConfigId])

  // Memoize derived state to avoid recalculating on every render
  const enabledMemoryCount = useMemo(
    () => memories.filter((memory) => memory.enabled === 1).length,
    [memories],
  )

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) {
      return
    }

    setLastUserMessage(text)
    setInput('')
    void sendMessage(text, selectedConfigId ?? undefined)
  }, [input, streaming, sendMessage, selectedConfigId])

  const handleRetry = useCallback(() => {
    if (lastUserMessage && !streaming) {
      void sendMessage(lastUserMessage, selectedConfigId ?? undefined)
    }
  }, [lastUserMessage, streaming, sendMessage, selectedConfigId])

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value),
    [],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleOpenSettings = useCallback(() => setActiveModule('settings'), [setActiveModule])

  const handleConfigChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) =>
      setSelectedConfigId(Number(event.target.value)),
    [],
  )

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <SessionList />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="ui-toolbar border-b px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
                  <Bot size={16} />
                </div>
                <div>
                  <h2 className="ui-section-title text-base">AI 助手</h2>
                  <p className="text-xs text-[var(--theme-text-muted)]">
                    支持跨对话记忆、预设角色和代码问答
                  </p>
                </div>
              </div>

              <button
                onClick={handleOpenSettings}
                className="ui-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                title="打开记忆库设置"
                aria-label="打开记忆库设置"
              >
                <Brain size={12} aria-hidden="true" />
                记忆库 {enabledMemoryCount}
              </button>

              {aiConfigs.length === 0 && (
                <button
                  onClick={handleOpenSettings}
                  className="ui-btn-accent flex items-center gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Settings size={12} />
                  配置 AI 模型
                </button>
              )}
            </div>

            {aiConfigs.length > 0 && (
              <select
                value={selectedConfigId ?? ''}
                onChange={handleConfigChange}
                aria-label="选择 AI 模型配置"
                className="ui-select w-[260px] max-w-full px-3 py-2 text-sm"
              >
                {aiConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name} ({config.model})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5">
          {!activeSessionId && (
            <EmptyState
              title="新建一个对话开始吧"
              description="你可以直接问编程问题、让 AI 解释题目，或者让它记住你的长期偏好。"
            />
          )}

          {activeSessionId && messages.length === 0 && (
            <EmptyState
              title="这一轮对话还没有消息"
              description={'试试输入"记住我更喜欢先看思路再看代码"，以后新会话也会带上这条记忆。'}
            />
          )}

          <div
            className="mx-auto flex w-full max-w-4xl flex-col gap-4"
            role="log"
            aria-label="对话消息"
            aria-live="polite"
          >
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                msg={message}
                isStreaming={
                  streaming &&
                  message.role === 'assistant' &&
                  message.id === messages[messages.length - 1]?.id
                }
              />
            ))}

            {error && (
              <div className="ui-card-soft flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-[var(--theme-danger)]">
                <AlertCircle size={16} className="shrink-0" />
                <span className="flex-1">{error}</span>
                <button
                  onClick={handleRetry}
                  disabled={streaming}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft)] transition-colors"
                >
                  <RefreshCw size={12} />
                  重试
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="ui-toolbar shrink-0 border-t px-5 py-4">
          <div className="mx-auto flex w-full max-w-4xl gap-3">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... Enter 发送，Shift+Enter 换行"
              aria-label="输入消息"
              rows={2}
              className="ui-textarea flex-1 resize-none px-4 py-3 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || streaming}
              className="ui-btn-accent self-end px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] focus-visible:ring-offset-2"
              aria-label="发送消息"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="ui-card w-full max-w-xl px-8 py-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
          <Bot size={24} />
        </div>
        <p className="text-lg font-semibold text-[var(--theme-text-primary)]">{title}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--theme-text-muted)]">{description}</p>
      </div>
    </div>
  )
}
