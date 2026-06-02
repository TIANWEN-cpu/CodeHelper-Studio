/**
 * Basic markdown-to-HTML renderer for AI responses.
 *
 * Converts a subset of Markdown (headings, bold, italic, inline code,
 * list items) into safe HTML strings. Handles severity tags specific
 * to the BugFinder panel ([严重], [警告], [提示]).
 */
export function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\[严重\]/g, '<span style="color:var(--theme-danger);font-weight:600">[严重]</span>')
    .replace(
      /\[警告\]/g,
      '<span style="color:var(--theme-warning,#f59e0b);font-weight:600">[警告]</span>',
    )
    .replace(/\[提示\]/g, '<span style="color:var(--theme-accent);font-weight:600">[提示]</span>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^(.+)$/, '<p>$1</p>')
}
