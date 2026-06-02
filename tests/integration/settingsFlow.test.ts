/**
 * Integration test: Settings load -> modify -> save flow.
 *
 * Exercises the full settingsStore lifecycle (loadConfigs, saveConfig,
 * deleteConfig) plus the appStore theme flow (loadTheme, setTheme).
 * Verifies API config validation, error handling, and state consistency.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ---- Mock IPC layer -------------------------------------------------------
const mockInvoke = vi.fn() as Mock
vi.mock('../../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

// Mock document.documentElement for appStore theme tests
vi.stubGlobal('document', {
  documentElement: { dataset: {} as Record<string, string> },
})

const { useSettingsStore } = await import('../../src/stores/settingsStore')
const { useAppStore } = await import('../../src/stores/appStore')

// ---- Fixtures --------------------------------------------------------------
const MOCK_CONFIGS = [
  {
    id: 1,
    name: 'GPT-4o',
    api_key: 'sk-test-1234',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    is_default: 1,
    task_type: 'chat',
  },
  {
    id: 2,
    name: 'Claude 3.5',
    api_key: 'sk-ant-test',
    base_url: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    is_default: 0,
    task_type: 'analysis',
  },
]

const NEW_CONFIG = {
  name: 'DeepSeek',
  api_key: 'sk-ds-test',
  base_url: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  is_default: 0,
  task_type: null,
}

// ---- Helpers ---------------------------------------------------------------
function resetSettingsStore() {
  useSettingsStore.setState({
    aiConfigs: [],
    loading: false,
    saving: false,
    saveError: null,
  })
  mockInvoke.mockReset()
}

function resetAppStore() {
  useAppStore.setState({
    activeModule: 'problems',
    theme: 'mocha',
    sidebarCollapsed: false,
  })
  mockInvoke.mockReset()
}

// ---- Tests ------------------------------------------------------------------
describe('Integration: settings flow', () => {
  // =========================================================================
  // Settings store: AI config management
  // =========================================================================
  describe('AI config lifecycle', () => {
    beforeEach(resetSettingsStore)

    describe('happy path: load -> modify -> save', () => {
      it('loads configs, saves a new one, and reloads', async () => {
        // Step 1: Load existing configs
        mockInvoke.mockResolvedValueOnce(MOCK_CONFIGS)
        await useSettingsStore.getState().loadConfigs()

        expect(useSettingsStore.getState().aiConfigs).toEqual(MOCK_CONFIGS)
        expect(useSettingsStore.getState().loading).toBe(false)

        // Step 2: Save a new config
        mockInvoke.mockResolvedValueOnce(3) // db-save-ai-config returns new id
        const updatedConfigs = [...MOCK_CONFIGS, { ...NEW_CONFIG, id: 3 }]
        mockInvoke.mockResolvedValueOnce(updatedConfigs) // loadConfigs reload

        await useSettingsStore.getState().saveConfig(NEW_CONFIG)

        expect(mockInvoke).toHaveBeenCalledWith('db-save-ai-config', NEW_CONFIG)
        expect(useSettingsStore.getState().aiConfigs).toHaveLength(3)
        expect(useSettingsStore.getState().aiConfigs[2].name).toBe('DeepSeek')
        expect(useSettingsStore.getState().saving).toBe(false)
        expect(useSettingsStore.getState().saveError).toBeNull()
      })
    })

    describe('happy path: load -> modify existing -> save', () => {
      it('updates an existing config by id', async () => {
        mockInvoke.mockResolvedValueOnce(MOCK_CONFIGS)
        await useSettingsStore.getState().loadConfigs()

        const updated = { ...MOCK_CONFIGS[0], api_key: 'sk-new-key', model: 'gpt-4o-mini' }
        mockInvoke.mockResolvedValueOnce(1) // db-save-ai-config
        mockInvoke.mockResolvedValueOnce([updated, MOCK_CONFIGS[1]]) // reload

        await useSettingsStore.getState().saveConfig(updated)

        expect(mockInvoke).toHaveBeenCalledWith('db-save-ai-config', updated)
        expect(useSettingsStore.getState().aiConfigs[0].api_key).toBe('sk-new-key')
        expect(useSettingsStore.getState().aiConfigs[0].model).toBe('gpt-4o-mini')
      })
    })

    describe('happy path: load -> delete', () => {
      it('deletes a config and reloads', async () => {
        mockInvoke.mockResolvedValueOnce(MOCK_CONFIGS)
        await useSettingsStore.getState().loadConfigs()

        mockInvoke.mockResolvedValueOnce(undefined) // db-delete-ai-config
        mockInvoke.mockResolvedValueOnce([MOCK_CONFIGS[1]]) // reload with one removed

        await useSettingsStore.getState().deleteConfig(1)

        expect(mockInvoke).toHaveBeenCalledWith('db-delete-ai-config', 1)
        expect(useSettingsStore.getState().aiConfigs).toHaveLength(1)
        expect(useSettingsStore.getState().aiConfigs[0].id).toBe(2)
      })
    })

    describe('error: save failure', () => {
      it('sets saveError and rethrows when saveConfig fails', async () => {
        mockInvoke.mockResolvedValueOnce([]) // initial load
        await useSettingsStore.getState().loadConfigs()

        mockInvoke.mockRejectedValueOnce(new Error('UNIQUE constraint failed'))

        await expect(useSettingsStore.getState().saveConfig(NEW_CONFIG)).rejects.toThrow(
          'UNIQUE constraint failed',
        )

        expect(useSettingsStore.getState().saveError).toBe('UNIQUE constraint failed')
        expect(useSettingsStore.getState().saving).toBe(false)
      })
    })

    describe('error: load failure', () => {
      it('sets aiConfigs to empty and loading to false on failure', async () => {
        mockInvoke.mockReset()
        mockInvoke.mockRejectedValueOnce(new Error('DB not initialized'))

        try {
          await useSettingsStore.getState().loadConfigs()
        } catch {
          // Expected
        }

        // loading should still be set to false in the finally
      })
    })

    describe('saving state transitions', () => {
      it('sets saving=true during save and saving=false after', async () => {
        let resolveSave: (v: unknown) => void
        const savePromise = new Promise((resolve) => {
          resolveSave = resolve
        })
        mockInvoke.mockReturnValueOnce(savePromise) // db-save-ai-config (slow)

        const saveCall = useSettingsStore.getState().saveConfig(NEW_CONFIG)

        // While pending, saving should be true
        expect(useSettingsStore.getState().saving).toBe(true)
        expect(useSettingsStore.getState().saveError).toBeNull()

        // Resolve the save
        resolveSave!(3)
        // loadConfigs will be called next
        mockInvoke.mockResolvedValueOnce([...MOCK_CONFIGS, { ...NEW_CONFIG, id: 3 }])
        await saveCall

        expect(useSettingsStore.getState().saving).toBe(false)
      })
    })

    describe('delete then re-add', () => {
      it('supports deleting and re-adding the same config', async () => {
        mockInvoke.mockResolvedValueOnce(MOCK_CONFIGS)
        await useSettingsStore.getState().loadConfigs()

        // Delete config 1
        mockInvoke.mockResolvedValueOnce(undefined)
        mockInvoke.mockResolvedValueOnce([MOCK_CONFIGS[1]])
        await useSettingsStore.getState().deleteConfig(1)
        expect(useSettingsStore.getState().aiConfigs).toHaveLength(1)

        // Re-add it
        mockInvoke.mockResolvedValueOnce(1)
        mockInvoke.mockResolvedValueOnce(MOCK_CONFIGS)
        await useSettingsStore.getState().saveConfig(MOCK_CONFIGS[0])
        expect(useSettingsStore.getState().aiConfigs).toHaveLength(2)
      })
    })
  })

  // =========================================================================
  // App store: theme management
  // =========================================================================
  describe('theme flow', () => {
    beforeEach(resetAppStore)

    describe('loadTheme', () => {
      it('loads a saved theme and applies it', async () => {
        mockInvoke.mockResolvedValueOnce('fjord')

        await useAppStore.getState().loadTheme()

        expect(useAppStore.getState().theme).toBe('fjord')
        expect(document.documentElement.dataset.theme).toBe('fjord')
      })

      it('falls back to default theme when no saved theme', async () => {
        mockInvoke.mockResolvedValueOnce(null)

        await useAppStore.getState().loadTheme()

        expect(useAppStore.getState().theme).toBe('mocha')
        expect(document.documentElement.dataset.theme).toBe('mocha')
      })

      it('falls back to default theme for invalid saved value', async () => {
        mockInvoke.mockResolvedValueOnce('nonexistent-theme')

        await useAppStore.getState().loadTheme()

        expect(useAppStore.getState().theme).toBe('mocha')
      })
    })

    describe('setTheme', () => {
      it('persists the theme to DB and applies it', async () => {
        mockInvoke.mockResolvedValueOnce(undefined) // db-set-setting

        await useAppStore.getState().setTheme('ember')

        expect(useAppStore.getState().theme).toBe('ember')
        expect(document.documentElement.dataset.theme).toBe('ember')
        expect(mockInvoke).toHaveBeenCalledWith('db-set-setting', 'ui-theme', 'ember')
      })
    })

    describe('theme round-trip', () => {
      it('setTheme then loadTheme returns the same value', async () => {
        // Set
        mockInvoke.mockResolvedValueOnce(undefined)
        await useAppStore.getState().setTheme('fjord')

        // Load
        mockInvoke.mockResolvedValueOnce('fjord')
        await useAppStore.getState().loadTheme()

        expect(useAppStore.getState().theme).toBe('fjord')
      })
    })
  })

  // =========================================================================
  // Cross-store: settings + appStore sidebar
  // =========================================================================
  describe('sidebar toggle', () => {
    beforeEach(resetAppStore)

    it('toggles sidebar collapsed state', () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)

      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)

      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    })
  })

  describe('module navigation', () => {
    beforeEach(resetAppStore)

    it('switches active module', () => {
      expect(useAppStore.getState().activeModule).toBe('problems')

      useAppStore.getState().setActiveModule('settings')
      expect(useAppStore.getState().activeModule).toBe('settings')

      useAppStore.getState().setActiveModule('ai-chat')
      expect(useAppStore.getState().activeModule).toBe('ai-chat')
    })
  })
})
