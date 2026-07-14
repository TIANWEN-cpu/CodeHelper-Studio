import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('editor workspace capability UI', () => {
  const source = readFileSync('src/views/WorkspaceView.tsx', 'utf8')
  const appSource = readFileSync('src/App.tsx', 'utf8')

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

  it('shows restoration progress and corrupted-data degradation instead of saved', () => {
    expect(source).toContain("? '工作区恢复中'")
    expect(source).toContain("? '工作区恢复降级'")
    expect(source).toContain('editorRestoreMessage')
    expect(source).toContain("? '工作区待保存'")
  })

  it('distinguishes file, problem, and exercise tabs in the visible workspace', () => {
    expect(source).toContain("kind: 'file'")
    expect(source).toContain("kind: 'problem'")
    expect(source).toContain("kind === 'exercise'")
    expect(source).toContain("if (kind === 'problem') return '题目'")
    expect(source).toContain("if (kind === 'exercise') return '练习'")
    // Exercise draft authority stays outside editor_tabs; the status bar says so.
    expect(source).toContain('草稿已同步')
    expect(source).toContain('草稿版本冲突')
    expect(source).toContain('isExerciseMode ? exerciseTabs : workspaceTabs')
  })

  it('restores and synchronizes the editor workspace once at application startup', () => {
    expect(appSource.match(/useEditorStore\.getState\(\)\.restoreTabs\(\)/g)).toHaveLength(1)
    expect(appSource.match(/void ensureEditorWorkspaceSync\(\)/g)).toHaveLength(1)
    expect(appSource).toContain("registerAppCloseFlushHandler('editor-workspace'")
    expect(appSource).toContain('unbindCloseLifecycle()')
    expect(appSource).toContain('unregisterWorkspace()')
  })

  it('gates starter code on an empty document', () => {
    expect(source).toContain('if (!isEmptyEditorDocument(current.content)) return')
  })
})
