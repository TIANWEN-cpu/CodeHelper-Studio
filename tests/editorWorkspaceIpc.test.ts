import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestIpcHandler = (...args: unknown[]) => Promise<unknown>

const handlers: Record<string, TestIpcHandler> = {}
const send = vi.fn()
const windows = [
  { webContents: { id: 1, isDestroyed: () => false, send } },
  { webContents: { id: 2, isDestroyed: () => false, send } },
]

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = async (...args: unknown[]) => handler(...args)
    }),
  },
  BrowserWindow: { getAllWindows: () => windows },
}))

const mockLoad = vi.fn()
const mockMigrate = vi.fn()
const mockSave = vi.fn()
const mockUpdateViewState = vi.fn()
const mockClose = vi.fn()
const mockReopen = vi.fn()
const mockDelete = vi.fn()
const mockSetActive = vi.fn()
vi.mock('../electron/db/editorWorkspaceRepository', () => ({
  DEFAULT_EDITOR_WORKSPACE_ID: 'default',
  loadEditorWorkspace: (...args: unknown[]) => mockLoad(...args),
  migrateLegacyEditorWorkspace: (...args: unknown[]) => mockMigrate(...args),
  saveEditorTab: (...args: unknown[]) => mockSave(...args),
  updateEditorTabViewState: (...args: unknown[]) => mockUpdateViewState(...args),
  closeEditorTab: (...args: unknown[]) => mockClose(...args),
  reopenEditorTab: (...args: unknown[]) => mockReopen(...args),
  deleteEditorTab: (...args: unknown[]) => mockDelete(...args),
  setActiveEditorTab: (...args: unknown[]) => mockSetActive(...args),
}))

const mockDB = {}
vi.mock('../electron/db/index', () => ({ getDB: () => mockDB }))

const { registerEditorWorkspaceIPC } = await import('../electron/ipc/editorWorkspace')

const event = { sender: { id: 1 } }
const identity = {
  workspaceId: 'default',
  mutationId: 'mutation-a',
  clientId: 'client-a',
}

beforeEach(() => {
  send.mockReset()
  mockLoad.mockReset()
  mockMigrate.mockReset()
  mockSave.mockReset()
  mockUpdateViewState.mockReset()
  mockClose.mockReset()
  mockReopen.mockReset()
  mockDelete.mockReset()
  mockSetActive.mockReset()
  registerEditorWorkspaceIPC()
})

