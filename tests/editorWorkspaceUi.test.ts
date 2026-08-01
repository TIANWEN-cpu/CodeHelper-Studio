import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('editor workspace capability UI', () => {
  const source = readFileSync('src/views/WorkspaceView.tsx', 'utf8')
  const appSource = readFileSync('src/App.tsx', 'utf8')
  const practiceHookSource = readFileSync('src/hooks/usePracticeData.ts', 'utf8')
  const practiceSessionSource = readFileSync('src/services/practiceDraftSession.ts', 'utf8')
  const practiceViewSource = readFileSync('src/views/PracticeView.tsx', 'utf8')

  it('exposes all explicit database conflict recovery choices', () => {
    expect(source).toContain('采用数据库会替换当前标签')
    expect(source).toContain('<Download size={12} /> 采用数据库')
    expect(source).toContain('<Upload size={12} /> 保留本地')
    expect(source).toContain('<CopyPlus size={12} /> 另存副本')
    expect(source).toContain('disabled={resolvingConflict}')
    expect(source).toContain('resolveEditorWorkspaceConflict(resolution, conflict.tabId)')
  })

  it('waits for the durable close path and labels degraded persistence honestly', () => {
    expect(source).toContain('await requestCloseEditorWorkspaceTab(tabId)')
    expect(source).toContain('await closeEditorWorkspaceTabLocally(tabId)')
    expect(source).toContain('工作区仅本地保存')
    expect(source).toContain('标签保持打开；请先处理数据库冲突或同步失败')
    expect(source).toContain('仅在本地关闭')
  })

  it('uses design-system confirmation dialogs in destructive views', () => {
    for (const path of [
      'src/views/ReviewView.tsx',
      'src/views/settings/AIModelSettings.tsx',
      'src/views/settings/MemorySettings.tsx',
    ]) {
      const viewSource = readFileSync(path, 'utf8')
      expect(viewSource).not.toContain('window.confirm')
      expect(viewSource).toContain('ConfirmDialog')
    }
  })

  it('shows restoration progress and corrupted-data degradation instead of saved', () => {
    const workspaceStatusStart = source.indexOf(
      ": !editorHydrated || editorDatabaseStatus === 'idle'",
    )
    const degradedIndex = source.indexOf(
      "editorDatabaseStatus === 'degraded'",
      workspaceStatusStart,
    )
    const recoveredIndex = source.indexOf(
      "editorRestoreStatus === 'recovered'",
      workspaceStatusStart,
    )

    expect(source).toContain("? '工作区恢复中'")
    expect(source).toContain("? '工作区恢复降级'")
    expect(source).toContain('editorRestoreMessage')
    expect(source).toContain("? '工作区待保存'")
    expect(source).toContain("? '工作区已恢复'")
    expect(source).toContain('已恢复上次异常退出前的工作区内容')
    expect(workspaceStatusStart).toBeGreaterThan(-1)
    expect(degradedIndex).toBeGreaterThan(workspaceStatusStart)
    expect(recoveredIndex).toBeGreaterThan(degradedIndex)
  })

  it('distinguishes file, problem, and exercise tabs in the visible workspace', () => {
    expect(source).toContain("kind: 'file'")
    expect(source).toContain("kind: 'problem'")
    expect(source).toContain("kind === 'exercise'")
    expect(source).toContain("if (kind === 'problem') return '题目'")
    expect(source).toContain("if (kind === 'exercise') return '练习'")
    // Exercise drafts and practice-tab topology report durability independently.
    expect(source).toContain('草稿与标签已同步')
    expect(source).toContain('草稿版本冲突')
    expect(source).toContain('isExerciseMode ? exerciseTabs : workspaceTabs')
    expect(source).toContain('isPracticeTab(tab)')
    expect(source).toContain('标签数据库冲突')
    expect(source).toContain('标签仅本地保存')
  })

  it('persists cursor and scroll state for exercise tabs as well as files and problems', () => {
    expect(source).toContain('onCursorPositionChange={handleCursorPositionChange}')
    expect(source).toContain('onScrollTopChange={handleScrollTopChange}')
    expect(source).not.toContain('onCursorPositionChange={isExerciseMode ? undefined')
    expect(source).not.toContain('onScrollTopChange={isExerciseMode ? undefined')
  })

  it('shows a recovered practice draft explicitly and clears the notice at lifecycle boundaries', () => {
    expect(practiceSessionSource).toContain('resolved.recovered && !resolved.conflict')
    expect(practiceSessionSource).toContain('已从本地恢复区恢复上次未完成保存的练习草稿')
    expect(practiceSessionSource).toContain('this.patch({ draftRestoreMessage: null })')
    expect(practiceHookSource).toContain('useSyncExternalStore(')
    expect(practiceHookSource).toContain('void practiceDraftSession.flushDraft()')
    expect(practiceViewSource).toContain('draftRestoreMessage,')
    expect(source).toContain('data-testid="practice-draft-restored"')
    expect(source).toContain("? '草稿已恢复'")
  })

  it('keeps the last practice tab closed across remounts and reports fallback failures', () => {
    const clearIndex = practiceViewSource.indexOf('const sessionResult = clearPracticeSession()')
    const closeIndex = practiceViewSource.indexOf('await requestCloseEditorWorkspaceTab(tabId)')

    expect(clearIndex).toBeGreaterThan(-1)
    expect(closeIndex).toBeGreaterThan(clearIndex)
    expect(practiceViewSource).toContain('if (!sessionResult.persisted)')
    expect(practiceViewSource).toContain('标签保持打开')
    expect(practiceViewSource).toContain('重启恢复将以标签工作区为准')
    expect(practiceViewSource).toContain('const target = pending ?? activeExercise?.problemId ??')
  })

  it('restores and synchronizes the editor workspace once at application startup', () => {
    expect(appSource.match(/useEditorStore\.getState\(\)\.restoreTabs\(\)/g)).toHaveLength(1)
    expect(appSource.match(/void ensureEditorWorkspaceSync\(\)/g)).toHaveLength(1)
    expect(appSource).toContain("registerAppCloseFlushHandler('editor-workspace'")
    expect(appSource).toContain('unbindCloseLifecycle()')
    expect(appSource).toContain('unregisterWorkspace()')
  })

  it('gates starter code on an empty document', () => {
    expect(source).toContain('findWorkspaceStarterTarget(state.tabs, activeVisibleTabId)')
    expect(source).toContain('if (!current) {')
    expect(source).toContain('if (starterInitializationAttemptedRef.current) return')
    expect(source).toContain('starterInitializationAttemptedRef.current = true')
  })

  it('requires explicit consent before any code runs without strong isolation', () => {
    expect(source).toContain('confirmUntrustedLocalExecution')
    expect(source).toContain('incomplete provenance')
    expect(source).toContain('requires acknowledgement')
    expect(source).toContain('不是容器或 AppContainer')
    expect(source).toContain(
      "executionMode === 'local-controlled' && !(await confirmUntrustedLocalExecution())",
    )
    // All confirmations go through the design-system ConfirmDialog, never window.confirm.
    expect(source).not.toContain('window.confirm')
    expect(source).toContain('ConfirmDialog')
  })

  it('uses Docker capability instead of host toolchains for strong isolation', () => {
    expect(source).toContain('strongIsolationAvailable')
    expect(source).toContain('strongIsolationReason')
    expect(source).toContain('STRONG_ISOLATION_LANGUAGES')
    expect(source).toContain("executionMode === 'strong-isolation'")
    expect(source).toContain('Docker 强隔离')
    expect(source).toContain('本地受控')
    expect(source).toContain('强隔离')
  })
})
