export type WorkspaceExecutionShortcut = 'run' | 'submit'

interface WorkspaceExecutionKeyEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  defaultPrevented: boolean
  repeat: boolean
}

export function getWorkspaceExecutionShortcut(
  event: WorkspaceExecutionKeyEvent,
): WorkspaceExecutionShortcut | null {
  if (event.defaultPrevented || event.repeat || event.altKey) return null
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return null
  return event.shiftKey ? 'submit' : 'run'
}
