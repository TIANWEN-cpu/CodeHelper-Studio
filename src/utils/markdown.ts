import { isSafeKnowledgeHref } from './knowledgeLinks'

const CODE_BLOCK_TOKEN = '\u0000CODE_BLOCK_'
const TABLE_TOKEN = '\u0000TABLE_'
const INLINE_TOKEN = '\u0000INLINE_'
const INLINE_PLACEHOLDER = new RegExp(`${INLINE_TOKEN}\\d+\u0000`, 'g')
const BLOCK_PLACEHOLDER = new RegExp(`\u0000(?:CODE_BLOCK_|TABLE_)\\d+\u0000`, 'g')

type Placeholder = {
  token: string
  html: string
}

export interface KnowledgeMarkdownOutlineItem {
  id: string
  text: string
  depth: 1 | 2 | 3 | 4 | 5 | 6
}

export interface KnowledgeMarkdownRenderOptions {
  renderImages?: boolean
}

export interface KnowledgeMarkdownRenderResult {
  html: string
  outline: KnowledgeMarkdownOutlineItem[]
}

type InlineRenderer = (text: string) => string

type BlockRenderContext = {
  renderInline: InlineRenderer
  outline?: KnowledgeMarkdownOutlineItem[]
  slugCounts?: Map<string, number>
  headingIds?: Set<string>
}

