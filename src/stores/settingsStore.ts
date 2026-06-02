import { create } from 'zustand'
import type { ChatConfig } from '../types/chat'
import { typedInvoke, invalidateCache } from '../api/ipc'
import { toErrorMessage } from '../utils/errors'
import { eventBus } from '../utils/eventBus'

// Re-export type so existing consumers are not broken
export type { ChatConfig as AIConfig }

interface SettingsState {
  aiConfigs: ChatConfig[]
  loading: boolean
  saving: boolean
  saveError: string | null
  loadConfigs: () => Promise<void>
  saveConfig: (config: ChatConfig) => Promise<void>
  deleteConfig: (id: number) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  aiConfigs: [],
  loading: false,
  saving: false,
  saveError: null,
  loadConfigs: async () => {
    set({ loading: true })
    try {
      const configs = await typedInvoke('db-get-ai-configs')
      set({ aiConfigs: configs })
    } catch (error) {
      console.error('[SettingsStore.loadConfigs]', toErrorMessage(error))
    } finally {
      set({ loading: false })
    }
  },
  saveConfig: async (config) => {
    set({ saving: true, saveError: null })
    try {
      const configId = await typedInvoke('db-save-ai-config', config)
      invalidateCache('db-get-ai-configs')
      await get().loadConfigs()
      eventBus.emit('settings:config-saved', Number(configId))
    } catch (error: unknown) {
      set({ saveError: toErrorMessage(error) })
      throw error
    } finally {
      set({ saving: false })
    }
  },
  deleteConfig: async (id) => {
    try {
      await typedInvoke('db-delete-ai-config', id)
      invalidateCache('db-get-ai-configs')
      await get().loadConfigs()
      eventBus.emit('settings:config-deleted', id)
    } catch (error) {
      console.error('[SettingsStore.deleteConfig]', toErrorMessage(error))
    }
  },
}))
