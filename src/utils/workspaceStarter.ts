/** Starter code may initialize a document only when the user has no content to preserve. */
export function isEmptyEditorDocument(content: string): boolean {
  return content.trim().length === 0
}

type StarterInitializationTab = {
  id: string
  kind: 'file' | 'problem' | 'exercise'
  content: string
  problemId?: string
}

/** Revalidate the visible target after the asynchronous starter lookup completes. */
export function findWorkspaceStarterTarget<T extends StarterInitializationTab>(
  tabs: readonly T[],
  visibleTabId: string | null,
): T | null {
  if (!visibleTabId) return null
  const target = tabs.find((tab) => tab.id === visibleTabId)
  if (!target || target.kind !== 'file' || target.problemId) return null
  return isEmptyEditorDocument(target.content) ? target : null
}
