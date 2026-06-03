import { app, BrowserWindow, shell, Menu, dialog } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { registerRunnerIPC } from './ipc/runner'
import { registerDatabaseIPC } from './ipc/database'
import { registerAIIPC } from './ipc/ai'
import { registerProblemsIPC } from './ipc/problems'
import { registerMistakesIPC } from './ipc/mistakes'
import { registerRAGIPC } from './ipc/rag'
import { registerChatIPC } from './ipc/chat'
import { registerAnalyticsIPC } from './ipc/analytics'
import { registerDemoDataIPC } from './ipc/demoData'
import { registerExportIPC } from './ipc/export'
import { logIpcStatsSummary, getIpcStats } from './utils/perfMonitor'
import { registerIpcHandler, rateLimitMiddleware } from './utils/middleware'
import { buildContentSecurityPolicy } from './utils/contentSecurityPolicy'
import { getPreloadScriptPath } from './utils/runtimePaths'
import { arch, release } from 'os'

// ---------------------------------------------------------------------------
// Diagnostic startup timer
// ---------------------------------------------------------------------------
const startupBegin = Date.now()
function startupLog(phase: string): void {
  const elapsed = Date.now() - startupBegin
  console.log(`[STARTUP] ${phase} (+${elapsed}ms)`)
}
function startupError(phase: string, err: unknown): void {
  const elapsed = Date.now() - startupBegin
  console.error(`[STARTUP][ERROR] ${phase} (+${elapsed}ms):`, err)
}

startupLog('Main process starting — pid: ' + process.pid)
console.log(
  '[STARTUP] Electron:',
  process.versions.electron,
  '| Chrome:',
  process.versions.chrome,
  '| Node:',
  process.versions.node,
)
console.log('[STARTUP] Platform:', process.platform, '| Arch:', arch(), '| OS release:', release())
console.log('[STARTUP] app.isPackaged:', app.isPackaged)
console.log('[STARTUP] CWD:', process.cwd())
console.log('[STARTUP] __dirname:', __dirname)

// ---------------------------------------------------------------------------
// Global error handlers — prevent silent crashes in the main process
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason) => {
  console.error('[ERROR] Unhandled promise rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[ERROR] Uncaught exception:', error)
})

let REPO_URL = 'https://github.com/TIANWEN-cpu/CodeHelper'
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
    repository?: { url?: string }
  }
  REPO_URL = pkg.repository?.url?.replace(/\.git$/, '') ?? REPO_URL
  console.log(
    '[STARTUP] package.json loaded, version:',
    (pkg as Record<string, unknown>).version ?? 'unknown',
  )
} catch (err) {
  console.error('[STARTUP][ERROR] Failed to read package.json:', err)
}

/** Get a human-readable platform name. */
function getPlatformDisplayName(): string {
  switch (process.platform) {
    case 'win32':
      return 'Windows'
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return process.platform
  }
}

/** Build platform info object for IPC and about dialog. */
function getPlatformInfo(): {
  platform: string
  arch: string
  osVersion: string
  electronVersion: string
  appVersion: string
  chromeVersion: string
  nodeVersion: string
} {
  return {
    platform: getPlatformDisplayName(),
    arch: arch(),
    osVersion: release(),
    electronVersion: process.versions.electron ?? '',
    appVersion: app.getVersion(),
    chromeVersion: process.versions.chrome ?? '',
    nodeVersion: process.versions.node ?? '',
  }
}

function setupApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '新建窗口', click: () => createWindow() },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换开发者工具', role: 'toggleDevTools' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 CodeHelper',
          click: () => {
            const info = getPlatformInfo()
            dialog.showMessageBox({
              type: 'info',
              title: '关于 CodeHelper',
              message: 'CodeHelper',
              detail: [
                `版本: ${info.appVersion}`,
                `平台: ${info.platform} (${info.arch})`,
                `系统版本: ${info.osVersion}`,
                `Electron: ${info.electronVersion}`,
                `Chrome: ${info.chromeVersion}`,
                `Node.js: ${info.nodeVersion}`,
                '',
                'AI 驱动的桌面编程助手',
                REPO_URL,
              ].join('\n'),
            })
          },
        },
        {
          label: 'GitHub 主页',
          click: () => {
            void shell.openExternal(REPO_URL)
          },
        },
      ],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { label: `关于 ${app.name}`, role: 'about' },
        { type: 'separator' },
        { label: '隐藏', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindowContextMenu(
  mainWindow: BrowserWindow,
  params: Electron.ContextMenuParams,
): void {
  const menuItems: Electron.MenuItemConstructorOptions[] = []

  if (params.selectionText) {
    menuItems.push({ label: '复制', role: 'copy' })
  }
  if (params.isEditable) {
    menuItems.push({ label: '粘贴', role: 'paste' })
    menuItems.push({ label: '剪切', role: 'cut' })
  }
  if (params.selectionText || params.isEditable) {
    menuItems.push({ label: '全选', role: 'selectAll' })
  }
  if (!params.selectionText && !params.isEditable) {
    menuItems.push({ label: '全选', role: 'selectAll' })
    menuItems.push({ label: '复制', role: 'copy' })
  }

  if (menuItems.length > 0) {
    Menu.buildFromTemplate(menuItems).popup({ window: mainWindow })
  }
}

function createWindow(): void {
  startupLog('Window creation starting')
  const preloadPath = getPreloadScriptPath(__dirname)
  console.log('[STARTUP] Preload script path:', preloadPath)

  let mainWindow: BrowserWindow
  try {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: '#1e1e2e',
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        navigateOnDragDrop: false,
      },
    })
    startupLog('BrowserWindow created')
  } catch (err) {
    startupError('BrowserWindow creation failed', err)
    throw err
  }

  // Content-Security-Policy: prevent XSS via inline script execution
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          buildContentSecurityPolicy({
            isPackaged: app.isPackaged,
            rendererUrl: process.env['ELECTRON_RENDERER_URL'],
          }),
        ],
      },
    })
  })

  mainWindow.on('ready-to-show', () => {
    startupLog('Window ready-to-show — displaying window')
    mainWindow.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    startupLog('Renderer did-finish-load')
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      startupError('Renderer did-fail-load', { errorCode, errorDescription, validatedURL })
    },
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[ERROR] Renderer process gone:', details.reason, details.exitCode)
  })

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[ERROR] Window became unresponsive')
  })

  mainWindow.webContents.on('responsive', () => {
    console.log('[STARTUP] Window became responsive again')
  })

  mainWindow.webContents.on('context-menu', (_event, params) => {
    createWindowContextMenu(mainWindow, params)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(details.url)
      } else {
        console.warn(
          `[security] Blocked navigation to disallowed protocol: ${parsed.protocol} (${details.url})`,
        )
      }
    } catch {
      console.warn(`[security] Blocked navigation to invalid URL: ${details.url}`)
    }
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    console.log('[STARTUP] Loading renderer from dev server:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    console.log('[STARTUP] Loading renderer from file:', rendererPath)
    mainWindow.loadFile(rendererPath)
  }
}

/** Log memory usage and warn if heap exceeds 512 MB. */
function logMemoryUsage(): void {
  const mem = process.memoryUsage()
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1)
  const rssMB = (mem.rss / 1024 / 1024).toFixed(1)
  console.debug(`[memory] Heap: ${heapMB} MB, RSS: ${rssMB} MB`)
  if (mem.heapUsed > 512 * 1024 * 1024) {
    console.warn(`[memory] HIGH MEMORY USAGE ALERT: Heap at ${heapMB} MB`)
  }
}

function registerPeriodicDiagnostics(): void {
  setInterval(() => logIpcStatsSummary(), 5 * 60 * 1000)
  setInterval(() => logMemoryUsage(), 2 * 60 * 1000)
}

