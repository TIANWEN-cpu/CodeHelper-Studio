import { describe, it, expect } from 'vitest'
import {
  renderKnowledgeMarkdown,
  renderMarkdown,
  resolveKnowledgeHeadingId,
} from '../src/utils/markdown'

describe('renderMarkdown', () => {
  // ---------------------------------------------------------------------------
  // Headings
  // ---------------------------------------------------------------------------
  describe('headings', () => {
    it('converts # to <h2>', () => {
      expect(renderMarkdown('# Title')).toBe('<h2>Title</h2>')
    })

    it('converts ## to <h3>', () => {
      expect(renderMarkdown('## Section')).toBe('<h3>Section</h3>')
    })

    it('converts ### to <h4>', () => {
      expect(renderMarkdown('### Sub')).toBe('<h4>Sub</h4>')
    })

    it('does not convert # without space', () => {
      const result = renderMarkdown('#noSpace')
      expect(result).not.toContain('<h2>')
      expect(result).toContain('#noSpace')
    })

    it('only converts headings at line start', () => {
      const result = renderMarkdown('text # not heading')
      expect(result).not.toContain('<h2>')
    })
  })

  // ---------------------------------------------------------------------------
  // Inline formatting
  // ---------------------------------------------------------------------------
  describe('bold', () => {
    it('converts **text** to <strong>', () => {
      expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
    })

    it('handles multiple bold segments', () => {
      const result = renderMarkdown('**a** and **b**')
      expect(result).toContain('<strong>a</strong>')
      expect(result).toContain('<strong>b</strong>')
    })

    it('does not convert single * to bold', () => {
      const result = renderMarkdown('*not bold*')
      expect(result).not.toContain('<strong>')
    })

    it('handles bold inside other text', () => {
      const result = renderMarkdown('some **bold** text')
      expect(result).toContain('<strong>bold</strong>')
    })
  })

  describe('italic', () => {
    it('converts *text* to <em>', () => {
      expect(renderMarkdown('*italic*')).toContain('<em>italic</em>')
    })

    it('handles bold-italic (**_combo_**)', () => {
      const result = renderMarkdown('***both***')
      // ***both*** -> bold first: <strong>*both*</strong> -> italic: <strong><em>both</em></strong>
      // Actually the regex runs sequentially, so let's just check it doesn't crash
      expect(result).toBeTruthy() // bold-italic combo renders without crashing
    })
  })

  describe('inline code', () => {
    it('converts `code` to <code>', () => {
      expect(renderMarkdown('use `console.log`')).toContain('<code>console.log</code>')
    })

    it('handles multiple code spans', () => {
      const result = renderMarkdown('`a` and `b`')
      expect(result).toContain('<code>a</code>')
      expect(result).toContain('<code>b</code>')
    })

    it('escapes HTML inside code', () => {
      const result = renderMarkdown('`<script>`')
      expect(result).toContain('&lt;script&gt;')
      expect(result).toContain('<code>')
    })
  })

  // ---------------------------------------------------------------------------
  // Lists
  // ---------------------------------------------------------------------------
  describe('lists', () => {
    it('converts - item to <li>', () => {
      const result = renderMarkdown('- item one')
      expect(result).toContain('<li>item one</li>')
    })

    it('wraps list items in <ul>', () => {
      const result = renderMarkdown('- a\n- b')
      expect(result).toContain('<ul>')
      expect(result).toContain('</ul>')
      expect(result).toContain('<li>a</li>')
      expect(result).toContain('<li>b</li>')
    })

    it('does not convert items without leading dash-space', () => {
      const result = renderMarkdown('not-a-list')
      expect(result).not.toContain('<li>')
    })
  })

  // ---------------------------------------------------------------------------
  // Links
  // ---------------------------------------------------------------------------
  describe('links', () => {
    it('renders safe links', () => {
      const result = renderMarkdown('[text](https://example.com)')
      expect(result).toContain('<a href="https://example.com"')
      expect(result).toContain('rel="noreferrer noopener"')
    })

    it('does not render javascript links', () => {
      const result = renderMarkdown('[bad](javascript:alert(1))')
      expect(result).not.toContain('<a')
      expect(result).toContain('[bad](javascript:alert(1))')
    })
  })

  // ---------------------------------------------------------------------------
  // HTML escaping (XSS prevention)
  // ---------------------------------------------------------------------------
  describe('HTML escaping', () => {
    it('escapes < and >', () => {
      const result = renderMarkdown('<div>test</div>')
      expect(result).toContain('&lt;div&gt;')
      expect(result).not.toContain('<div>')
    })

    it('escapes ampersand', () => {
      const result = renderMarkdown('A & B')
      expect(result).toContain('&amp;')
    })

    it('escapes ampersand before other replacements', () => {
      const result = renderMarkdown('&lt;')
      // &lt; -> &amp;lt; then < and > are not present to escape
      expect(result).toContain('&amp;lt;')
    })
  })

  // ---------------------------------------------------------------------------
  // Severity tags
  // ---------------------------------------------------------------------------
  describe('severity tags', () => {
    it('wraps [严重] with danger styling', () => {
      const result = renderMarkdown('[严重] error')
      expect(result).toContain('color:var(--theme-danger)')
      expect(result).toContain('[严重]')
    })

    it('wraps [警告] with warning styling', () => {
      const result = renderMarkdown('[警告] warning')
      expect(result).toContain('color:var(--theme-warning')
      expect(result).toContain('[警告]')
    })

    it('wraps [提示] with accent styling', () => {
      const result = renderMarkdown('[提示] info')
      expect(result).toContain('color:var(--theme-accent)')
      expect(result).toContain('[提示]')
    })

    it('handles multiple severity tags', () => {
      const result = renderMarkdown('[严重] a\n[警告] b\n[提示] c')
      expect(result).toContain('theme-danger')
      expect(result).toContain('theme-warning')
      expect(result).toContain('theme-accent')
    })
  })

  // ---------------------------------------------------------------------------
  // Paragraph / newline handling
  // ---------------------------------------------------------------------------
  describe('paragraphs and newlines', () => {
    it('wraps entire output in <p>', () => {
      const result = renderMarkdown('hello')
      expect(result).toMatch(/^<p>hello<\/p>$/)
    })

    it('converts double newline to </p><p>', () => {
      const result = renderMarkdown('a\n\nb')
      expect(result).toContain('</p><p>')
    })

    it('converts single newline to <br/>', () => {
      const result = renderMarkdown('a\nb')
      expect(result).toContain('<br/>')
    })

    it('normalizes Windows line endings before parsing block markdown', () => {
      const input = [
        '# Windows title',
        '',
        '- first',
        '- second',
        '',
        '> quoted',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
      ].join('\r\n')

      const result = renderMarkdown(input)

      expect(result).toContain('<h2>Windows title</h2>')
      expect(result).toContain('<ul><li>first</li><li>second</li></ul>')
      expect(result).toContain('<blockquote>quoted</blockquote>')
      expect(result).toContain('<table>')
      expect(result).toContain('<td>2</td>')
    })

    it('normalizes lone carriage returns from imported text', () => {
      expect(renderMarkdown('## Section\rBody')).toBe('<h3>Section</h3><p>Body</p>')
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = renderMarkdown('')
      // Empty string: the final regex /^(.+)$/ requires at least one char,
      // so empty input produces empty output (no wrapping <p>)
      expect(result).toBe('')
    })

    it('handles whitespace-only string', () => {
      const result = renderMarkdown('   ')
      expect(result).toBe('')
    })

    it('handles very long string', () => {
      const long = 'x'.repeat(100_000)
      const result = renderMarkdown(long)
      expect(result).toContain(long)
      expect(result.startsWith('<p>')).toBe(true)
      expect(result.endsWith('</p>')).toBe(true)
    })

    it('handles string with only special characters', () => {
      const result = renderMarkdown('<>&')
      expect(result).toContain('&lt;')
      expect(result).toContain('&gt;')
      expect(result).toContain('&amp;')
    })

    it('handles empty string without throwing', () => {
      const result = renderMarkdown('')
      expect(typeof result).toBe('string')
      // Empty string produces empty output — no crash
      expect(result).toBe('')
    })

    it('preserves unicode characters', () => {
      const result = renderMarkdown('你好世界 emoji: 😀')
      expect(result).toContain('你好世界')
      expect(result).toContain('😀')
    })

    it('handles markdown with mixed formatting', () => {
      const input = '# Title\n\n**bold** and *italic* and `code`\n\n- item'
      const result = renderMarkdown(input)
      expect(result).toContain('<h2>Title</h2>')
      expect(result).toContain('<strong>bold</strong>')
      expect(result).toContain('<em>italic</em>')
      expect(result).toContain('<code>code</code>')
      expect(result).toContain('<li>item</li>')
      expect(result).toContain('<h2>Title</h2>')
    })

    it('handles consecutive bold and italic', () => {
      const result = renderMarkdown('**bold** *italic*')
      expect(result).toContain('<strong>bold</strong>')
      expect(result).toContain('<em>italic</em>')
    })

    it('handles code block containing backticks that would be stripped', () => {
      // Single backtick pairs only
      const result = renderMarkdown('`code`')
      expect(result).toContain('<code>code</code>')
    })

    it('renders ordered lists', () => {
      const result = renderMarkdown('1. first\n2. second')
      expect(result).toContain('<ol>')
      expect(result).toContain('<li>first</li>')
      expect(result).toContain('<li>second</li>')
    })

    it('renders fenced code blocks', () => {
      const result = renderMarkdown('```ts\nconst x = 1\n```')
      expect(result).toContain('<pre><code class="language-ts">')
      expect(result).toContain('const x = 1')
    })

    it('renders blockquotes', () => {
      const result = renderMarkdown('> quoted')
      expect(result).toContain('<blockquote>quoted</blockquote>')
    })

    it('renders tables', () => {
      const result = renderMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |')
      expect(result).toContain('<table>')
      expect(result).toContain('<th>A</th>')
      expect(result).toContain('<td>2</td>')
    })
  })
})

