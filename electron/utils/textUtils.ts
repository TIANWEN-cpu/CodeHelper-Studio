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

/**
 * 转义 SQL LIKE 的通配符（% 与 _）和转义符本身，使输入按字面量匹配。
 * 用于把外部输入拼进 LIKE pattern 时，防止 % / _ 扩大匹配范围（注入面）。
 * 需配合 `LIKE ... ESCAPE '\\'` 使用。
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&')
}
