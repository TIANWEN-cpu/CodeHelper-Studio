import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Loader2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAIStream } from '../../hooks/useAIStream'
import { renderMarkdown } from '../../utils/markdown'

/**
 * Configuration for a single AI analysis panel.
 *
 * Every field that varies between BugFinder / CodeExplainer /
 * CodeReviewer / CodeOptimizer lives here; the shared UI and
 * lifecycle logic lives in AIPanel itself.
 */
export interface AIPanelConfig {
  /** Panel title shown in the header (e.g. "Bug 检测") */
  title: string
  /** Lucide icon component rendered in the header */
  icon: LucideIcon
  /** Tailwind classes for the icon container background and text color */
  iconClassName: string
  /** Label on the primary action button */
  buttonLabel: string
  /** Text shown while the AI request is in flight */
  loadingLabel: string
  /** Tailwind color class for the loading spinner area */
  loadingClassName?: string
  /** Optional subtitle below the loading label */
  loadingHint?: string
  /** System prompt passed to createSession */
  systemPrompt: string
  /** Session name prefix (e.g. "Bug 检测") */
  sessionName: string
  /**
   * Build the user-facing prompt from selected code and language.
   * Receives (code, language) and must return the full prompt string.
   */
  buildPrompt: (code: string, language: string) => string
  /** Tailwind max-height class for the result area (default: max-h-[32rem]) */
  resultMaxHeight?: string
  /** Optional extra content rendered between the header and code preview */
  extraHeader?: ReactNode
  /** Error fallback message prefix */
  errorPrefix?: string
}

interface AIPanelProps {
  code: string
  language: string
  onClose: () => void
  config: AIPanelConfig
}

/**
 * Generic, reusable AI analysis panel.
 *
 * Consumes an AIPanelConfig and renders the full panel lifecycle:
 * code preview -> action button -> loading state -> result / error.
 *
 * Each specific panel (BugFinder, CodeExplainer, etc.) becomes a
 * thin wrapper that supplies only the config.
 */
export function AIPanel({ code, language, onClose, config }: AIPanelProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [copied, setCopied] = useState(false)

  const messages = useChatStore((s) => s.messages)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const createSession = useChatStore((s) => s.createSession)

  const aiConfigs = useSettingsStore((s) => s.aiConfigs)
  const resultRef = useRef<HTMLDivElement>(null)

  const { scrollRef } = useAIStream({ autoScroll: true })

  const {
    title,
    icon: Icon,
    iconClassName,
    buttonLabel,
    loadingLabel,
    loadingClassName = 'text-[var(--theme-accent)]',
    loadingHint,
    systemPrompt,
    sessionName,
    buildPrompt,
    resultMaxHeight = 'max-h-[32rem]',
    extraHeader,
    errorPrefix = '操作',
  } = config

  const handleAction = useCallback(async () => {
    if (!code.trim() || loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    const prompt = buildPrompt(code, language)

    try {
      await createSession(systemPrompt, `${sessionName}: ${language}`)
      await sendMessage(prompt, aiConfigs[0]?.id)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : `${errorPrefix}时出错`)
      setLoading(false)
    }
  }, [
    code,
    language,
    loading,
    sendMessage,
    createSession,
    aiConfigs,
    buildPrompt,
    systemPrompt,
    sessionName,
    errorPrefix,
  ])

  const handleCopy = useCallback(async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }, [result])

  // Capture the last assistant message as the result
  useEffect(() => {
    if (!loading && messages.length > 0) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
      if (lastAssistant) {
        setResult(lastAssistant.content)
      }
    }
  }, [messages, loading])

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg-surface)] shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${iconClassName}`}>
            <Icon size={14} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--theme-text-primary)]">{title}</h3>
            <p className="text-xs text-[var(--theme-text-muted)]">{language}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {result && (
            <button
              onClick={handleCopy}
              className="rounded-lg px-2 py-1 text-xs text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
              aria-label={copied ? '已复制到剪贴板' : '复制结果'}
            >
              {copied ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? '折叠面板' : '展开面板'}
            className="rounded-lg px-2 py-1 text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
          >
            {expanded ? (
              <ChevronUp size={14} aria-hidden="true" />
            ) : (
              <ChevronDown size={14} aria-hidden="true" />
            )}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            aria-label={`关闭${title}面板`}
          >
            关闭
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Optional extra content (e.g. severity filter) */}
          {extraHeader}

          {/* Code preview */}
          <div className="border-b border-[var(--theme-border)] px-4 py-3">
            <pre className="max-h-32 overflow-auto rounded-lg bg-[var(--theme-bg-code)] p-3 text-xs text-[var(--theme-text-primary)]">
              <code>{code.length > 500 ? code.slice(0, 500) + '\n...' : code}</code>
            </pre>
          </div>

          {/* Action / Result area */}
          <div className="px-4 py-3">
            {!result && !loading && !error && (
              <button
                onClick={handleAction}
                className="ui-btn-accent flex w-full items-center justify-center gap-2 px-4 py-2.5 text-sm"
                aria-label={buttonLabel}
              >
                <Icon size={14} aria-hidden="true" />
                {buttonLabel}
              </button>
            )}

            {loading && (
              <div
                className="flex flex-col items-center justify-center gap-3 py-6"
                role="status"
                aria-label="正在分析"
              >
                <div className={`flex items-center gap-2 ${loadingClassName}`}>
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  <span className="text-sm">{loadingLabel}</span>
                </div>
                {loadingHint && (
                  <p className="text-xs text-[var(--theme-text-muted)]">{loadingHint}</p>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-[var(--theme-danger-soft, #fef2f2)] px-4 py-3 text-sm text-[var(--theme-danger)]">
                {error}
                <button onClick={handleAction} className="ml-2 underline hover:no-underline">
                  重试
                </button>
              </div>
            )}

            {result && (
              <div
                ref={resultRef}
                className={`prose prose-sm dark:prose-invert ${resultMaxHeight} overflow-auto rounded-xl bg-[var(--theme-bg-code)] p-4 text-sm leading-6 text-[var(--theme-text-primary)]`}
              >
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(result) }} />
                <div ref={scrollRef} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
