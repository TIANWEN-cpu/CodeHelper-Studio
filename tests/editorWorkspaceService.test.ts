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