function registerDeferredIPC(): void {
  startupLog('Registering deferred IPC handlers...')
  try {
    registerMistakesIPC()
    console.log('[IPC] Registered: mistakes handlers')
  } catch (e) {
    startupError('registerMistakesIPC', e)
  }
  try {
    registerChatIPC()
    console.log('[IPC] Registered: chat handlers')
  } catch (e) {
    startupError('registerChatIPC', e)
  }
  try {
    registerRAGIPC()
    console.log('[IPC] Registered: RAG/knowledge handlers')
  } catch (e) {
    startupError('registerRAGIPC', e)
  }
  try {
    registerAnalyticsIPC()
    console.log('[IPC] Registered: analytics handlers')
  } catch (e) {
    startupError('registerAnalyticsIPC', e)
  }
  try {
    registerDemoDataIPC()
    console.log('[IPC] Registered: demo data handlers')
  } catch (e) {
    startupError('registerDemoDataIPC', e)
  }
  try {
    registerExportIPC()
    console.log('[IPC] Registered: export/import handlers')
  } catch (e) {
    startupError('registerExportIPC', e)
  }
  startupLog('All deferred IPC handlers registered')
}

app
  .whenReady()
  .then(() => {
    startupLog('app.whenReady fired')
    console.log('[STARTUP] userData path:', app.getPath('userData'))

    startupLog('Setting up application menu...')
    setupApplicationMenu()
    startupLog('Application menu set up')

    // Register high-risk IPC with middleware stack
    startupLog('Registering critical IPC handlers...')
    registerIpcHandler(
      'open-external',
      (_event, url: unknown) => {
        if (typeof url !== 'string' || !url.trim()) throw new Error('参数无效: url')
        url = url.trim().slice(0, 2000)
        const parsed = new URL(url as string)
        if (!['http:', 'https:'].includes(parsed.protocol))
          throw new Error('仅支持 http/https 链接')
        return shell.openExternal(url as string)
      },
      [rateLimitMiddleware({ maxCalls: 20, windowMs: 10_000 })],
    )
    console.log('[IPC] Registered: open-external')

    // Critical IPC: needed for initial render (theme, problem list)
    try {
      registerDatabaseIPC()
      console.log('[IPC] Registered: database handlers')
    } catch (e) {
      startupError('registerDatabaseIPC', e)
    }
    try {
      registerProblemsIPC()
      console.log('[IPC] Registered: problems handlers')
    } catch (e) {
      startupError('registerProblemsIPC', e)
    }
    try {
      registerRunnerIPC()
      console.log('[IPC] Registered: runner handlers')
    } catch (e) {
      startupError('registerRunnerIPC', e)
    }
    try {
      registerAIIPC()
      console.log('[IPC] Registered: AI handlers')
    } catch (e) {
      startupError('registerAIIPC', e)
    }

    // Platform information endpoint for renderer
    registerIpcHandler('platform-info', () => getPlatformInfo())
    console.log('[IPC] Registered: platform-info')

    // Register ALL IPC handlers synchronously before creating the window.
    // Using setImmediate() here creates a race condition: the deferred handlers
    // (RAG, chat, mistakes, analytics, demoData, export) would be registered in
    // the next event-loop tick, but createWindow() calls loadURL() synchronously.
    // While Electron's internal scheduling usually means the renderer JS hasn't
    // executed by then, this is fragile — a slow loadURL or fast renderer
    // hydration could cause "No handler registered" errors.
    startupLog('Registering deferred IPC (non-critical)...')
    registerDeferredIPC()

    startupLog('Starting periodic diagnostics...')
    registerPeriodicDiagnostics()

    // IPC stats endpoint for renderer diagnostics (with middleware)
    registerIpcHandler('perf-get-ipc-stats', () => getIpcStats())
    console.log('[IPC] Registered: perf-get-ipc-stats')

    startupLog('All IPC handlers registered — creating window...')
    createWindow()
    startupLog('createWindow() returned')

    app.on('activate', () => {
      console.log('[STARTUP] app activate event — windows:', BrowserWindow.getAllWindows().length)
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((err) => {
    startupError('app.whenReady() rejected', err)
  })

app.on('window-all-closed', () => {
  console.log('[STARTUP] All windows closed, platform:', process.platform)
  if (process.platform !== 'darwin') app.quit()
})
