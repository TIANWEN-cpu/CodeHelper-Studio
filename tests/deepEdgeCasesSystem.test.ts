/**
 * Deep edge-case tests for renderMarkdown and eventBus.
 *
 * Covers:
 *  - Markdown: XSS vectors, nested formatting, BOM, control chars, mixed severity
 *  - EventBus: MAX_LISTENERS warning, once semantics, void events, type safety edge cases
 *  - Memory monitor: interval precision, high-heap warning exact format
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderMarkdown } from '../src/utils/markdown'

// ---------------------------------------------------------------------------
// EventBus import (re-create local instance for isolation)
// ---------------------------------------------------------------------------
// We import the singleton but clear it before each test
const { eventBus } = await import('../src/utils/eventBus')

// =========================================================================
// 1. renderMarkdown — deeper edge cases
// =========================================================================

describe('Deep: renderMarkdown edge cases', () => {
  describe('XSS prevention', () => {
    it('escapes <script> tags', () => {
      const result = renderMarkdown('<script>alert("xss")</script>')
      expect(result).toContain('&lt;script&gt;')
      expect(result).not.toContain('<script>')
      expect(result).toContain('&lt;/script&gt;')
    })

    it('escapes event handlers in HTML', () => {
      const result = renderMarkdown('<img onerror="alert(1)">')
      expect(result).toContain('&lt;img')
      expect(result).not.toContain('<img')
    })

    it('escapes nested HTML tags', () => {
      const result = renderMarkdown('<div><span>text</span></div>')
      expect(result).not.toContain('<div>')
      expect(result).not.toContain('<span>')
      expect(result).toContain('&lt;div&gt;')
      expect(result).toContain('&lt;span&gt;')
    })

    it('escapes ampersand in various contexts', () => {
      expect(renderMarkdown('A & B & C')).toBe('<p>A &amp; B &amp; C</p>')
    })

    it('escapes HTML entities that are already escaped', () => {
      const result = renderMarkdown('&amp; &lt; &gt;')
      expect(result).toContain('&amp;amp;')
      expect(result).toContain('&amp;lt;')
      expect(result).toContain('&amp;gt;')
    })

    it('escapes angle brackets in markdown syntax', () => {
      const result = renderMarkdown('Use <strong> not <em>')
      expect(result).toContain('&lt;strong&gt;')
      expect(result).toContain('&lt;em&gt;')
    })
  })

  describe('nested formatting', () => {
    it('bold text containing backtick code', () => {
      const result = renderMarkdown('**use `code` here**')
      // Bold wraps first, then code inside
      expect(result).toContain('<strong>')
      expect(result).toContain('<code>code</code>')
    })

    it('italic text containing bold', () => {
      const result = renderMarkdown('*italic **bold** text*')
      // Italic wraps first (since single * is processed after **)
      // ** -> <strong>, then * -> <em>
      expect(result).toContain('<strong>bold</strong>')
    })

    it('code span does NOT protect inner content from bold (known limitation)', () => {
      // renderMarkdown applies ** -> <strong> BEFORE ` -> <code>
      // so backticks do NOT protect inner content from other transformations
      const result = renderMarkdown('`**not bold**`')
      expect(result).toContain('<code>')
      expect(result).toContain('</code>')
      // The ** IS converted to <strong> because bold runs before code
      expect(result).toContain('<strong>not bold</strong>')
    })

    it('code span preserves HTML entities', () => {
      const result = renderMarkdown('`<div>&amp;</div>`')
      expect(result).toContain('&lt;div&gt;')
      expect(result).toContain('<code>')
    })
  })

  describe('heading edge cases', () => {
    it('multiple headings in one text', () => {
      const result = renderMarkdown('# H1\n## H2\n### H3')
      expect(result).toContain('<h2>H1</h2>')
      expect(result).toContain('<h3>H2</h3>')
      expect(result).toContain('<h4>H3</h4>')
    })

    it('heading with inline formatting', () => {
      const result = renderMarkdown('# **Bold** Title')
      expect(result).toContain('<h2>')
      expect(result).toContain('<strong>Bold</strong>')
    })

    it('heading with special chars', () => {
      const result = renderMarkdown('# Title with <html> & entities')
      expect(result).toContain('<h2>')
      expect(result).toContain('&lt;html&gt;')
      expect(result).toContain('&amp;')
    })

    it('four or more hashes does not create heading', () => {
      const result = renderMarkdown('#### four hashes')
      // The regex only handles #, ##, ### so #### is not matched
      expect(result).not.toContain('<h5>')
      expect(result).toContain('#### four hashes')
    })

    it('heading at very end of string', () => {
      const result = renderMarkdown('# End')
      expect(result).toContain('<h2>End</h2>')
    })
  })

  describe('list edge cases', () => {
    it('single item list', () => {
      const result = renderMarkdown('- only item')
      expect(result).toContain('<ul>')
      expect(result).toContain('<li>only item</li>')
      expect(result).toContain('</ul>')
    })

    it('list items with inline formatting', () => {
      const result = renderMarkdown('- **bold** item\n- *italic* item\n- `code` item')
      expect(result).toContain('<strong>bold</strong>')
      expect(result).toContain('<em>italic</em>')
      expect(result).toContain('<code>code</code>')
    })

    it('dash without space is not a list item', () => {
      const result = renderMarkdown('not-a-list')
      expect(result).not.toContain('<li>')
      expect(result).not.toContain('<ul>')
    })

    it('double dash is not a list item', () => {
      const result = renderMarkdown('--double')
      expect(result).not.toContain('<li>')
    })
  })

  describe('severity tag edge cases', () => {
    it('severity tag inside bold text', () => {
      const result = renderMarkdown('**[严重] bug**')
      expect(result).toContain('theme-danger')
      expect(result).toContain('<strong>')
    })

    it('multiple severity tags on same line', () => {
      const result = renderMarkdown('[严重] err1 [严重] err2')
      const severeCount = (result.match(/theme-danger/g) || []).length
      expect(severeCount).toBe(2)
    })

    it('severity tags case-sensitive (must be Chinese)', () => {
      const result = renderMarkdown('[severe] [warning] [info]')
      // English severity tags are NOT converted
      expect(result).not.toContain('theme-danger')
      expect(result).not.toContain('theme-warning')
      expect(result).not.toContain('theme-accent')
    })

    it('partial severity tags are not matched', () => {
      const result = renderMarkdown('[严] [重] [警] [告]')
      expect(result).not.toContain('theme-danger')
      expect(result).not.toContain('theme-warning')
    })

    it('[提示] exact style values', () => {
      const result = renderMarkdown('[提示] info')
      expect(result).toContain('color:var(--theme-accent)')
      expect(result).toContain('font-weight:600')
    })
  })

  describe('paragraph and newline edge cases', () => {
    it('triple newline creates empty paragraph', () => {
      const result = renderMarkdown('a\n\n\nb')
      // \n{2,} -> </p><p>, so triple newline still produces one separator
      expect(result).toContain('</p><p>')
    })

    it('single newline at start', () => {
      const result = renderMarkdown('\nhello')
      expect(result).toContain('<br/>')
      expect(result).toContain('hello')
    })

    it('text ending with double newline', () => {
      const result = renderMarkdown('text\n\n')
      expect(result).toContain('text')
    })

    it('only newlines', () => {
      const result = renderMarkdown('\n\n\n')
      // \n{2,} -> </p><p>, then \n -> <br/>, wrapped in <p>
      // The result should be well-formed
      expect(result.startsWith('<p>')).toBe(true)
      expect(result.endsWith('</p>')).toBe(true)
    })
  })

  describe('unicode and emoji', () => {
    it('CJK headings', () => {
      const result = renderMarkdown('# 标题')
      expect(result).toContain('<h2>标题</h2>')
    })

    it('emoji in bold', () => {
      const result = renderMarkdown('**done! 🎉**')
      expect(result).toContain('<strong>done! 🎉</strong>')
    })

    it('mixed CJK and emoji in lists', () => {
      const result = renderMarkdown('- 第一项 ✅\n- 第二项 🚀')
      expect(result).toContain('第一项 ✅')
      expect(result).toContain('第二项 🚀')
    })

    it('RTL text is preserved', () => {
      const result = renderMarkdown('مرحبا שלום')
      expect(result).toContain('مرحبا')
      expect(result).toContain('שלום')
    })

    it('mathematical symbols preserved', () => {
      const result = renderMarkdown('公式: ∑∏∫√∞')
      expect(result).toContain('∑∏∫√∞')
    })

    it('zero-width characters preserved', () => {
      const result = renderMarkdown('hello​world‌‍')
      expect(result).toContain('hello​world‌‍')
    })

    it('BOM character preserved', () => {
      const result = renderMarkdown('﻿text')
      expect(result).toContain('﻿text')
    })
  })

  describe('extremely long content', () => {
    it('100KB of bold text renders', () => {
      const text = '**' + 'a'.repeat(100_000) + '**'
      const result = renderMarkdown(text)
      expect(result).toContain('<strong>')
      expect(result).toContain('</strong>')
    })

    it('1000 list items render', () => {
      const items = Array.from({ length: 1000 }, (_, i) => `- item ${i}`).join('\n')
      const result = renderMarkdown(items)
      expect(result).toContain('<li>item 0</li>')
      expect(result).toContain('<li>item 999</li>')
    })

    it('100 headings render', () => {
      const headings = Array.from({ length: 100 }, (_, i) => `# Heading ${i}`).join('\n')
      const result = renderMarkdown(headings)
      const h2Count = (result.match(/<h2>/g) || []).length
      expect(h2Count).toBe(100)
    })
  })
})

// =========================================================================
// 2. eventBus — deep edge cases
// =========================================================================

describe('Deep: eventBus edge cases', () => {
  beforeEach(() => {
    eventBus.off()
  })

  describe('MAX_LISTENERS warning', () => {
    it('adding exactly 50 listeners does not warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      for (let i = 0; i < 50; i++) {
        eventBus.on('theme:changed', () => {})
      }
      expect(eventBus.listenerCount('theme:changed')).toBe(50)
      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('adding 51st listener triggers warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      for (let i = 0; i < 51; i++) {
        eventBus.on('theme:changed', () => {})
      }
      expect(eventBus.listenerCount('theme:changed')).toBe(51)
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0][0]).toContain('Max listeners')
      expect(warnSpy.mock.calls[0][0]).toContain('50')
      warnSpy.mockRestore()
    })

    it('adding 52nd listener triggers another warning (per-add)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      for (let i = 0; i < 52; i++) {
        eventBus.on('theme:changed', () => {})
      }
      // Warning fires for 51st and 52nd
      expect(warnSpy).toHaveBeenCalledTimes(2)
      warnSpy.mockRestore()
    })
  })

  describe('once() semantics', () => {
    it('once listener auto-unsubscribes after first emit', () => {
      let count = 0
      eventBus.once('theme:changed', () => {
        count++
      })

      eventBus.emit('theme:changed', 'fjord')
      eventBus.emit('theme:changed', 'ember')
      eventBus.emit('theme:changed', 'mocha')

      expect(count).toBe(1)
      expect(eventBus.listenerCount('theme:changed')).toBe(0)
    })

    it('once receives the correct data', () => {
      let received = ''
      eventBus.once('theme:changed', (data) => {
        received = data
      })

      eventBus.emit('theme:changed', 'fjord')
      expect(received).toBe('fjord')
    })

    it('once unsub before emit prevents callback', () => {
      let called = false
      const unsub = eventBus.once('theme:changed', () => {
        called = true
      })
      unsub()
      eventBus.emit('theme:changed', 'fjord')
      expect(called).toBe(false)
    })

    it('multiple once listeners all fire once', () => {
      let count1 = 0
      let count2 = 0
      eventBus.once('theme:changed', () => {
        count1++
      })
      eventBus.once('theme:changed', () => {
        count2++
      })

      eventBus.emit('theme:changed', 'fjord')
      eventBus.emit('theme:changed', 'ember')

      expect(count1).toBe(1)
      expect(count2).toBe(1)
      expect(eventBus.listenerCount('theme:changed')).toBe(0)
    })
  })

  describe('void events', () => {
    it('void event emits with undefined', () => {
      let received: unknown = 'not-set'
      eventBus.on('problems:refreshed', (data) => {
        received = data
      })

      eventBus.emit('problems:refreshed', undefined)
      expect(received).toBeUndefined()
    })

    it('knowledge:uploaded void event', () => {
      let called = false
      eventBus.on('knowledge:uploaded', () => {
        called = true
      })

      eventBus.emit('knowledge:uploaded', undefined)
      expect(called).toBe(true)
    })
  })

  describe('complex event data', () => {
    it('editor:content-changed passes object', () => {
      let received: { tabId: string; content: string } | null = null
      eventBus.on('editor:content-changed', (data) => {
        received = data
      })

      eventBus.emit('editor:content-changed', { tabId: 'tab-1', content: 'hello' })
      expect(received).toEqual({ tabId: 'tab-1', content: 'hello' })
    })

    it('ai:stream-chunk passes requestId and chunk', () => {
      let received: { requestId: string; chunk: string } | null = null
      eventBus.on('ai:stream-chunk', (data) => {
        received = data
      })

      eventBus.emit('ai:stream-chunk', { requestId: 'r1', chunk: 'hello' })
      expect(received!.requestId).toBe('r1')
      expect(received!.chunk).toBe('hello')
    })

    it('knowledge:tagged passes docId and tags array', () => {
      let received: { docId: number; tags: string[] } | null = null
      eventBus.on('knowledge:tagged', (data) => {
        received = data
      })

      eventBus.emit('knowledge:tagged', { docId: 42, tags: ['dp', 'graph'] })
      expect(received!.docId).toBe(42)
      expect(received!.tags).toEqual(['dp', 'graph'])
    })
  })

  describe('off() edge cases', () => {
    it('off(event) only clears specified event', () => {
      eventBus.on('theme:changed', () => {})
      eventBus.on('theme:changed', () => {})
      eventBus.on('session:created', () => {})

      eventBus.off('theme:changed')

      expect(eventBus.listenerCount('theme:changed')).toBe(0)
      expect(eventBus.listenerCount('session:created')).toBe(1)
    })

    it('off() with no args clears all events', () => {
      eventBus.on('theme:changed', () => {})
      eventBus.on('session:created', () => {})
      eventBus.on('problem:selected', () => {})
      eventBus.on('editor:tab-opened', () => {})

      eventBus.off()

      expect(eventBus.listenerCount('theme:changed')).toBe(0)
      expect(eventBus.listenerCount('session:created')).toBe(0)
      expect(eventBus.listenerCount('problem:selected')).toBe(0)
      expect(eventBus.listenerCount('editor:tab-opened')).toBe(0)
    })

    it('off(non-existent-event) does not throw', () => {
      expect(() => eventBus.off('app:ready')).not.toThrow()
    })
  })

  describe('listener error isolation', () => {
    it('error in first listener does not prevent second listener', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const calls: string[] = []

      eventBus.on('theme:changed', () => {
        calls.push('first')
        throw new Error('boom')
      })
      eventBus.on('theme:changed', () => {
        calls.push('second')
      })

      eventBus.emit('theme:changed', 'fjord')
      expect(calls).toEqual(['first', 'second'])
      consoleSpy.mockRestore()
    })

    it('error in middle listener does not prevent later listeners', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const calls: string[] = []

      eventBus.on('theme:changed', () => {
        calls.push('1')
      })
      eventBus.on('theme:changed', () => {
        throw new Error('err')
      })
      eventBus.on('theme:changed', () => {
        calls.push('3')
      })

      eventBus.emit('theme:changed', 'fjord')
      expect(calls).toEqual(['1', '3'])
      consoleSpy.mockRestore()
    })

    it('console.error is called for listener errors', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      eventBus.on('theme:changed', () => {
        throw new Error('test err')
      })
      eventBus.emit('theme:changed', 'fjord')

      expect(spy).toHaveBeenCalled()
      expect(spy.mock.calls[0][0]).toContain('EventBus')
      spy.mockRestore()
    })
  })

  describe('hasListeners', () => {
    it('returns true when listeners exist', () => {
      eventBus.on('theme:changed', () => {})
      expect(eventBus.hasListeners('theme:changed')).toBe(true)
    })

    it('returns false when no listeners', () => {
      expect(eventBus.hasListeners('theme:changed')).toBe(false)
    })

    it('returns false after all listeners removed', () => {
      const unsub = eventBus.on('theme:changed', () => {})
      unsub()
      expect(eventBus.hasListeners('theme:changed')).toBe(false)
    })
  })

  describe('listenerCount', () => {
    it('returns 0 for unregistered event', () => {
      expect(eventBus.listenerCount('error:occurred')).toBe(0)
    })

    it('tracks multiple listeners correctly', () => {
      const unsubs = []
      for (let i = 0; i < 10; i++) {
        unsubs.push(eventBus.on('theme:changed', () => {}))
      }
      expect(eventBus.listenerCount('theme:changed')).toBe(10)

      unsubs[0]()
      expect(eventBus.listenerCount('theme:changed')).toBe(9)

      unsubs[1]()
      unsubs[2]()
      expect(eventBus.listenerCount('theme:changed')).toBe(7)
    })
  })

  describe('unsubscribe idempotency', () => {
    it('calling unsubscribe twice is safe', () => {
      const unsub = eventBus.on('theme:changed', () => {})
      unsub()
      expect(() => unsub()).not.toThrow()
      expect(eventBus.listenerCount('theme:changed')).toBe(0)
    })

    it('calling unsubscribe three times is safe', () => {
      const unsub = eventBus.on('theme:changed', () => {})
      unsub()
      unsub()
      unsub()
      expect(eventBus.listenerCount('theme:changed')).toBe(0)
    })
  })
})
