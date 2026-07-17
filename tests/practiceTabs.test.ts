import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exerciseTabId } from '../src/stores/editorStore'
import { isPracticeTab, practiceTabKind } from '../src/utils/practiceTabs'

describe('practice editor tab kinds', () => {
  const practiceViewSource = readFileSync('src/views/PracticeView.tsx', 'utf8')
  const workspaceViewSource = readFileSync('src/views/WorkspaceView.tsx', 'utf8')

  it('maps imported problem records to real problem tabs', () => {
    expect(practiceTabKind('problem')).toBe('problem')
  })

  it('keeps built-in and legacy entries as exercise tabs', () => {
    expect(practiceTabKind('exercise')).toBe('exercise')
    expect(practiceTabKind(undefined)).toBe('exercise')
  })

  it('uses stable practice identity without hiding standalone problem tabs', () => {
    expect(isPracticeTab({ id: exerciseTabId('imported-problem'), kind: 'problem' })).toBe(true)
    expect(isPracticeTab({ id: exerciseTabId('built-in-exercise'), kind: 'exercise' })).toBe(true)
    expect(isPracticeTab({ id: 'workspace-problem', kind: 'problem' })).toBe(false)
    expect(isPracticeTab({ id: 'workspace-file', kind: 'file' })).toBe(false)
  })

  it('protects an active draft when another window closes its topology tab', () => {
    expect(practiceViewSource).toContain('onEditorWorkspaceChanged((event) =>')
    expect(practiceViewSource).toContain("event.kind !== 'closed'")
    expect(practiceViewSource).toContain('remoteCloseSignaled')
    expect(practiceViewSource).toContain('remotePracticeCloseHandlingRef')
    expect(practiceViewSource).toContain('deactivateExercise(snapshot.id)')
    expect(practiceViewSource).toContain("result.outcome === 'persistence-failed'")
    expect(practiceViewSource).toContain('preservePracticeTabLocally(snapshot)')
    expect(practiceViewSource).toContain('localOnly: true as const')
    expect(practiceViewSource).toContain('已在本窗口保留本地标签和内存内容')
    expect(practiceViewSource).toContain("resolveEditorWorkspaceConflict('use-database', tabId)")
  })

  it('does not mistake selection or a local close for a remote close', () => {
    expect(practiceViewSource).toContain('selectingExerciseIdsRef.current.has(currentExercise.id)')
    expect(practiceViewSource).toContain('locallyClosingTabIdsRef.current.has(tabId)')
    expect(practiceViewSource).toContain('knownOpenPracticeTabIdsRef.current.has(tabId)')
    expect(practiceViewSource).toContain('const resumesInMemoryDraft = currentExercise?.id === id')
    expect(practiceViewSource).toContain('if (!selected && !resumesInMemoryDraft) return false')
  })

  it('returns to the list with an explicit notice after a durable remote close', () => {
    expect(practiceViewSource).toContain('草稿已保存，已返回题库')
    expect(practiceViewSource).toContain('最新草稿仅保存在本地恢复区，已返回题库')
    expect(practiceViewSource).toContain("setTabCloseNotice({ tone: 'info', message })")
    expect(practiceViewSource).toContain("setViewMode('list')")
  })

  it('keeps recovery-only switches visibly degraded and confirms unsafe active closes', () => {
    expect(practiceViewSource).toContain('draftDegradedMessage,')
    expect(practiceViewSource).toContain('getPracticeDraftCloseWarning({')
    expect(practiceViewSource).toContain(
      'const recoveryOnlyState = getRecoveryOnlyDraftCloseState(tab.problemId)',
    )
    expect(practiceViewSource).toContain('getPracticeDraftCloseWarning(recoveryOnlyState)')
    expect(practiceViewSource).toContain('draftCloseWarning && !window.confirm(draftCloseWarning)')
    expect(practiceViewSource).toContain('草稿版本冲突仍未处理')
    expect(practiceViewSource).toContain('SQLite 草稿保存不可用')
    expect(workspaceViewSource).toContain('data-testid="practice-draft-degraded"')
    expect(workspaceViewSource).toContain("? '草稿仅本地保存'")
  })
})
