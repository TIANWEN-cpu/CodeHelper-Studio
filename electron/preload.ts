import { contextBridge, ipcRenderer } from 'electron'

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
      throw new Error('IPC channel 必须是字符串')
    }
    if (!allowedInvokeChannels.has(channel)) {
      throw new Error(`不允许的 IPC 调用: ${channel}`)
    }
    if (!args.every((a) => isSerializable(a))) {
      throw new Error('IPC 参数包含不可序列化的值')
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (typeof channel !== 'string') {
      throw new Error('IPC channel 必须是字符串')
    }
    if (!allowedEventChannels.has(channel)) {
      throw new Error(`不允许的 IPC 事件监听: ${channel}`)
    }
    if (typeof callback !== 'function') {
      throw new Error('IPC 事件回调必须是函数')
    }
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
}

contextBridge.exposeInMainWorld('api', api)
