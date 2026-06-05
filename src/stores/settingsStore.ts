import { create } from 'zustand'
import { typedInvoke } from '@/api/ipc'

type AIConfig = Record<string, unknown> & { id?: number }

type SettingsStore = {
  aiConfigs: AIConfig[]
  loading: boolean
  saving: boolean
  saveError: string | null
  loadConfigs: () => Promise<void>
  saveConfig: (config: AIConfig) => Promise<void>
  deleteConfig: (id: number) => Promise<void>
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  aiConfigs: [],
  loading: false,
  saving: false,
  saveError: null,
  loadConfigs: async () => {
    set({ loading: true })
    try {
      const aiConfigs = await typedInvoke<AIConfig[]>('db-get-ai-configs')
      set({ aiConfigs })
    } catch (error) {
      console.error('[SettingsStore.loadConfigs]', error)
      set({ aiConfigs: [] })
    } finally {
      set({ loading: false })
    }
  },
  saveConfig: async (config) => {
    set({ saving: true, saveError: null })
    try {
      await typedInvoke('db-save-ai-config', config)
      await get().loadConfigs()
    } catch (error) {
      set({ saveError: message(error) })
      throw error
    } finally {
      set({ saving: false })
    }
  },
  deleteConfig: async (id) => {
    try {
      await typedInvoke('db-delete-ai-config', id)
      await get().loadConfigs()
    } catch (error) {
      console.error('[SettingsStore.deleteConfig]', error)
    }
  },
}))
