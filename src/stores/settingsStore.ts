import { create } from 'zustand'
import type { ChatConfig } from '../types/chat'
import { typedInvoke } from '../api/ipc'

// Re-export type so existing consumers are not broken
export type { ChatConfig as AIConfig }

interface SettingsState {
  aiConfigs: ChatConfig[]
  loading: boolean
  loadConfigs: () => Promise<void>
  saveConfig: (config: ChatConfig) => Promise<void>
  deleteConfig: (id: number) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  aiConfigs: [],
  loading: false,
  loadConfigs: async () => {
    set({ loading: true })
    const configs = await typedInvoke('db-get-ai-configs')
    set({ aiConfigs: configs, loading: false })
  },
  saveConfig: async (config) => {
    await typedInvoke('db-save-ai-config', config)
    await get().loadConfigs()
  },
  deleteConfig: async (id) => {
    await typedInvoke('db-delete-ai-config', id)
    await get().loadConfigs()
  },
}))
