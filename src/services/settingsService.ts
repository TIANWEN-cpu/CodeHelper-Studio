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

export interface UserProfileSettings {
  name: string
  avatar: string
}

export interface LearningRecordsClearResult {
  success: boolean
  changed: Record<string, number>
}

export const PROFILE_NAME_KEY = 'user_name'
export const PROFILE_AVATAR_KEY = 'user_avatar'

export type ExportCategory =
  | 'problems'
  | 'submissions'
  | 'mistakes'
  | 'chat_sessions'
  | 'chat_history'
  | 'knowledge_docs'
  | 'knowledge_chunks'
  | 'settings'
  | 'memories'
  | 'prompt_presets'

export const DEFAULT_EXPORT_CATEGORIES: ExportCategory[] = [
  'problems',
  'submissions',
  'mistakes',
  'chat_sessions',
  'chat_history',
  'knowledge_docs',
  'knowledge_chunks',
  'settings',
  'memories',
  'prompt_presets',
]

interface ExportResult {
  success: boolean
  filePath?: string
  error?: string
}

interface ImportResult {
  success: boolean
  errors?: string[]
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>('db-get-setting', key)
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>('db-set-setting', key, value)
}

export async function getUserProfile(): Promise<UserProfileSettings> {
  const [name, avatar] = await Promise.all([
    getSetting(PROFILE_NAME_KEY),
    getSetting(PROFILE_AVATAR_KEY),
  ])
  return {
    name: name?.trim() || '',
    avatar: avatar?.trim() || '',
  }
}

export async function saveUserProfile(profile: UserProfileSettings): Promise<void> {
  const trimmedName = profile.name.trim().slice(0, 40)
  const trimmedAvatar = profile.avatar.trim().slice(0, 10000)
  await Promise.all([
    setSetting(PROFILE_NAME_KEY, trimmedName),
    setSetting(PROFILE_AVATAR_KEY, trimmedAvatar),
  ])
}

export async function clearLearningRecords(): Promise<LearningRecordsClearResult> {
  return invoke<LearningRecordsClearResult>('learning-records-clear')
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

export async function exportData(
  categories: ExportCategory[] = DEFAULT_EXPORT_CATEGORIES,
): Promise<void> {
  const result = await invoke<ExportResult>('export-data', categories)
  if (result && result.success === false) {
    throw new Error(result.error || '导出数据失败')
  }
}

export async function importData(): Promise<void> {
  const result = await invoke<ImportResult>('import-data')
  if (result && result.success === false) {
    throw new Error(result.errors?.join('；') || '导入数据失败')
  }
}
