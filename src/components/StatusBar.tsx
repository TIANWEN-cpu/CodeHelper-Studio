import { useAppStore } from '../stores/appStore'

declare const __APP_VERSION__: string

const moduleLabels: Record<string, string> = {
  problems: '刷题系统',
  editor: '代码编辑器',
  'ai-chat': 'AI 助手',
  mistakes: '错题本',
  knowledge: '知识库',
  settings: '设置',
}

export function StatusBar() {
  const activeModule = useAppStore((s) => s.activeModule)

  return (
    <div className="h-6 bg-[var(--theme-bg-sidebar)] border-t border-[var(--theme-border)] flex items-center px-3 text-[10px] text-[var(--theme-text-muted)] gap-4 shrink-0">
      <span className="text-[var(--theme-accent)]">CodeHelper</span>
      <span>{moduleLabels[activeModule]}</span>
      <div className="ml-auto flex gap-4">
        <span>UTF-8</span>
        <span>v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}</span>
      </div>
    </div>
  )
}
