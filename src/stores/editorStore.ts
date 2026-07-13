import { create } from 'zustand'
import { normalizeEditorCursorPosition, type EditorCursorPosition } from '@/utils/editorViewState'

export type EditorTab = {
  id: string
  filename: string
  language: string
  content: string
  problemId?: string
  cursorPosition?: EditorCursorPosition
  scrollTop?: number
}

export const EDITOR_STORAGE_KEY = 'codehelper-editor-workspace'
export const LEGACY_EDITOR_STORAGE_KEY = 'codehelper-editor-tabs'
export const EDITOR_STORAGE_VERSION = 1

const PERSIST_DELAY_MS = 500
export const MAX_EDITOR_TABS = 50
const MAX_FILENAME_LENGTH = 255
const MAX_CONTENT_LENGTH = 5_000_000

export type EditorWorkspaceSnapshot = {
  version: number
  tabs: EditorTab[]
  activeTabId: string | null
}

type EditorStore = {
  tabs: EditorTab[]
  activeTabId: string | null
  cursorPosition: { line: number; column: number } | null
  scrollTop: number
  addTab: (tab: EditorTab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string | null) => void
  updateTab: (id: string, patch: Partial<EditorTab>) => void
  updateContent: (id: string, content: string) => void
  setCursorPosition: (position: { line: number; column: number } | null) => void
  setScrollTop: (scrollTop: number) => void
  updateCursorPosition: (id: string, lineNumber: number, column: number) => void
  updateScrollTop: (id: string, scrollTop: number) => void
  restoreTabs: (tabs?: EditorTab[], activeTabId?: string | null) => void
  hydrated: boolean
  dirty: boolean
  persistenceError: string | null
  lastPersistedAt: number | null
  recentlyClosedTabs: EditorTab[]
  reopenLastClosed: () => void
}

export const WELCOME_TAB_CONTENT = '# Welcome\nprint("hello")\n'

const welcomeTab: EditorTab = {
  id: 'welcome',
  filename: 'welcome.py',
  language: 'python',
  content: WELCOME_TAB_CONTENT,
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function normalizeTab(value: unknown): EditorTab | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<EditorTab>
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null
  if (typeof raw.filename !== 'string' || typeof raw.language !== 'string') return null
  if (typeof raw.content !== 'string' || raw.content.length > MAX_CONTENT_LENGTH) return null
  const cursorPosition = normalizeEditorCursorPosition(raw.cursorPosition)
  return {
    id: raw.id.trim().slice(0, 200),
    filename: raw.filename.slice(0, MAX_FILENAME_LENGTH),
    language: raw.language.slice(0, 40),
    content: raw.content,
    ...(typeof raw.problemId === 'string' ? { problemId: raw.problemId.slice(0, 200) } : {}),
    ...(cursorPosition ? { cursorPosition } : {}),
    ...(typeof raw.scrollTop === 'number' && Number.isFinite(raw.scrollTop)
      ? { scrollTop: Math.max(0, raw.scrollTop) }
      : {}),
  }
}

function normalizeTabs(value: unknown): EditorTab[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tabs: EditorTab[] = []
  for (const item of value) {
    const tab = normalizeTab(item)
    if (!tab || seen.has(tab.id)) continue
    seen.add(tab.id)
    tabs.push(tab)
    if (tabs.length >= MAX_EDITOR_TABS) break
  }
  return tabs
}

function readSnapshot(): EditorWorkspaceSnapshot | null {
  if (!canUseStorage()) return null
  try {
    const raw = window.localStorage.getItem(EDITOR_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EditorWorkspaceSnapshot>
      const tabs = normalizeTabs(parsed.tabs)
      if (parsed.version === EDITOR_STORAGE_VERSION && tabs.length > 0) {
        const activeTabId =
          typeof parsed.activeTabId === 'string' &&
          tabs.some((tab) => tab.id === parsed.activeTabId)
            ? parsed.activeTabId
            : tabs[0].id
        return { version: EDITOR_STORAGE_VERSION, tabs, activeTabId }
      }
    }

    // Migrate the original array-only format once.
    const legacy = window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY)
    if (!legacy) return null
    const tabs = normalizeTabs(JSON.parse(legacy))
    return tabs.length > 0
      ? { version: EDITOR_STORAGE_VERSION, tabs, activeTabId: tabs[0].id }
      : null
  } catch {
    try {
      const broken = window.localStorage.getItem(EDITOR_STORAGE_KEY)
      if (broken) {
        window.localStorage.setItem(
          `${EDITOR_STORAGE_KEY}.corrupt.${Date.now()}`,
          broken.slice(0, 100_000),
        )
      }
    } catch {
      // Best-effort backup only; the editor must still open with a clean tab.
    }
    return null
  }
}

export function flushPersistTabs(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!canUseStorage()) return
  const state = useEditorStore.getState()
  const tabs = normalizeTabs(state.tabs)
  if (tabs.length !== state.tabs.length) {
    useEditorStore.setState({ persistenceError: '工作区内容超过本地保存上限，请拆分文件后重试' })
    return
  }
  const snapshot: EditorWorkspaceSnapshot = {
    version: EDITOR_STORAGE_VERSION,
    tabs,
    activeTabId:
      state.activeTabId && state.tabs.some((tab) => tab.id === state.activeTabId)
        ? state.activeTabId
        : (state.tabs[0]?.id ?? null),
  }
  try {
    window.localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(snapshot))
    useEditorStore.setState({ dirty: false, persistenceError: null, lastPersistedAt: Date.now() })
  } catch (error) {
    useEditorStore.setState({
      persistenceError: error instanceof Error ? error.message : '工作区本地存储写入失败',
    })
  }
}

