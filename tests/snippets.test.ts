import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key]
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => delete store[k])
  }),
})

import {
  getSnippets,
  getSnippetLanguages,
  addUserSnippet,
  removeUserSnippet,
  updateUserSnippet,
  findSnippetByPrefix,
  expandSnippetBody,
  getSnippetPrefixes,
} from '../src/utils/snippets'

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k])
  vi.clearAllMocks()
})

describe('getSnippets', () => {
  it('returns built-in snippets for python', () => {
    const snippets = getSnippets('python')
    expect(snippets.length).toBeGreaterThan(0)
    for (const s of snippets) {
      expect(s.language).toBe('python')
    }
  })

  it('returns built-in snippets for javascript', () => {
    const snippets = getSnippets('javascript')
    expect(snippets.length).toBeGreaterThan(0)
  })

  it('returns built-in snippets for typescript', () => {
    const snippets = getSnippets('typescript')
    expect(snippets.length).toBeGreaterThan(0)
  })

  it('returns built-in snippets for cpp', () => {
    const snippets = getSnippets('cpp')
    expect(snippets.length).toBeGreaterThan(0)
  })

  it('returns built-in snippets for java', () => {
    const snippets = getSnippets('java')
    expect(snippets.length).toBeGreaterThan(0)
  })

  it('returns built-in snippets for go', () => {
    const snippets = getSnippets('go')
    expect(snippets.length).toBeGreaterThan(0)
  })

  it('returns built-in snippets for rust', () => {
    const snippets = getSnippets('rust')
    expect(snippets.length).toBeGreaterThan(0)
  })

  it('returns empty for unknown language', () => {
    const snippets = getSnippets('brainfuck')
    expect(snippets).toEqual([])
  })

  it('includes user snippets before built-in', () => {
    addUserSnippet({
      name: 'My Snippet',
      prefix: 'ms',
      language: 'python',
      body: 'custom',
      description: 'test',
    })
    const snippets = getSnippets('python')
    expect(snippets[0].isBuiltin).toBe(false)
    expect(snippets[0].prefix).toBe('ms')
  })
})

describe('getSnippetLanguages', () => {
  it('returns sorted list of unique languages', () => {
    const langs = getSnippetLanguages()
    expect(langs).toContain('python')
    expect(langs).toContain('javascript')
    expect(langs).toContain('typescript')
    // Should be sorted
    const sorted = [...langs].sort()
    expect(langs).toEqual(sorted)
  })
})

describe('addUserSnippet', () => {
  it('creates a new snippet with auto-generated id', () => {
    const snippet = addUserSnippet({
      name: 'Test',
      prefix: 'tst',
      language: 'python',
      body: 'test body',
      description: 'test desc',
    })
    expect(snippet.id).toMatch(/^user-/)
    expect(snippet.isBuiltin).toBe(false)
    expect(snippet.name).toBe('Test')
    expect(snippet.prefix).toBe('tst')
  })

  it('persists to localStorage', () => {
    addUserSnippet({
      name: 'Test',
      prefix: 'tst',
      language: 'python',
      body: 'body',
      description: 'desc',
    })
    expect(localStorage.setItem).toHaveBeenCalled()
  })
})

describe('removeUserSnippet', () => {
  it('removes a snippet by id', () => {
    const snippet = addUserSnippet({
      name: 'To Remove',
      prefix: 'rm',
      language: 'python',
      body: 'body',
      description: 'desc',
    })
    removeUserSnippet(snippet.id)
    const snippets = getSnippets('python')
    expect(snippets.find((s) => s.id === snippet.id)).toBeUndefined()
  })

  it('does nothing for non-existent id', () => {
    removeUserSnippet('nonexistent')
    // Should not throw
  })
})

describe('updateUserSnippet', () => {
  it('updates snippet properties', () => {
    const snippet = addUserSnippet({
      name: 'Original',
      prefix: 'orig',
      language: 'python',
      body: 'body',
      description: 'desc',
    })
    updateUserSnippet(snippet.id, { name: 'Updated', body: 'new body' })
    const snippets = getSnippets('python')
    const updated = snippets.find((s) => s.id === snippet.id)
    expect(updated!.name).toBe('Updated')
    expect(updated!.body).toBe('new body')
  })

  it('does nothing for non-existent id', () => {
    updateUserSnippet('nonexistent', { name: 'test' })
    // Should not throw
  })
})

describe('findSnippetByPrefix', () => {
  it('finds snippet by prefix', () => {
    const snippet = findSnippetByPrefix('main', 'python')
    expect(snippet).toBeDefined()
    expect(snippet!.prefix).toBe('main')
    expect(snippet!.language).toBe('python')
  })

  it('returns null for non-matching prefix', () => {
    const snippet = findSnippetByPrefix('xyz_nonexistent', 'python')
    expect(snippet).toBeNull()
  })

  it('returns null for wrong language', () => {
    const snippet = findSnippetByPrefix('main', 'nonexistent')
    expect(snippet).toBeNull()
  })
})

describe('expandSnippetBody', () => {
  it('replaces tab-stop placeholders with defaults', () => {
    expect(expandSnippetBody('${1:hello}')).toBe('hello')
    expect(expandSnippetBody('${1:pass} world')).toBe('pass world')
  })

  it('handles multiple placeholders', () => {
    const body = '${1:first} ${2:second} ${3:third}'
    expect(expandSnippetBody(body)).toBe('first second third')
  })

  it('handles empty defaults', () => {
    expect(expandSnippetBody('${1:}')).toBe('')
  })

  it('leaves text without placeholders unchanged', () => {
    expect(expandSnippetBody('no placeholders')).toBe('no placeholders')
  })

  it('handles nested braces', () => {
    expect(expandSnippetBody('${1:if (x) { return y; }}')).toBe('if (x) { return y; }')
  })
})

describe('getSnippetPrefixes', () => {
  it('returns prefix info for a language', () => {
    const prefixes = getSnippetPrefixes('python')
    expect(prefixes.length).toBeGreaterThan(0)
    for (const p of prefixes) {
      expect(p.prefix).toBeDefined()
      expect(p.description).toBeDefined()
      expect(p.body).toBeDefined()
    }
  })

  it('returns empty for unknown language', () => {
    const prefixes = getSnippetPrefixes('nonexistent')
    expect(prefixes).toEqual([])
  })
})
