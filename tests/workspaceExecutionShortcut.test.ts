import { describe, expect, it } from 'vitest'
import { getWorkspaceExecutionShortcut } from '../src/utils/workspaceExecutionShortcut'

function keyEvent(overrides: Partial<Parameters<typeof getWorkspaceExecutionShortcut>[0]> = {}) {
  return {
    key: 'Enter',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    repeat: false,
    ...overrides,
  }
}

describe('workspace execution shortcut', () => {
  it('maps Ctrl/Cmd+Enter to one run action', () => {
    expect(getWorkspaceExecutionShortcut(keyEvent())).toBe('run')
    expect(getWorkspaceExecutionShortcut(keyEvent({ ctrlKey: false, metaKey: true }))).toBe('run')
  })

  it('maps Shift+Ctrl/Cmd+Enter to submit instead of run', () => {
    expect(getWorkspaceExecutionShortcut(keyEvent({ shiftKey: true }))).toBe('submit')
  })

  it('does not override handled, repeated, Alt, or unrelated keys', () => {
    expect(getWorkspaceExecutionShortcut(keyEvent({ defaultPrevented: true }))).toBeNull()
    expect(getWorkspaceExecutionShortcut(keyEvent({ repeat: true }))).toBeNull()
    expect(getWorkspaceExecutionShortcut(keyEvent({ altKey: true }))).toBeNull()
    expect(getWorkspaceExecutionShortcut(keyEvent({ key: 'Space' }))).toBeNull()
  })
})
