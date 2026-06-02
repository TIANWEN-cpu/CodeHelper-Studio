import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, X, Lightbulb, Code2, Bug } from 'lucide-react'
import { useProblemStore } from '../../stores/problemStore'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const AI_PANEL_MIN_WIDTH = 220
const AI_PANEL_MAX_WIDTH = 760

const quickPrompts = [
  { icon: Lightbulb, label: '解释题目', prompt: '请用简单的中文解释这道题目的要求和解题思路。' },
  { icon: Code2, label: '给我提示', prompt: '请给我循序渐进的解题提示，但不要直接给最终答案。' },
  {
    icon: Bug,
    label: '分析代码',
    prompt: '请分析我当前可能会写出的代码问题，并提醒我最容易出错的点。',
  },
]

export function AISidebar() {
  const { activeProblem, setAIPanelOpen, aiPanelWidth, setAIPanelWidth } = useProblemStore()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubChunk = window.api.on('ai-chat-chunk', (payload: unknown) => {
      const data = payload as { requestId: string; chunk: string }
      if (data.requestId !== requestIdRef.current) {
        return
      }

      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { ...last, content: last.content + data.chunk }
        }
        return next
      })
    })

    const unsubDone = window.api.on('ai-chat-done', (payload: unknown) => {
      const data = payload as { requestId: string }
      if (data.requestId !== requestIdRef.current) {
        return
      }

      requestIdRef.current = null
      setStreaming(false)
    })

    return () => {
      unsubChunk()
      unsubDone()
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleResizeStart = (event: React.MouseEvent) => {
    event.preventDefault()
    const panelRight = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth

    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(
        AI_PANEL_MIN_WIDTH,
        Math.min(AI_PANEL_MAX_WIDTH, panelRight - moveEvent.clientX),
      )
      setAIPanelWidth(nextWidth)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('cursor-col-resize', 'select-none')
    }

    document.body.classList.add('cursor-col-resize', 'select-none')
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const sendMsg = async (text: string) => {
    if (!text.trim() || streaming) {
      return
    }

    const context = activeProblem
      ? `[当前题目: ${activeProblem.title}]
[难度: ${activeProblem.difficulty}]
[题目描述: ${activeProblem.description}]

`
      : ''

    const userMsg: Msg = { id: `m${Date.now()}`, role: 'user', content: text }
    const assistantMsg: Msg = { id: `m${Date.now() + 1}`, role: 'assistant', content: '' }
    const requestId = `problem-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    setInput('')
    requestIdRef.current = requestId

    const apiMessages = [
      {
        role: 'system' as const,
        content:
          '你是一名中文编程辅导助手，正在帮助用户刷题。请优先给提示、思路和错误定位，保持简洁、耐心、可执行。',
      },
      ...messages
        .filter((msg) => msg.content)
        .map((msg) => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
      { role: 'user' as const, content: context + text },
    ]

    try {
      await window.api.invoke('ai-chat', {
        messages: apiMessages,
        requestId,
        includeMemories: false,
      })
    } catch (error) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last) {
          next[next.length - 1] = { ...last, content: String(error) }
        }
        return next
      })
      requestIdRef.current = null
      setStreaming(false)
    }
  }

  return (
    <div
      ref={panelRef}
      className="ui-toolbar relative flex min-h-0 min-w-0 shrink-0 flex-col border-l"
      style={{ width: aiPanelWidth }}
    >
      <div
        className="ai-sidebar-resize-handle absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize"
        onMouseDown={handleResizeStart}
        title="拖拽调整 AI 侧边栏宽度"
      />

      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 glass-line">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
            <Bot size={15} />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--theme-text-primary)]">
              题目侧边 AI
            </div>
            <div className="text-[11px] text-[var(--theme-text-muted)]">
              更适合追问思路、定位 bug 和逐步提示
            </div>
          </div>
        </div>
        <button
          onClick={() => setAIPanelOpen(false)}
          className="ui-btn-ghost flex h-8 w-8 items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>

      {messages.length === 0 && (
        <div className="shrink-0 border-b px-3 py-3 glass-line">
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt.label}
                onClick={() => void sendMsg(prompt.prompt)}
                className="ui-chip hover:bg-[var(--theme-bg-hover)]"
              >
                <prompt.icon size={11} />
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
                  <Bot size={11} />
                </div>
              )}
              <div
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-6 ${
                  msg.role === 'user'
                    ? 'rounded-br-md bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]'
                    : 'ui-card-soft rounded-tl-md'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                {msg.role === 'assistant' &&
                  streaming &&
                  msg.id === messages[messages.length - 1]?.id && (
                    <span className="ml-1 mt-1 inline-flex items-center gap-0.5">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  )}
              </div>
              {msg.role === 'user' && (
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-info)] text-[var(--theme-accent-contrast)]">
                  <User size={11} />
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t px-3 py-3 glass-line">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMsg(input)
              }
            }}
            placeholder="继续追问这道题..."
            className="ui-input flex-1 px-3 py-2 text-xs"
          />
          <button
            onClick={() => void sendMsg(input)}
            disabled={!input.trim() || streaming}
            className="ui-btn-accent px-3"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
