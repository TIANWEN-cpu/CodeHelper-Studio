import { useAppStore } from '../stores/appStore'
import { MODULE_LABELS } from '../constants'

declare const __APP_VERSION__: string

export function StatusBar() {
  const activeModule = useAppStore((s) => s.activeModule)

  return (
    <div className="h-6 bg-[var(--theme-bg-sidebar)] border-t border-[var(--theme-border)] flex items-center px-3 text-[10px] text-[var(--theme-text-muted)] gap-4 shrink-0">
      <span className="text-[var(--theme-accent)]">CodeHelper</span>
      <span>{MODULE_LABELS[activeModule]}</span>
      <div className="ml-auto flex gap-4">
        <span>UTF-8</span>
        <span>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</span>
      </div>
    </div>
  )
}
