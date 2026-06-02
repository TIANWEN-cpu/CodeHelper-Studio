import { create } from 'zustand'

export interface AIConfig {
  id?: number
  name: string
  api_key: string
  base_url: string
  model: string
  is_default: number
  task_type: string | null
}

interface SettingsState {
  aiConfigs: AIConfig[]
  loading: boolean
  loadConfigs: () => Promise<void>
  saveConfig: (config: AIConfig) => Promise<void>
  deleteConfig: (id: number) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  aiConfigs: [],
  loading: false,
  loadConfigs: async () => {
    set({ loading: true })
    const configs = (await window.api.invoke('db-get-ai-configs')) as AIConfig[]
    set({ aiConfigs: configs, loading: false })
  },
  saveConfig: async (config) => {
    await window.api.invoke('db-save-ai-config', config)
    await get().loadConfigs()
  },
  deleteConfig: async (id) => {
    await window.api.invoke('db-delete-ai-config', id)
    await get().loadConfigs()
  },
}))
