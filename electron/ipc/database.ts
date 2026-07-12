import { ipcMain } from 'electron'
import { getDB } from '../db/index'
import { trackPerformance } from '../utils/perfMonitor'
import {
  assertAllowedProviderBaseUrl,
  resolveAllowedProviderTarget,
} from '../utils/providerSecurity'
import { fetchResolvedProvider } from '../utils/providerFetch'
import {
  discardResponseBody,
  friendlyUpstreamError,
  redirectBlockedError,
  isRedirect,
} from '../utils/httpErrors'
import type { AIConfigRow, AIConfigDecrypted } from '../types/db'
import { decryptApiKey, encryptApiKey, isMaskedApiKey, maskApiKey } from '../utils/apiKeyStorage'

export { isMaskedApiKey, maskApiKey } from '../utils/apiKeyStorage'

type AIConfigPublic = Omit<AIConfigDecrypted, 'api_key'> & { api_key: string; has_api_key: boolean }
const SETTINGS_VALUE_LIMIT = 10000
const SETTINGS_LARGE_VALUE_LIMIT = 120000
const LARGE_SETTING_KEYS = new Set(['user_avatar'])

function decryptConfigRow(row: AIConfigRow | undefined | null): AIConfigDecrypted | null {
  if (!row) return null
  return { ...row, api_key: decryptApiKey(row.api_key) }
}

function publicConfigRow(row: AIConfigRow | undefined | null): AIConfigPublic | null {
  const decrypted = decryptConfigRow(row)
  if (!decrypted) return null
  return {
    ...decrypted,
    api_key: maskApiKey(decrypted.api_key),
    has_api_key: Boolean(decrypted.api_key),
  }
}

function assertCredentialBaseUrl(existingBaseUrl: string, requestedBaseUrl: string): void {
  if (assertAllowedProviderBaseUrl(existingBaseUrl) !== requestedBaseUrl) {
    throw new Error('更改 Base URL 后请重新输入 API Key')
  }
}

