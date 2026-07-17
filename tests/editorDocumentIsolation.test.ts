import { readFileSync } from 'node:fs'
import { EditorState, type Transaction } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

function editorHarness(initialDocument: string) {
  let state = EditorState.create({ doc: initialDocument, extensions: [history()] })
  const view = {
    get state() {
      return state
    },
    dispatch(transaction: Transaction) {
      state = transaction.state
    },
  } as unknown as EditorView

  return {
    replace(document: string) {
      state = state.update({
        changes: { from: 0, to: state.doc.length, insert: document },
      }).state
    },
    undo() {
      return undo(view)
    },
    document() {
      return state.doc.toString()
    },
  }
}

describe('editor document isolation', () => {
  it('demonstrates why a reused CodeMirror history corrupts the next document', () => {
    const reused = editorHarness('tab A')
    reused.replace('tab A edited')
    reused.replace('tab B')

    expect(reused.undo()).toBe(true)
    expect(reused.document()).not.toBe('tab B')
  })

  it('keys the editor by execution scope and hydration epoch so restored views get fresh state', () => {
    const workspaceSource = readFileSync('src/views/WorkspaceView.tsx', 'utf8')
    const codeEditorSource = readFileSync('src/components/editor/CodeEditor.tsx', 'utf8')
    const isolated = editorHarness('tab B')

    expect(workspaceSource).toContain(
      'key={`${executionScopeId}:${isExerciseMode ? 0 : editorHydrationEpoch}`}',
    )
    expect(workspaceSource).toContain(
      'const editorHydrationEpoch = useEditorStore((state) => state.hydrationEpoch)',
    )
    expect(codeEditorSource).toContain('const [initialSelection] = useState')
    expect(codeEditorSource).toContain('const [restoredScrollTop] = useState')
    expect(codeEditorSource).toContain('editorView.requestMeasure({')
    expect(codeEditorSource).toContain(
      'if (active && view === editorView) view.scrollDOM.scrollTop = scrollTop',
    )
    expect(codeEditorSource).toContain('onChange={onChange}')
    expect(codeEditorSource).not.toContain('scrollElement.scrollTop = restoredScrollTop')
    expect(codeEditorSource).not.toContain('setTimeout(')
    expect(isolated.undo()).toBe(false)
    expect(isolated.document()).toBe('tab B')
  })
})
