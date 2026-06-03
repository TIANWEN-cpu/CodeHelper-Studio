import { describe, expect, it } from 'vitest'

import { buildContentSecurityPolicy } from '../electron/utils/contentSecurityPolicy'
import { getPreloadScriptPath } from '../electron/utils/runtimePaths'

describe('Electron startup configuration', () => {
  it('points BrowserWindow preload at the JavaScript file emitted by electron-vite', () => {
    const preloadPath = getPreloadScriptPath('D:/codehelper/out/main')

    expect(preloadPath.replace(/\\/g, '/')).toBe('D:/codehelper/out/preload/index.js')
    expect(preloadPath).not.toContain('index.mjs')
  })

  it('keeps production CSP strict for packaged renderer files', () => {
    const csp = buildContentSecurityPolicy({ isPackaged: true })

    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("connect-src 'self' https:")
    expect(csp).not.toContain('ws://localhost:*')
  })

  it('allows Vite dev server scripts and HMR websocket in development', () => {
    const csp = buildContentSecurityPolicy({
      isPackaged: false,
      rendererUrl: 'http://localhost:5173/',
    })

    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).toContain('http://localhost:*')
    expect(csp).toContain('ws://localhost:*')
    expect(csp).toContain('http://127.0.0.1:*')
    expect(csp).toContain('ws://127.0.0.1:*')
  })
})
