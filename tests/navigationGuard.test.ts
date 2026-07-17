import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  createMainWindowNavigationGuard,
  type NavigationEventLike,
} from '../electron/utils/navigationGuard'

function createNavigationEvent(url: string, isMainFrame = true) {
  const preventDefault = vi.fn()
  return {
    event: { url, isMainFrame, preventDefault } satisfies NavigationEventLike,
    preventDefault,
  }
}

function createGuard(expectedRendererUrl = 'http://127.0.0.1:5173/') {
  const openExternal = vi.fn(() => Promise.resolve())
  const warn = vi.fn()
  return {
    guard: createMainWindowNavigationGuard({ expectedRendererUrl, openExternal, warn }),
    openExternal,
    warn,
  }
}

describe('main-window navigation guard', () => {
  it('allows the expected renderer document in development and packaged builds', () => {
    const dev = createGuard()
    const devNavigation = createNavigationEvent(
      'http://127.0.0.1:5173/?rendererRecovery=crashed#workspace',
    )

    dev.guard.handleWillNavigate(devNavigation.event)

    expect(devNavigation.preventDefault).not.toHaveBeenCalled()
    expect(dev.openExternal).not.toHaveBeenCalled()

    const packagedUrl = pathToFileURL(resolve('out/renderer/index.html')).toString()
    const packaged = createGuard(packagedUrl)
    const packagedNavigation = createNavigationEvent(`${packagedUrl}?rendererRecovery=crashed`)

    packaged.guard.handleWillNavigate(packagedNavigation.event)

    expect(packagedNavigation.preventDefault).not.toHaveBeenCalled()
    expect(packaged.openExternal).not.toHaveBeenCalled()
  })

  it('blocks a same-window external link and opens it in the system browser', () => {
    const { guard, openExternal } = createGuard()
    const navigation = createNavigationEvent('https://example.com/docs?q=electron')

    guard.handleWillNavigate(navigation.event)

    expect(navigation.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs?q=electron')
  })

  it('blocks an external redirect and opens its target in the system browser', () => {
    const { guard, openExternal } = createGuard()
    const redirect = createNavigationEvent('http://example.com/redirected')

    guard.handleWillRedirect(redirect.event)

    expect(redirect.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledWith('http://example.com/redirected')
  })

  it.each([
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'file:///tmp/another-renderer.html',
    'file:///tmp/%2Fmalformed-renderer.html',
    'ftp://example.com/archive.zip',
    'not a url',
  ])('fails closed for an illegal top-level target: %s', (targetUrl) => {
    const { guard, openExternal, warn } = createGuard()
    const navigation = createNavigationEvent(targetUrl)

    guard.handleWillNavigate(navigation.event)

    expect(navigation.preventDefault).toHaveBeenCalledOnce()
    expect(openExternal).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('denies every new window and only forwards validated HTTP(S) targets', () => {
    const { guard, openExternal } = createGuard()

    expect(guard.handleWindowOpen({ url: 'https://example.com/' })).toEqual({ action: 'deny' })
    expect(guard.handleWindowOpen({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledOnce()
    expect(openExternal).toHaveBeenCalledWith('https://example.com/')
  })

  it('does not treat subframe redirects as top-level navigation', () => {
    const { guard, openExternal } = createGuard()
    const redirect = createNavigationEvent('https://example.com/embedded', false)

    guard.handleWillRedirect(redirect.event)

    expect(redirect.preventDefault).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('rejects a non-local configured renderer URL', () => {
    expect(() => createGuard('https://example.com/app')).toThrow(
      'Renderer URL must use a local file or loopback HTTP(S) address',
    )
  })
})
