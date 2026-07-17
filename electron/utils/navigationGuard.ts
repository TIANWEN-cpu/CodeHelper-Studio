import { fileURLToPath } from 'node:url'
import { isIP } from 'node:net'
import { resolve } from 'node:path'

const MAX_EXTERNAL_URL_LENGTH = 2_000

export interface NavigationEventLike {
  readonly isMainFrame?: boolean
  readonly url?: string
  preventDefault(): void
}

export interface MainWindowNavigationGuardOptions {
  expectedRendererUrl: string
  openExternal(url: string): Promise<unknown> | unknown
  warn?(message: string, error?: unknown): void
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (host === 'localhost' || host === '::1') return true
  if (isIP(host) !== 4) return false
  return Number(host.split('.')[0]) === 127
}

function normalizedFilePath(url: URL): string {
  const filePath = resolve(fileURLToPath(url))
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath
}

function assertExpectedRendererUrl(expectedRendererUrl: string): URL {
  const parsed = new URL(expectedRendererUrl)
  if (parsed.protocol === 'file:') return parsed
  if (
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    isLoopbackHost(parsed.hostname)
  ) {
    return parsed
  }
  throw new Error('Renderer URL must use a local file or loopback HTTP(S) address')
}

function isExpectedRendererNavigation(target: URL, expected: URL): boolean {
  if (expected.protocol === 'file:') {
    return (
      target.protocol === 'file:' && normalizedFilePath(target) === normalizedFilePath(expected)
    )
  }

  if (target.protocol !== expected.protocol) return false
  const normalizedTarget = new URL(target)
  const normalizedExpected = new URL(expected)
  normalizedTarget.search = ''
  normalizedTarget.hash = ''
  normalizedExpected.search = ''
  normalizedExpected.hash = ''
  return normalizedTarget.toString() === normalizedExpected.toString()
}

type NavigationDecision =
  | { action: 'allow-renderer' }
  | { action: 'open-external'; url: string }
  | { action: 'deny' }

function classifyNavigation(targetUrl: string, expectedRendererUrl: URL): NavigationDecision {
  if (!targetUrl || targetUrl.length > MAX_EXTERNAL_URL_LENGTH) return { action: 'deny' }

  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return { action: 'deny' }
  }

  try {
    if (isExpectedRendererNavigation(parsed, expectedRendererUrl)) {
      return { action: 'allow-renderer' }
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { action: 'open-external', url: parsed.toString() }
    }
  } catch {
    return { action: 'deny' }
  }
  return { action: 'deny' }
}

export function createMainWindowNavigationGuard(options: MainWindowNavigationGuardOptions) {
  const expectedRendererUrl = assertExpectedRendererUrl(options.expectedRendererUrl)
  const warn =
    options.warn ??
    ((message: string, error?: unknown) => {
      if (error === undefined) console.warn(message)
      else console.warn(message, error)
    })

  const openExternal = (url: string, source: string) => {
    try {
      void Promise.resolve(options.openExternal(url)).catch((error) => {
        warn(`[security] Failed to open external ${source}: ${url}`, error)
      })
    } catch (error) {
      warn(`[security] Failed to open external ${source}: ${url}`, error)
    }
  }

  const handleTopLevelNavigation = (
    source: 'navigation' | 'redirect',
    event: NavigationEventLike,
    legacyTargetUrl?: string,
  ) => {
    if (event.isMainFrame === false) return
    const targetUrl = event.url ?? legacyTargetUrl ?? ''
    const decision = classifyNavigation(targetUrl, expectedRendererUrl)
    if (decision.action === 'allow-renderer') return

    event.preventDefault()
    if (decision.action === 'open-external') {
      openExternal(decision.url, source)
      return
    }
    warn(`[security] Blocked main-window ${source}: ${targetUrl || '<missing URL>'}`)
  }

  return {
    handleWillNavigate: (event: NavigationEventLike, legacyTargetUrl?: string) =>
      handleTopLevelNavigation('navigation', event, legacyTargetUrl),
    handleWillRedirect: (event: NavigationEventLike, legacyTargetUrl?: string) =>
      handleTopLevelNavigation('redirect', event, legacyTargetUrl),
    handleWindowOpen: (details: { url: string }) => {
      const decision = classifyNavigation(details.url, expectedRendererUrl)
      if (decision.action === 'open-external') {
        openExternal(decision.url, 'new-window link')
      } else {
        warn(`[security] Blocked new-window navigation: ${details.url || '<missing URL>'}`)
      }
      return { action: 'deny' as const }
    },
  }
}
