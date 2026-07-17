import { readFileSync } from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EDITOR_RECOVERY_KEY_PREFIX,
  EDITOR_STORAGE_KEY,
  flushPersistTabs,
  useEditorStore,
  type EditorTab,
} from '../src/stores/editorStore'
import { DraftAutosaveCoordinator, type DraftSaveReceipt } from '../src/utils/draftAutosave'

const workspaceTabs: EditorTab[] = [
  { id: 'workspace-a', filename: 'main.py', language: 'python', content: '', kind: 'file' },
  { id: 'workspace-b', filename: 'other.py', language: 'python', content: '', kind: 'file' },
]

function resetWorkspace(): void {
  useEditorStore.setState({
    tabs: workspaceTabs.map((tab) => ({ ...tab })),
    activeTabId: 'workspace-a',
    hydrated: true,
    dirty: false,
    persistenceError: null,
    lastPersistedAt: null,
    recentlyClosedTabs: [],
    restoreStatus: 'restored',
    restoreMessage: null,
  })
}

describe('data-loss regressions', () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
        removeItem: vi.fn((key: string) => values.delete(key)),
      },
    })
    resetWorkspace()
  })

  afterEach(() => {
    flushPersistTabs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('keeps edited workspace code after an immediate tab and page switch', () => {
    useEditorStore.getState().updateContent('workspace-a', 'print("must survive")')
    useEditorStore.getState().setActiveTab('workspace-b')
    flushPersistTabs()

    expect(values.has(EDITOR_STORAGE_KEY)).toBe(true)
    resetWorkspace()
    useEditorStore.setState({ hydrated: false })
    useEditorStore.getState().restoreTabs()

    expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'workspace-a')?.content).toBe(
      'print("must survive")',
    )
    expect(useEditorStore.getState().activeTabId).toBe('workspace-b')
  })

  it('changes the workspace run language without replacing the document', () => {
    useEditorStore.getState().updateContent('workspace-a', 'custom user code')
    useEditorStore.getState().updateTab('workspace-a', {
      language: 'javascript',
      filename: 'main.js',
    })

    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      language: 'javascript',
      filename: 'main.js',
      content: 'custom user code',
    })
  })

  it('recovers an edit made immediately before an abnormal renderer exit', () => {
    useEditorStore.getState().updateContent('workspace-a', 'not even 500ms old')

    expect(values.has(EDITOR_STORAGE_KEY)).toBe(false)
    expect([...values.keys()].some((key) => key.startsWith(EDITOR_RECOVERY_KEY_PREFIX))).toBe(true)
    resetWorkspace()
    useEditorStore.setState({ hydrated: false })
    useEditorStore.getState().restoreTabs()

    expect(useEditorStore.getState().tabs.find((tab) => tab.id === 'workspace-a')?.content).toBe(
      'not even 500ms old',
    )
  })

  it('starts the latest practice draft write immediately when the view unmounts', async () => {
    let finishSave: ((receipt: DraftSaveReceipt) => void) | undefined
    const pendingSave = new Promise<DraftSaveReceipt>((resolve) => {
      finishSave = resolve
    })
    const save = vi.fn(() => pendingSave)
    const coordinator = new DraftAutosaveCoordinator(save, { delayMs: 60_000 })
    coordinator.setActive('exercise-a', { code: 'starter', language: 'python' }, 4)
    coordinator.update({ code: 'latest edit before navigation', language: 'python' })

    const disposing = coordinator.dispose()
    expect(save).toHaveBeenCalledWith(
      'exercise-a',
      { code: 'latest edit before navigation', language: 'python' },
      4,
    )
    finishSave?.({ revision: 5, updatedAt: '2026-07-14T00:00:00Z' })
    await disposing

    expect(coordinator.hasPending()).toBe(false)
  })

  it('does not claim an unprobed local toolchain is ready', () => {
    const source = readFileSync('src/views/WorkspaceView.tsx', 'utf8')

    expect(source).toContain("? '工具链探测中'")
    expect(source).toContain("languageToolchain?.status === 'ready'")
    expect(source).not.toContain('languageMeta(language).label} ready')
  })
})
