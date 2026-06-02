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
import { arch, release } from 'os'

// ---------------------------------------------------------------------------
// Global error handlers — prevent silent crashes in the main process
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled promise rejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[main] Uncaught exception:', error)
})

const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  repository?: { url?: string }
}
const REPO_URL =
  pkg.repository?.url?.replace(/\.git$/, '') ?? 'https://github.com/TIANWEN-cpu/CodeHelper'

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
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e2e',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      navigateOnDragDrop: false,
    },
  })

  // Content-Security-Policy: prevent XSS via inline script execution
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data https:; connect-src 'self' https:; font-src 'self' data:;",
        ],
      },
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
  registerMistakesIPC()
  registerChatIPC()
  registerRAGIPC()
  registerAnalyticsIPC()
  registerDemoDataIPC()
  registerExportIPC()
}

app.whenReady().then(() => {
  setupApplicationMenu()

  // Register high-risk IPC with middleware stack
  registerIpcHandler(
    'open-external',
    (_event, url: unknown) => {
      if (typeof url !== 'string' || !url.trim()) throw new Error('参数无效: url')
      url = url.trim().slice(0, 2000)
      const parsed = new URL(url as string)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('仅支持 http/https 链接')
      return shell.openExternal(url as string)
    },
    [rateLimitMiddleware({ maxCalls: 20, windowMs: 10_000 })],
  )

  // Critical IPC: needed for initial render (theme, problem list)
  registerDatabaseIPC()
  registerProblemsIPC()
  registerRunnerIPC()
  registerAIIPC()

  // Platform information endpoint for renderer
  registerIpcHandler('platform-info', () => getPlatformInfo())

  // Defer non-critical IPC registrations to reduce time to first paint
  setImmediate(() => registerDeferredIPC())

  registerPeriodicDiagnostics()

  // IPC stats endpoint for renderer diagnostics (with middleware)
  registerIpcHandler('perf-get-ipc-stats', () => getIpcStats())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
