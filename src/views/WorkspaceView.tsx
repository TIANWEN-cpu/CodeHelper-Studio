import React, { useState, useEffect, useCallback } from 'react'
import {
  Play,
  Save,
  FileCode2,
  ChevronDown,
  Check,
  X,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  Copy,
  Plus,
  Undo2,
  RefreshCw,
  Upload,
  Download,
  CopyPlus,
  FileQuestion,
  Dumbbell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { useWorkspaceData } from '@/hooks/useWorkspaceData'
import { useAppStore } from '@/store'
import { toast } from '@/stores/toastStore'
import { CodeEditor } from '@/components/editor/CodeEditor'
import type { SubmitResult as ExerciseSubmitResult } from '@/services/practiceService'
import { MAX_EDITOR_TABS, useEditorStore, type EditorTabKind } from '@/stores/editorStore'
import { isEmptyEditorDocument } from '@/utils/workspaceStarter'
import { getEditorTabCloseWarning } from '@/utils/editorTabClose'
import {
  closeEditorWorkspaceTabLocally,
  ensureEditorWorkspaceSync,
  getEditorTabPersistenceState,
  getEditorWorkspaceConflict,
  requestCloseEditorWorkspaceTab,
  resolveEditorWorkspaceConflict,
  type EditorWorkspaceConflictResolution,
} from '@/services/editorWorkspaceSync'

const DEFAULT_WORKSPACE_CODE = `# 从左侧题库或工作区题目加载 starter code 后开始编码
print("Hello, CodeHelper")`

/**
 * 工作区可运行语言 → 显示名 / 文件后缀 / 终端示意命令。
 * 与 electron/utils/codeRunner.ts 后端真实支持的语言保持一致：
 * python / javascript(node) / c / cpp / csharp / sql。
 */
const LANGUAGE_META: Record<string, { label: string; ext: string; cmd: string }> = {
  python: { label: 'Python', ext: 'py', cmd: 'python' },
  javascript: { label: 'JavaScript (Node)', ext: 'js', cmd: 'node' },
  c: { label: 'C', ext: 'c', cmd: 'gcc' },
  cpp: { label: 'C++', ext: 'cpp', cmd: 'g++' },
  csharp: { label: 'C#', ext: 'cs', cmd: 'csc' },
  sql: { label: 'SQL', ext: 'sql', cmd: 'sqlite3' },
}

function languageMeta(language: string): { label: string; ext: string; cmd: string } {
  return LANGUAGE_META[language] ?? { label: language, ext: 'txt', cmd: language }
}

function editorTabKindLabel(kind: EditorTabKind): string {
  if (kind === 'problem') return '题目'
  if (kind === 'exercise') return '练习'
  return '文件'
}

function EditorTabKindIcon({ kind, size = 14 }: { kind: EditorTabKind; size?: number }) {
  const label = editorTabKindLabel(kind)
  const icon =
    kind === 'problem' ? (
      <FileQuestion size={size} className="text-[#F59E0B]" aria-hidden="true" />
    ) : kind === 'exercise' ? (
      <Dumbbell size={size} className="text-[#34D399]" aria-hidden="true" />
    ) : (
      <FileCode2 size={size} className="text-[#38BDF8]" aria-hidden="true" />
    )
  return (
    <span title={`${label}标签`} aria-label={`${label}标签`} className="inline-flex shrink-0">
      {icon}
    </span>
  )
}

function safeFileBaseName(input: string | undefined): string {
  const base = (input || 'main')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || 'main'
}

function coerceStarterCode(raw: unknown, language: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const text = raw.trim()
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') return parsed
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const candidate = record[language] ?? record.python ?? record.javascript
      if (typeof candidate === 'string') return candidate
    }
  } catch {
    // starter_code is often plain code, not JSON.
  }
  return raw
}

interface WorkspaceExerciseContext {
  id: string
  tabId: string
  title: string
  code: string
  setCode: (code: string) => void
  language: string
  setLanguage: (language: string) => void
  submitResult: ExerciseSubmitResult | null
  isSubmitting: boolean
  submitCode: (exerciseId: string, code: string, language: string) => Promise<void>
  draftSaving?: boolean
  draftDirty?: boolean
  draftError?: string | null
  draftConflict?: boolean
  keepLocalDraft?: () => void
  reloadPersistedDraft?: () => void
  selectTab: (exerciseId: string) => Promise<boolean>
  closeTab: (tabId: string) => Promise<void>
}

interface WorkspaceViewProps {
  hideExplorer?: boolean
  exerciseContext?: WorkspaceExerciseContext | null
}

