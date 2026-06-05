import { create } from 'zustand'

export type EditorTab = {
  id: string
  filename: string
  language: string
  content: string
  cursorPosition?: { lineNumber: number; column: number }
  scrollTop?: number
}

type EditorStore = {
  tabs: EditorTab[]
  activeTabId: string | null
  cursorPosition: { line: number; column: number } | null
  scrollTop: number
  addTab: (tab: EditorTab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  updateContent: (id: string, content: string) => void
  setCursorPosition: (position: { line: number; column: number } | null) => void
  setScrollTop: (scrollTop: number) => void
  updateCursorPosition: (id: string, lineNumber: number, column: number) => void
  updateScrollTop: (id: string, scrollTop: number) => void
  restoreTabs: (tabs?: EditorTab[], activeTabId?: string | null) => void
}

const welcomeTab: EditorTab = {
  id: 'welcome',
  filename: 'welcome.py',
  language: 'python',
  content: '# Welcome\nprint("hello")\n',
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  tabs: [welcomeTab],
  activeTabId: 'welcome',
  cursorPosition: null,
  scrollTop: 0,
  addTab: (tab) => set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id })),
  closeTab: (id) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeTabId =
        state.activeTabId === id ? (tabs.length > 0 ? tabs[0].id : null) : state.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateContent: (id, content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, content } : tab)),
    })),
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setScrollTop: (scrollTop) => set({ scrollTop }),
  updateCursorPosition: (id, lineNumber, column) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, cursorPosition: { lineNumber, column } } : tab,
      ),
    })),
  updateScrollTop: (id, scrollTop) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, scrollTop } : tab)),
    })),
  restoreTabs: (tabs, activeTabId) =>
    set(() => {
      let nextTabs = tabs
      if (!nextTabs) {
        try {
          const raw = localStorage.getItem('codehelper-editor-tabs')
          const parsed = raw ? (JSON.parse(raw) as EditorTab[]) : []
          nextTabs = Array.isArray(parsed) ? parsed : []
        } catch {
          nextTabs = []
        }
      }
      if (nextTabs.length === 0) {
        return { tabs: get().tabs, activeTabId: get().activeTabId }
      }
      return { tabs: nextTabs, activeTabId: activeTabId ?? nextTabs[0]?.id ?? null }
    }),
}))
