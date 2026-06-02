import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Play, Send, CheckCircle2, XCircle, ChevronsRight, Bot, Link2, Clock3 } from 'lucide-react'
import { useProblemStore } from '../../stores/problemStore'
import { useAppStore } from '../../stores/appStore'
import { monacoThemeByAppTheme, registerMonacoThemes } from '../../theme/monacoThemes'
import { parseJsonArray, trackLabel, platformLabel, modeLabel, examStyleLabel } from '../../utils/labels'

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'sql', label: 'SQL' },
  { value: 'verilog', label: 'Verilog' },
]

export function ProblemDetail() {
  const {
    activeProblem,
    submitResult,
    submitting,
    submit,
    selectedLanguage,
    setSelectedLanguage,
    listCollapsed,
    setListCollapsed,
    aiPanelOpen,
    setAIPanelOpen,
  } = useProblemStore()
  const theme = useAppStore((state) => state.theme)
  const [code, setCode] = useState('')
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [splitRatio, setSplitRatio] = useState(0.38)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeProblem) {
      return
    }

    const starterCode = JSON.parse(activeProblem.starter_code) as Record<string, string>
    const languages = parseJsonArray(activeProblem.languages)
    if (languages.length > 0 && !languages.includes(selectedLanguage)) {
      setSelectedLanguage(languages[0])
      return
    }
    const fallbackCode = starterCode[selectedLanguage] || starterCode.python || Object.values(starterCode)[0] || ''
    setCode(fallbackCode)
    setRunOutput(null)
  }, [activeProblem?.id, selectedLanguage])

  const handleDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) {
      return
    }

    const onMove = (moveEvent: MouseEvent) => {
      const offsetX = moveEvent.clientX - container.getBoundingClientRect().left
      setSplitRatio(Math.max(0.24, Math.min(0.62, offsetX / container.offsetWidth)))
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!activeProblem) {
    return (
      <div className="flex flex-1 flex-col">
        {listCollapsed && (
          <div className="ui-toolbar border-b px-2 py-2">
            <button
              onClick={() => setListCollapsed(false)}
              className="ui-btn-ghost flex h-9 w-9 items-center justify-center"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="ui-card w-full max-w-2xl px-8 py-10 text-center">
            <p className="text-lg font-semibold text-[var(--theme-text-primary)]">选择一道题目开始练习</p>
            <p className="mt-2 text-sm text-[var(--theme-text-muted)]">
              左侧支持按赛道、平台、题型、难度和语言筛选，方便按考研、保研、校招、IC 和建模目标切换训练。
            </p>
          </div>
        </div>
      </div>
    )
  }

  const examples = JSON.parse(activeProblem.examples) as Array<{ input: string; output: string; explanation?: string }>
  const tags = JSON.parse(activeProblem.tags) as string[]
  const tracks = parseJsonArray(activeProblem.tracks)
  const availableLanguages = parseJsonArray(activeProblem.languages)
  const isOJMode = (activeProblem.mode ?? 'oj') === 'oj'

  const handleRun = async () => {
    if (!isOJMode) {
      return
    }

    setRunning(true)
    setRunOutput(null)

    try {
      const result = await window.api.invoke('run-code', { code, language: selectedLanguage }) as { stdout: string; stderr: string }
      setRunOutput(result)
    } finally {
      setRunning(false)
    }
  }

  const handleSubmit = () => {
    if (!isOJMode) {
      return
    }
    void submit(code, selectedLanguage)
  }

  const difficultyClass =
    activeProblem.difficulty === 'easy'
      ? 'ui-chip-success'
      : activeProblem.difficulty === 'medium'
        ? 'ui-chip-warning'
        : 'ui-chip-danger'

  const difficultyLabel =
    activeProblem.difficulty === 'easy'
      ? '简单'
      : activeProblem.difficulty === 'medium'
        ? '中等'
        : '困难'

  return (
    <div ref={containerRef} className="flex flex-1 flex-col">
      <div className="ui-toolbar flex items-center gap-3 border-b px-3 py-2 text-sm">
        {listCollapsed && (
          <button
            onClick={() => setListCollapsed(false)}
            className="ui-btn-ghost flex h-9 w-9 items-center justify-center"
          >
            <ChevronsRight size={16} />
          </button>
        )}

        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--theme-text-primary)]">{activeProblem.id}. {activeProblem.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`ui-chip ${difficultyClass}`}>{difficultyLabel}</span>
            {activeProblem.platform && <span className="ui-chip">{platformLabel(activeProblem.platform)}</span>}
            {activeProblem.mode && <span className="ui-chip">{modeLabel(activeProblem.mode)}</span>}
            {activeProblem.exam_style && <span className="ui-chip">{examStyleLabel(activeProblem.exam_style)}</span>}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={selectedLanguage}
            onChange={(event) => setSelectedLanguage(event.target.value)}
            className="ui-select w-32 px-3 py-2 text-sm"
            disabled={!isOJMode}
          >
            {LANGUAGES.filter((language) => availableLanguages.includes(language.value)).map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
          <button onClick={handleRun} disabled={running || !isOJMode} className="ui-btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm">
            <Play size={13} />
            运行
          </button>
          <button onClick={handleSubmit} disabled={submitting || !isOJMode} className="ui-btn-success flex items-center gap-1.5 px-3 py-2 text-sm">
            <Send size={13} />
            提交
          </button>
          <button
            onClick={() => setAIPanelOpen(!aiPanelOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm ${aiPanelOpen ? 'ui-btn-accent' : 'ui-btn-secondary'}`}
          >
            <Bot size={13} />
            AI
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="overflow-y-auto overscroll-contain p-4" style={{ width: `${splitRatio * 100}%` }}>
          <div className="mb-4 flex flex-wrap gap-2">
            {tracks.map((track) => (
              <span key={track} className="ui-chip">{trackLabel(track)}</span>
            ))}
            {tags.map((tag) => (
              <span key={tag} className="ui-chip">{tag}</span>
            ))}
          </div>

          <div className="ui-card rounded-[24px] p-5">
            <div className="mb-5 flex flex-wrap gap-4 text-xs text-[var(--theme-text-muted)]">
              {activeProblem.estimated_time ? (
                <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> 建议时长 {activeProblem.estimated_time} 分钟</span>
              ) : null}
              {activeProblem.official_url ? (
                <a
                  href={activeProblem.official_url}
                  onClick={(event) => {
                    event.preventDefault()
                    void window.api.invoke('open-external', activeProblem.official_url)
                  }}
                  className="inline-flex items-center gap-1.5 text-[var(--theme-accent)] hover:underline"
                >
                  <Link2 size={12} />
                  官方链接
                </a>
              ) : null}
            </div>

            {!isOJMode && (
              <div className="mb-5 rounded-2xl bg-[var(--theme-warning-soft)] px-4 py-3 text-sm text-[var(--theme-warning)]">
                这道题属于 {modeLabel(activeProblem.mode ?? 'case-study')}，当前版本先支持题面阅读、AI 辅助和代码草稿，暂不支持自动判题。
              </div>
            )}

            <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--theme-text-secondary)]">
              {activeProblem.description}
            </div>

            <div className="mt-6 space-y-3">
              {examples.map((example, index) => (
                <div key={index} className="ui-card-soft rounded-2xl p-4 text-xs">
                  <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">示例 {index + 1}</div>
                  <div><span className="text-[var(--theme-info)]">输入:</span> {example.input}</div>
                  <div className="mt-1"><span className="text-[var(--theme-success)]">输出:</span> {example.output}</div>
                  {example.explanation && (
                    <div className="mt-2 whitespace-pre-wrap font-sans text-[var(--theme-text-muted)]">{example.explanation}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="resize-handle" onMouseDown={handleDrag} />

        <div className="flex min-w-0 flex-col" style={{ width: `${(1 - splitRatio) * 100}%` }}>
          <div className="flex-1 min-h-0">
            <Editor
              key={`${activeProblem.id}-${selectedLanguage}`}
              beforeMount={registerMonacoThemes}
              theme={monacoThemeByAppTheme[theme]}
              language={selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage}
              value={code}
              onChange={(value) => setCode(value ?? '')}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                padding: { top: 8 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                lineNumbersMinChars: 3,
                readOnly: !isOJMode,
              }}
            />
          </div>
          <div className="ui-card h-40 shrink-0 overflow-auto rounded-t-none border-b-0 border-x-0 border-t p-3 text-xs">
            {running && <span className="animate-pulse text-[var(--theme-warning)]">运行中...</span>}
            {submitting && <span className="animate-pulse text-[var(--theme-warning)]">判题中...</span>}

            {runOutput && !submitResult && (
              <div>
                {runOutput.stdout && <pre className="whitespace-pre-wrap text-[var(--theme-success)]">{runOutput.stdout}</pre>}
                {runOutput.stderr && <pre className="whitespace-pre-wrap text-[var(--theme-danger)]">{runOutput.stderr}</pre>}
              </div>
            )}

            {submitResult && (
              <div>
                <div className={`mb-2 flex items-center gap-1.5 font-medium ${
                  submitResult.status === 'accepted' ? 'text-[var(--theme-success)]' : 'text-[var(--theme-danger)]'
                }`}>
                  {submitResult.status === 'accepted' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {submitResult.status === 'accepted' ? '通过' : '未通过'}
                  <span className="font-normal text-[var(--theme-text-muted)]">
                    ({submitResult.passed}/{submitResult.total}, {submitResult.duration}ms)
                  </span>
                </div>

                {submitResult.results.map((result, index) => (
                  <div
                    key={index}
                    className={`mb-2 rounded-xl p-2 ${
                      result.passed ? 'bg-[var(--theme-success-soft)]' : 'bg-[var(--theme-danger-soft)]'
                    }`}
                  >
                    <span className={result.passed ? 'text-[var(--theme-success)]' : 'text-[var(--theme-danger)]'}>
                      用例 {index + 1}: {result.passed ? '通过' : '失败'}
                    </span>
                    {!result.passed && (
                      <span className="ml-2 text-[var(--theme-text-muted)]">
                        期望: {result.expected} | 实际: {result.actual || '(空)'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!running && !submitting && !runOutput && !submitResult && (
              <span className="text-[var(--theme-text-muted)]">
                {isOJMode ? '点击运行测试代码，点击提交进行判题。' : '当前题型暂不支持自动判题，可以在编辑区记录思路或让 AI 辅助分析。'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

