import { contextBridge, ipcRenderer } from 'electron'

console.log('[STARTUP] Preload script executing...')

const allowedInvokeChannels = new Set([
  'run-code',
  'db-get-setting',
  'db-set-setting',
  'db-get-ai-configs',
  'db-save-ai-config',
  'db-delete-ai-config',
  'db-get-default-ai-config',
  'ai-fetch-models',
  'ai-chat',
  'problems-list',
  'problems-get',
  'problems-submit',
  'problems-submissions',
  'mistakes-list',
  'mistakes-get',
  'mistakes-update-analysis',
  'mistakes-delete',
  'knowledge-upload',
  'knowledge-list',
  'knowledge-delete',
  'knowledge-search',
  // Advanced knowledge features
  'knowledge-semantic-search',
  'knowledge-summarize',
  'knowledge-concept-graph',
  'knowledge-concept-detail',
  'knowledge-auto-tag',
  'knowledge-tags',
  'knowledge-tag-documents',
  'knowledge-rag-context',
  'open-external',
  'chat-sessions-list',
  'chat-session-create',
  'chat-session-update',
  'chat-session-delete',
  'chat-messages-load',
  'chat-message-save',
  'chat-presets-list',
  'chat-preset-save',
  'chat-preset-delete',
  'chat-memories-list',
  'chat-memory-save',
  'chat-memory-delete',
  'chat-memory-capture',
  'platform-info',
  // Analytics
  'analytics-track',
  'analytics-get-events',
  'analytics-get-summary',
  'analytics-get-streak',
  'analytics-get-weekly-report',
  'analytics-clear',
  // Demo data
  'demo-load-data',
  // Export/Import
  'export-data',
  'export-data-to-path',
  'import-data',
  'import-data-from-path',
  'export-get-counts',
  // Performance
  'perf-get-ipc-stats',
  // Lessons
  'lessons-list',
  'lessons-get',
  'lessons-progress',
  'lessons-mark-opened',
  'lessons-mark-completed',
  'lessons-notes-get',
  'lessons-notes-save',
  'lessons-search',
  'lesson-get-progress',
  // Achievements
  'achievements-list',
  'achievements-check',
  'achievements-seed',
  // Review (spaced repetition)
  'review-due',
  'review-update',
  'review-stats',
  'review-schedule',
  // Home overview
  'home-get-overview',
  // Exercises
  'exercises-list',
  'exercises-get',
  'exercises-draft-get',
  'exercises-draft-save',
  'exercises-draft-clear',
  'exercises-evaluate',
  // Codex Pet desktop companions
  'pets-list',
  'pets-install-slug',
  'pets-import-file',
  'pets-import-directory',
  // Import-ready external learning resource packs
  'resource-pack-import',
  // Learning records
  'learning-records-clear',
])

const allowedEventChannels = new Set(['ai-chat-chunk', 'ai-chat-done'])

function isSerializable(value: unknown, depth = 0): boolean {
  if (depth > 10) return false
  if (value === null || value === undefined) return true
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (t === 'function' || t === 'symbol' || t === 'bigint') return false
  if (Array.isArray(value)) return value.every((v) => isSerializable(v, depth + 1))
  if (t === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.constructor && obj.constructor !== Object && obj.constructor !== Array) return false
    return Object.values(obj).every((v) => isSerializable(v, depth + 1))
  }
  return false
}

const api = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (typeof channel !== 'string') {
      const err = 'IPC channel 必须是字符串'
      console.error('[IPC][ERROR] Preload invoke rejected:', err)
      throw new Error(err)
    }
    if (!allowedInvokeChannels.has(channel)) {
      const err = `不允许的 IPC 调用: ${channel}`
      console.error('[IPC][ERROR] Preload invoke rejected:', err)
      throw new Error(err)
    }
    if (!args.every((a) => isSerializable(a))) {
      const err = 'IPC 参数包含不可序列化的值'
      console.error(`[IPC][ERROR] Preload invoke rejected for "${channel}":`, err)
      throw new Error(err)
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (typeof channel !== 'string') {
      const err = 'IPC channel 必须是字符串'
      console.error('[IPC][ERROR] Preload on() rejected:', err)
      throw new Error(err)
    }
    if (!allowedEventChannels.has(channel)) {
      const err = `不允许的 IPC 事件监听: ${channel}`
      console.error('[IPC][ERROR] Preload on() rejected:', err)
      throw new Error(err)
    }
    if (typeof callback !== 'function') {
      const err = 'IPC 事件回调必须是函数'
      console.error(`[IPC][ERROR] Preload on("${channel}") rejected:`, err)
      throw new Error(err)
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
}

contextBridge.exposeInMainWorld('api', api)
console.log(
  `[STARTUP] Preload complete — exposed ${allowedInvokeChannels.size} invoke channels, ${allowedEventChannels.size} event channels`,
)
