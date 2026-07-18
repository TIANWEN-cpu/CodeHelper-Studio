import { describe, expect, it } from 'vitest'
import {
  applyKnowledgeLinkAuditTooltip,
  defragmentKnowledgeHref,
  isSafeKnowledgeHref,
  resolveKnowledgeLink,
  type KnowledgeLinkSource,
} from '../src/utils/knowledgeLinks'

describe('applyKnowledgeLinkAuditTooltip', () => {
  it('preserves the authored title and replaces audit text idempotently', () => {
    const anchor = {
      dataset: {} as { knowledgeOriginalTitle?: string },
      title: '上游说明',
      getAttribute: (name: string) => (name === 'title' ? '上游说明' : null),
    }

    applyKnowledgeLinkAuditTooltip(anchor, '离线检查：可访问', '2026-07-18T10:00:00Z')
    expect(anchor.title).toBe('上游说明 · 离线检查：可访问，检查于 2026-07-18T10:00:00Z')

    applyKnowledgeLinkAuditTooltip(anchor, '离线检查：上游确认不存在', '2026-07-18T11:00:00Z')
    expect(anchor.title).toBe('上游说明 · 离线检查：上游确认不存在，检查于 2026-07-18T11:00:00Z')
    expect(anchor.title.match(/上游说明/g)).toHaveLength(1)
  })
})

describe('defragmentKnowledgeHref', () => {
  it('removes only the fragment while preserving the query and balanced parentheses', () => {
    expect(
      defragmentKnowledgeHref('https://example.com/wiki/Function_(mathematics)?view=full#History'),
    ).toBe('https://example.com/wiki/Function_(mathematics)?view=full')
    expect(defragmentKnowledgeHref('../guide_(draft).md#安装')).toBe('../guide_(draft).md')
    expect(defragmentKnowledgeHref('#安装')).toBe('')
  })
})

const githubRootSource: KnowledgeLinkSource = {
  source_repo: 'acme/handbook',
  source_url: 'https://github.com/acme/handbook',
  source_path: 'docs/guide/current.md',
  source_commit: 'abc123',
}

describe('isSafeKnowledgeHref', () => {
  it('allows anchors, repository-relative paths, and browser-safe external protocols', () => {
    expect(isSafeKnowledgeHref('#section')).toBe(true)
    expect(isSafeKnowledgeHref('./child.md')).toBe(true)
    expect(isSafeKnowledgeHref('../parent.md')).toBe(true)
    expect(isSafeKnowledgeHref('guide.md?view=full#intro')).toBe(true)
    expect(isSafeKnowledgeHref('/docs/index.md')).toBe(true)
    expect(isSafeKnowledgeHref('https://example.com')).toBe(true)
    expect(isSafeKnowledgeHref('mailto:docs@example.com')).toBe(false)
    expect(isSafeKnowledgeHref('mailto:docs@example.com', { allowMailto: true })).toBe(true)
  })

  it('rejects dangerous, unsupported, protocol-relative, and control-character targets', () => {
    expect(isSafeKnowledgeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeKnowledgeHref('DATA:text/html,unsafe')).toBe(false)
    expect(isSafeKnowledgeHref('file:///tmp/note.md')).toBe(false)
    expect(isSafeKnowledgeHref('ftp://example.com/note.md')).toBe(false)
    expect(isSafeKnowledgeHref('https://')).toBe(false)
    expect(isSafeKnowledgeHref('//example.com/note.md')).toBe(false)
    expect(isSafeKnowledgeHref('guide\u0000.md')).toBe(false)
    expect(isSafeKnowledgeHref('mailto:image@example.com', { allowMailto: false })).toBe(false)
  })
})

