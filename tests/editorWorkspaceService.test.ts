import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const onEvent = vi.fn()

vi.mock('../src/services/ipc', () => ({ invoke, onEvent }))

const service = await import('../src/services/editorWorkspaceService')

beforeEach(() => {
  invoke.mockReset()
  onEvent.mockReset()
})

describe('editor workspace service', () => {
  it('uses the fixed default workspace for load and active-tab hints', async () => {
    await service.loadEditorWorkspace()
    await service.setActiveEditorTab('tab-a')

    expect(invoke).toHaveBeenNthCalledWith(1, 'editor-workspace-load', {
      workspaceId: 'default',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'editor-workspace-set-active', {
      workspaceId: 'default',
      activeTabId: 'tab-a',
    })
  })

  it('sends the complete local workspace through the atomic migration channel', async () => {
    const input = {
      workspaceId: 'default',
      mutationId: 'migration-1',
      clientId: 'client-a',
      storageVersion: 2,
      activeTabId: 'tab-a',
      tabs: [
        {
          id: 'tab-a',
          filename: 'a.py',
          language: 'python',
          content: 'print(1)',
          kind: 'problem' as const,
          cursorPosition: null,
          scrollTop: 0,
          position: 0,
          status: 'open' as const,
        },
      ],
    }

    await service.migrateLegacyEditorWorkspace(input)

    expect(invoke).toHaveBeenCalledWith('editor-workspace-migrate-legacy', input)
  })

  it('forwards the persisted tab kind on save', async () => {
    const input = {
      workspaceId: 'default',
      mutationId: 'save-exercise-a',
      clientId: 'client-a',
      id: 'exercise-a',
      filename: 'exercise.py',
      language: 'python',
      content: 'practice()',
      kind: 'exercise' as const,
      problemId: 'exercise-a',
      position: 0,
      baseRevision: 0,
    }

    await service.saveEditorTab(input)

    expect(invoke).toHaveBeenCalledWith('editor-tab-save', input)
  })

  it('forwards mutation identities unchanged to lifecycle channels', async () => {
    const input = {
      workspaceId: 'default',
      id: 'tab-a',
      mutationId: 'mutation-a',
      clientId: 'client-a',
      baseRevision: 2,
    }
    await service.closeEditorTab(input)
    await service.reopenEditorTab(input)
    await service.deleteEditorTab(input)

    expect(invoke).toHaveBeenNthCalledWith(1, 'editor-tab-close', input)
    expect(invoke).toHaveBeenNthCalledWith(2, 'editor-tab-reopen', input)
    expect(invoke).toHaveBeenNthCalledWith(3, 'editor-tab-delete', input)
  })

  it('subscribes to the typed cross-window mutation event', () => {
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    onEvent.mockReturnValue(unsubscribe)

    expect(service.onEditorWorkspaceChanged(callback)).toBe(unsubscribe)
    expect(onEvent).toHaveBeenCalledWith('editor-workspace-changed', expect.any(Function))

    const event = {
      sourceClientId: 'client-b',
      workspaceId: 'default',
      kind: 'saved',
      tab: { id: 'tab-a' },
      generation: 3,
    }
    const listener = onEvent.mock.calls[0][1] as (value: unknown) => void
    listener(event)
    expect(callback).toHaveBeenCalledWith(event)
  })
})
