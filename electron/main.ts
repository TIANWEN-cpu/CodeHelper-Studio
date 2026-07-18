import { app, BrowserWindow, shell, Menu, dialog, nativeImage } from 'electron'
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
import { registerExercisesIPC } from './ipc/exercises'
import { registerLessonsIPC } from './ipc/lessons'
import { registerReviewIPC } from './ipc/review'
import { registerHomeHandlers } from './ipc/home'
import { registerPetsIPC } from './ipc/pets'
import { registerResourcePackIPC } from './ipc/resourcePack'
import { registerLearningRecordsIPC } from './ipc/learningRecords'
import { registerEditorWorkspaceIPC } from './ipc/editorWorkspace'
import { registerAgentIPC } from './ipc/agent'
import { registerMaintenanceIPC } from './ipc/maintenance'
import { registerCapabilitiesIPC } from './ipc/capabilities'
import { closeDB, getDatabasePath } from './db/index'
import { logIpcStatsSummary, getIpcStats } from './utils/perfMonitor'
import { registerIpcHandler, rateLimitMiddleware } from './utils/middleware'
import { buildContentSecurityPolicy } from './utils/contentSecurityPolicy'
import { getPreloadScriptPath } from './utils/runtimePaths'
import { configureTestUserData } from './utils/testUserData'
import { WindowCloseFlushBroker } from './utils/windowCloseHandshake'
import { shouldShowBrowserWindow } from './utils/testWindowVisibility'
import { createMainWindowNavigationGuard } from './utils/navigationGuard'
import {
  resolvePackagedSmokeUserDataPath,
  runPackagedSmokeIfRequested,
} from './utils/packagedSmoke'
import { arch, release } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { randomUUID } from 'crypto'
import { acquireProcessLease, type ProcessLease } from './utils/processLease'

process.env.CODEHELPER_RECOVERY_BOOT_ID = randomUUID()

let appProcessLease: ProcessLease | null = null

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

app.setName('CodeHelper')
const packagedSmokeUserDataPath = resolvePackagedSmokeUserDataPath(app.isPackaged)
const configuredTestUserDataPath = configureTestUserData(app)
if (packagedSmokeUserDataPath && configuredTestUserDataPath !== packagedSmokeUserDataPath) {
  throw new Error('Packaged smoke failed to configure its isolated userData directory')
}
const closeFlushBroker = new WindowCloseFlushBroker()

async function flushAllRendererWindows() {
  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
  const results = await Promise.all(
    windows.map((window) =>
      closeFlushBroker.request(window.webContents.id, (payload) => {
        window.webContents.send('app-before-close', payload)
      }),
    ),
  )
  const failures = results.filter((result) => !result.ok)
  return failures.length === 0
    ? { ok: true }
    : {
        ok: false,
        error: failures.map((failure) => failure.error || 'Renderer flush failed').join('; '),
        recoveryAvailable: failures.every((failure) => failure.recoveryAvailable === true),
      }
}

function scheduleRendererReloadAfterPortableImport(): void {
  setTimeout(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue
      window.webContents.reload()
    }
  }, 750)
}

if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? 'com.codehelper.app' : 'com.codehelper.app.dev')
}

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

function getApplicationIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icons', 'icon.ico')
  }

  return join(__dirname, '../../resources/icons/icon.ico')
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

function getExpectedRendererUrl(): string {
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL']
  }
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}

const MAX_RENDERER_RECOVERY_ATTEMPTS = 3
const RENDERER_RECOVERY_STABLE_MS = 10_000

async function loadRenderer(
  mainWindow: BrowserWindow,
  rendererRecoveryReason?: string,
): Promise<void> {
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = new URL(process.env['ELECTRON_RENDERER_URL'])
    if (rendererRecoveryReason) {
      rendererUrl.searchParams.set('rendererRecovery', rendererRecoveryReason)
    }
    console.log('[STARTUP] Loading renderer from dev server:', rendererUrl.toString())
    await mainWindow.loadURL(rendererUrl.toString())
    return
  }

  const rendererPath = join(__dirname, '../renderer/index.html')
  console.log('[STARTUP] Loading renderer from file:', rendererPath)
  await mainWindow.loadFile(
    rendererPath,
    rendererRecoveryReason ? { query: { rendererRecovery: rendererRecoveryReason } } : undefined,
  )
}

interface CreateWindowOptions {
  rendererRecoveryReason?: string
  rendererRecoveryAttempts?: number
  bounds?: { x: number; y: number; width: number; height: number }
  maximized?: boolean
  fullScreen?: boolean
}

