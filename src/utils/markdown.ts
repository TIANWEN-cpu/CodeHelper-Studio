const CODE_BLOCK_TOKEN = '\u0000CODE_BLOCK_'
const TABLE_TOKEN = '\u0000TABLE_'

type Placeholder = {
  token: string
  html: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isSafeLink(href: string): boolean {
  const trimmed = href.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./')) return true
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:'
  } catch {
    return false
  }
}

function renderInline(text: string): string {
  let result = escapeHtml(text)

  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, href) => {
    const decodedHref = String(href)
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
    if (!isSafeLink(decodedHref)) return match
    return `<a href="${escapeHtml(decodedHref)}" target="_blank" rel="noreferrer noopener">${label}</a>`
  })

  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*/g, '$1<em>$2</em>')
  result = result.replace(/`([^`]+?)`/g, '<code>$1</code>')
  result = result
    .replace(/\[严重\]/g, '<span style="color:var(--theme-danger);font-weight:600">[严重]</span>')
    .replace(/\[警告\]/g, '<span style="color:var(--theme-warning);font-weight:600">[警告]</span>')
    .replace(/\[提示\]/g, '<span style="color:var(--theme-accent);font-weight:600">[提示]</span>')
  return result
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function renderTable(lines: string[]): string {
  const [headerLine, , ...bodyLines] = lines
  const headers = splitTableRow(headerLine)
  const rows = bodyLines.map(splitTableRow)
  return [
    '<table>',
    '<thead><tr>',
    headers.map((cell) => `<th>${renderInline(cell)}</th>`).join(''),
    '</tr></thead>',
    '<tbody>',
    rows
      .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
      .join(''),
    '</tbody>',
    '</table>',
  ].join('')
}

function stashCodeBlocks(markdown: string, placeholders: Placeholder[]): string {
  return markdown.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const token = `${CODE_BLOCK_TOKEN}${placeholders.length}\u0000`
    const language = String(lang || '').trim()
    const className = language ? ` class="language-${escapeHtml(language)}"` : ''
    placeholders.push({
      token,
      html: `<pre><code${className}>${escapeHtml(String(code).replace(/\n$/, ''))}</code></pre>`,
    })
    return token
  })
}

function stashTables(markdown: string, placeholders: Placeholder[]): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    if (i + 1 < lines.length && lines[i].includes('|') && isTableDivider(lines[i + 1])) {
      const tableLines = [lines[i], lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        tableLines.push(lines[i])
        i += 1
      }
      i -= 1
      const token = `${TABLE_TOKEN}${placeholders.length}\u0000`
      placeholders.push({ token, html: renderTable(tableLines) })
      out.push(token)
    } else {
      out.push(lines[i])
    }
  }
  return out.join('\n')
}

function restorePlaceholders(html: string, placeholders: Placeholder[]): string {
  return placeholders.reduce((next, item) => next.split(item.token).join(item.html), html)
}

function renderBlocks(markdown: string): string {
  const lines = markdown.split('\n')
  const blocks: string[] = []
  let paragraph: string[] = []
  let unordered: string[] = []
  let ordered: string[] = []
  let quote: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${paragraph.map(renderInline).join('<br/>')}</p>`)
      paragraph = []
    }
  }
  const flushUnordered = () => {
    if (unordered.length > 0) {
      blocks.push(`<ul>${unordered.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`)
      unordered = []
    }
  }
  const flushOrdered = () => {
    if (ordered.length > 0) {
      blocks.push(`<ol>${ordered.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`)
      ordered = []
    }
  }
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push(`<blockquote>${quote.map(renderInline).join('<br/>')}</blockquote>`)
      quote = []
    }
  }
  const flushAll = () => {
    flushParagraph()
    flushUnordered()
    flushOrdered()
    flushQuote()
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushAll()
      continue
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      flushAll()
      const level = heading[1].length + 1
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    const unorderedMatch = /^\s*[-*]\s+(.+)$/.exec(line)
    if (unorderedMatch) {
      flushParagraph()
      flushOrdered()
      flushQuote()
      unordered.push(unorderedMatch[1])
      continue
    }

    const orderedMatch = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (orderedMatch) {
      flushParagraph()
      flushUnordered()
      flushQuote()
      ordered.push(orderedMatch[1])
      continue
    }

    const quoteMatch = /^\s*>\s?(.+)$/.exec(line)
    if (quoteMatch) {
      flushParagraph()
      flushUnordered()
      flushOrdered()
      quote.push(quoteMatch[1])
      continue
    }

    flushUnordered()
    flushOrdered()
    flushQuote()
    paragraph.push(line)
  }

  flushAll()
  return blocks.join('')
}

export function renderMarkdown(markdown: string): string {
  if (!markdown) return ''
  if (/^\n+$/.test(markdown)) return '<p><br/></p>'
  const placeholders: Placeholder[] = []
  const withoutCode = stashCodeBlocks(markdown, placeholders)
  const withoutTables = stashTables(withoutCode, placeholders)
  const leadingBreak = withoutTables.startsWith('\n') ? '<p><br/></p>' : ''
  return (
    leadingBreak +
    restorePlaceholders(renderBlocks(withoutTables.replace(/^\n+/, '')), placeholders)
  )
}

export const renderSafeMarkdown = renderMarkdown
