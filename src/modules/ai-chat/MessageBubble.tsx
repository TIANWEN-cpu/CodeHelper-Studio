import { Bot, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ChatMessage } from '../../stores/chatStore'

interface Props {
  msg: ChatMessage
  isStreaming: boolean
}

export function MessageBubble({ msg, isStreaming }: Props) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[82%] rounded-[22px] rounded-br-md bg-[var(--theme-accent)] px-4 py-3 text-sm leading-7 text-[var(--theme-accent-contrast)] shadow-[0_14px_30px_var(--theme-glow)]">
          <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-info)] text-[var(--theme-accent-contrast)]">
          <User size={16} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]">
        <Bot size={16} />
      </div>
      <div className="ui-card max-w-[88%] rounded-[22px] rounded-tl-md px-4 py-3 text-sm leading-7 markdown-body">
        {msg.content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const code = String(children).replace(/\n$/, '')

                if (match) {
                  return (
                    <div className="my-3 overflow-hidden rounded-2xl border border-[var(--theme-border)]">
                      <div className="bg-[var(--theme-code-header)] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">
                        {match[1]}
                      </div>
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          padding: '14px',
                          fontSize: '12px',
                          background: 'var(--theme-code-bg)',
                        }}
                      >
                        {code}
                      </SyntaxHighlighter>
                    </div>
                  )
                }

                return (
                  <code
                    className="rounded-lg px-1.5 py-0.5 text-xs text-[var(--theme-danger)]"
                    style={{ background: 'var(--theme-code-inline)' }}
                    {...props}
                  >
                    {children}
                  </code>
                )
              },
              p({ children }) {
                return <p className="mb-2 last:mb-0">{children}</p>
              },
              ul({ children }) {
                return <ul className="mb-2 list-disc pl-5">{children}</ul>
              },
              ol({ children }) {
                return <ol className="mb-2 list-decimal pl-5">{children}</ol>
              },
              li({ children }) {
                return <li className="mb-1">{children}</li>
              },
              h1({ children }) {
                return <h1 className="mb-2 text-lg font-bold">{children}</h1>
              },
              h2({ children }) {
                return <h2 className="mb-2 text-base font-bold">{children}</h2>
              },
              h3({ children }) {
                return <h3 className="mb-1 text-sm font-bold">{children}</h3>
              },
              blockquote({ children }) {
                return (
                  <blockquote className="my-3 border-l-2 border-[var(--theme-accent)] pl-3 text-[var(--theme-text-secondary)]">
                    {children}
                  </blockquote>
                )
              },
              table({ children }) {
                return <table className="my-3 w-full border-collapse text-xs">{children}</table>
              },
              th({ children }) {
                return <th className="border border-[var(--theme-border)] bg-[var(--theme-code-header)] px-2 py-1">{children}</th>
              },
              td({ children }) {
                return <td className="border border-[var(--theme-border)] px-2 py-1">{children}</td>
              },
              a({ href, children }) {
                let allowed = false
                try {
                  const url = new URL(href ?? '')
                  allowed = url.protocol === 'http:' || url.protocol === 'https:'
                } catch {
                  // relative URLs throw in new URL(); allow them
                  allowed = true
                }
                if (!allowed) {
                  return <span>{children}</span>
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--theme-accent)] underline"
                  >
                    {children}
                  </a>
                )
              },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        ) : null}
        {isStreaming && (
          <span className="ml-1 mt-1 inline-flex items-center gap-0.5">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
        )}
      </div>
    </div>
  )
}