function createWindow(options: CreateWindowOptions = {}): BrowserWindow {
  startupLog('Window creation starting')
  const navigationGuard = createMainWindowNavigationGuard({
    expectedRendererUrl: getExpectedRendererUrl(),
    openExternal: (url) => shell.openExternal(url),
  })
  const preloadPath = getPreloadScriptPath(__dirname)
  const iconPath = getApplicationIconPath()
  const applicationIcon = nativeImage.createFromPath(iconPath)
  console.log('[STARTUP] Preload script path:', preloadPath)
  console.log(
    '[STARTUP] Application icon path:',
    iconPath,
    '| loaded:',
    !applicationIcon.isEmpty(),
    '| size:',
    applicationIcon.getSize(),
  )

  let mainWindow: BrowserWindow
  try {
    mainWindow = new BrowserWindow({
      ...(options.bounds ?? { width: 1200, height: 800 }),
      minWidth: 900,
      minHeight: 600,
      backgroundColor: '#1e1e2e',
      icon: applicationIcon,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        navigateOnDragDrop: false,
        webviewTag: false,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
      },
    })
    mainWindow.setIcon(applicationIcon)
    startupLog('BrowserWindow created')
  } catch (err) {
    startupError('BrowserWindow creation failed', err)
    throw err
  }

  let allowClose = false
  let closeInProgress = false
  let rendererReplacementStarted = false
  let rendererRecoveryAttempts = options.rendererRecoveryAttempts ?? 0
  let rendererStableTimer: ReturnType<typeof setTimeout> | null = null
  const rendererId = mainWindow.webContents.id
  mainWindow.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    if (closeInProgress) return
    closeInProgress = true
    void (async () => {
      const result = await closeFlushBroker.request(rendererId, (payload) => {
        mainWindow.webContents.send('app-before-close', payload)
      })
      if (mainWindow.isDestroyed()) return
      let shouldClose = result.ok
      if (!shouldClose) {
        const recoveryOnly = result.recoveryAvailable === true
        const response = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: recoveryOnly ? '内容仅保存在恢复区' : '仍有内容未保存',
          message: recoveryOnly ? '部分编辑内容尚未写入 SQLite。' : '部分编辑内容未能完成持久化。',
          detail: recoveryOnly
            ? `${result.error ?? '最新内容已保存在本地恢复区'}\n\n返回应用可继续重试；选择仍然关闭后，下次启动会尝试从恢复区恢复。`
            : `${result.error ?? '保存状态未知'}\n\n返回应用可继续处理；选择仍然关闭可能丢失仅存在内存中的内容。`,
          buttons: ['返回应用', '仍然关闭'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        shouldClose = response.response === 1
      }
      if (!shouldClose || mainWindow.isDestroyed()) return
      allowClose = true
      mainWindow.close()
    })().finally(() => {
      closeInProgress = false
    })
  })
  mainWindow.on('closed', () => {
    closeFlushBroker.cancelSender(rendererId)
    if (rendererStableTimer) clearTimeout(rendererStableTimer)
  })

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
    if (options.maximized) mainWindow.maximize()
    if (options.fullScreen) mainWindow.setFullScreen(true)
    if (shouldShowBrowserWindow()) mainWindow.show()
    else startupLog('E2E headless window remains hidden')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    startupLog('Renderer did-finish-load')
    if (rendererStableTimer) clearTimeout(rendererStableTimer)
    if (rendererRecoveryAttempts > 0) {
      rendererStableTimer = setTimeout(() => {
        rendererRecoveryAttempts = 0
        rendererStableTimer = null
      }, RENDERER_RECOVERY_STABLE_MS)
    }
    void runPackagedSmokeIfRequested(mainWindow, {
      isPackaged: app.isPackaged,
      version: app.getVersion(),
      executablePath: process.execPath,
      userDataPath: app.getPath('userData'),
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
    })
      .then((ran) => {
        if (!ran) return
        closeDB()
        if (!mainWindow.isDestroyed()) mainWindow.destroy()
        app.quit()
      })
      .catch((error) => {
        startupError('Packaged smoke failed before result capture', error)
        closeDB()
        if (!mainWindow.isDestroyed()) mainWindow.destroy()
        app.exit(1)
      })
  })

  // Forward renderer console to main process
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const prefix = ['VERBOSE', 'INFO', 'WARNING', 'ERROR'][level] || 'LOG'
    console.log(`[RENDERER ${prefix}] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      startupError('Renderer did-fail-load', { errorCode, errorDescription, validatedURL })
    },
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[ERROR] Renderer process gone:', details.reason, details.exitCode)
    closeFlushBroker.cancelSender(rendererId)
    if (
      details.reason === 'clean-exit' ||
      allowClose ||
      closeInProgress ||
      mainWindow.isDestroyed()
    ) {
      return
    }

    rendererRecoveryAttempts += 1
    if (rendererRecoveryAttempts <= MAX_RENDERER_RECOVERY_ATTEMPTS) {
      if (rendererReplacementStarted) return
      rendererReplacementStarted = true
      setImmediate(() => {
        if (mainWindow.isDestroyed()) return
        try {
          createWindow({
            rendererRecoveryReason: details.reason,
            rendererRecoveryAttempts,
            bounds: mainWindow.getBounds(),
            maximized: mainWindow.isMaximized(),
            fullScreen: mainWindow.isFullScreen(),
          })
          mainWindow.destroy()
        } catch (error) {
          rendererReplacementStarted = false
          startupError('Renderer recovery window creation failed', error)
        }
      })
      return
    }

    void dialog
      .showMessageBox(mainWindow, {
        type: 'error',
        title: '界面进程反复崩溃',
        message: 'CodeHelper 界面无法保持稳定运行。',
        detail: '最新编辑仍保留在本地恢复区。可以再重新加载一次，或关闭窗口后重新启动 CodeHelper。',
        buttons: ['重新加载', '关闭窗口'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (mainWindow.isDestroyed()) return
        if (response === 0) {
          try {
            createWindow({
              rendererRecoveryReason: details.reason,
              bounds: mainWindow.getBounds(),
              maximized: mainWindow.isMaximized(),
              fullScreen: mainWindow.isFullScreen(),
            })
            mainWindow.destroy()
          } catch (error) {
            startupError('Manual renderer recovery window creation failed', error)
          }
        } else {
          mainWindow.destroy()
        }
      })
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

  mainWindow.webContents.setWindowOpenHandler(navigationGuard.handleWindowOpen)
  mainWindow.webContents.on('will-navigate', navigationGuard.handleWillNavigate)
  mainWindow.webContents.on('will-redirect', navigationGuard.handleWillRedirect)

  void loadRenderer(mainWindow, options.rendererRecoveryReason).catch((error) =>
    startupError('Initial renderer load failed', error),
  )
  return mainWindow
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
    registerExportIPC({
      requestRendererFlush: flushAllRendererWindows,
      scheduleRendererReload: scheduleRendererReloadAfterPortableImport,
    })
    console.log('[IPC] Registered: export/import handlers')
  } catch (e) {
    startupError('registerExportIPC', e)
  }
  try {
    registerExercisesIPC()
    console.log('[IPC] Registered: exercises handlers')
  } catch (e) {
    startupError('registerExercisesIPC', e)
  }
  try {
    registerLessonsIPC()
    console.log('[IPC] Registered: lessons handlers')
  } catch (e) {
    startupError('registerLessonsIPC', e)
  }
  try {
    registerReviewIPC()
    console.log('[IPC] Registered: review handlers')
  } catch (e) {
    startupError('registerReviewIPC', e)
  }
  try {
    registerHomeHandlers()
    console.log('[IPC] Registered: home handlers')
  } catch (e) {
    startupError('registerHomeHandlers', e)
  }
  try {
    registerPetsIPC()
    console.log('[IPC] Registered: pets handlers')
  } catch (e) {
    startupError('registerPetsIPC', e)
  }
  try {
    registerResourcePackIPC()
    console.log('[IPC] Registered: resource pack handlers')
  } catch (e) {
    startupError('registerResourcePackIPC', e)
  }
  try {
    registerLearningRecordsIPC()
    console.log('[IPC] Registered: learning records handlers')
  } catch (e) {
    startupError('registerLearningRecordsIPC', e)
  }
  try {
    registerEditorWorkspaceIPC()
    console.log('[IPC] Registered: editor workspace handlers')
  } catch (e) {
    startupError('registerEditorWorkspaceIPC', e)
  }
  startupLog('All deferred IPC handlers registered')
}

app
  .whenReady()
  .then(() => {
    startupLog('app.whenReady fired')
    console.log('[STARTUP] userData path:', app.getPath('userData'))
    appProcessLease = acquireProcessLease(getDatabasePath(), 'app')
    startupLog('Process lease acquired')

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
    try {
      registerAgentIPC()
      console.log('[IPC] Registered: Agent handlers')
    } catch (e) {
      startupError('registerAgentIPC', e)
    }

    // Platform information endpoint for renderer
    registerIpcHandler('platform-info', () => getPlatformInfo())
    console.log('[IPC] Registered: platform-info')

    registerIpcHandler('app-close-flush-complete', (event, payload) => ({
      accepted: closeFlushBroker.resolve(event.sender.id, payload),
    }))
    console.log('[IPC] Registered: app close flush handshake')

    try {
      registerMaintenanceIPC({ requestRendererFlush: flushAllRendererWindows })
      console.log('[IPC] Registered: maintenance handlers')
    } catch (e) {
      startupError('registerMaintenanceIPC', e)
    }
    try {
      registerCapabilitiesIPC()
      console.log('[IPC] Registered: system capabilities handler')
    } catch (e) {
      startupError('registerCapabilitiesIPC', e)
    }

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
    appProcessLease?.release()
    appProcessLease = null
    app.quit()
  })

app.on('window-all-closed', () => {
  console.log('[STARTUP] All windows closed, platform:', process.platform)
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  // `will-quit` runs after BrowserWindow close handshakes, so the renderer's
  // final editor/draft IPC writes complete before SQLite checkpoints and closes.
  closeDB()
  appProcessLease?.release()
  appProcessLease = null
})