export function registerDatabaseIPC(): void {
  const firstCall = new Set<string>()
  function logFirstCall(channel: string): void {
    if (!firstCall.has(channel)) {
      firstCall.add(channel)
      console.log(`[IPC] First call to "${channel}"`)
    }
  }

  // Settings
  ipcMain.handle('db-get-setting', (_e, key: string) => {
    logFirstCall('db-get-setting')
    if (typeof key !== 'string' || !key.trim()) throw new Error('参数无效: key')
    key = key.trim().slice(0, 256)
    const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  })

  ipcMain.handle('db-set-setting', (_e, key: string, value: string) => {
    logFirstCall('db-set-setting')
    if (typeof key !== 'string' || !key.trim()) throw new Error('参数无效: key')
    if (typeof value !== 'string') throw new Error('参数无效: value')
    key = key.trim().slice(0, 256)
    value = value.slice(
      0,
      LARGE_SETTING_KEYS.has(key) ? SETTINGS_LARGE_VALUE_LIMIT : SETTINGS_VALUE_LIMIT,
    )
    getDB().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  // AI Configs
  ipcMain.handle(
    'db-get-ai-configs',
    trackPerformance('db-get-ai-configs', () => {
      logFirstCall('db-get-ai-configs')
      const rows = getDB()
        .prepare('SELECT * FROM ai_configs ORDER BY is_default DESC, id ASC')
        .all() as AIConfigRow[]
      return rows.map(publicConfigRow)
    }),
  )

  ipcMain.handle(
    'db-save-ai-config',
    (
      _e,
      config: {
        id?: number
        name: string
        api_key: string
        base_url: string
        model: string
        is_default?: boolean
        task_type?: string
      },
    ) => {
      if (!config || typeof config !== 'object') throw new Error('参数无效: config')
      if (typeof config.name !== 'string' || !config.name.trim()) throw new Error('参数无效: name')
      if (typeof config.api_key !== 'string') throw new Error('参数无效: api_key')
      if (typeof config.base_url !== 'string' || !config.base_url.trim())
        throw new Error('参数无效: base_url')
      if (typeof config.model !== 'string' || !config.model.trim())
        throw new Error('参数无效: model')
      config.name = config.name.trim().slice(0, 200)
      config.api_key = config.api_key.slice(0, 2000)
      config.base_url = assertAllowedProviderBaseUrl(config.base_url.trim().slice(0, 2000))
      config.model = config.model.trim().slice(0, 200)
      if (config.task_type !== undefined && typeof config.task_type === 'string')
        config.task_type = config.task_type.trim().slice(0, 100)
      const db = getDB()
      const existingConfig = config.id
        ? (db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(config.id) as
            | AIConfigRow
            | undefined)
        : undefined
      const submittedApiKey = config.api_key.trim()
      if ((!submittedApiKey || isMaskedApiKey(submittedApiKey)) && existingConfig) {
        assertCredentialBaseUrl(existingConfig.base_url, config.base_url)
      }
      const apiKeyForStorage =
        !submittedApiKey || isMaskedApiKey(submittedApiKey)
          ? existingConfig
            ? decryptApiKey(existingConfig.api_key)
            : ''
          : submittedApiKey
      if (!apiKeyForStorage) throw new Error('参数无效: api_key')
      const encryptedKey = encryptApiKey(apiKeyForStorage)
      const saveConfigFn = db.transaction(() => {
        if (config.is_default) {
          db.prepare('UPDATE ai_configs SET is_default = 0').run()
        }
        if (config.id) {
          db.prepare(
            'UPDATE ai_configs SET name=?, api_key=?, base_url=?, model=?, is_default=?, task_type=? WHERE id=?',
          ).run(
            config.name,
            encryptedKey,
            config.base_url,
            config.model,
            config.is_default ? 1 : 0,
            config.task_type ?? null,
            config.id,
          )
          return config.id
        } else {
          const result = db
            .prepare(
              'INSERT INTO ai_configs (name, api_key, base_url, model, is_default, task_type) VALUES (?,?,?,?,?,?)',
            )
            .run(
              config.name,
              encryptedKey,
              config.base_url,
              config.model,
              config.is_default ? 1 : 0,
              config.task_type ?? null,
            )
          return result.lastInsertRowid
        }
      })
      return saveConfigFn()
    },
  )

  ipcMain.handle('db-delete-ai-config', (_e, id: number) => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id < 1) throw new Error('参数无效: id')
    getDB().prepare('DELETE FROM ai_configs WHERE id = ?').run(id)
  })

  ipcMain.handle('db-get-default-ai-config', () => {
    const row =
      (getDB().prepare('SELECT * FROM ai_configs WHERE is_default = 1').get() as
        | AIConfigRow
        | undefined) ??
      (getDB().prepare('SELECT * FROM ai_configs LIMIT 1').get() as AIConfigRow | undefined) ??
      undefined
    return publicConfigRow(row ?? null)
  })

  // Fetch available models from API
  ipcMain.handle(
    'ai-fetch-models',
    async (_e, args: { api_key: string; base_url: string; config_id?: number }) => {
      if (!args || typeof args !== 'object') throw new Error('参数无效')
      if (typeof args.api_key !== 'string' || !args.api_key.trim())
        throw new Error('参数无效: api_key')
      if (typeof args.base_url !== 'string' || !args.base_url.trim())
        throw new Error('参数无效: base_url')
      args.api_key = args.api_key.trim().slice(0, 2000)
      args.base_url = assertAllowedProviderBaseUrl(args.base_url.trim().slice(0, 2000))
      if (isMaskedApiKey(args.api_key)) {
        if (
          typeof args.config_id !== 'number' ||
          !Number.isFinite(args.config_id) ||
          args.config_id < 1
        ) {
          throw new Error('璇疯鎻愪緵鏈夋晥鐨勬ā鍨嬮厤缃?')
        }
        const row = getDB()
          .prepare('SELECT api_key, base_url FROM ai_configs WHERE id = ?')
          .get(args.config_id) as { api_key: string; base_url: string } | undefined
        if (!row) throw new Error('妯″瀷閰嶇疆涓嶅瓨鍦?')
        assertCredentialBaseUrl(row.base_url, args.base_url)
        args.api_key = decryptApiKey(row.api_key)
        if (!args.api_key) throw new Error('API Key 鏃犳硾瑙ｆ垨宸叉崯鍧?')
      }
      const provider = await resolveAllowedProviderTarget(args.base_url)
      const requestTarget = { ...provider, url: `${args.base_url}/models` }

      let response: Response
      try {
        response = await fetchResolvedProvider(requestTarget, {
          headers: { Authorization: `Bearer ${args.api_key}` },
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes('abort') || msg.includes('timeout')) {
          throw new Error('获取模型列表超时，请检查网络或 Base URL')
        }
        console.warn('[ai] fetch-models failed:', msg)
        throw new Error('网络连接失败，请检查网络或 Base URL')
      }

      // 出于 SSRF 防护，拒绝跟随上游重定向（可能指向内网/元数据地址）
      if (isRedirect(response.status)) {
        await discardResponseBody(response)
        throw redirectBlockedError('models')
      }

      if (!response.ok) {
        await discardResponseBody(response)
        console.warn(`[ai] fetch-models upstream error ${response.status}`)
        throw new Error(friendlyUpstreamError(response.status, 'models'))
      }
      let json: { data?: { id: string }[] }
      try {
        json = (await response.json()) as { data?: { id: string }[] }
      } catch {
        // 上游返回 200 OK 但响应体不是合法 JSON（如代理返回 HTML 错误页）。
        // 不把原始 SyntaxError 泄漏给用户。
        console.warn('[ai] fetch-models: response is not valid JSON')
        throw new Error('模型列表响应无法解析，请确认 Base URL 指向兼容 OpenAI 的服务')
      }
      const models = (json.data || []).map((m) => m.id).sort()
      return models
    },
  )
}
