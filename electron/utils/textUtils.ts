/**
 * Pure text utility functions extracted from rag.ts for testability.
 * These functions have zero Electron/Node dependencies.
 */

export function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  const paragraphs = text.split(/\n\n+/)
  let current = ''

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxLen && current) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : ['']
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
