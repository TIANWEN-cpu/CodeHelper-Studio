export interface EditorTabCloseState {
  pending: boolean
  conflict: boolean
  degraded: boolean
  persistenceError: string | null
  error: string | null
}

export function getEditorTabCloseWarning(state: EditorTabCloseState): string | null {
  const reason = state.persistenceError
    ? `本地恢复区写入失败：${state.persistenceError}`
    : state.conflict
      ? `该标签的数据库版本冲突尚未处理${state.error ? `：${state.error}` : ''}`
      : state.degraded
        ? `该标签的 SQLite 同步不可用，当前内容仅保存在本地恢复区${state.error ? `：${state.error}` : ''}`
        : state.pending
          ? 'SQLite 同步尚未完成'
          : null
  return reason ? `${reason}。关闭前会先重试持久化；若仍失败，标签会保持打开。继续吗？` : null
}