describe('resolveKnowledgeLink', () => {
  it('resolves same-document anchors and query/hash values without source metadata', () => {
    expect(resolveKnowledgeLink('#安装')).toEqual({
      kind: 'same-document',
      originalHref: '#安装',
      resolvedHref: '#安装',
      fragment: '安装',
    })
    expect(resolveKnowledgeLink('?view=full#%E6%A6%82%E8%A7%88')).toEqual({
      kind: 'same-document',
      originalHref: '?view=full#%E6%A6%82%E8%A7%88',
      resolvedHref: '?view=full#%E6%A6%82%E8%A7%88',
      query: 'view=full',
      fragment: '概览',
    })
  })

  it('resolves parent paths against a GitHub repository root and keeps query/hash', () => {
    const result = resolveKnowledgeLink('../api.md?raw=1#方法', githubRootSource)

    expect(result).toMatchObject({
      kind: 'corpus-document',
      originalHref: '../api.md?raw=1#方法',
      resolvedHref: 'docs/api.md?raw=1#方法',
      corpusPath: 'docs/api.md',
      query: 'raw=1',
      fragment: '方法',
    })
    expect(result.kind === 'corpus-document' ? decodeURI(result.externalUrl ?? '') : '').toBe(
      'https://github.com/acme/handbook/blob/abc123/docs/api.md?raw=1#方法',
    )
  })

  it('resolves ./, bare, and repository-root paths to canonical corpus paths', () => {
    expect(resolveKnowledgeLink('./child.md', githubRootSource)).toMatchObject({
      kind: 'corpus-document',
      corpusPath: 'docs/guide/child.md',
      resolvedHref: 'docs/guide/child.md',
    })
    expect(resolveKnowledgeLink('sibling.md#part', githubRootSource)).toMatchObject({
      kind: 'corpus-document',
      corpusPath: 'docs/guide/sibling.md',
      fragment: 'part',
    })
    expect(resolveKnowledgeLink('/README.md', githubRootSource)).toMatchObject({
      kind: 'corpus-document',
      corpusPath: 'README.md',
    })
  })

  it('recognizes an explicit path back to the current document', () => {
    expect(resolveKnowledgeLink('./current.md#details', githubRootSource)).toEqual({
      kind: 'same-document',
      originalHref: './current.md#details',
      resolvedHref: '#details',
      sourcePath: 'docs/guide/current.md',
      fragment: 'details',
    })
  })

  it('derives repository, ref, and current path from a GitHub blob file URL', () => {
    const result = resolveKnowledgeLink('../other.md', {
      source_url: 'https://github.com/acme/handbook/blob/main/docs/guide/current.md',
    })

    expect(result).toMatchObject({
      kind: 'corpus-document',
      corpusPath: 'docs/other.md',
    })
    expect(result.kind === 'corpus-document' ? result.externalUrl : undefined).toBe(
      'https://github.com/acme/handbook/blob/main/docs/other.md',
    )
  })

  it('uses source_path to disambiguate slash-containing refs in blob URLs', () => {
    const result = resolveKnowledgeLink('../other.md', {
      source_url: 'https://github.com/acme/handbook/blob/feature/docs/docs/guide/current.md',
      source_path: 'docs/guide/current.md',
    })

    expect(result.kind === 'corpus-document' ? result.externalUrl : undefined).toBe(
      'https://github.com/acme/handbook/blob/feature/docs/docs/other.md',
    )
  })

  it('lets source_commit override a blob URL ref', () => {
    const result = resolveKnowledgeLink('next.md', {
      source_url: 'https://github.com/acme/handbook/blob/main/docs/current.md',
      source_path: 'docs/current.md',
      source_commit: 'deadbeef',
    })

    expect(result.kind === 'corpus-document' ? result.externalUrl : undefined).toBe(
      'https://github.com/acme/handbook/blob/deadbeef/docs/next.md',
    )
  })

  it('builds a traceable GitHub URL from source_repo when source_url is absent', () => {
    const result = resolveKnowledgeLink('next.md', {
      source_repo: 'acme/handbook',
      source_path: 'docs/current.md',
      source_commit: 'release/v2',
    })

    expect(result.kind === 'corpus-document' ? result.externalUrl : undefined).toBe(
      'https://github.com/acme/handbook/blob/release/v2/docs/next.md',
    )
  })

  it('returns a corpus target without inventing a remote URL when only source_path is known', () => {
    expect(
      resolveKnowledgeLink('../shared.md', {
        source_path: 'docs/guide/current.md',
      }),
    ).toEqual({
      kind: 'corpus-document',
      originalHref: '../shared.md',
      resolvedHref: 'docs/shared.md',
      corpusPath: 'docs/shared.md',
    })
  })

  it('blocks direct and encoded attempts to escape the repository root', () => {
    expect(resolveKnowledgeLink('../../../outside.md', githubRootSource)).toEqual({
      kind: 'blocked',
      originalHref: '../../../outside.md',
      reason: 'path-escape',
    })
    expect(resolveKnowledgeLink('%2e%2e/%2e%2e/%2e%2e/outside.md', githubRootSource)).toEqual({
      kind: 'blocked',
      originalHref: '%2e%2e/%2e%2e/%2e%2e/outside.md',
      reason: 'path-escape',
    })
  })

  it('classifies supported external URLs without consulting source metadata', () => {
    expect(resolveKnowledgeLink('https://example.com/a?b=1#c')).toEqual({
      kind: 'external',
      originalHref: 'https://example.com/a?b=1#c',
      resolvedHref: 'https://example.com/a?b=1#c',
      protocol: 'https:',
    })
    expect(resolveKnowledgeLink('mailto:docs@example.com')).toEqual({
      kind: 'external',
      originalHref: 'mailto:docs@example.com',
      resolvedHref: 'mailto:docs@example.com',
      protocol: 'mailto:',
    })
  })

  it.each(['javascript:alert(1)', 'DATA:text/html,unsafe', 'file:///tmp/a.md', 'vbscript:bad'])(
    'blocks dangerous protocol %s',
    (href) => {
      expect(resolveKnowledgeLink(href)).toMatchObject({
        kind: 'blocked',
        reason: 'dangerous-scheme',
      })
    },
  )

  it('distinguishes unsupported schemes, protocol-relative URLs, and missing source metadata', () => {
    expect(resolveKnowledgeLink('ftp://example.com/a.md')).toEqual({
      kind: 'blocked',
      originalHref: 'ftp://example.com/a.md',
      reason: 'unsupported-scheme',
    })
    expect(resolveKnowledgeLink('//example.com/a.md')).toEqual({
      kind: 'unresolved',
      originalHref: '//example.com/a.md',
      reason: 'protocol-relative-url',
    })
    expect(resolveKnowledgeLink('guide.md')).toEqual({
      kind: 'unresolved',
      originalHref: 'guide.md',
      reason: 'missing-source-path',
    })
  })

  it('reports malformed links and invalid source paths without throwing', () => {
    expect(resolveKnowledgeLink('%E0%A4%A', githubRootSource)).toEqual({
      kind: 'blocked',
      originalHref: '%E0%A4%A',
      reason: 'invalid-target',
    })
    expect(
      resolveKnowledgeLink('guide.md', {
        source_path: '../outside/current.md',
      }),
    ).toEqual({
      kind: 'unresolved',
      originalHref: 'guide.md',
      reason: 'invalid-source-path',
    })
    expect(resolveKnowledgeLink('http://')).toEqual({
      kind: 'blocked',
      originalHref: 'http://',
      reason: 'invalid-target',
    })
  })
})