type ParsedInlineLink = {
  raw: string
  label: string
  target: string
  title?: string
  image: boolean
  end: number
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isSafeLegacyLink(href: string): boolean {
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

function renderInlineFormatting(text: string): string {
  let result = escapeHtml(text)
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*/g, '$1<em>$2</em>')
  result = result.replace(/`([^`]+?)`/g, '<code>$1</code>')
  return result
    .replace(/\[严重\]/g, '<span style="color:var(--theme-danger);font-weight:600">[严重]</span>')
    .replace(/\[警告\]/g, '<span style="color:var(--theme-warning);font-weight:600">[警告]</span>')
    .replace(/\[提示\]/g, '<span style="color:var(--theme-accent);font-weight:600">[提示]</span>')
}

const MAX_INLINE_LINK_TARGET_SCAN = 16 * 1024

function findInlineLinkCandidates(source: string): Map<number, number> {
  const candidates = new Map<number, number>()
  const brackets: number[] = []
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '[') {
      brackets.push(index)
      continue
    }
    if (char === ']' && brackets.length > 0) {
      const openBracket = brackets.pop() as number
      if (source[index + 1] !== '(') continue
      const start = source[openBracket - 1] === '!' ? openBracket - 1 : openBracket
      candidates.set(start, index)
    }
  }
  return candidates
}

function unescapeMarkdownTarget(value: string): string {
  return value.replace(/\\([\\()<>"'])/g, '$1')
}

function parseInlineLink(
  source: string,
  start: number,
  closeBracket: number,
): ParsedInlineLink | null {
  const image = source[start] === '!'
  const openBracket = image ? start + 1 : start
  if (source[openBracket] !== '[') return null
  if (!image && start > 0 && source[start - 1] === '!') return null
  if (closeBracket <= openBracket || source[closeBracket + 1] !== '(') return null

  let cursor = closeBracket + 2
  const scanEnd = Math.min(source.length, cursor + MAX_INLINE_LINK_TARGET_SCAN)
  while (cursor < scanEnd && /[ \t]/.test(source[cursor])) cursor += 1
  if (cursor >= scanEnd) return null

  let target = ''
  if (source[cursor] === '<') {
    const targetStart = cursor + 1
    cursor = targetStart
    let escaped = false
    while (cursor < scanEnd) {
      const char = source[cursor]
      if (escaped) {
        escaped = false
        cursor += 1
        continue
      }
      if (char === '\\') {
        escaped = true
        cursor += 1
        continue
      }
      if (char === '>') break
      if (char === '\n' || char === '\r') return null
      cursor += 1
    }
    if (source[cursor] !== '>') return null
    target = source.slice(targetStart, cursor)
    cursor += 1
  } else {
    const targetStart = cursor
    let nestedParentheses = 0
    let escaped = false
    while (cursor < scanEnd) {
      const char = source[cursor]
      if (escaped) {
        escaped = false
        cursor += 1
        continue
      }
      if (char === '\\') {
        escaped = true
        cursor += 1
        continue
      }
      if (char === '(') {
        nestedParentheses += 1
        cursor += 1
        continue
      }
      if (char === ')') {
        if (nestedParentheses === 0) break
        nestedParentheses -= 1
        cursor += 1
        continue
      }
      if (/\s/.test(char) && nestedParentheses === 0) break
      cursor += 1
    }
    if (nestedParentheses !== 0) return null
    target = source.slice(targetStart, cursor)
  }
  if (!target) return null

  while (cursor < scanEnd && /[ \t]/.test(source[cursor])) cursor += 1
  let title: string | undefined
  if (source[cursor] !== ')') {
    const opener = source[cursor]
    const closer = opener === '"' ? '"' : opener === "'" ? "'" : opener === '(' ? ')' : ''
    if (!closer) return null
    cursor += 1
    const titleStart = cursor
    let escaped = false
    let nestedTitleParentheses = 0
    while (cursor < scanEnd) {
      const char = source[cursor]
      if (escaped) {
        escaped = false
        cursor += 1
        continue
      }
      if (char === '\\') {
        escaped = true
        cursor += 1
        continue
      }
      if (opener === '(' && char === '(') {
        nestedTitleParentheses += 1
        cursor += 1
        continue
      }
      if (char === closer) {
        if (nestedTitleParentheses > 0) {
          nestedTitleParentheses -= 1
          cursor += 1
          continue
        }
        break
      }
      if (char === '\n' || char === '\r') return null
      cursor += 1
    }
    if (source[cursor] !== closer) return null
    title = unescapeMarkdownTarget(source.slice(titleStart, cursor))
    cursor += 1
    while (cursor < scanEnd && /[ \t]/.test(source[cursor])) cursor += 1
    if (source[cursor] !== ')') return null
  }

  const end = cursor + 1
  return {
    raw: source.slice(start, end),
    label: source.slice(openBracket + 1, closeBracket),
    target: unescapeMarkdownTarget(target),
    ...(title !== undefined ? { title } : {}),
    image,
    end,
  }
}

function replaceInlineLinks(source: string, render: (link: ParsedInlineLink) => string): string {
  const output: string[] = []
  const candidates = findInlineLinkCandidates(source)
  let copiedUntil = 0
  let cursor = 0
  while (cursor < source.length) {
    const closeBracket = candidates.get(cursor)
    const link = closeBracket === undefined ? null : parseInlineLink(source, cursor, closeBracket)
    if (!link) {
      cursor += 1
      continue
    }
    output.push(source.slice(copiedUntil, cursor), render(link))
    cursor = link.end
    copiedUntil = cursor
  }
  output.push(source.slice(copiedUntil))
  return output.join('')
}

function renderInlineLegacy(text: string): string {
  const placeholders: Placeholder[] = []
  const stash = (html: string): string => {
    const token = `${INLINE_TOKEN}${placeholders.length}\u0000`
    placeholders.push({ token, html })
    return token
  }
  const source = replaceInlineLinks(text, (link) => {
    if (link.image || !isSafeLegacyLink(link.target)) return link.raw
    return stash(
      `<a href="${escapeHtml(link.target)}" target="_blank" rel="noreferrer noopener">${renderInlineFormatting(link.label)}</a>`,
    )
  })
  return restoreInlinePlaceholders(renderInlineFormatting(source), placeholders)
}

function isExternalKnowledgeHref(href: string): boolean {
  try {
    const protocol = new URL(href).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function restoreInlinePlaceholders(html: string, placeholders: Placeholder[]): string {
  if (placeholders.length === 0) return html
  const byToken = new Map(placeholders.map((placeholder) => [placeholder.token, placeholder.html]))
  return html.replace(INLINE_PLACEHOLDER, (token) => byToken.get(token) ?? token)
}

function renderInlineKnowledge(text: string, renderImages: boolean): string {
  const placeholders: Placeholder[] = []
  const stash = (html: string): string => {
    const token = `${INLINE_TOKEN}${placeholders.length}\u0000`
    placeholders.push({ token, html })
    return token
  }

  const source = replaceInlineLinks(text, (link) => {
    if (!isSafeKnowledgeHref(link.target)) return link.raw
    const titleAttribute = link.title !== undefined ? ` title="${escapeHtml(link.title)}"` : ''
    if (link.image) {
      if (renderImages) {
        return stash(
          `<img src="${escapeHtml(link.target)}" alt="${escapeHtml(link.label)}"${titleAttribute} loading="lazy" decoding="async" />`,
        )
      }
      const label = link.label.trim() || '图片'
      return stash(
        `<a href="${escapeHtml(link.target)}" data-knowledge-link="true" data-knowledge-image="true"${titleAttribute}>查看图片：${renderInlineFormatting(label)}</a>`,
      )
    }
    const externalAttributes = isExternalKnowledgeHref(link.target)
      ? ' target="_blank" rel="noreferrer noopener"'
      : ''
    return stash(
      `<a href="${escapeHtml(link.target)}" data-knowledge-link="true"${titleAttribute}${externalAttributes}>${renderInlineFormatting(link.label)}</a>`,
    )
  })

  return restoreInlinePlaceholders(renderInlineFormatting(source), placeholders)
}

function headingText(markdown: string): string {
  return replaceInlineLinks(markdown, (link) => link.label)
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function knowledgeHeadingSlug(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'section'
}

function uniqueHeadingSlug(
  value: string,
  counts: Map<string, number>,
  headingIds: Set<string>,
): string {
  const base = knowledgeHeadingSlug(value)
  let suffix = counts.get(base) ?? 0
  let candidate = suffix === 0 ? base : `${base}-${suffix}`
  while (headingIds.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  counts.set(base, suffix + 1)
  headingIds.add(candidate)
  return candidate
}

export function resolveKnowledgeHeadingId(
  fragment: string | undefined,
  outline: readonly Pick<KnowledgeMarkdownOutlineItem, 'id'>[],
): string | null {
  if (!fragment) return null
  const rawValue = fragment.replace(/^#/, '').trim()
  if (!rawValue) return null
  const exact = outline.find((heading) => heading.id === rawValue)
  if (exact) return exact.id

  let decodedValue = rawValue
  try {
    decodedValue = decodeURIComponent(rawValue)
  } catch {
    // Keep malformed percent escapes deterministic and fail to a slug lookup.
  }
  const decodedExact = outline.find((heading) => heading.id === decodedValue)
  if (decodedExact) return decodedExact.id
  const normalized = knowledgeHeadingSlug(decodedValue)
  return outline.find((heading) => heading.id === normalized)?.id ?? null
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

function renderTable(lines: string[], renderInline: InlineRenderer): string {
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

function stashTables(
  markdown: string,
  placeholders: Placeholder[],
  renderInline: InlineRenderer,
): string {
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
      placeholders.push({ token, html: renderTable(tableLines, renderInline) })
      out.push(token)
    } else {
      out.push(lines[i])
    }
  }
  return out.join('\n')
}

function restorePlaceholders(html: string, placeholders: Placeholder[]): string {
  if (placeholders.length === 0) return html
  const byToken = new Map(placeholders.map((placeholder) => [placeholder.token, placeholder.html]))
  return html.replace(BLOCK_PLACEHOLDER, (token) => byToken.get(token) ?? token)
}

function renderBlocks(markdown: string, context: BlockRenderContext): string {
  const { renderInline } = context
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

    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      flushAll()
      const depth = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6
      const level = Math.min(depth + 1, 6)
      if (context.outline && context.slugCounts && context.headingIds) {
        const text = headingText(heading[2])
        const id = uniqueHeadingSlug(text, context.slugCounts, context.headingIds)
        context.outline.push({ id, text, depth })
        blocks.push(`<h${level} id="${escapeHtml(id)}">${renderInline(heading[2])}</h${level}>`)
      } else {
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      }
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

function renderMarkdownInternal(markdown: string, context: BlockRenderContext): string {
  if (!markdown) return ''

  // Files read on Windows commonly use CRLF. Leaving the trailing carriage
  // return on each line prevents block patterns such as headings and lists
  // from matching, so normalize once before every parsing stage.
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n')
  if (/^\n+$/.test(normalizedMarkdown)) return '<p><br/></p>'
  const placeholders: Placeholder[] = []
  const withoutCode = stashCodeBlocks(normalizedMarkdown, placeholders)
  const withoutTables = stashTables(withoutCode, placeholders, context.renderInline)
  const leadingBreak = withoutTables.startsWith('\n') ? '<p><br/></p>' : ''
  return (
    leadingBreak +
    restorePlaceholders(renderBlocks(withoutTables.replace(/^\n+/, ''), context), placeholders)
  )
}

export function renderMarkdown(markdown: string): string {
  return renderMarkdownInternal(markdown, { renderInline: renderInlineLegacy })
}

export function renderKnowledgeMarkdown(
  markdown: string,
  options: KnowledgeMarkdownRenderOptions = {},
): KnowledgeMarkdownRenderResult {
  const outline: KnowledgeMarkdownOutlineItem[] = []
  const html = renderMarkdownInternal(markdown, {
    renderInline: (text) => renderInlineKnowledge(text, options.renderImages === true),
    outline,
    slugCounts: new Map<string, number>(),
    headingIds: new Set<string>(),
  })
  return { html, outline }
}

export const renderSafeMarkdown = renderMarkdown
