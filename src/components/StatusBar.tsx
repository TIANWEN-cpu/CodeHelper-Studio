import { useEffect, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { useProblemStore } from '../stores/problemStore'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { MODULE_LABELS } from '../constants'
import { Wifi, WifiOff, Circle, Monitor } from 'lucide-react'
import { typedInvoke } from '../api/ipc'
import type { PlatformInfo } from '../types/ipc'

declare const __APP_VERSION__: string

export function StatusBar() {
  const activeModule = useAppStore((s) => s.activeModule)
  const submitting = useProblemStore((s) => s.submitting)
  const streaming = useChatStore((s) => s.streaming)
  const aiConfigCount = useSettingsStore((s) => s.aiConfigs.length)
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null)

  const isRunning = submitting || streaming
  const isConnected = aiConfigCount > 0

  useEffect(() => {
    typedInvoke('platform-info')
      .then((info) => setPlatformInfo(info))
      .catch(() => {
        // Gracefully degrade if platform info is unavailable
      })
  }, [])

  const platformLabel = platformInfo ? `${platformInfo.platform} ${platformInfo.arch}` : ''

  return (
    <div
      className="h-6 bg-[var(--theme-bg-sidebar)] border-t border-[var(--theme-border)] flex items-center px-3 text-[10px] text-[var(--theme-text-muted)] gap-4 shrink-0"
      role="status"
      aria-label="状态栏"
    >
      <span className="text-[var(--theme-accent)]">CodeHelper</span>
      <span>{MODULE_LABELS[activeModule]}</span>

      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        {isConnected ? (
          <>
            <Wifi size={10} className="text-[var(--theme-success)]" aria-hidden="true" />
            <span className="text-[var(--theme-success)]">已连接</span>
          </>
        ) : (
          <>
            <WifiOff size={10} className="text-[var(--theme-danger)]" aria-hidden="true" />
            <span className="text-[var(--theme-danger)]">未连接</span>
          </>
        )}
      </div>

      {/* Running status */}
      {isRunning && (
        <div className="flex items-center gap-1.5" aria-live="polite">
          <Circle
            size={8}
            className="status-pulse fill-[var(--theme-accent)] text-[var(--theme-accent)]"
            aria-hidden="true"
          />
          <span className="text-[var(--theme-accent)]">
            {streaming ? 'AI 生成中...' : '代码运行中...'}
          </span>
        </div>
      )}

      <div className="ml-auto flex gap-4 items-center">
        {/* Platform indicator */}
        {platformLabel && (
          <span className="flex items-center gap-1">
            <Monitor size={9} aria-hidden="true" />
            {platformLabel}
          </span>
        )}
        <span>UTF-8</span>
        <span>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</span>
      </div>
    </div>
  )
}
