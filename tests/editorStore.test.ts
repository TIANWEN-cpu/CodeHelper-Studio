import { describe, it, expect, beforeEach } from 'vitest'

// editorStore has no external deps beyond constants, no mock needed
const { useEditorStore } = await import('../src/stores/editorStore')

function resetStore() {
  useEditorStore.setState({
    tabs: [
      {
        id: 'welcome',
        filename: 'welcome.py',
        language: 'python',
        content: '# Welcome\nprint("hello")\n',
      },
    ],
    activeTabId: 'welcome',
  })
}

beforeEach(() => {
  resetStore()
})

describe('editorStore', () => {
  describe('initial state', () => {
    it('starts with a welcome tab', () => {
      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe('welcome')
      expect(state.tabs[0].filename).toBe('welcome.py')
      expect(state.activeTabId).toBe('welcome')
    })
  })

  describe('addTab', () => {
    it('adds a new tab and makes it active', () => {
      const newTab = {
        id: 'tab-2',
        filename: 'test.js',
        language: 'javascript',
        content: 'console.log("hi")',
      }
      useEditorStore.getState().addTab(newTab)

      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.tabs[1]).toEqual(newTab)
      expect(state.activeTabId).toBe('tab-2')
    })

    it('preserves existing tabs when adding', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'a', filename: 'a.py', language: 'python', content: 'a' })
      useEditorStore
        .getState()
        .addTab({ id: 'b', filename: 'b.py', language: 'python', content: 'b' })

      expect(useEditorStore.getState().tabs).toHaveLength(3)
    })
  })

  describe('closeTab', () => {
    it('removes the specified tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      useEditorStore.getState().closeTab('tab-2')

      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe('welcome')
    })

    it('switches to first remaining tab when closing active tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      // activeTabId is now 'tab-2'
      expect(useEditorStore.getState().activeTabId).toBe('tab-2')

      useEditorStore.getState().closeTab('tab-2')

      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })

    it('sets activeTabId to null when closing the last tab', () => {
      useEditorStore.getState().closeTab('welcome')

      const state = useEditorStore.getState()
      expect(state.tabs).toHaveLength(0)
      expect(state.activeTabId).toBeNull()
    })

    it('does not change activeTabId when closing a non-active tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      useEditorStore.getState().setActiveTab('welcome')
      useEditorStore.getState().closeTab('tab-2')

      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })
  })

  describe('setActiveTab', () => {
    it('switches active tab', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: '' })
      useEditorStore.getState().setActiveTab('welcome')

      expect(useEditorStore.getState().activeTabId).toBe('welcome')
    })
  })

  describe('updateContent', () => {
    it('updates content of the specified tab', () => {
      useEditorStore.getState().updateContent('welcome', 'new content')

      expect(useEditorStore.getState().tabs[0].content).toBe('new content')
    })

    it('does not affect other tabs', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: 'original' })
      useEditorStore.getState().updateContent('welcome', 'changed')

      expect(useEditorStore.getState().tabs[1].content).toBe('original')
    })

    it('updates the correct tab among multiple', () => {
      useEditorStore
        .getState()
        .addTab({ id: 'tab-2', filename: 'x.py', language: 'python', content: 'a' })
      useEditorStore
        .getState()
        .addTab({ id: 'tab-3', filename: 'y.py', language: 'python', content: 'b' })
      useEditorStore.getState().updateContent('tab-2', 'updated-a')

      expect(useEditorStore.getState().tabs[0].content).toBe('# Welcome\nprint("hello")\n')
      expect(useEditorStore.getState().tabs[1].content).toBe('updated-a')
      expect(useEditorStore.getState().tabs[2].content).toBe('b')
    })
  })
})
