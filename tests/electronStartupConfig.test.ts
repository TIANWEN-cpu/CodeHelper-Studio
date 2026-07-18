import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { buildContentSecurityPolicy } from '../electron/utils/contentSecurityPolicy'
import { getPreloadScriptPath } from '../electron/utils/runtimePaths'

describe('Electron startup configuration', () => {
  const mainSource = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
  const ragSource = readFileSync(new URL('../electron/ipc/rag.ts', import.meta.url), 'utf8')

  it('points BrowserWindow preload at the JavaScript file emitted by electron-vite', () => {
    const preloadPath = getPreloadScriptPath('D:/codehelper/out/main')

    expect(preloadPath.replace(/\\/g, '/')).toBe('D:/codehelper/out/preload/index.js')
    expect(preloadPath).not.toContain('index.mjs')
  })

  it('pins security-sensitive BrowserWindow defaults explicitly', () => {
    expect(mainSource).toContain('contextIsolation: true')
    expect(mainSource).toContain('nodeIntegration: false')
    expect(mainSource).toContain('sandbox: true')
    expect(mainSource).toContain('webSecurity: true')
    expect(mainSource).toContain('navigateOnDragDrop: false')
    expect(mainSource).toContain('webviewTag: false')
    expect(mainSource).toContain('allowRunningInsecureContent: false')
    expect(mainSource).toContain('experimentalFeatures: false')
  })

  it('keeps production CSP strict for packaged renderer files', () => {
    const csp = buildContentSecurityPolicy({ isPackaged: true })

    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
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
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain('http://localhost:*')
    expect(csp).toContain('ws://localhost:*')
    expect(csp).toContain('http://127.0.0.1:*')
    expect(csp).toContain('ws://127.0.0.1:*')
  })

  it('closes SQLite at will-quit after renderer close handshakes can flush', () => {
    expect(mainSource).toContain("import { closeDB, getDatabasePath } from './db/index'")
    expect(mainSource).toMatch(/app\.on\('will-quit',[\s\S]*?closeDB\(\)/)
    expect(mainSource).not.toMatch(/app\.on\('before-quit',[\s\S]*?closeDB\(\)/)
  })

  it('acquires the database process lease before registering database IPC', () => {
    expect(mainSource).toContain(
      "import { acquireProcessLease, type ProcessLease } from './utils/processLease'",
    )
    expect(mainSource.indexOf("acquireProcessLease(getDatabasePath(), 'app')")).toBeLessThan(
      mainSource.indexOf('registerDatabaseIPC()'),
    )
    expect(mainSource).toMatch(
      /app\.on\('will-quit',[\s\S]*?closeDB\(\)[\s\S]*?appProcessLease\?\.release\(\)/,
    )
  })

  it('does not open the database while the RAG module is being evaluated', () => {
    expect(ragSource).not.toMatch(/^ensureKnowledgeDBInit\(\)$/m)
    expect(ragSource).toMatch(
      /async function getDBWithTimeout\(\)[\s\S]*?ensureKnowledgeDBInit\(\)/,
    )
  })

  it('fails closed for both main-window navigation and redirects', () => {
    expect(mainSource).toContain(
      "import { createMainWindowNavigationGuard } from './utils/navigationGuard'",
    )
    expect(mainSource).toContain('const navigationGuard = createMainWindowNavigationGuard({')
    expect(mainSource).toContain(
      "mainWindow.webContents.on('will-navigate', navigationGuard.handleWillNavigate)",
    )
    expect(mainSource).toContain(
      "mainWindow.webContents.on('will-redirect', navigationGuard.handleWillRedirect)",
    )
    expect(mainSource).toContain(
      'mainWindow.webContents.setWindowOpenHandler(navigationGuard.handleWindowOpen)',
    )
  })
})
