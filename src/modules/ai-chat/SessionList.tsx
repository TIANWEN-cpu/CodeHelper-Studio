import { useState } from 'react'
import { Plus, Trash2, MessageSquare, Pencil, Check, X } from 'lucide-react'
import { useChatStore, type ChatSession } from '../../stores/chatStore'

export function SessionList() {
  const { sessions, activeSessionId, createSession, switchSession, deleteSession, renameSession, presets } = useChatStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showPresetMenu, setShowPresetMenu] = useState(false)

  const handleNew = (systemPrompt?: string, title?: string) => {
    void createSession(systemPrompt, title)
    setShowPresetMenu(false)
  }

  const startRename = (session: ChatSession) => {
    setEditingId(session.id)
    setEditTitle(session.title)
  }

  const confirmRename = () => {
    if (editingId && editTitle.trim()) {
      void renameSession(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="ui-toolbar flex w-72 shrink-0 min-h-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-4 py-3 glass-line shrink-0">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-text-muted)]">对话</span>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">预设角色、长期会话一处管理</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowPresetMenu(!showPresetMenu)}
            className="ui-btn-secondary flex h-9 w-9 items-center justify-center"
          >
            <Plus size={14} />
          </button>
          {showPresetMenu && (
            <div className="ui-card-soft absolute right-0 top-11 z-10 w-52 overflow-hidden py-2">
              <button
                onClick={() => handleNew()}
                className="w-full px-4 py-2 text-left text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)]"
              >
                空白对话
              </button>
              <div className="my-1 border-t glass-line" />
              <div className="px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--theme-text-muted)]">预设角色</div>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleNew(preset.prompt, preset.name)}
                  className="w-full truncate px-4 py-2 text-left text-sm text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-hover)]"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => void switchSession(session.id)}
            className={`group mb-2 rounded-2xl border px-3 py-3 transition-colors ${
              activeSessionId === session.id
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
                : 'border-transparent bg-transparent hover:border-[var(--theme-border)] hover:bg-[var(--theme-bg-hover)]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                activeSessionId === session.id
                  ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]'
                  : 'bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]'
              }`}>
                <MessageSquare size={14} />
              </div>

              {editingId === session.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && confirmRename()}
                    className="ui-input flex-1 px-2 py-1 text-xs"
                    autoFocus
                  />
                  <button onClick={confirmRename} className="rounded p-1 text-[var(--theme-success)] hover:bg-[var(--theme-success-soft)]">
                    <Check size={12} />
                  </button>
                  <button onClick={() => setEditingId(null)} className="rounded p-1 text-[var(--theme-danger)] hover:bg-[var(--theme-danger-soft)]">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--theme-text-primary)]">{session.title}</div>
                    <div className="mt-1 text-xs text-[var(--theme-text-muted)]">
                      {new Date(session.updated_at).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="hidden gap-1 group-hover:flex">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        startRename(session)
                      }}
                      className="rounded p-1 text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)]"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        if (window.confirm('确定要删除该对话？')) {
                          void deleteSession(session.id)
                        }
                      }}
                      className="rounded p-1 text-[var(--theme-danger)] hover:bg-[var(--theme-danger-soft)]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[var(--theme-text-muted)]">
            点击右上角新建第一条对话
          </div>
        )}
      </div>
    </div>
  )
}
