import { memo, useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, MessageSquare, Pencil, Check, X } from 'lucide-react'
import { useChatStore, type ChatSession } from '../../stores/chatStore'

// Memoized individual session item to prevent re-rendering all sessions
// when only the active session changes
const SessionItem = memo(function SessionItem({
  session,
  isActive,
  isEditing,
  editTitle,
  onSwitch,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onDelete,
  onEditTitleChange,
}: {
  session: ChatSession
  isActive: boolean
  isEditing: boolean
  editTitle: string
  onSwitch: (id: string) => void
  onStartRename: (session: ChatSession) => void
  onConfirmRename: () => void
  onCancelRename: () => void
  onDelete: (id: string) => void
  onEditTitleChange: (value: string) => void
}) {
  const formattedDate = new Date(session.updated_at).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div
      onClick={() => void onSwitch(session.id)}
      className={`group mb-2 rounded-2xl border px-3 py-3 transition-colors ${
        isActive
          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
          : 'border-transparent bg-transparent hover:border-[var(--theme-border)] hover:bg-[var(--theme-bg-hover)]/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            isActive
              ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)]'
              : 'bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]'
          }`}
        >
          <MessageSquare size={14} />
        </div>

        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              value={editTitle}
              onChange={(event) => onEditTitleChange(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onConfirmRename()}
              className="ui-input flex-1 px-2 py-1 text-xs"
              autoFocus
            />
            <button
              onClick={onConfirmRename}
              className="rounded p-1 text-[var(--theme-success)] hover:bg-[var(--theme-success-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
              aria-label="确认重命名"
            >
              <Check size={12} aria-hidden="true" />
            </button>
            <button
              onClick={onCancelRename}
              className="rounded p-1 text-[var(--theme-danger)] hover:bg-[var(--theme-danger-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
              aria-label="取消重命名"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--theme-text-primary)]">
                {session.title}
              </div>
              <div className="mt-1 text-xs text-[var(--theme-text-muted)]">{formattedDate}</div>
            </div>
            <div className="hidden gap-1 group-hover:flex">
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  onStartRename(session)
                }}
                className="rounded p-1 text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                aria-label={`重命名对话：${session.title}`}
              >
                <Pencil size={12} aria-hidden="true" />
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  if (window.confirm('确定要删除该对话？')) {
                    onDelete(session.id)
                  }
                }}
                className="rounded p-1 text-[var(--theme-danger)] hover:bg-[var(--theme-danger-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                aria-label={`删除对话：${session.title}`}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
})

export function SessionList() {
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const createSession = useChatStore((s) => s.createSession)
  const switchSession = useChatStore((s) => s.switchSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const presets = useChatStore((s) => s.presets)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showPresetMenu, setShowPresetMenu] = useState(false)

  const handleNew = useCallback(
    (systemPrompt?: string, title?: string) => {
      void createSession(systemPrompt, title)
      setShowPresetMenu(false)
    },
    [createSession],
  )

  const startRename = useCallback((session: ChatSession) => {
    setEditingId(session.id)
    setEditTitle(session.title)
  }, [])

  const confirmRename = useCallback(() => {
    if (editingId && editTitle.trim()) {
      void renameSession(editingId, editTitle.trim())
    }
    setEditingId(null)
  }, [editingId, editTitle, renameSession])

  const cancelRename = useCallback(() => setEditingId(null), [])

  const handleEditTitleChange = useCallback((value: string) => setEditTitle(value), [])

  const handleTogglePresetMenu = useCallback(() => setShowPresetMenu((v) => !v), [])

  // Close preset menu on Escape
  useEffect(() => {
    if (!showPresetMenu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPresetMenu(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showPresetMenu])

  const handleSwitchSession = useCallback((id: string) => void switchSession(id), [switchSession])

  const handleDeleteSession = useCallback((id: string) => void deleteSession(id), [deleteSession])

  return (
    <div className="ui-toolbar flex w-72 shrink-0 min-h-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-4 py-3 glass-line shrink-0">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-text-muted)]">
            对话
          </span>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">预设角色、长期会话一处管理</p>
        </div>
        <div className="relative">
          <button
            onClick={handleTogglePresetMenu}
            className="ui-btn-secondary flex h-9 w-9 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
            aria-label="新建对话"
            aria-expanded={showPresetMenu}
            aria-haspopup="true"
          >
            <Plus size={14} aria-hidden="true" />
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
              <div className="px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--theme-text-muted)]">
                预设角色
              </div>
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
          <SessionItem
            key={session.id}
            session={session}
            isActive={activeSessionId === session.id}
            isEditing={editingId === session.id}
            editTitle={editTitle}
            onSwitch={handleSwitchSession}
            onStartRename={startRename}
            onConfirmRename={confirmRename}
            onCancelRename={cancelRename}
            onDelete={handleDeleteSession}
            onEditTitleChange={handleEditTitleChange}
          />
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
