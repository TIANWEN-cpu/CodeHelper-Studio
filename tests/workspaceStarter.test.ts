import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findWorkspaceStarterTarget, isEmptyEditorDocument } from '../src/utils/workspaceStarter'

describe('workspace starter initialization', () => {
  it('initializes only a truly empty or whitespace-only document', () => {
    expect(isEmptyEditorDocument('')).toBe(true)
    expect(isEmptyEditorDocument('  \n\t')).toBe(true)
  })

  it('never treats welcome, default, or user code as replaceable starter space', () => {
    expect(isEmptyEditorDocument('# Welcome\nprint("hello")\n')).toBe(false)
    expect(isEmptyEditorDocument('print("Hello, CodeHelper")')).toBe(false)
    expect(isEmptyEditorDocument('// user typed this')).toBe(false)
  })

  it('targets the visible empty file when the global active tab belongs to practice', () => {
    const tabs = [
      {
        id: 'workspace-empty',
        filename: 'untitled.py',
        language: 'python',
        content: '',
        kind: 'file' as const,
      },
      {
        id: 'exercise-active',
        filename: 'practice.py',
        language: 'python',
        content: '',
        kind: 'exercise' as const,
        problemId: 'exercise-1',
      },
    ]
    const globalActiveTabId = 'exercise-active'
    const visibleWorkspaceTabId = tabs.find((tab) => tab.kind === 'file')?.id ?? null

    expect(globalActiveTabId).not.toBe(visibleWorkspaceTabId)
    expect(findWorkspaceStarterTarget(tabs, visibleWorkspaceTabId)?.id).toBe('workspace-empty')

    const workspaceSource = readFileSync('src/views/WorkspaceView.tsx', 'utf8')
    expect(workspaceSource).toContain('findWorkspaceStarterTarget(state.tabs, activeVisibleTabId)')
    expect(workspaceSource).toContain(
      'const starterInitializationAttemptedRef = React.useRef(false)',
    )
    expect(workspaceSource).toContain('if (starterInitializationAttemptedRef.current) return')
    expect(workspaceSource).toContain('starterInitializationAttemptedRef.current = true')
  })

  it('never targets non-empty files, problems, or exercises', () => {
    const tabs = [
      { id: 'file', kind: 'file' as const, content: 'user code' },
      { id: 'problem', kind: 'problem' as const, content: '' },
      { id: 'exercise', kind: 'exercise' as const, content: '' },
      { id: 'legacy-problem', kind: 'file' as const, content: '', problemId: 'problem-1' },
    ]

    for (const tab of tabs) {
      expect(findWorkspaceStarterTarget(tabs, tab.id)).toBeNull()
    }
  })
})
