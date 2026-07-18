export interface KnowledgeLinkSource {
  source_repo?: string
  source_url?: string
  source_path?: string
  source_commit?: string
}

interface KnowledgeLinkTooltipAnchor {
  dataset: { knowledgeOriginalTitle?: string }
  getAttribute(name: string): string | null
  title: string
}

export type KnowledgeLinkResolutionReason =
  | 'empty-href'
  | 'invalid-target'
  | 'dangerous-scheme'
  | 'unsupported-scheme'
  | 'protocol-relative-url'
  | 'missing-source-path'
  | 'invalid-source-path'
  | 'path-escape'

export type KnowledgeLinkResolution =
  | {
      kind: 'same-document'
      originalHref: string
      resolvedHref: string
      sourcePath?: string
      query?: string
      fragment?: string
    }
  | {
      kind: 'corpus-document'
      originalHref: string
      resolvedHref: string
      corpusPath: string
      externalUrl?: string
      query?: string
      fragment?: string
    }
  | {
      kind: 'external'
      originalHref: string
      resolvedHref: string
      protocol: 'http:' | 'https:' | 'mailto:'
    }
  | {
      kind: 'unresolved'
      originalHref: string
      reason: KnowledgeLinkResolutionReason
    }
  | {
      kind: 'blocked'
      originalHref: string
      reason: KnowledgeLinkResolutionReason
    }

interface SplitRelativeHref {
  path: string
  query?: string
  fragment?: string
  suffix: string
}

interface NormalizedPathResult {
  path?: string
  escaped?: boolean
  invalid?: boolean
}

interface GitHubSource {
  repositoryUrl: string
  ref: string
  sourcePath?: string
}

const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const DANGEROUS_PROTOCOLS = new Set(['javascript:', 'data:', 'file:', 'vbscript:'])
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function optionalFields(query?: string, fragment?: string) {
  return {
    ...(query !== undefined ? { query } : {}),
    ...(fragment !== undefined ? { fragment } : {}),
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function splitRelativeHref(href: string): SplitRelativeHref | null {
  const hashIndex = href.indexOf('#')
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const rawFragment = hashIndex >= 0 ? href.slice(hashIndex + 1) : undefined
  const queryIndex = beforeHash.indexOf('?')
  const rawPath = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : undefined
  const path = safeDecode(rawPath.replace(/\\/g, '/'))
  const fragment = rawFragment === undefined ? undefined : safeDecode(rawFragment)
  if (path === null || fragment === null) return null
  if (hasControlCharacter(path) || (fragment !== undefined && hasControlCharacter(fragment))) {
    return null
  }
  return {
    path,
    query,
    fragment,
    suffix: `${queryIndex >= 0 ? `?${query ?? ''}` : ''}${hashIndex >= 0 ? `#${rawFragment ?? ''}` : ''}`,
  }
}

function normalizePath(baseSegments: string[], targetPath: string): NormalizedPathResult {
  if (hasControlCharacter(targetPath)) return { invalid: true }
  const output = targetPath.startsWith('/') ? [] : [...baseSegments]
  for (const rawSegment of targetPath.split('/')) {
    const segment = rawSegment
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (output.length === 0) return { escaped: true }
      output.pop()
      continue
    }
    output.push(segment)
  }
  return { path: output.join('/') }
}

function normalizeStoredSourcePath(sourcePath: string): NormalizedPathResult {
  if (!sourcePath.trim()) return { invalid: true }
  const decoded = safeDecode(sourcePath.trim().replace(/\\/g, '/'))
  if (decoded === null) return { invalid: true }
  return normalizePath([], decoded.replace(/^\/+/, ''))
}

function parseGitHubUrl(value: string): {
  repositoryUrl: string
  tail: string[]
  kind: 'root' | 'blob'
} | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null
  if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) return null
  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => safeDecode(segment))
  if (segments.some((segment) => segment === null) || segments.length < 2) return null
  const [ownerValue, repoValue, marker, ...tail] = segments as string[]
  const owner = ownerValue.trim()
  const repo = repoValue.replace(/\.git$/i, '').trim()
  if (!owner || !repo || owner === '.' || owner === '..' || repo === '.' || repo === '..')
    return null
  return {
    repositoryUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    tail,
    kind: marker === 'blob' ? 'blob' : 'root',
  }
}

