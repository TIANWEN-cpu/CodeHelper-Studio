import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { registerRunnerIPC } from './ipc/runner'
import { registerDatabaseIPC } from './ipc/database'
import { registerAIIPC } from './ipc/ai'
import { registerProblemsIPC } from './ipc/problems'
import { registerMistakesIPC } from './ipc/mistakes'
import { registerRAGIPC } from './ipc/rag'
import { registerChatIPC } from './ipc/chat'

function setupApplicationMenu() {
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
            void shell.openExternal('https://github.com')
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
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Right-click context menu
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []

    if (params.isEditable || params.selectionText) {
      if (params.selectionText) {
        menuItems.push({ label: '复制', role: 'copy' })
      }
      if (params.isEditable) {
        menuItems.push({ label: '粘贴', role: 'paste' })
        menuItems.push({ label: '剪切', role: 'cut' })
      }
      if (params.selectionText) {
        menuItems.push({ label: '全选', role: 'selectAll' })
      }
    } else {
      menuItems.push({ label: '全选', role: 'selectAll' })
      menuItems.push({ label: '复制', role: 'copy' })
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow })
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  setupApplicationMenu()
  ipcMain.handle('open-external', (_event, url: string) => {
    if (typeof url !== 'string' || !url.trim()) throw new Error('参数无效: url')
    url = url.trim().slice(0, 2000)
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('仅支持 http/https 链接')
    return shell.openExternal(url)
  })
  registerRunnerIPC()
  registerDatabaseIPC()
  registerAIIPC()
  registerProblemsIPC()
  registerMistakesIPC()
  registerRAGIPC()
  registerChatIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
