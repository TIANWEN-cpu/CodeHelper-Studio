import { create } from 'zustand'

export interface EditorTab {
  id: string
  filename: string
  language: string
  content: string
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  addTab: (tab: EditorTab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  tabs: [
    {
      id: 'welcome',
      filename: 'welcome.py',
      language: 'python',
      content:
        '# 欢迎使用 CodeHelper!\n# 在这里编写你的代码\n\ndef hello():\n    print("Hello, CodeHelper!")\n\nhello()\n',
    },
  ],
  activeTabId: 'welcome',
  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),
  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId = s.activeTabId === id ? (tabs[0]?.id ?? null) : s.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
    })),
}))
