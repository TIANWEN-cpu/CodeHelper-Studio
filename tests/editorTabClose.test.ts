import { describe, expect, it } from 'vitest'
import { getEditorTabCloseWarning } from '../src/utils/editorTabClose'

describe('editor tab close confirmation', () => {
  it('does not interrupt closing a recoverably saved tab', () => {
    expect(
      getEditorTabCloseWarning({
        pending: false,
        conflict: false,
        degraded: false,
        persistenceError: null,
        error: null,
      }),
    ).toBeNull()
  })

  it('requires an explicit decision when persistence failed', () => {
    const warning = getEditorTabCloseWarning({
      pending: true,
      conflict: false,
      degraded: true,
      persistenceError: 'disk quota exceeded',
      error: 'database unavailable',
    })
    expect(warning).toContain('disk quota exceeded')
    expect(warning).toContain('标签会保持打开')
  })

  it('requires confirmation while SQLite is pending or conflicted', () => {
    expect(
      getEditorTabCloseWarning({
        pending: true,
        conflict: false,
        degraded: false,
        persistenceError: null,
        error: null,
      }),
    ).toContain('同步尚未完成')
    expect(
      getEditorTabCloseWarning({
        pending: false,
        conflict: true,
        degraded: false,
        persistenceError: null,
        error: 'stale revision',
      }),
    ).toContain('冲突')
  })
})
