import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

// Mock document.documentElement for theme tests
const mockDataset: Record<string, string> = {}
vi.stubGlobal('document', {
  documentElement: {
    dataset: new Proxy(mockDataset, {
      set(target, prop, value) {
        target[prop as string] = value
        return true
      },
    }),
  },
})

const { useAppStore } = await import('../src/stores/appStore')

beforeEach(() => {
  useAppStore.setState({ activeModule: 'problems', theme: 'mocha' })
  mockInvoke.mockReset()
  Object.keys(mockDataset).forEach((k) => delete mockDataset[k])
})

describe('appStore', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useAppStore.getState()
      expect(state.activeModule).toBe('problems')
      expect(state.theme).toBe('mocha')
    })
  })

  describe('setActiveModule', () => {
    it('changes active module', () => {
      useAppStore.getState().setActiveModule('editor')
      expect(useAppStore.getState().activeModule).toBe('editor')
    })

    it('accepts all valid module ids', () => {
      const modules = [
        'problems',
        'editor',
        'ai-chat',
        'mistakes',
        'knowledge',
        'settings',
      ] as const
      for (const mod of modules) {
        useAppStore.getState().setActiveModule(mod)
        expect(useAppStore.getState().activeModule).toBe(mod)
      }
    })
  })

  describe('setTheme', () => {
    it('updates theme and persists to DB', async () => {
      mockInvoke.mockResolvedValueOnce(undefined) // db-set-setting

      await useAppStore.getState().setTheme('fjord')

      expect(useAppStore.getState().theme).toBe('fjord')
      expect(mockDataset.theme).toBe('fjord')
      expect(mockInvoke).toHaveBeenCalledWith('db-set-setting', 'ui-theme', 'fjord')
    })
  })

  describe('loadTheme', () => {
    it('loads saved theme from DB', async () => {
      mockInvoke.mockResolvedValueOnce('ember') // db-get-setting

      await useAppStore.getState().loadTheme()

      expect(useAppStore.getState().theme).toBe('ember')
      expect(mockDataset.theme).toBe('ember')
      expect(mockInvoke).toHaveBeenCalledWith('db-get-setting', 'ui-theme')
    })

    it('falls back to default theme when no saved value', async () => {
      mockInvoke.mockResolvedValueOnce(null)

      await useAppStore.getState().loadTheme()

      expect(useAppStore.getState().theme).toBe('mocha')
      expect(mockDataset.theme).toBe('mocha')
    })

    it('falls back to default theme for invalid saved value', async () => {
      mockInvoke.mockResolvedValueOnce('invalid-theme')

      await useAppStore.getState().loadTheme()

      expect(useAppStore.getState().theme).toBe('mocha')
    })
  })
})
