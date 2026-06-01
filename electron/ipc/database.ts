import { ipcMain, safeStorage } from 'electron'
import { getDB } from '../db/index'

function encryptApiKey(apiKey: string): string {
  if (!safeStorage.isEncryptionAvailable()) return apiKey
  return 'enc:' + safeStorage.encryptString(apiKey).toString('base64')
}

function decryptApiKey(value: string): string {
  if (value.startsWith('enc:')) {
    return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64')).toString()
  }
  return value
}

function decryptConfigRow(row: any): any {
  if (row && row.api_key) {
    return { ...row, api_key: decryptApiKey(row.api_key) }
  }
  return row
}

export function registerDatabaseIPC() {
  // Settings
  ipcMain.handle('db-get-setting', (_e, key: string) => {
    if (typeof key !== 'string' || !key.trim()) throw new Error('参数无效: key')
    key = key.trim().slice(0, 256)
    const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  })

  ipcMain.handle('db-set-setting', (_e, key: string, value: string) => {
    if (typeof key !== 'string' || !key.trim()) throw new Error('参数无效: key')
    if (typeof value !== 'string') throw new Error('参数无效: value')
    key = key.trim().slice(0, 256)
    value = value.slice(0, 10000)
    getDB().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  // AI Configs
  ipcMain.handle('db-get-ai-configs', () => {
    const rows = getDB().prepare('SELECT * FROM ai_configs ORDER BY is_default DESC, id ASC').all() as any[]
    return rows.map(decryptConfigRow)
  })

  ipcMain.handle('db-save-ai-config', (_e, config: {
    id?: number; name: string; api_key: string; base_url: string; model: string; is_default?: boolean; task_type?: string
  }) => {
    if (!config || typeof config !== 'object') throw new Error('参数无效: config')
    if (typeof config.name !== 'string' || !config.name.trim()) throw new Error('参数无效: name')
    if (typeof config.api_key !== 'string') throw new Error('参数无效: api_key')
    if (typeof config.base_url !== 'string' || !config.base_url.trim()) throw new Error('参数无效: base_url')
    if (typeof config.model !== 'string' || !config.model.trim()) throw new Error('参数无效: model')
    config.name = config.name.trim().slice(0, 200)
    config.api_key = config.api_key.slice(0, 2000)
    config.base_url = config.base_url.trim().slice(0, 2000)
    config.model = config.model.trim().slice(0, 200)
    if (config.task_type !== undefined && typeof config.task_type === 'string') config.task_type = config.task_type.trim().slice(0, 100)
    const db = getDB()
    const encryptedKey = encryptApiKey(config.api_key)
    if (config.is_default) {
      db.prepare('UPDATE ai_configs SET is_default = 0').run()
    }
    if (config.id) {
      db.prepare(
        'UPDATE ai_configs SET name=?, api_key=?, base_url=?, model=?, is_default=?, task_type=? WHERE id=?'
      ).run(config.name, encryptedKey, config.base_url, config.model, config.is_default ? 1 : 0, config.task_type ?? null, config.id)
      return config.id
    } else {
      const result = db.prepare(
        'INSERT INTO ai_configs (name, api_key, base_url, model, is_default, task_type) VALUES (?,?,?,?,?,?)'
      ).run(config.name, encryptedKey, config.base_url, config.model, config.is_default ? 1 : 0, config.task_type ?? null)
      return result.lastInsertRowid
    }
  })

  ipcMain.handle('db-delete-ai-config', (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    getDB().prepare('DELETE FROM ai_configs WHERE id = ?').run(id)
  })

  ipcMain.handle('db-get-default-ai-config', () => {
    const row = getDB().prepare('SELECT * FROM ai_configs WHERE is_default = 1').get() ??
           getDB().prepare('SELECT * FROM ai_configs LIMIT 1').get() ?? null
    return decryptConfigRow(row)
  })

  // Fetch available models from API
  ipcMain.handle('ai-fetch-models', async (_e, args: { api_key: string; base_url: string }) => {
    if (!args || typeof args !== 'object') throw new Error('参数无效')
    if (typeof args.api_key !== 'string' || !args.api_key.trim()) throw new Error('参数无效: api_key')
    if (typeof args.base_url !== 'string' || !args.base_url.trim()) throw new Error('参数无效: base_url')
    args.api_key = args.api_key.trim().slice(0, 2000)
    args.base_url = args.base_url.trim().slice(0, 2000)
    const url = `${args.base_url.replace(/\/$/, '')}/models`
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${args.api_key}` },
    })
    if (!response.ok) {
      throw new Error(`获取模型列表失败 (${response.status})`)
    }
    const json = await response.json() as { data?: { id: string }[] }
    const models = (json.data || []).map((m) => m.id).sort()
    return models
  })
}
