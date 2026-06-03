import { invoke } from './ipc'

export interface AIConfig {
  id?: number
  name: string
  base_url: string
  model: string
  api_key?: string
  is_default?: boolean
}

export interface PlatformInfo {
  platform: string
  arch: string
  osVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  appVersion: string
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>('db-get-setting', key)
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>('db-set-setting', key, value)
}

export async function getAIConfigs(): Promise<AIConfig[]> {
  return invoke<AIConfig[]>('db-get-ai-configs')
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  return invoke<void>('db-save-ai-config', config)
}

export async function deleteAIConfig(id: number): Promise<void> {
  return invoke<void>('db-delete-ai-config', id)
}

export async function getDefaultAIConfig(): Promise<AIConfig> {
  return invoke<AIConfig>('db-get-default-ai-config')
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  return invoke<string[]>('ai-fetch-models', { base_url: baseUrl, api_key: apiKey })
}

export async function getPlatformInfo(): Promise<PlatformInfo> {
  return invoke<PlatformInfo>('platform-info')
}

export async function exportData(): Promise<void> {
  return invoke<void>('export-data')
}

export async function importData(): Promise<void> {
  return invoke<void>('import-data')
}