function parseSourceRepo(sourceRepo?: string): string | null {
  const value = sourceRepo?.trim()
  if (!value || hasControlCharacter(value)) return null
  const githubUrl = parseGitHubUrl(value)
  if (githubUrl) return githubUrl.repositoryUrl
  const normalized = value
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')
  const [owner, repo, ...extra] = normalized.split('/')
  if (
    !owner ||
    !repo ||
    extra.length > 0 ||
    owner === '.' ||
    owner === '..' ||
    repo === '.' ||
    repo === '..'
  ) {
    return null
  }
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

function resolveGitHubSource(source: KnowledgeLinkSource): GitHubSource | null {
  const fromUrl = source.source_url ? parseGitHubUrl(source.source_url.trim()) : null
  const repositoryUrl = fromUrl?.repositoryUrl ?? parseSourceRepo(source.source_repo)
  if (!repositoryUrl) return null

  let sourcePath = source.source_path?.trim()
  let ref = source.source_commit?.trim()
  if (fromUrl?.kind === 'blob' && fromUrl.tail.length > 0) {
    const blobTail = fromUrl.tail.join('/')
    if (sourcePath) {
      const normalizedSource = normalizeStoredSourcePath(sourcePath)
      if (normalizedSource.path) {
        sourcePath = normalizedSource.path
        const suffix = `/${sourcePath}`
        if (blobTail === sourcePath) ref ||= 'HEAD'
        else if (blobTail.endsWith(suffix)) ref ||= blobTail.slice(0, -suffix.length)
      }
    } else {
      ref ||= fromUrl.tail[0]
      sourcePath = fromUrl.tail.slice(1).join('/') || undefined
    }
  }

  if (ref) {
    const refSegments = ref.split('/')
    if (
      hasControlCharacter(ref) ||
      refSegments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return null
    }
  }
  return {
    repositoryUrl,
    ref: ref || 'HEAD',
    sourcePath,
  }
}

function encodeGitHubPath(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildGitHubBlobUrl(
  source: GitHubSource,
  corpusPath: string,
  query?: string,
  fragment?: string,
): string {
  const url = new URL(
    `${source.repositoryUrl}/blob/${encodeGitHubPath(source.ref)}/${encodeGitHubPath(corpusPath)}`,
  )
  if (query !== undefined) url.search = query
  if (fragment !== undefined) url.hash = fragment
  return url.toString()
}

function externalProtocol(href: string): string | null {
  const match = EXPLICIT_SCHEME.exec(href)
  return match ? match[0].toLowerCase() : null
}

export function isSafeKnowledgeHref(
  href: string,
  options: { allowMailto?: boolean } = {},
): boolean {
  const value = href.trim()
  if (!value || hasControlCharacter(value) || value.startsWith('//')) return false
  const protocol = externalProtocol(value)
  if (!protocol) return true
  if (protocol === 'mailto:' && options.allowMailto !== true) return false
  if (!EXTERNAL_PROTOCOLS.has(protocol)) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function defragmentKnowledgeHref(href: string): string {
  const value = href.trim()
  const hashIndex = value.indexOf('#')
  return hashIndex >= 0 ? value.slice(0, hashIndex) : value
}

export function applyKnowledgeLinkAuditTooltip(
  anchor: KnowledgeLinkTooltipAnchor,
  statusLabel: string,
  checkedAt?: string | null,
): void {
  let originalTitle = anchor.dataset.knowledgeOriginalTitle
  if (originalTitle === undefined) {
    originalTitle = anchor.getAttribute('title') ?? ''
    anchor.dataset.knowledgeOriginalTitle = originalTitle
  }
  const checked = checkedAt ? `，检查于 ${checkedAt}` : ''
  anchor.title = `${originalTitle ? `${originalTitle} · ` : ''}${statusLabel}${checked}`
}

export function resolveKnowledgeLink(
  href: string,
  source: KnowledgeLinkSource = {},
): KnowledgeLinkResolution {
  const originalHref = href.trim()
  if (!originalHref) return { kind: 'unresolved', originalHref, reason: 'empty-href' }
  if (hasControlCharacter(originalHref)) {
    return { kind: 'blocked', originalHref, reason: 'invalid-target' }
  }

  const protocol = externalProtocol(originalHref)
  if (protocol) {
    if (DANGEROUS_PROTOCOLS.has(protocol)) {
      return { kind: 'blocked', originalHref, reason: 'dangerous-scheme' }
    }
    if (!EXTERNAL_PROTOCOLS.has(protocol)) {
      return { kind: 'blocked', originalHref, reason: 'unsupported-scheme' }
    }
    try {
      const resolvedHref = new URL(originalHref).toString()
      return {
        kind: 'external',
        originalHref,
        resolvedHref,
        protocol: protocol as 'http:' | 'https:' | 'mailto:',
      }
    } catch {
      return { kind: 'blocked', originalHref, reason: 'invalid-target' }
    }
  }

  if (originalHref.startsWith('//')) {
    return { kind: 'unresolved', originalHref, reason: 'protocol-relative-url' }
  }

  const relative = splitRelativeHref(originalHref)
  if (!relative) return { kind: 'blocked', originalHref, reason: 'invalid-target' }
  const githubSource = resolveGitHubSource(source)
  const sourcePathValue = source.source_path?.trim() || githubSource?.sourcePath

  if (!relative.path) {
    return {
      kind: 'same-document',
      originalHref,
      resolvedHref: relative.suffix || originalHref,
      ...(sourcePathValue ? { sourcePath: sourcePathValue } : {}),
      ...optionalFields(relative.query, relative.fragment),
    }
  }

  if (!sourcePathValue) {
    return { kind: 'unresolved', originalHref, reason: 'missing-source-path' }
  }
  const normalizedSource = normalizeStoredSourcePath(sourcePathValue)
  if (!normalizedSource.path || normalizedSource.invalid || normalizedSource.escaped) {
    return { kind: 'unresolved', originalHref, reason: 'invalid-source-path' }
  }

  const sourceSegments = normalizedSource.path.split('/')
  const target = normalizePath(sourceSegments.slice(0, -1), relative.path)
  if (target.invalid) return { kind: 'blocked', originalHref, reason: 'invalid-target' }
  if (target.escaped) return { kind: 'blocked', originalHref, reason: 'path-escape' }
  if (!target.path) return { kind: 'unresolved', originalHref, reason: 'invalid-target' }

  if (target.path === normalizedSource.path) {
    return {
      kind: 'same-document',
      originalHref,
      resolvedHref: relative.suffix || originalHref,
      sourcePath: normalizedSource.path,
      ...optionalFields(relative.query, relative.fragment),
    }
  }

  const resolvedHref = `${target.path}${relative.suffix}`
  return {
    kind: 'corpus-document',
    originalHref,
    resolvedHref,
    corpusPath: target.path,
    ...(githubSource
      ? {
          externalUrl: buildGitHubBlobUrl(
            githubSource,
            target.path,
            relative.query,
            relative.fragment,
          ),
        }
      : {}),
    ...optionalFields(relative.query, relative.fragment),
  }
}
