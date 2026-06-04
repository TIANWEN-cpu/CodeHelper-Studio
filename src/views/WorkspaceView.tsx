import React, { useState, useEffect } from 'react'
import {
  Play,
  Save,
  FileCode2,
  ChevronDown,
  Check,
  X,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { useWorkspaceData } from '@/hooks/useWorkspaceData'
import { useAppStore } from '@/store'
import { CodeEditor } from '@/components/editor/CodeEditor'
import type { SubmitResult as ExerciseSubmitResult } from '@/services/practiceService'

const DEFAULT_WORKSPACE_CODE = `# 从左侧题库或工作区题目加载 starter code 后开始编码
print("Hello, CodeHelper")`

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
  title: string
  code: string
  setCode: (code: string) => void
  language: string
  setLanguage: (language: string) => void
  submitResult: ExerciseSubmitResult | null
  isSubmitting: boolean
  submitCode: (exerciseId: string, code: string, language: string) => Promise<void>
  draftSaving?: boolean
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
    code: workspaceCode,
    setCode: setWorkspaceCode,
    language: workspaceLanguage,
    setLanguage: setWorkspaceLanguage,
    runResult,
    isRunning,
    runCode,
    submitResult: workspaceSubmitResult,
    isSubmitting: workspaceSubmitting,
    submitToProblem,
    getProblems,
    error,
    clearError,
  } = useWorkspaceData(DEFAULT_WORKSPACE_CODE, 'python')

  const isExerciseMode = Boolean(exerciseContext)
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
  const [explorerCollapsed, setExplorerCollapsed] = useState(false)
  const [terminalCollapsed, setTerminalCollapsed] = useState(bottomPanelCollapsed)
  const [problemId, setProblemId] = useState<string>('')
  const [workspaceFileBaseName, setWorkspaceFileBaseName] = useState('main')
  const fileBaseName = safeFileBaseName(exerciseContext?.id ?? workspaceFileBaseName)
  const fileName = `${fileBaseName}.py`

  // Workspace standalone mode still uses the SQLite problems table.
  // Practice embedded mode receives its exercise id/code from PracticeView and submits via exercises-evaluate.
  useEffect(() => {
    if (isExerciseMode) return
    getProblems().then((list) => {
      if (list.length === 0) return
      const first = list[0]
      setProblemId(first.id)
      setWorkspaceFileBaseName(first.title || `problem_${first.id}`)
      const starter = coerceStarterCode(first.starter_code, workspaceLanguage)
      if (starter) setWorkspaceCode(starter)
    })
  }, [getProblems, isExerciseMode, setWorkspaceCode, workspaceLanguage])

  const handleRun = async () => {
    setTerminalCollapsed(false)
    clearError()
    await runCode(code, language)
  }

  const handleSubmit = async () => {
    setTerminalCollapsed(false)
    clearError()
    if (exerciseContext) {
      await exerciseContext.submitCode(exerciseContext.id, code, language)
      return
    }
    if (!problemId) return
    await submitToProblem(problemId, code, language)
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
                      <div className="text-xs p-1.5 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] rounded flex items-center gap-2 border border-[var(--color-accent-primary)]/20">
                        <FileCode2 size={14} /> {fileName}
                      </div>
                    </div>
                  </div>
                  <p className="px-2 pt-3 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
                    单文件运行环境：当前仅编辑并运行此文件。
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
          <div
            className={cn(
              'flex bg-[#0F111A] text-[#E5E7EB] border-t-2 border-[var(--color-accent-primary)] text-xs font-medium min-w-max rounded-t-md mx-1 border-r border-l border-[#2A2F45] px-4',
              doubleLineTabs ? 'flex-col items-start py-1.5 gap-0.5' : 'items-center py-2 gap-2',
            )}
          >
            <span className="flex items-center gap-2">
              <FileCode2 size={14} className="text-[#38BDF8]" /> {fileName}
            </span>
            {doubleLineTabs && (
              <span className="text-[10px] font-normal text-[var(--color-text-muted)] pl-[22px]">
                {language.toUpperCase()} · {isExerciseMode ? '练习模式' : '工作区'}
              </span>
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
          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
            themeId={codeTheme}
            onRun={handleRun}
          />
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
                      <span className="text-[#F59E0B]">&gt;</span>{' '}
                      {language === 'python' ? 'python' : 'node'}
                      src/{fileName}
                    </div>

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
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full bg-[var(--color-bg-base)] border border-[var(--color-border-subtle)] rounded-lg text-sm text-white px-3 py-1.5 outline-none focus:border-[var(--color-accent-primary)]"
                      >
                        <option value="python">Python</option>
                        <option value="javascript">Node.js</option>
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
                        className="w-full bg-[var(--color-accent-primary)] hover:bg-[#4F46E5] active:scale-95 text-white py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:pointer-events-none"
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

        {/* Status Bar */}
        <div className="h-6 bg-[var(--color-accent-primary)] flex items-center justify-between px-3 text-[11px] text-white/90 font-medium tracking-wide z-10 shrink-0">
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
            <span>{language === 'python' ? 'Python' : 'Node.js'} ready</span>
          </div>
          <div className="flex items-center gap-4">
            <span>{fileName}</span>
            <span>{code.split('\n').length} 行</span>
          </div>
        </div>
      </div>
    </div>
  )
}