export function WorkspaceView({
  hideExplorer = false,
  exerciseContext = null,
}: WorkspaceViewProps) {
  const {
    runResult,
    isRunning,
    runCode,
    submitResult: workspaceSubmitResult,
    isSubmitting: workspaceSubmitting,
    submitToProblem,
    getProblems,
    error,
    clearError,
    clearExecutionState,
  } = useWorkspaceData(DEFAULT_WORKSPACE_CODE, 'python')

  const isExerciseMode = Boolean(exerciseContext)
  const tabs = useEditorStore((state) => state.tabs)
  const activeTabId = useEditorStore((state) => state.activeTabId)
  const editorHydrated = useEditorStore((state) => state.hydrated)
  const editorDirty = useEditorStore((state) => state.dirty)
  const editorPersistenceError = useEditorStore((state) => state.persistenceError)
  const editorDatabaseStatus = useEditorStore((state) => state.databaseStatus)
  const editorDatabaseError = useEditorStore((state) => state.databaseError)
  const editorHydrationEpoch = useEditorStore((state) => state.hydrationEpoch)
  const editorRestoreStatus = useEditorStore((state) => state.restoreStatus)
  const editorRestoreMessage = useEditorStore((state) => state.restoreMessage)
  const addTab = useEditorStore((state) => state.addTab)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const updateTab = useEditorStore((state) => state.updateTab)
  const updateContent = useEditorStore((state) => state.updateContent)
  const updateCursorPosition = useEditorStore((state) => state.updateCursorPosition)
  const updateScrollTop = useEditorStore((state) => state.updateScrollTop)
  const restoreTabs = useEditorStore((state) => state.restoreTabs)
  const recentlyClosedTabs = useEditorStore((state) => state.recentlyClosedTabs)
  const reopenTab = useEditorStore((state) => state.reopenTab)
  const workspaceTabs = tabs.filter((tab) => tab.kind !== 'exercise')
  const exerciseTabs = tabs.filter((tab) => tab.kind === 'exercise')
  const visibleTabs = isExerciseMode ? exerciseTabs : workspaceTabs
  const visibleRecentlyClosedTabs = recentlyClosedTabs.filter((tab) =>
    isExerciseMode ? tab.kind === 'exercise' : tab.kind !== 'exercise',
  )
  const activeTab = isExerciseMode
    ? (exerciseTabs.find((tab) => tab.id === exerciseContext?.tabId) ?? null)
    : (workspaceTabs.find((tab) => tab.id === activeTabId) ?? workspaceTabs[0] ?? null)
  const activeVisibleTabId = activeTab?.id ?? null
  const workspaceLanguage = activeTab?.language ?? 'python'
  const workspaceCode = activeTab?.content ?? ''

  const setWorkspaceCode = useCallback(
    (nextCode: string) => {
      if (activeVisibleTabId) updateContent(activeVisibleTabId, nextCode)
    },
    [activeVisibleTabId, updateContent],
  )
  const setWorkspaceLanguage = useCallback(
    (nextLanguage: string) => {
      if (!activeVisibleTabId || !activeTab) return
      const base = activeTab.filename.replace(/\.[^.]+$/, '') || 'main'
      updateTab(activeVisibleTabId, {
        language: nextLanguage,
        filename: `${base}.${languageMeta(nextLanguage).ext}`,
      })
    },
    [activeTab, activeVisibleTabId, updateTab],
  )
  const handleCursorPositionChange = useCallback(
    ({ lineNumber, column }: { lineNumber: number; column: number }) => {
      if (activeVisibleTabId) {
        updateCursorPosition(activeVisibleTabId, lineNumber, column)
      }
    },
    [activeVisibleTabId, updateCursorPosition],
  )
  const handleScrollTopChange = useCallback(
    (nextScrollTop: number) => {
      if (activeVisibleTabId) updateScrollTop(activeVisibleTabId, nextScrollTop)
    },
    [activeVisibleTabId, updateScrollTop],
  )

  const code = exerciseContext?.code ?? workspaceCode
  const setCode = exerciseContext?.setCode ?? setWorkspaceCode
  const language = exerciseContext?.language ?? workspaceLanguage
  const setLanguage = exerciseContext?.setLanguage ?? setWorkspaceLanguage
  const isSubmitting = exerciseContext?.isSubmitting ?? workspaceSubmitting
  const exerciseSubmitResult = exerciseContext?.submitResult ?? null

  // 底部面板初始折叠态来自设置页"显示底部面板"；进入工作区时按偏好展开/收起，之后本地可临时切换。
  const bottomPanelCollapsed = useAppStore((s) => s.bottomPanelCollapsed)
  const doubleLineTabs = useAppStore((s) => s.doubleLineTabs)
  const codeTheme = useAppStore((s) => s.codeTheme)
  const setAIContext = useAppStore((s) => s.setAIContext)
  const requestAIChat = useAppStore((s) => s.requestAIChat)
  const [explorerCollapsed, setExplorerCollapsed] = useState(false)
  const [terminalCollapsed, setTerminalCollapsed] = useState(bottomPanelCollapsed)
  const [resolvingConflict, setResolvingConflict] = useState(false)
  const [workspacePersistenceReady, setWorkspacePersistenceReady] = useState(false)
  const problemId = activeTab?.problemId ?? ''
  const fileName = exerciseContext
    ? (activeTab?.filename ??
      `${safeFileBaseName(exerciseContext.id)}.${languageMeta(language).ext}`)
    : (activeTab?.filename ?? `main.${languageMeta(language).ext}`)
  const workspaceTitle = activeTab?.filename ?? '工作区代码'
  const executionScopeId = isExerciseMode
    ? `exercise:${exerciseContext?.id ?? 'none'}`
    : `workspace:${activeVisibleTabId ?? 'none'}`

  const handleSelectVisibleTab = useCallback(
    (tabId: string, exerciseId?: string) => {
      if (isExerciseMode) {
        if (exerciseId) void exerciseContext?.selectTab(exerciseId)
        return
      }
      setActiveTab(tabId)
    },
    [exerciseContext, isExerciseMode, setActiveTab],
  )

  const handleReopenVisibleTab = useCallback(() => {
    const tab = visibleRecentlyClosedTabs[0]
    if (!tab) return
    if (isExerciseMode) {
      if (tab.problemId) void exerciseContext?.selectTab(tab.problemId)
      return
    }
    reopenTab(tab.id)
  }, [exerciseContext, isExerciseMode, reopenTab, visibleRecentlyClosedTabs])

  const createWorkspaceTab = useCallback(() => {
    const existing = new Set(tabs.map((tab) => tab.filename))
    let index = 1
    while (existing.has(`untitled_${index}.py`)) index += 1
    addTab({
      id: `workspace-${Date.now()}-${index}`,
      kind: 'file',
      filename: `untitled_${index}.py`,
      language: 'python',
      content: '',
    })
  }, [addTab, tabs])

  const handleCloseWorkspaceTab = useCallback(async (tabId: string) => {
    const state = useEditorStore.getState()
    const tabPersistence = getEditorTabPersistenceState(tabId)
    const warning = getEditorTabCloseWarning({
      pending: tabPersistence.pending,
      conflict: tabPersistence.conflict,
      degraded: tabPersistence.degraded || state.databaseStatus === 'degraded',
      persistenceError: state.persistenceError,
      error: tabPersistence.error ?? state.databaseError,
    })
    if (warning && !window.confirm(warning)) return
    const closed = await requestCloseEditorWorkspaceTab(tabId)
    if (closed) return
    const closeLocally = window.confirm(
      'SQLite 持久化仍未成功，标签当前保持打开。确定后将仅在本地关闭，并保留在“最近关闭”中；数据库状态会继续标记为降级。',
    )
    if (!closeLocally) {
      toast.error('标签保持打开；请先处理数据库冲突或同步失败')
      return
    }
    await closeEditorWorkspaceTabLocally(tabId)
    toast.info('标签已仅在本地关闭，可从“最近关闭”恢复')
  }, [])

  const handleCloseVisibleTab = useCallback(
    (tabId: string) => {
      if (isExerciseMode) {
        void exerciseContext?.closeTab(tabId)
        return
      }
      void handleCloseWorkspaceTab(tabId)
    },
    [exerciseContext, handleCloseWorkspaceTab, isExerciseMode],
  )

  const handleWorkspaceConflict = useCallback(
    async (resolution: EditorWorkspaceConflictResolution) => {
      const conflict = getEditorWorkspaceConflict()
      if (!conflict) return
      const local = useEditorStore.getState().tabs.find((tab) => tab.id === conflict.tabId)
      const filename = local?.filename ?? conflict.databaseTab?.filename ?? conflict.tabId
      if (
        resolution === 'use-database' &&
        !window.confirm(`采用数据库版本会替换 ${filename} 的当前本地内容，继续吗？`)
      ) {
        return
      }
      setResolvingConflict(true)
      try {
        const resolved = await resolveEditorWorkspaceConflict(resolution, conflict.tabId)
        if (!resolved) toast.error('冲突处理未完成，本地内容仍已保留')
      } finally {
        setResolvingConflict(false)
      }
    },
    [],
  )

  const workspaceConflict =
    !isExerciseMode && editorDatabaseStatus === 'conflict' ? getEditorWorkspaceConflict() : null
  const workspaceConflictFilename = workspaceConflict
    ? (tabs.find((tab) => tab.id === workspaceConflict.tabId)?.filename ??
      recentlyClosedTabs.find((tab) => tab.id === workspaceConflict.tabId)?.filename ??
      workspaceConflict.databaseTab?.filename ??
      workspaceConflict.tabId)
    : null

  useEffect(() => {
    if (isExerciseMode) return
    let cancelled = false
    restoreTabs()
    setWorkspacePersistenceReady(false)
    void ensureEditorWorkspaceSync().then(() => {
      if (!cancelled) setWorkspacePersistenceReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [isExerciseMode, restoreTabs])

  useEffect(() => {
    if (isExerciseMode || !editorHydrated) return
    if (workspaceTabs.length === 0) {
      createWorkspaceTab()
      return
    }
    if (!workspaceTabs.some((tab) => tab.id === activeTabId)) {
      setActiveTab(workspaceTabs[0].id)
    }
  }, [activeTabId, createWorkspaceTab, editorHydrated, isExerciseMode, setActiveTab, workspaceTabs])

  useEffect(() => {
    clearExecutionState()
  }, [clearExecutionState, executionScopeId])

  // Workspace standalone mode still uses the SQLite problems table.
  // Practice embedded mode receives its exercise id/code from PracticeView and submits via exercises-evaluate.
  useEffect(() => {
    if (isExerciseMode || !workspacePersistenceReady) return
    let cancelled = false
    void getProblems().then((list) => {
      if (cancelled) return
      if (list.length === 0) return
      const first = list[0]
      const state = useEditorStore.getState()
      const current = state.tabs.find((tab) => tab.id === state.activeTabId)
      if (!current || current.problemId) return
      if (!isEmptyEditorDocument(current.content)) return
      const starter = coerceStarterCode(first.starter_code, current.language)
      state.updateTab(current.id, {
        kind: 'problem',
        filename: `${safeFileBaseName(first.title || `problem_${first.id}`)}.${languageMeta(current.language).ext}`,
        problemId: first.id,
        ...(starter ? { content: starter } : {}),
      })
    })
    return () => {
      cancelled = true
    }
  }, [getProblems, isExerciseMode, workspacePersistenceReady])

  const handleRun = useCallback(async () => {
    setTerminalCollapsed(false)
    clearError()
    await runCode(code, language)
  }, [clearError, runCode, code, language])

  const handleSubmit = useCallback(async () => {
    setTerminalCollapsed(false)
    clearError()
    if (exerciseContext) {
      await exerciseContext.submitCode(exerciseContext.id, code, language)
      return
    }
    if (!problemId) return
    await submitToProblem(problemId, code, language)
  }, [clearError, exerciseContext, problemId, submitToProblem, code, language])

  // 复制运行输出（stdout + stderr）到剪贴板，失败时给 toast 反馈。
  const copyRunOutput = useCallback(async () => {
    if (!runResult) return
    const text = [runResult.stdout, runResult.stderr].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制运行输出')
    } catch {
      toast.error('复制失败，请手动选择文本复制')
    }
  }, [runResult])

  // 把当前题目/练习与编辑器代码写入 AI 上下文，使 AI 面板提问时自动带入。
  useEffect(() => {
    const title = isExerciseMode ? (exerciseContext?.title ?? '练习') : workspaceTitle
    setAIContext({ kind: isExerciseMode ? 'exercise' : 'problem', title, language, code })
  }, [isExerciseMode, exerciseContext?.title, workspaceTitle, language, code, setAIContext])
  useEffect(() => () => setAIContext(null), [setAIContext])

  // 全局快捷键：Ctrl/Cmd+Enter 运行代码；Ctrl/Cmd+Shift+Enter 提交（练习/题目模式）。
  // 在编辑器内输入时同样生效（这是它的主要价值），故不像视图切换那样让位输入框。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (e.shiftKey) {
        void handleSubmit()
      } else {
        void handleRun()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRun, handleSubmit])

  // 运行/提交报错时，一键把代码与报错交给 AI 诊断（打开 AI 面板并发送）。
  const runStderr = runResult && runResult.exitCode !== 0 ? runResult.stderr : ''
  const diagnosable = Boolean(runStderr || error)
  const handleDiagnose = () => {
    const detail = (runStderr || error || '').trim()
    if (!detail) return
    const send = `我运行下面这段 ${language} 代码时报错了，请帮我诊断原因并给出修复建议（用中文，简明扼要）：\n\n【代码】\n${code}\n\n【报错信息】\n${detail}`
    requestAIChat('帮我诊断这个运行错误', send)
  }

  return (
    <div className="flex h-full bg-[var(--color-bg-base)] w-full">
      {/* Sidebar Explorer */}
      {!hideExplorer && (
        <AnimatePresence initial={false}>
          {explorerCollapsed ? (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 48, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] flex flex-col flex-shrink-0 items-center py-4"
            >
              <button
                onClick={() => setExplorerCollapsed(false)}
                className="p-2 text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-hover)] rounded-lg transition-colors"
                title="展开资源管理器"
              >
                <PanelLeft size={16} />
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="shrink-0 overflow-hidden border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]"
            >
              <div className="flex flex-col h-full w-[256px] hide-scrollbar overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between text-xs font-semibold text-[var(--color-text-secondary)] tracking-wider">
                  <span>资源管理器</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setExplorerCollapsed(true)}
                      className="hover:text-white text-[var(--color-text-muted)] transition-colors p-1"
                      title="收起资源管理器"
                    >
                      <PanelLeftClose size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                  <div className="text-xs p-1.5 rounded text-[var(--color-text-primary)] font-medium flex items-center gap-2">
                    <ChevronDown size={14} className="text-[var(--color-text-muted)]" /> WORKSPACE
                  </div>
                  <div className="pl-6 space-y-0.5">
                    <div className="text-xs p-1.5 rounded text-[var(--color-text-primary)] flex items-center gap-2">
                      <ChevronDown size={14} className="text-[var(--color-text-muted)]" /> src
                    </div>
                    <div className="pl-6 space-y-0.5">
                      {visibleTabs.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            handleSelectVisibleTab(item.id, item.problemId ?? undefined)
                          }
                          className={cn(
                            'w-full text-xs p-1.5 rounded flex items-center gap-2 border text-left transition-colors',
                            item.id === activeVisibleTabId
                              ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border-[var(--color-accent-primary)]/20'
                              : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                          )}
                        >
                          <EditorTabKindIcon kind={item.kind} />
                          <span className="truncate">{item.filename}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="px-2 pt-3 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
                    {isExerciseMode
                      ? '练习代码由草稿库保存；标签顺序、关闭状态与光标位置由工作区恢复。'
                      : '工作区标签会自动保存，并在下次启动时恢复。'}
                  </p>
                </div>

                {/* Run target hint at bottom of explorer */}
                <div className="p-3 border-t border-[var(--color-border-subtle)] text-[10px] text-[var(--color-text-muted)] flex items-center gap-2 shrink-0">
                  <FileCode2 size={12} />
                  <span className="truncate">运行入口 src/{fileName}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Editor & Terminal Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0F111A]">
        {/* Editor Tabs ... */}
        <div className="flex items-center bg-[var(--color-bg-panel)] overflow-x-auto hide-scrollbar border-b border-[#2A2F45]">
          {visibleTabs.map((tab) => {
            const selected = tab.id === activeVisibleTabId
            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex text-xs font-medium min-w-max rounded-t-md mx-1 border-r border-l border-[#2A2F45] px-3 transition-colors',
                  selected
                    ? 'bg-[#0F111A] text-[#E5E7EB] border-t-2 border-[var(--color-accent-primary)]'
                    : 'text-[var(--color-text-muted)] border-t-2 border-transparent hover:bg-[#171A26]',
                  doubleLineTabs
                    ? 'flex-col items-start py-1.5 gap-0.5'
                    : 'items-center py-2 gap-2',
                )}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSelectVisibleTab(tab.id, tab.problemId ?? undefined)}
                    className="flex items-center gap-2"
                    aria-pressed={selected}
                  >
                    <EditorTabKindIcon kind={tab.kind} /> {tab.filename}
                  </button>
                  <button
                    type="button"
                    title={`关闭 ${tab.filename}`}
                    aria-label={`关闭 ${tab.filename}`}
                    onClick={() => handleCloseVisibleTab(tab.id)}
                    className="rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
                {doubleLineTabs && (
                  <span className="text-[10px] font-normal text-[var(--color-text-muted)] pl-[22px]">
                    {tab.language.toUpperCase()} · {editorTabKindLabel(tab.kind)}
                  </span>
                )}
              </div>
            )
          })}

          <div className="flex shrink-0 items-center">
            {visibleRecentlyClosedTabs.length > 0 && (
              <button
                type="button"
                onClick={handleReopenVisibleTab}
                title="重新打开最近关闭的标签"
                aria-label="重新打开最近关闭的标签"
                className="mx-1 rounded p-1.5 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
              >
                <Undo2 size={14} />
              </button>
            )}
            {!isExerciseMode && (
              <button
                type="button"
                onClick={createWorkspaceTab}
                disabled={tabs.length >= MAX_EDITOR_TABS}
                title={
                  tabs.length >= MAX_EDITOR_TABS
                    ? `最多支持 ${MAX_EDITOR_TABS} 个标签`
                    : '新建工作区标签'
                }
                aria-label="新建工作区标签"
                className="mx-1 rounded p-1.5 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center px-3 gap-2">
            <button
              onClick={handleRun}
              disabled={isRunning || !code.trim()}
              title="运行 (Ctrl Enter)"
              className="text-[var(--color-text-muted)] hover:text-white p-1 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Play size={14} fill="currentColor" className="text-[#10B981]" />
            </button>
          </div>
        </div>

        {/* Editor：CodeMirror 语法高亮，含行号；code_theme 驱动配色，Ctrl/Cmd+Enter 运行 */}
        <div className="flex-1 overflow-hidden relative">
          {(isExerciseMode || editorHydrated) && (
            <CodeEditor
              key={`${executionScopeId}:${isExerciseMode ? 0 : editorHydrationEpoch}`}
              value={code}
              onChange={setCode}
              language={language}
              themeId={codeTheme}
              onRun={handleRun}
              initialCursorPosition={activeTab?.cursorPosition}
              initialScrollTop={activeTab?.scrollTop ?? 0}
              onCursorPositionChange={isExerciseMode ? undefined : handleCursorPositionChange}
              onScrollTopChange={isExerciseMode ? undefined : handleScrollTopChange}
            />
          )}
        </div>

        {/* Terminal/Runner */}
        <AnimatePresence initial={false}>
          {terminalCollapsed ? (
            <div className="h-10 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] flex items-center px-4 justify-between shrink-0">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setTerminalCollapsed(false)}
                  className="text-xs text-[var(--color-text-muted)] hover:text-white transition-colors flex items-center gap-2"
                >
                  <ChevronDown className="rotate-180" size={14} /> 展开面板
                </button>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 256, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="z-10 overflow-hidden shrink-0"
            >
              <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] flex flex-col shadow-lg h-[256px]">
                <div className="flex items-center px-4 pt-2 gap-4 border-b border-[var(--color-border-subtle)] justify-between">
                  <div className="flex gap-4">
                    <span className="text-xs text-white pb-2 border-b-2 border-[var(--color-accent-primary)] font-medium">
                      运行输出
                    </span>
                  </div>
                  <button
                    onClick={() => setTerminalCollapsed(true)}
                    className="text-[var(--color-text-muted)] hover:text-white mb-2 ml-auto"
                    title="收起面板"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* Terminal Output */}
                  <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-[#D1D5DB] space-y-1.5 bg-[#0B0E14] custom-scrollbar relative">
                    <div className="flex items-center gap-2">
                      <span className="text-[#F59E0B]">&gt;</span> {languageMeta(language).cmd} src/
                      {fileName}
                    </div>

                    {diagnosable && (
                      <button
                        onClick={handleDiagnose}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-accent-purple)]/10 border border-[var(--color-accent-purple)]/30 text-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/20 text-[11px] font-medium transition-colors"
                      >
                        <Sparkles size={12} /> 让 AI 诊断此错误
                      </button>
                    )}

                    {isRunning ? (
                      <div className="text-[var(--color-text-muted)] animate-pulse pt-2">
                        Executing tests...
                      </div>
                    ) : error ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-1.5 pt-1"
                      >
                        <div className="text-[#EF4444]">Error: {error}</div>
                      </motion.div>
                    ) : runResult ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-1.5 pt-1"
                      >
                        {runResult.stdout && (
                          <pre className="text-[var(--color-text-muted)] whitespace-pre-wrap">
                            {runResult.stdout}
                          </pre>
                        )}
                        {runResult.stderr && (
                          <pre className="text-[#EF4444] whitespace-pre-wrap">
                            {runResult.stderr}
                          </pre>
                        )}
                        <div className="my-2 border-t border-dashed border-[var(--color-border-subtle)] w-1/2"></div>
                        <div className="flex items-center gap-3">
                          {runResult.exitCode === 0 ? (
                            <span className="text-[#10B981] flex items-center gap-1">
                              <Check size={12} /> 运行成功
                            </span>
                          ) : (
                            <span className="text-[#EF4444] flex items-center gap-1">
                              <X size={12} /> 退出码: {runResult.exitCode}
                            </span>
                          )}
                          <span className="text-[var(--color-text-muted)]">
                            耗时 {runResult.duration_ms}ms
                          </span>
                          <button
                            type="button"
                            onClick={copyRunOutput}
                            className="ml-auto flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                            title="复制运行输出"
                          >
                            <Copy size={12} /> 复制
                          </button>
                        </div>
                      </motion.div>
                    ) : null}

                    {exerciseSubmitResult && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-1.5 pt-2 border-t border-dashed border-[var(--color-border-subtle)] mt-2"
                      >
                        {exerciseSubmitResult.feedback_lines?.map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              'whitespace-pre-wrap',
                              line.includes('✅') || line.includes('通过')
                                ? 'text-[#10B981]'
                                : line.includes('❌') || line.includes('失败')
                                  ? 'text-[#EF4444]'
                                  : 'text-[var(--color-text-muted)]',
                            )}
                          >
                            {line}
                          </div>
                        ))}
                        {exerciseSubmitResult.stdout && (
                          <pre className="text-[var(--color-text-muted)] whitespace-pre-wrap border-t border-dashed border-[var(--color-border-subtle)] pt-2 mt-2">
                            {exerciseSubmitResult.stdout}
                          </pre>
                        )}
                        <div className="my-2 border-t border-dashed border-[var(--color-border-subtle)] w-1/2"></div>
                        <div className="flex items-center gap-3">
                          {exerciseSubmitResult.passed ? (
                            <span className="text-[#10B981] flex items-center gap-1">
                              <Check size={12} /> 练习通过
                            </span>
                          ) : (
                            <span className="text-[#EF4444] flex items-center gap-1">
                              <X size={12} /> 仍需修改
                            </span>
                          )}
                          <span className="text-[var(--color-text-muted)]">
                            得分: {exerciseSubmitResult.score}
                          </span>
                          <span className="text-[var(--color-text-muted)]">
                            耗时 {Math.round((exerciseSubmitResult.duration_sec || 0) * 1000)}ms
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {!exerciseSubmitResult && workspaceSubmitResult && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-1.5 pt-2 border-t border-dashed border-[var(--color-border-subtle)] mt-2"
                      >
                        {workspaceSubmitResult.details?.map((d, i) => (
                          <div key={i} className="space-y-0.5">
                            <div className="text-[var(--color-text-muted)]">
                              用例 {i + 1}: {d.case}
                            </div>
                            {d.passed ? (
                              <div className="text-[#10B981] flex items-center gap-1">
                                <Check size={12} /> 通过
                              </div>
                            ) : (
                              <>
                                <div className="text-[var(--color-text-muted)]">
                                  预期: {d.expected}
                                </div>
                                <div className="text-[var(--color-text-muted)]">
                                  实际: {d.actual}
                                </div>
                                <div className="text-[#EF4444] flex items-center gap-1">
                                  <X size={12} /> 未通过
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                        <div className="my-2 border-t border-dashed border-[var(--color-border-subtle)] w-1/2"></div>
                        <div className="flex items-center gap-3">
                          {workspaceSubmitResult.passed ? (
                            <span className="text-[#10B981] flex items-center gap-1">
                              <Check size={12} /> 全部通过
                            </span>
                          ) : (
                            <span className="text-[#EF4444] flex items-center gap-1">
                              <X size={12} /> 未全部通过
                            </span>
                          )}
                          <span className="text-[var(--color-text-muted)]">
                            得分: {workspaceSubmitResult.score}
                          </span>
                        </div>
                      </motion.div>
                    )}

                    {!isRunning &&
                      !error &&
                      !runResult &&
                      !exerciseSubmitResult &&
                      !workspaceSubmitResult && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[#F59E0B]">&gt;</span>{' '}
                          <span className="w-1.5 h-3 bg-white block animate-pulse"></span>
                        </div>
                      )}
                  </div>

                  {/* Run Config Sidebar */}
                  <div className="w-64 border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-4 flex flex-col gap-4 overflow-y-auto">
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)] mb-1.5 block">
                        运行配置
                      </label>
                      <select
                        data-testid="editor-language-select"
                        aria-label="编辑器语言"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg text-sm text-white px-3 py-1.5 outline-none focus:border-[var(--color-accent-primary)]"
                      >
                        {Object.entries(LANGUAGE_META).map(([value, meta]) => (
                          <option key={value} value={value}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-muted)] mb-1.5 block">
                        运行环境
                      </label>
                      <input
                        type="text"
                        value={`src/${fileName}`}
                        readOnly
                        className="w-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg text-sm text-[var(--color-text-secondary)] px-3 py-1.5 outline-none"
                      />
                    </div>
                    <div className="mt-auto space-y-2">
                      <button
                        onClick={handleRun}
                        disabled={isRunning || !code.trim()}
                        className="w-full bg-[var(--color-accent-solid)] hover:bg-[var(--color-accent-solid-hover)] active:scale-95 text-[var(--color-on-accent)] py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:pointer-events-none"
                      >
                        {isRunning ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Play size={14} fill="currentColor" />
                        )}
                        {isRunning ? '运行中...' : '运行 (Ctrl Enter)'}
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !code.trim() || (!isExerciseMode && !problemId)}
                        className="w-full bg-[var(--color-bg-base)] hover:bg-[#262B3D] active:scale-95 border border-[var(--color-border-subtle)] text-white py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                      >
                        {isSubmitting ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        {isSubmitting ? '提交中...' : isExerciseMode ? '提交练习' : '提交测试'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {workspaceConflict && (
          <div
            role="alertdialog"
            aria-label={`解决 ${workspaceConflictFilename} 的数据库冲突`}
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-amber-400/40 bg-[#2A2112] px-3 py-2 text-xs text-amber-50"
          >
            <div className="min-w-0">
              <div className="font-semibold">
                {workspaceConflictFilename} 存在数据库冲突
                {workspaceConflict.count > 1 ? `（共 ${workspaceConflict.count} 个待处理）` : ''}
              </div>
              <div className="text-[11px] text-amber-100/80">
                采用数据库会替换当前标签；保留本地会写入新版本；另存副本会同时保留两份。
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void handleWorkspaceConflict('use-database')}
                className="inline-flex items-center gap-1 rounded border border-amber-200/30 px-2 py-1 hover:bg-white/10 disabled:opacity-50"
              >
                <Download size={12} /> 采用数据库
              </button>
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void handleWorkspaceConflict('keep-local')}
                className="inline-flex items-center gap-1 rounded border border-amber-200/30 px-2 py-1 hover:bg-white/10 disabled:opacity-50"
              >
                <Upload size={12} /> 保留本地
              </button>
              <button
                type="button"
                disabled={resolvingConflict}
                onClick={() => void handleWorkspaceConflict('save-copy')}
                className="inline-flex items-center gap-1 rounded border border-amber-200/30 px-2 py-1 hover:bg-white/10 disabled:opacity-50"
              >
                <CopyPlus size={12} /> 另存副本
              </button>
            </div>
          </div>
        )}

        {!isExerciseMode && editorRestoreStatus === 'degraded' && !workspaceConflict && (
          <div
            role="status"
            className="shrink-0 border-t border-amber-400/40 bg-[#2A2112] px-3 py-1.5 text-xs text-amber-100"
          >
            {editorRestoreMessage ?? '工作区恢复失败；已备份损坏数据并打开默认工作区。'}
          </div>
        )}

        {/* Status Bar */}
        <div className="h-6 bg-[var(--color-accent-solid)] flex items-center justify-between px-3 text-[11px] text-[var(--color-on-accent)] font-medium tracking-wide z-10 shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <X size={12} className="text-white" />{' '}
              {exerciseSubmitResult
                ? exerciseSubmitResult.passed
                  ? 0
                  : 1
                : workspaceSubmitResult
                  ? workspaceSubmitResult.details.filter((d) => !d.passed).length
                  : error
                    ? 1
                    : 0}{' '}
              <Check size={12} className="text-white" />{' '}
              {exerciseSubmitResult
                ? exerciseSubmitResult.passed
                  ? 1
                  : 0
                : workspaceSubmitResult
                  ? workspaceSubmitResult.details.filter((d) => d.passed).length
                  : runResult?.exitCode === 0
                    ? 1
                    : 0}
            </span>
            <span title="尚未完成启动时工具链探测；运行能力取决于本机环境">
              {languageMeta(language).label} · 依赖本地工具链
            </span>
          </div>
          <div className="flex items-center gap-4">
            {exerciseContext?.draftConflict && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={exerciseContext.reloadPersistedDraft}
                  title="重新加载已保存草稿"
                  aria-label="重新加载已保存草稿"
                  className="rounded p-1 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  type="button"
                  onClick={exerciseContext.keepLocalDraft}
                  title="保留本地草稿并覆盖已保存版本"
                  aria-label="保留本地草稿并覆盖已保存版本"
                  className="rounded p-1 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                >
                  <Upload size={12} />
                </button>
              </div>
            )}
            <span
              title={
                editorRestoreMessage ?? editorPersistenceError ?? editorDatabaseError ?? undefined
              }
            >
              {isExerciseMode
                ? exerciseContext?.draftSaving
                  ? '草稿保存中'
                  : exerciseContext?.draftConflict
                    ? '草稿版本冲突'
                    : exerciseContext?.draftError
                      ? '草稿保存失败'
                      : exerciseContext?.draftDirty
                        ? '草稿待保存'
                        : '草稿已同步'
                : !editorHydrated || editorDatabaseStatus === 'idle'
                  ? '工作区恢复中'
                  : editorRestoreStatus === 'degraded'
                    ? '工作区恢复降级'
                    : editorPersistenceError
                      ? '工作区保存失败'
                      : editorDatabaseStatus === 'conflict'
                        ? '工作区数据库冲突'
                        : editorDatabaseStatus === 'degraded'
                          ? '工作区仅本地保存'
                          : editorDatabaseStatus === 'syncing'
                            ? '工作区同步中'
                            : editorDirty
                              ? '工作区待保存'
                              : '工作区已保存'}
            </span>
            <span title={exerciseContext?.draftError ?? undefined}>{fileName}</span>
            <span>{code.split('\n').length} 行</span>
          </div>
        </div>
      </div>
    </div>
  )
}