function schedulePersistTabs(): void {
  if (!canUseStorage()) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(flushPersistTabs, PERSIST_DELAY_MS)
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  tabs: [welcomeTab],
  activeTabId: 'welcome',
  cursorPosition: null,
  scrollTop: 0,
  hydrated: false,
  dirty: false,
  persistenceError: null,
  lastPersistedAt: null,
  recentlyClosedTabs: [],
  addTab: (tab) => {
    const normalized = normalizeTab(tab)
    if (!normalized) return
    set((state) => {
      const replacing = state.tabs.some((item) => item.id === normalized.id)
      if (!replacing && state.tabs.length >= MAX_EDITOR_TABS) {
        return { persistenceError: `工作区最多支持 ${MAX_EDITOR_TABS} 个标签` }
      }
      const tabs = state.tabs.filter((item) => item.id !== normalized.id)
      return { tabs: [...tabs, normalized], activeTabId: normalized.id, dirty: true }
    })
    schedulePersistTabs()
  },
  closeTab: (id) => {
    set((state) => {
      const closed = state.tabs.find((tab) => tab.id === id)
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      const activeTabId =
        state.activeTabId === id
          ? (tabs[Math.max(0, state.tabs.findIndex((tab) => tab.id === id) - 1)]?.id ?? null)
          : tabs.some((tab) => tab.id === state.activeTabId)
            ? state.activeTabId
            : (tabs[0]?.id ?? null)
      return {
        tabs,
        activeTabId,
        dirty: Boolean(closed) || state.dirty,
        recentlyClosedTabs: closed
          ? [closed, ...state.recentlyClosedTabs.filter((tab) => tab.id !== closed.id)].slice(0, 10)
          : state.recentlyClosedTabs,
      }
    })
    schedulePersistTabs()
  },
  reopenLastClosed: () => {
    set((state) => {
      const [tab, ...recentlyClosedTabs] = state.recentlyClosedTabs
      if (!tab) return state
      if (state.tabs.length >= MAX_EDITOR_TABS) {
        return { persistenceError: `工作区最多支持 ${MAX_EDITOR_TABS} 个标签` }
      }
      return {
        tabs: [...state.tabs.filter((item) => item.id !== tab.id), tab],
        activeTabId: tab.id,
        recentlyClosedTabs,
        dirty: true,
      }
    })
    schedulePersistTabs()
  },
  setActiveTab: (id) => {
    const next = id && get().tabs.some((tab) => tab.id === id) ? id : (get().tabs[0]?.id ?? null)
    set({ activeTabId: next, dirty: true })
    schedulePersistTabs()
  },
  updateTab: (id, patch) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
      dirty: true,
    }))
    schedulePersistTabs()
  },
  updateContent: (id, content) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, content } : tab)),
      dirty: true,
    }))
    schedulePersistTabs()
  },
  setCursorPosition: (cursorPosition) => set({ cursorPosition }),
  setScrollTop: (scrollTop) => set({ scrollTop }),
  updateCursorPosition: (id, lineNumber, column) => {
    const cursorPosition = normalizeEditorCursorPosition({ lineNumber, column })
    if (!cursorPosition) return
    const current = get().tabs.find((tab) => tab.id === id)?.cursorPosition
    if (
      !get().tabs.some((tab) => tab.id === id) ||
      (current?.lineNumber === cursorPosition.lineNumber &&
        current.column === cursorPosition.column)
    ) {
      return
    }
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, cursorPosition } : tab)),
      dirty: true,
    }))
    schedulePersistTabs()
  },
  updateScrollTop: (id, scrollTop) => {
    if (!Number.isFinite(scrollTop)) return
    const normalizedScrollTop = Math.max(0, scrollTop)
    const current = get().tabs.find((tab) => tab.id === id)
    if (!current || current.scrollTop === normalizedScrollTop) return
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, scrollTop: normalizedScrollTop } : tab,
      ),
      dirty: true,
    }))
    schedulePersistTabs()
  },
  restoreTabs: (tabs, activeTabId) => {
    if (!tabs && get().hydrated) return
    const snapshot = tabs ? { tabs: normalizeTabs(tabs), activeTabId } : readSnapshot()
    if (!snapshot || snapshot.tabs.length === 0) {
      set({ hydrated: true, dirty: false })
      return
    }
    const nextActive =
      snapshot.activeTabId && snapshot.tabs.some((tab) => tab.id === snapshot.activeTabId)
        ? snapshot.activeTabId
        : snapshot.tabs[0].id
    set({
      tabs: snapshot.tabs,
      activeTabId: nextActive,
      hydrated: true,
      dirty: false,
      persistenceError: null,
    })
  },
}))

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushPersistTabs)
  window.addEventListener('beforeunload', flushPersistTabs)
}
