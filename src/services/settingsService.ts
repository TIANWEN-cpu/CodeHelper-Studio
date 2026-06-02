/**
 * Settings service — abstracts settings and AI config IPC calls.
 *
 * Wraps `db-*` and `ai-fetch-models` IPC channels behind a clean interface
 * that can be mocked for testing.
 */

import { typedInvoke } from '../api/ipc'
import type { AIConfigSavePayload, AIFetchModelsPayload } from '../types/ipc'
import type { ChatConfig } from '../types/chat'

export interface ISettingsService {
  getAIConfigs(): Promise<ChatConfig[]>
  saveAIConfig(config: AIConfigSavePayload): Promise<number | bigint>
  deleteAIConfig(id: number): Promise<void>
  getDefaultAIConfig(): Promise<ChatConfig | null>
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  fetchModels(payload: AIFetchModelsPayload): Promise<string[]>
}

class SettingsServiceImpl implements ISettingsService {
  getAIConfigs(): Promise<ChatConfig[]> {
    return typedInvoke('db-get-ai-configs')
  }

  saveAIConfig(config: AIConfigSavePayload): Promise<number | bigint> {
    return typedInvoke('db-save-ai-config', config)
  }

  deleteAIConfig(id: number): Promise<void> {
    return typedInvoke('db-delete-ai-config', id)
  }

  getDefaultAIConfig(): Promise<ChatConfig | null> {
    return typedInvoke('db-get-default-ai-config')
  }

  getSetting(key: string): Promise<string | null> {
    return typedInvoke('db-get-setting', key)
  }

  setSetting(key: string, value: string): Promise<void> {
    return typedInvoke('db-set-setting', key, value)
  }

  fetchModels(payload: AIFetchModelsPayload): Promise<string[]> {
    return typedInvoke('ai-fetch-models', payload)
  }
}

// ---------------------------------------------------------------------------
// Singleton with swappable implementation
// ---------------------------------------------------------------------------

let instance: ISettingsService = new SettingsServiceImpl()

export const settingsService: ISettingsService = {
  getAIConfigs: (...args) => instance.getAIConfigs(...args),
  saveAIConfig: (...args) => instance.saveAIConfig(...args),
  deleteAIConfig: (...args) => instance.deleteAIConfig(...args),
  getDefaultAIConfig: (...args) => instance.getDefaultAIConfig(...args),
  getSetting: (...args) => instance.getSetting(...args),
  setSetting: (...args) => instance.setSetting(...args),
  fetchModels: (...args) => instance.fetchModels(...args),
}

/**
 * Replace the default settings service (useful for testing).
 */
export function setSettingsService(service: ISettingsService): void {
  instance = service
}
