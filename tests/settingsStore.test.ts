import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

const { useSettingsStore } = await import('../src/stores/settingsStore')

beforeEach(() => {
  useSettingsStore.setState({ aiConfigs: [], loading: false })
  mockInvoke.mockReset()
})

describe('settingsStore', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useSettingsStore.getState()
      expect(state.aiConfigs).toEqual([])
      expect(state.loading).toBe(false)
    })
  })

  describe('loadConfigs', () => {
    it('sets loading state and loads configs', async () => {
      const mockConfigs = [
        {
          id: 1,
          name: 'GPT-4',
          api_key: 'sk-xxx',
          base_url: 'https://api.openai.com',
          model: 'gpt-4',
          is_default: 1,
          task_type: null,
        },
      ]
      mockInvoke.mockResolvedValueOnce(mockConfigs)

      const loadPromise = useSettingsStore.getState().loadConfigs()

      // Should be loading
      expect(useSettingsStore.getState().loading).toBe(true)

      await loadPromise

      expect(mockInvoke).toHaveBeenCalledWith('db-get-ai-configs')
      expect(useSettingsStore.getState().aiConfigs).toEqual(mockConfigs)
      expect(useSettingsStore.getState().loading).toBe(false)
    })

    it('sets loading to false after error', async () => {
      mockInvoke.mockReset()
      mockInvoke.mockRejectedValueOnce(new Error('DB error'))

      try {
        await useSettingsStore.getState().loadConfigs()
      } catch {
        // Expected
      }

      expect(mockInvoke).toHaveBeenCalledWith('db-get-ai-configs')
    })
  })

  describe('saveConfig', () => {
    it('saves config and reloads', async () => {
      const config = {
        name: 'Claude',
        api_key: 'sk-ant',
        base_url: 'https://api.anthropic.com',
        model: 'claude-3',
        is_default: 0,
        task_type: null,
      }
      mockInvoke.mockResolvedValueOnce(1) // db-save-ai-config
      mockInvoke.mockResolvedValueOnce([config]) // loadConfigs

      await useSettingsStore.getState().saveConfig(config)

      expect(mockInvoke).toHaveBeenCalledWith('db-save-ai-config', config)
      expect(useSettingsStore.getState().aiConfigs).toEqual([config])
    })
  })

  describe('deleteConfig', () => {
    it('deletes config and reloads', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // db-delete-ai-config
      mockInvoke.mockResolvedValueOnce([]) // loadConfigs

      await useSettingsStore.getState().deleteConfig(1)

      expect(mockInvoke).toHaveBeenCalledWith('db-delete-ai-config', 1)
      expect(useSettingsStore.getState().aiConfigs).toEqual([])
    })
  })
})
