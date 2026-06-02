/**
 * TerminalPanel — Integrated terminal panel for the editor.
 *
 * Provides a shell-like interface that captures command output
 * by executing code via the existing IPC runner.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Terminal, ChevronDown } from 'lucide-react'
import { typedInvoke } from '../../api/ipc'

interface TerminalEntry {
  id: number
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  timestamp: number
}

interface TerminalPanelProps {
  onClose: () => void
}

const TERMINAL_HISTORY_KEY = 'codehelper-terminal-history'

function loadCommandHistory(): string[] {
  try {
    const raw = localStorage.getItem(TERMINAL_HISTORY_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveCommandHistory(history: string[]) {
  localStorage.setItem(TERMINAL_HISTORY_KEY, JSON.stringify(history.slice(-50)))
}

export function TerminalPanel({ onClose }: TerminalPanelProps) {
  const [entries, setEntries] = useState<TerminalEntry[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [height, setHeight] = useState(220)
  const [_resizing, setResizing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const commandHistory = useRef(loadCommandHistory())
  const entryId = useRef(0)

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [entries])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const executeCommand = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return

    setRunning(true)
    const id = ++entryId.current
    const entry: TerminalEntry = {
      id,
      command: cmd,
      stdout: '',
      stderr: '',
      exitCode: null,
      timestamp: Date.now(),
    }

    setEntries((prev) => [...prev, entry])

    // Save to history
    commandHistory.current.push(cmd)
    saveCommandHistory(commandHistory.current)
    setHistoryIdx(-1)

    try {
      // Use the run-code IPC to execute
      const result = await typedInvoke('run-code', { code: cmd, language: 'python' })
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                stdout: result?.stdout ?? '',
                stderr: result?.stderr ?? '',
                exitCode: result?.exitCode ?? 0,
              }
            : e,
        ),
      )
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                stderr: `Error: ${err instanceof Error ? err.message : String(err)}`,
                exitCode: 1,
              }
            : e,
        ),
      )
    } finally {
      setRunning(false)
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !running) {
        e.preventDefault()
        void executeCommand(input)
        setInput('')
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const history = commandHistory.current
        if (history.length > 0) {
          const newIdx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1)
          setHistoryIdx(newIdx)
          setInput(history[newIdx])
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const history = commandHistory.current
        if (historyIdx >= 0) {
          const newIdx = historyIdx + 1
          if (newIdx >= history.length) {
            setHistoryIdx(-1)
            setInput('')
          } else {
            setHistoryIdx(newIdx)
            setInput(history[newIdx])
          }
        }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault()
        setEntries([])
      }
    },
    [input, running, historyIdx, executeCommand],
  )

  // Resize handling
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setResizing(true)
      const startY = e.clientY
      const startHeight = height

      const onMouseMove = (me: MouseEvent) => {
        const diff = startY - me.clientY
        setHeight(Math.max(100, Math.min(500, startHeight + diff)))
      }
      const onMouseUp = () => {
        setResizing(false)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [height],
  )

  return (
    <div
      className="flex shrink-0 flex-col border-t border-[var(--theme-border)]"
      style={{ height }}
    >
      {/* Resize handle */}
      <div
        className="flex h-1 cursor-row-resize items-center justify-center hover:bg-[var(--theme-accent-soft)]"
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整终端面板高度"
        tabIndex={0}
      >
        <div className="h-0.5 w-8 rounded-full bg-[var(--theme-border)]" aria-hidden="true" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-3 py-1.5 glass-line">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[var(--theme-accent)]" aria-hidden="true" />
          <span className="text-xs font-medium text-[var(--theme-text-muted)]">终端</span>
          {running && (
            <span
              className="text-[10px] text-[var(--theme-warning)] animate-pulse"
              aria-live="polite"
            >
              运行中...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEntries([])}
            className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            title="清空终端"
            aria-label="清空终端"
          >
            <X size={12} aria-hidden="true" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            title="关闭终端"
            aria-label="关闭终端"
          >
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto bg-[var(--theme-bg-app)] p-2 font-mono text-xs"
        role="log"
        aria-label="终端输出"
        aria-live="polite"
      >
        {entries.length === 0 && (
          <div className="text-[var(--theme-text-muted)]">
            输入命令并按 Enter 执行。Ctrl+L 清空。上下键浏览历史。
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[var(--theme-accent)]">$</span>
              <span className="text-[var(--theme-text-primary)]">{entry.command}</span>
            </div>
            {entry.stdout && (
              <pre className="mt-1 whitespace-pre-wrap pl-4 text-[var(--theme-success)]">
                {entry.stdout}
              </pre>
            )}
            {entry.stderr && (
              <pre className="mt-1 whitespace-pre-wrap pl-4 text-[var(--theme-danger)]">
                {entry.stderr}
              </pre>
            )}
            {entry.exitCode !== null && entry.exitCode !== 0 && (
              <div className="mt-1 pl-4 text-[var(--theme-danger)]">
                Process exited with code {entry.exitCode}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-[var(--theme-border)] bg-[var(--theme-bg-app)] px-3 py-2">
        <span className="shrink-0 text-xs text-[var(--theme-accent)]">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入命令..."
          disabled={running}
          aria-label="终端命令输入"
          className="flex-1 bg-transparent font-mono text-xs text-[var(--theme-text-primary)] outline-none placeholder:text-[var(--theme-text-muted)]"
        />
      </div>
    </div>
  )
}
