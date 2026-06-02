import { memo } from 'react'

interface ConsoleProps {
  output: { stdout: string; stderr: string } | null
  running: boolean
}

export const Console = memo(function Console({ output, running }: ConsoleProps) {
  return (
    <div
      className="ui-card h-48 rounded-t-none border-x-0 border-b-0 flex flex-col shrink-0"
      role="log"
      aria-label="控制台输出"
    >
      <div className="border-b px-3 py-2 text-xs font-medium text-[var(--theme-text-muted)] glass-line">
        控制台
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-sm" aria-live="polite">
        {running && <span className="text-[var(--theme-warning)] animate-pulse">运行中...</span>}
        {output?.stdout && (
          <pre className="whitespace-pre-wrap text-[var(--theme-success)]">{output.stdout}</pre>
        )}
        {output?.stderr && (
          <pre className="whitespace-pre-wrap text-[var(--theme-danger)]">{output.stderr}</pre>
        )}
        {!running && !output && (
          <span className="text-[var(--theme-text-muted)]">点击运行按钮执行代码</span>
        )}
      </div>
    </div>
  )
})
