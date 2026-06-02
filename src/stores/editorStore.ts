import { create } from 'zustand'
import { DEFAULT_LANGUAGE } from '../constants'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorTab {
  id: string
  filename: string
  language: string
  content: string
  /** Cursor position (line, column) persisted for tab restore. */
  cursorPosition?: { lineNumber: number; column: number }
  /** Scroll position persisted for tab restore. */
  scrollTop?: number
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  addTab: (tab: EditorTab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  updateCursorPosition: (id: string, lineNumber: number, column: number) => void
  updateScrollTop: (id: string, scrollTop: number) => void
  restoreTabs: () => void
}

// ---------------------------------------------------------------------------
// Tab persistence (debounced to avoid writing on every keystroke)
// ---------------------------------------------------------------------------

const TABS_STORAGE_KEY = 'codehelper-editor-tabs'
const ACTIVE_TAB_KEY = 'codehelper-active-tab'
const PERSIST_DEBOUNCE_MS = 500

let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistTabs(tabs: EditorTab[], activeTabId: string | null): void {
  // Debounce: batch rapid writes (e.g. during typing)
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      const tabsMeta = tabs.map((t) => ({
        id: t.id,
        filename: t.filename,
        language: t.language,
        content: t.content,
        cursorPosition: t.cursorPosition,
        scrollTop: t.scrollTop,
      }))
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabsMeta))
      if (activeTabId) {
        localStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
      }
    } catch {
      // localStorage might be full; silently ignore
    }
  }, PERSIST_DEBOUNCE_MS)
}

/** Flush any pending persistence immediately (call on app unload). */
export function flushPersistTabs(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
    // Force synchronous write
    try {
      const { tabs, activeTabId } = useEditorStore.getState()
      const tabsMeta = tabs.map((t) => ({
        id: t.id,
        filename: t.filename,
        language: t.language,
        content: t.content,
        cursorPosition: t.cursorPosition,
        scrollTop: t.scrollTop,
      }))
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabsMeta))
      if (activeTabId) {
        localStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
      }
    } catch {
      // ignore
    }
  }
}

function loadPersistedTabs(): { tabs: EditorTab[]; activeTabId: string | null } {
  try {
    const rawTabs = localStorage.getItem(TABS_STORAGE_KEY)
    const rawActive = localStorage.getItem(ACTIVE_TAB_KEY)
    if (rawTabs) {
      const tabs = JSON.parse(rawTabs) as EditorTab[]
      if (tabs.length > 0) {
        return { tabs, activeTabId: rawActive ?? tabs[0].id }
      }
    }
  } catch {
    // ignore parse errors
  }
  return { tabs: [], activeTabId: null }
}

const DEFAULT_TAB: EditorTab = {
  id: 'welcome',
  filename: 'welcome.py',
  language: DEFAULT_LANGUAGE,
  content:
    '# 欢迎使用 CodeHelper!\n# 在这里编写你的代码\n\ndef hello():\n    print("Hello, CodeHelper!")\n\nhello()\n',
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const { tabs: persistedTabs, activeTabId: persistedActiveTab } = loadPersistedTabs()
const initialTabs = persistedTabs.length > 0 ? persistedTabs : [DEFAULT_TAB]
const initialActiveId = persistedActiveTab ?? initialTabs[0]?.id ?? null

export const useEditorStore = create<EditorState>((set, _get) => ({
  tabs: initialTabs,
  activeTabId: initialActiveId,

  addTab: (tab) =>
    set((s) => {
      const newTabs = [...s.tabs, tab]
      persistTabs(newTabs, tab.id)
      return { tabs: newTabs, activeTabId: tab.id }
    }),

  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId = s.activeTabId === id ? (tabs[0]?.id ?? null) : s.activeTabId
      persistTabs(tabs, activeTabId)
      return { tabs, activeTabId }
    }),

  setActiveTab: (id) =>
    set((s) => {
      persistTabs(s.tabs, id)
      return { activeTabId: id }
    }),

  updateContent: (id, content) =>
    set((s) => {
      const newTabs = s.tabs.map((t) => (t.id === id ? { ...t, content } : t))
      persistTabs(newTabs, s.activeTabId)
      return { tabs: newTabs }
    }),

  updateCursorPosition: (id, lineNumber, column) =>
    set((s) => {
      const newTabs = s.tabs.map((t) =>
        t.id === id ? { ...t, cursorPosition: { lineNumber, column } } : t,
      )
      persistTabs(newTabs, s.activeTabId)
      return { tabs: newTabs }
    }),

  updateScrollTop: (id, scrollTop) =>
    set((s) => {
      const newTabs = s.tabs.map((t) => (t.id === id ? { ...t, scrollTop } : t))
      persistTabs(newTabs, s.activeTabId)
      return { tabs: newTabs }
    }),

  restoreTabs: () => {
    const { tabs, activeTabId } = loadPersistedTabs()
    if (tabs.length > 0) {
      set({ tabs, activeTabId })
    }
  },
}))

// Flush pending persistence on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPersistTabs)
}