describe('editor workspace IPC', () => {
  it('validates saves and broadcasts applied mutations with source metadata', async () => {
    mockSave.mockReturnValue({
      status: 'saved',
      applied: true,
      generation: 4,
      tab: { id: 'tab-a', revision: 1 },
    })
    await handlers['editor-tab-save'](event, {
      ...identity,
      id: 'tab-a',
      filename: 'a.py',
      language: 'python',
      content: 'print(1)',
      kind: 'problem',
      problemId: null,
      position: 0,
      baseRevision: 0,
    })

    expect(mockSave).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        workspaceId: 'default',
        mutationId: 'mutation-a',
        clientId: 'client-a',
        id: 'tab-a',
        kind: 'problem',
        baseRevision: 0,
      }),
    )
    expect(send).toHaveBeenCalledWith('editor-workspace-changed', {
      sourceClientId: 'client-a',
      workspaceId: 'default',
      kind: 'saved',
      tab: { id: 'tab-a', revision: 1 },
      generation: 4,
    })
  })

  it('does not rebroadcast conflicts or idempotent retries and rejects unsafe bounds', async () => {
    mockSave.mockReturnValue({ status: 'conflict', current: null, generation: 1 })
    await handlers['editor-tab-save'](event, {
      ...identity,
      id: 'tab-a',
      filename: 'a.py',
      language: 'python',
      content: 'print(1)',
      position: 0,
      baseRevision: 0,
    })
    expect(mockSave).toHaveBeenLastCalledWith(
      mockDB,
      expect.objectContaining({ id: 'tab-a', kind: 'file' }),
    )
    expect(send).not.toHaveBeenCalled()

    mockSave.mockReturnValue({
      status: 'saved',
      applied: false,
      generation: 1,
      tab: { id: 'tab-a', revision: 1 },
    })
    await handlers['editor-tab-save'](event, {
      ...identity,
      id: 'tab-a',
      filename: 'a.py',
      language: 'python',
      content: 'print(1)',
      position: 0,
      baseRevision: 0,
    })
    expect(send).not.toHaveBeenCalled()

    await expect(
      handlers['editor-tab-save'](event, {
        ...identity,
        id: 'tab-a',
        filename: 'a.py',
        language: 'python',
        content: 'x'.repeat(5_000_001),
        position: 0,
        baseRevision: 0,
      }),
    ).rejects.toThrow('无法保存')
    await expect(
      handlers['editor-tab-close'](event, { ...identity, id: 'tab-a', baseRevision: 0 }),
    ).rejects.toThrow('baseRevision')
    await expect(
      handlers['editor-tab-save'](event, {
        ...identity,
        mutationId: '',
        id: 'tab-a',
        filename: 'a.py',
        language: 'python',
        content: '',
        position: 0,
        baseRevision: 0,
      }),
    ).rejects.toThrow('mutationId')
    await expect(
      handlers['editor-tab-save'](event, {
        ...identity,
        id: 'tab-a',
        filename: 'a.py',
        language: 'python',
        content: '',
        kind: 'unknown',
        position: 0,
        baseRevision: 0,
      }),
    ).rejects.toThrow('kind')
    await expect(
      handlers['editor-workspace-load'](event, { workspaceId: 'unexpected' }),
    ).rejects.toThrow('workspaceId')
  })

  it('forwards view, lifecycle, load, and active-tab operations', async () => {
    const saved = (revision: number) => ({
      status: 'saved',
      applied: true,
      generation: revision,
      tab: { id: 'tab-a', revision },
    })
    mockLoad.mockReturnValue({ workspaceId: 'default', tabs: [] })
    mockMigrate.mockReturnValue({
      status: 'migrated',
      workspace: { workspaceId: 'default', tabs: [] },
      recoveredTabIds: [],
      recoveredTabMappings: {},
    })
    mockUpdateViewState.mockReturnValue({
      status: 'saved',
      applied: true,
      generation: 1,
      viewState: {
        workspaceId: 'default',
        id: 'tab-a',
        cursorPosition: { lineNumber: 2, column: 3 },
        scrollTop: 42,
        status: 'open',
        revision: 1,
        viewUpdatedAt: '2026-01-01T00:00:00Z',
      },
    })
    mockClose.mockReturnValue(saved(2))
    mockReopen.mockReturnValue(saved(3))
    mockDelete.mockReturnValue(saved(4))
    mockSetActive.mockReturnValue({ activeTabId: 'tab-a', generation: 5 })

    await handlers['editor-workspace-load'](event, { workspaceId: 'default' })
    await handlers['editor-workspace-migrate-legacy'](event, {
      ...identity,
      storageVersion: 2,
      activeTabId: 'tab-a',
      tabs: [
        {
          id: 'tab-a',
          filename: 'a.py',
          language: 'python',
          content: 'print(1)',
          kind: 'exercise',
          problemId: null,
          cursorPosition: { lineNumber: 2, column: 3 },
          scrollTop: 42,
          position: 0,
          status: 'open',
        },
      ],
    })
    await handlers['editor-tab-update-view-state'](event, {
      ...identity,
      id: 'tab-a',
      cursorPosition: { lineNumber: 2, column: 3 },
      scrollTop: 42,
    })
    await handlers['editor-tab-close'](event, {
      ...identity,
      mutationId: 'mutation-close',
      id: 'tab-a',
      baseRevision: 1,
    })
    await handlers['editor-tab-reopen'](event, {
      ...identity,
      mutationId: 'mutation-reopen',
      id: 'tab-a',
      baseRevision: 2,
    })
    await handlers['editor-tab-delete'](event, {
      ...identity,
      mutationId: 'mutation-delete',
      id: 'tab-a',
      baseRevision: 3,
    })
    await handlers['editor-workspace-set-active'](event, {
      workspaceId: 'default',
      activeTabId: 'tab-a',
    })

    expect(mockLoad).toHaveBeenCalledWith(mockDB, 'default')
    expect(mockMigrate).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        workspaceId: 'default',
        storageVersion: 2,
        activeTabId: 'tab-a',
        tabs: [expect.objectContaining({ id: 'tab-a', kind: 'exercise', status: 'open' })],
      }),
    )
    expect(mockUpdateViewState).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({ id: 'tab-a', scrollTop: 42 }),
    )
    expect(mockClose).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({ id: 'tab-a', baseRevision: 1 }),
    )
    expect(mockReopen).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({ id: 'tab-a', baseRevision: 2 }),
    )
    expect(mockDelete).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({ id: 'tab-a', baseRevision: 3 }),
    )
    expect(mockSetActive).toHaveBeenCalledWith(mockDB, 'default', 'tab-a')
    expect(send).toHaveBeenCalledTimes(4)
    expect(send).toHaveBeenCalledWith(
      'editor-workspace-changed',
      expect.objectContaining({
        kind: 'view-state',
        viewState: expect.objectContaining({ id: 'tab-a', scrollTop: 42 }),
      }),
    )
    const viewBroadcast = send.mock.calls.find((call) => call[1]?.kind === 'view-state')?.[1]
    expect(viewBroadcast).not.toHaveProperty('tab')
    expect(viewBroadcast.viewState).not.toHaveProperty('content')
  })
})
