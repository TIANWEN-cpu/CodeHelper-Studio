/** Starter code may initialize a document only when the user has no content to preserve. */
export function isEmptyEditorDocument(content: string): boolean {
  return content.trim().length === 0
}