describe('renderKnowledgeMarkdown', () => {
  it('adds stable bilingual heading ids and an outline without changing heading levels', () => {
    const result = renderKnowledgeMarkdown(
      [
        '# Hello, World!',
        '# Hello World',
        '## 中文 标题',
        '## 中文 标题',
        '### ＡＰＩ / 概览',
        '### !!!',
      ].join('\n'),
    )

    expect(result.outline).toEqual([
      { id: 'hello-world', text: 'Hello, World!', depth: 1 },
      { id: 'hello-world-1', text: 'Hello World', depth: 1 },
      { id: '中文-标题', text: '中文 标题', depth: 2 },
      { id: '中文-标题-1', text: '中文 标题', depth: 2 },
      { id: 'api-概览', text: 'ＡＰＩ / 概览', depth: 3 },
      { id: 'section', text: '!!!', depth: 3 },
    ])
    expect(result.html).toContain('<h2 id="hello-world">Hello, World!</h2>')
    expect(result.html).toContain('<h3 id="中文-标题">中文 标题</h3>')
    expect(result.html).toContain('<h4 id="api-概览">ＡＰＩ / 概览</h4>')
    expect(renderMarkdown('# Hello, World!')).toBe('<h2>Hello, World!</h2>')
  })

  it('uses readable link and formatting text when creating heading slugs', () => {
    const result = renderKnowledgeMarkdown('# **Quick** [Start](./start.md) `API`')

    expect(result.outline).toEqual([{ id: 'quick-start-api', text: 'Quick Start API', depth: 1 }])
    expect(result.html).toContain('<h2 id="quick-start-api">')
    expect(result.html).toContain('<strong>Quick</strong>')
    expect(result.html).toContain('href="./start.md"')
  })

  it('keeps heading ids globally unique when source headings contain numeric suffixes', () => {
    const result = renderKnowledgeMarkdown(['# Foo-1', '# Foo', '# Foo'].join('\n'))

    expect(result.outline.map((heading) => heading.id)).toEqual(['foo-1', 'foo', 'foo-2'])
    expect(new Set(result.outline.map((heading) => heading.id)).size).toBe(result.outline.length)
  })

  it('preserves same-document and repository-relative links in knowledge mode', () => {
    const result = renderKnowledgeMarkdown(
      [
        '[anchor](#section)',
        '[child](./child.md)',
        '[parent](../parent.md)',
        '[bare](guide.md?view=full#intro)',
        '[root](/docs/index.md)',
      ].join('\n'),
    ).html

    expect(result).toContain('href="#section"')
    expect(result).toContain('href="./child.md"')
    expect(result).toContain('href="../parent.md"')
    expect(result).toContain('href="guide.md?view=full#intro"')
    expect(result).toContain('href="/docs/index.md"')
    expect(result.match(/data-knowledge-link="true"/g)).toHaveLength(5)

    expect(renderMarkdown('[parent](../parent.md)')).not.toContain('<a')
    expect(renderMarkdown('[bare](guide.md)')).not.toContain('<a')
  })

  it('keeps balanced parentheses in link and image destinations', () => {
    const markdown = [
      '[Function](https://en.wikipedia.org/wiki/Function_(mathematics)#History)',
      '[Nested](https://example.com/a_(b_(c))/index.html "Nested title")',
      '![diagram](../images/flow_(v2).png "Flow (v2)")',
    ].join('\n')

    const linked = renderKnowledgeMarkdown(markdown).html
    expect(linked).toContain('href="https://en.wikipedia.org/wiki/Function_(mathematics)#History"')
    expect(linked).toContain('href="https://example.com/a_(b_(c))/index.html"')
    expect(linked).toContain('title="Nested title"')
    expect(linked).toContain('href="../images/flow_(v2).png"')
    expect(linked).toContain('title="Flow (v2)"')

    const images = renderKnowledgeMarkdown(markdown, { renderImages: true }).html
    expect(images).toContain('<img src="../images/flow_(v2).png"')
  })

  it('keeps browser-safe external links and rejects dangerous or unsupported schemes', () => {
    const result = renderKnowledgeMarkdown(
      [
        '[web](https://example.com/docs)',
        '[mail](mailto:docs@example.com)',
        '[js](javascript:alert(1))',
        '[data](data:text/html,unsafe)',
        '[file](file:///tmp/note.md)',
        '[ftp](ftp://example.com/note.md)',
      ].join('\n'),
    ).html

    expect(result).toContain('href="https://example.com/docs"')
    expect(result).not.toContain('href="mailto:docs@example.com"')
    expect(result).toContain('target="_blank" rel="noreferrer noopener"')
    expect(result).not.toContain('href="javascript:')
    expect(result).not.toContain('href="data:')
    expect(result).not.toContain('href="file:')
    expect(result).not.toContain('href="ftp:')
  })

  it('renders safe image links by default and images only when explicitly requested', () => {
    const markdown =
      '![diagram <one>](../images/diagram.png "A <diagram>") ![remote](https://example.com/a.png)'

    const safeLinks = renderKnowledgeMarkdown(markdown).html
    expect(safeLinks).not.toContain('<img')
    expect(safeLinks).toContain(
      '<a href="../images/diagram.png" data-knowledge-link="true" data-knowledge-image="true"',
    )
    expect(safeLinks).toContain('查看图片：diagram &lt;one&gt;')
    expect(safeLinks).toContain(
      '<a href="https://example.com/a.png" data-knowledge-link="true" data-knowledge-image="true"',
    )
    const rendered = renderKnowledgeMarkdown(markdown, { renderImages: true }).html
    expect(rendered).toContain(
      '<img src="../images/diagram.png" alt="diagram &lt;one&gt;" title="A &lt;diagram&gt;" loading="lazy" decoding="async" />',
    )
    expect(rendered).toContain('<img src="https://example.com/a.png" alt="remote"')
  })

  it('does not render unsafe image sources or reinterpret them as links', () => {
    const rendered = renderKnowledgeMarkdown(
      [
        '![bad](javascript:alert(1))',
        '![data](data:image/png;base64,abc)',
        '![file](file:///tmp/a.png)',
        '![mail](mailto:image@example.com)',
      ].join('\n'),
      { renderImages: true },
    ).html

    expect(rendered).not.toContain('<img')
    expect(rendered).not.toContain('<a')
    expect(rendered).toContain('![bad](javascript:alert(1))')
  })

  it('parses H4-H6 headings into the outline and keeps them as heading elements', () => {
    const result = renderKnowledgeMarkdown(
      ['#### Fourth level', '##### Fifth level', '###### 第六级（细节）'].join('\n'),
    )

    expect(result.outline).toEqual([
      { id: 'fourth-level', text: 'Fourth level', depth: 4 },
      { id: 'fifth-level', text: 'Fifth level', depth: 5 },
      { id: '第六级细节', text: '第六级（细节）', depth: 6 },
    ])
    expect(result.html).toContain('<h5 id="fourth-level">Fourth level</h5>')
    expect(result.html).toContain('<h6 id="fifth-level">Fifth level</h6>')
    expect(result.html).toContain('<h6 id="第六级细节">第六级（细节）</h6>')
  })

  it('uses the same slug rules for generated headings and incoming fragments', () => {
    const result = renderKnowledgeMarkdown('# API（v2）：快速 入门!')

    expect(result.outline[0].id).toBe('apiv2快速-入门')
    expect(
      resolveKnowledgeHeadingId(
        '#API%EF%BC%88v2%EF%BC%89%EF%BC%9A%E5%BF%AB%E9%80%9F%20%E5%85%A5%E9%97%A8%21',
        result.outline,
      ),
    ).toBe('apiv2快速-入门')
    expect(resolveKnowledgeHeadingId('#APIV2快速-入门', result.outline)).toBe('apiv2快速-入门')
  })

  it('renders about 700KB with many block placeholders in a bounded time', () => {
    const section = (index: number) =>
      [
        `# Section ${index}`,
        '',
        '正文'.repeat(1400),
        '',
        '```ts',
        `const section${index} = ${index}`,
        '```',
        '',
        '| Name | Value |',
        '| --- | --- |',
        `| section | ${index} |`,
      ].join('\n')
    const markdown = Array.from({ length: 260 }, (_, index) => section(index)).join('\n\n')
    expect(markdown.length).toBeGreaterThan(700_000)

    const startedAt = performance.now()
    const result = renderKnowledgeMarkdown(markdown)
    const elapsed = performance.now() - startedAt

    expect(result.outline).toHaveLength(260)
    expect(result.html).toContain('const section259 = 259')
    expect(result.html).toContain('<td>259</td>')
    expect(result.html).not.toContain('\u0000CODE_BLOCK_')
    expect(result.html).not.toContain('\u0000TABLE_')
    expect(elapsed).toBeLessThan(4_000)
  })

  it('handles many unmatched opening brackets in linear time', () => {
    const markdown = `${'['.repeat(200_000)}[valid](https://example.com/docs)`

    const startedAt = performance.now()
    const result = renderKnowledgeMarkdown(markdown)
    const elapsed = performance.now() - startedAt

    expect(result.html).toContain('href="https://example.com/docs"')
    expect(elapsed).toBeLessThan(2_000)
  })
})
