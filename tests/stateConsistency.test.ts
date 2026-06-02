/**
 * State consistency tests for Zustand stores.
 *
 * Tests: rapid sequential operations, concurrent operations,
 * and verifies stores remain in a consistent state after all mutations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (shared across all store tests)
// ---------------------------------------------------------------------------

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
const { useEditorStore } = await import('../src/stores/editorStore')
const { useChatStore } = await import('../src/stores/chatStore')
const { useSettingsStore } = await import('../src/stores/settingsStore')

beforeEach(() => {
  // Reset all stores to clean state
  useAppStore.setState({ activeModule: 'problems', theme: 'mocha', sidebarCollapsed: false })
  useEditorStore.setState({
    tabs: [{ id: 'welcome', filename: 'welcome.py', language: 'python', content: 'default' }],
    activeTabId: 'welcome',
  })
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    messages: [],
    streaming: false,
    currentRequestId: null,
    error: null,
    presets: [],
    memories: [],
  })
  useSettingsStore.setState({ aiConfigs: [], loading: false, saving: false, saveError: null })
  mockInvoke.mockReset()
  Object.keys(mockDataset).forEach((k) => delete mockDataset[k])
})

// ---------------------------------------------------------------------------
// appStore: rapid sequential operations
// ---------------------------------------------------------------------------

describe('State consistency: appStore', () => {
  describe('rapid sequential module switches', () => {
    it('final module is the last one set', () => {
      const modules = [
        'problems',
        'editor',
        'ai-chat',
        'mistakes',
        'knowledge',
        'settings',
      ] as const
      for (let i = 0; i < 100; i++) {
        useAppStore.getState().setActiveModule(modules[i % modules.length])
      }
      // 99 % 6 = 3 -> modules[3] = 'mistakes' (loop runs 0..99)
      expect(useAppStore.getState().activeModule).toBe('mistakes')
      // Also verify the invariant: the last call was with modules[3]
      useAppStore.getState().setActiveModule('settings')
      expect(useAppStore.getState().activeModule).toBe('settings')
    })

    it('rapid toggleSidebar always toggles correctly', () => {
      // Start collapsed = false
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)

      for (let i = 0; i < 50; i++) {
        useAppStore.getState().toggleSidebar()
      }
      // Even number of toggles -> back to false
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)

      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)
    })
  })

  describe('concurrent theme operations', () => {
    it('multiple sequential setTheme calls maintain last theme', async () => {
      mockInvoke.mockResolvedValue(undefined)

      const themes = ['mocha', 'fjord', 'ember', 'fjord', 'mocha'] as const
      for (const theme of themes) {
        await useAppStore.getState().setTheme(theme)
      }

      expect(useAppStore.getState().theme).toBe('mocha')
      expect(mockDataset.theme).toBe('mocha')
    })
  })

  describe('state integrity after partial failures', () => {
    it('setTheme updates local state even if IPC fails', async () => {
      mockInvoke.mockReset()
      mockInvoke.mockRejectedValue(new Error('DB down'))

      // setTheme should reject when IPC fails
      try {
        await useAppStore.getState().setTheme('ember')
      } catch {
        // Expected: DB error
      }
      // Local state should still be updated (setTheme sets state before await)
      expect(useAppStore.getState().theme).toBe('ember')
    })
  })
})

// ---------------------------------------------------------------------------
// editorStore: rapid sequential operations
// ---------------------------------------------------------------------------

describe('State consistency: editorStore', () =>
  describe('rapid tab operations', () => {
    it('add many tabs then close them all leaves empty state', () => {
      for (let i = 0; i < 50; i++) {
        useEditorStore
          .getState()
          .addTab({ id: `tab-${i}`, filename: `f${i}.py`, language: 'python', content: `c${i}` })
      }
      expect(useEditorStore.getState().tabs).toHaveLength(51) // 50 + welcome

      // Close all
      const allTabs = [...useEditorStore.getState().tabs]
      for (const tab of allTabs) {
        useEditorStore.getState().closeTab(tab.id)
      }

      expect(useEditorStore.getState().tabs).toHaveLength(0)
      expect(useEditorStore.getState().activeTabId).toBeNull()
    })

    it('add tabs, update content, verify all updates applied', () => {
      for (let i = 0; i < 20; i++) {
        useEditorStore
          .getState()
          .addTab({ id: `tab-${i}`, filename: `f${i}.py`, language: 'python', content: '' })
      }

      // Update content for all tabs
      for (let i = 0; i < 20; i++) {
        useEditorStore.getState().updateContent(`tab-${i}`, `updated-${i}`)
      }

      // Verify all updates
      for (let i = 0; i < 20; i++) {
        const tab = useEditorStore.getState().tabs.find((t) => t.id === `tab-${i}`)
        expect(tab?.content).toBe(`updated-${i}`)
      }
    })

    it('close tab and update remaining tab is consistent', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'a', filename: 'a.py', language: 'python', content: 'A' })
      useEditorStore
        .getState()
        .addTab({ id: 'b', filename: 'b.py', language: 'python', content: 'B' })
      useEditorStore
        .getState()
        .addTab({ id: 'c', filename: 'c.py', language: 'python', content: 'C' })

      // Close middle tab
      useEditorStore.getState().closeTab('b')
      expect(useEditorStore.getState().tabs).toHaveLength(3) // welcome + a + c

      // Update remaining
      useEditorStore.getState().updateContent('a', 'A-updated')
      const a = useEditorStore.getState().tabs.find((t) => t.id === 'a')
      expect(a?.content).toBe('A-updated')

      // b should not exist
      const b = useEditorStore.getState().tabs.find((t) => t.id === 'b')
      expect(b).toBeUndefined()
    })

    it('interleaved add/close maintains correct tab count', () => {
      for (let i = 0; i < 100; i++) {
        if (i % 3 === 0) {
          // Add
          useEditorStore
            .getState()
            .addTab({ id: `t-${i}`, filename: `f${i}.py`, language: 'python', content: '' })
        } else if (i % 3 === 1) {
          // Close most recent if exists
          const tabs = useEditorStore.getState().tabs
          if (tabs.length > 1) {
            useEditorStore.getState().closeTab(tabs[tabs.length - 1].id)
          }
        }
        // else: no-op
      }

      const state = useEditorStore.getState()
      expect(state.tabs.length).toBeGreaterThanOrEqual(0)
      expect(state.tabs.length).toBeLessThanOrEqual(50)

      // If there's an active tab, it should exist in tabs
      if (state.activeTabId) {
        expect(state.tabs.some((t) => t.id === state.activeTabId)).toBe(true)
      }
    })
  }))

// ---------------------------------------------------------------------------
// editorStore: concurrent operations
// ---------------------------------------------------------------------------

describe('State consistency: editorStore concurrent', () => {
  it('addTab and setActiveTab in sequence maintain consistency', () => {
    useEditorStore.getState().addTab({ id: 'x', filename: 'x.py', language: 'python', content: '' })
    useEditorStore.getState().setActiveTab('welcome')
    useEditorStore.getState().addTab({ id: 'y', filename: 'y.py', language: 'python', content: '' })
    useEditorStore.getState().setActiveTab('x')
    useEditorStore.getState().closeTab('y')

    const state = useEditorStore.getState()
    expect(state.tabs).toHaveLength(2) // welcome + x
    expect(state.activeTabId).toBe('x')
    expect(state.tabs.some((t) => t.id === 'y')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// chatStore: rapid sequential operations
// ---------------------------------------------------------------------------

describe('State consistency: chatStore', () => {
  describe('rapid appendChunk operations', () => {
    it('many rapid chunks accumulate correctly', () => {
      useChatStore.setState({
        currentRequestId: 'req-1',
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: '', timestamp: 2 },
        ],
      })

      for (let i = 0; i < 200; i++) {
        useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: `${i}` })
      }

      const content = useChatStore.getState().messages[1].content
      // Should contain all numbers 0-199 concatenated
      expect(content).toContain('0')
      expect(content).toContain('199')
      expect(content.length).toBeGreaterThan(0)
    })

    it('chunks with wrong requestId are ignored throughout', () => {
      useChatStore.setState({
        currentRequestId: 'correct',
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: '', timestamp: 2 },
        ],
      })

      for (let i = 0; i < 50; i++) {
        useChatStore.getState().appendChunk({ requestId: 'wrong', chunk: `bad-${i}` })
      }

      expect(useChatStore.getState().messages[1].content).toBe('')
    })
  })

  describe('switchSession resets streaming state', () => {
    it('switching session while streaming resets all flags', async () => {
      useChatStore.setState({
        streaming: true,
        currentRequestId: 'req-old',
        error: 'some error',
      })

      mockInvoke.mockResolvedValueOnce([]) // chat-messages-load
      await useChatStore.getState().switchSession('new-session')

      const state = useChatStore.getState()
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
      expect(state.error).toBeNull()
      expect(state.activeSessionId).toBe('new-session')
    })
  })

  describe('state after error in sendMessage', () => {
    it('streaming resets and error is set after failure', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        sessions: [{ id: 's1', title: 'Chat', system_prompt: '', created_at: '', updated_at: '' }],
      })
      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // chat-memory-capture
      mockInvoke.mockRejectedValueOnce(new Error('network timeout')) // ai-chat

      await useChatStore.getState().sendMessage('test')

      const state = useChatStore.getState()
      expect(state.streaming).toBe(false)
      expect(state.currentRequestId).toBeNull()
      expect(state.error).toBe('network timeout')
      // Messages should include the error in the assistant response
      const lastMsg = state.messages[state.messages.length - 1]
      expect(lastMsg.role).toBe('assistant')
      expect(lastMsg.content).toBe('network timeout')
    })
  })

  describe('session list after multiple creates and deletes', () => {
    it('creates sessions then deletes them all leaves empty state', async () => {
      const sessionIds: string[] = []

      // Create 5 sessions
      for (let i = 0; i < 5; i++) {
        mockInvoke.mockResolvedValueOnce(undefined) // chat-session-create
        mockInvoke.mockResolvedValueOnce([]) // loadSessions (empty list for simplicity)
        mockInvoke.mockResolvedValueOnce([]) // switchSession -> chat-messages-load
        const id = await useChatStore.getState().createSession()
        sessionIds.push(id)
      }

      // Set up sessions list for deletion
      const sessions = sessionIds.map((id) => ({
        id,
        title: `Chat ${id}`,
        system_prompt: '',
        created_at: '',
        updated_at: '',
      }))
      useChatStore.setState({ sessions, activeSessionId: sessionIds[4] })

      // Delete all
      for (const id of sessionIds) {
        mockInvoke.mockResolvedValueOnce(undefined) // chat-session-delete
        mockInvoke.mockResolvedValueOnce([]) // loadSessions returns empty
        await useChatStore.getState().deleteSession(id)
      }

      const state = useChatStore.getState()
      expect(state.sessions).toEqual([])
      expect(state.activeSessionId).toBeNull()
      expect(state.messages).toEqual([])
    })
  })

  describe('finishStream then appendChunk', () => {
    it('after finishStream, appendChunk to old requestId is ignored', async () => {
      useChatStore.setState({
        activeSessionId: 's1',
        currentRequestId: 'req-1',
        streaming: true,
        messages: [
          { id: 'm1', role: 'user', content: 'Hi', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: 'response', timestamp: 2 },
        ],
      })

      mockInvoke.mockResolvedValueOnce(undefined) // chat-message-save
      mockInvoke.mockResolvedValueOnce([]) // loadSessions
      mockInvoke.mockResolvedValueOnce([]) // loadMemories
      await useChatStore.getState().finishStream({ requestId: 'req-1', content: '' })

      expect(useChatStore.getState().streaming).toBe(false)
      expect(useChatStore.getState().currentRequestId).toBeNull()

      // Try to append to old request - should be ignored
      useChatStore.getState().appendChunk({ requestId: 'req-1', chunk: 'more' })
      expect(useChatStore.getState().messages[1].content).toBe('response')
    })
  })
})

// ---------------------------------------------------------------------------
// settingsStore: state consistency
// ---------------------------------------------------------------------------

describe('State consistency: settingsStore', () => {
  describe('rapid save operations', () => {
    it('multiple saves maintain correct final state', async () => {
      for (let i = 0; i < 10; i++) {
        const config = {
          name: `Config-${i}`,
          api_key: `key-${i}`,
          base_url: 'https://api.test.com',
          model: `model-${i}`,
          is_default: 0,
          task_type: null,
        }
        mockInvoke.mockResolvedValueOnce(i + 1) // db-save-ai-config
        mockInvoke.mockResolvedValueOnce([config]) // loadConfigs
        await useSettingsStore.getState().saveConfig(config)
      }

      const state = useSettingsStore.getState()
      expect(state.aiConfigs).toHaveLength(1) // Each load replaces the list
      expect(state.aiConfigs[0].name).toBe('Config-9')
      expect(state.saving).toBe(false)
    })
  })

  describe('save failure handling', () => {
    it('saveError is set and saving resets on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('disk full'))

      await expect(
        useSettingsStore.getState().saveConfig({
          name: 'test',
          api_key: 'key',
          base_url: 'url',
          model: 'model',
          is_default: 0,
          task_type: null,
        }),
      ).rejects.toThrow('disk full')

      const state = useSettingsStore.getState()
      expect(state.saveError).toBe('disk full')
      expect(state.saving).toBe(false)
    })

    it('saveError clears on next successful save', async () => {
      // First save fails
      mockInvoke.mockRejectedValueOnce(new Error('disk full'))
      await expect(
        useSettingsStore.getState().saveConfig({
          name: 'test',
          api_key: 'key',
          base_url: 'url',
          model: 'model',
          is_default: 0,
          task_type: null,
        }),
      ).rejects.toThrow()

      expect(useSettingsStore.getState().saveError).toBe('disk full')

      // Second save succeeds
      mockInvoke.mockResolvedValueOnce(1)
      mockInvoke.mockResolvedValueOnce([])
      await useSettingsStore.getState().saveConfig({
        name: 'test2',
        api_key: 'key2',
        base_url: 'url2',
        model: 'model2',
        is_default: 0,
        task_type: null,
      })

      expect(useSettingsStore.getState().saveError).toBeNull()
      expect(useSettingsStore.getState().saving).toBe(false)
    })
  })

  describe('delete + load consistency', () => {
    it('deleting all configs leaves empty list', async () => {
      useSettingsStore.setState({
        aiConfigs: [
          {
            id: 1,
            name: 'A',
            api_key: 'k1',
            base_url: 'u1',
            model: 'm1',
            is_default: 0,
            task_type: null,
          },
          {
            id: 2,
            name: 'B',
            api_key: 'k2',
            base_url: 'u2',
            model: 'm2',
            is_default: 0,
            task_type: null,
          },
        ],
      })

      mockInvoke.mockResolvedValueOnce(undefined) // delete id=1
      mockInvoke.mockResolvedValueOnce([
        {
          id: 2,
          name: 'B',
          api_key: 'k2',
          base_url: 'u2',
          model: 'm2',
          is_default: 0,
          task_type: null,
        },
      ])
      await useSettingsStore.getState().deleteConfig(1)

      mockInvoke.mockResolvedValueOnce(undefined) // delete id=2
      mockInvoke.mockResolvedValueOnce([])
      await useSettingsStore.getState().deleteConfig(2)

      expect(useSettingsStore.getState().aiConfigs).toEqual([])
    })
  })

  describe('load during save', () => {
    it('interleaved load and save maintain consistency', async () => {
      // Start a save
      const savePromise = (async () => {
        mockInvoke.mockResolvedValueOnce(1) // db-save-ai-config
        // Simulate a slow loadConfigs inside saveConfig
        await new Promise((r) => setTimeout(r, 10))
        mockInvoke.mockResolvedValueOnce([
          {
            id: 1,
            name: 'saved',
            api_key: '',
            base_url: '',
            model: '',
            is_default: 0,
            task_type: null,
          },
        ])
        await useSettingsStore.getState().saveConfig({
          name: 'saved',
          api_key: '',
          base_url: '',
          model: '',
          is_default: 0,
          task_type: null,
        })
      })()

      // Meanwhile, do a load
      mockInvoke.mockResolvedValueOnce([
        {
          id: 2,
          name: 'loaded',
          api_key: '',
          base_url: '',
          model: '',
          is_default: 0,
          task_type: null,
        },
      ])
      await useSettingsStore.getState().loadConfigs()

      await savePromise

      // Both should have completed without throwing
      const state = useSettingsStore.getState()
      expect(state.saving).toBe(false)
      expect(state.loading).toBe(false)
      expect(state.aiConfigs.length).toBeGreaterThanOrEqual(1)
    })
  })
})
