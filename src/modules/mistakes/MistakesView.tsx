import { memo, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Bot, RefreshCw, Trash2, AlertCircle } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useProblemStore } from '../../stores/problemStore'
import { typedInvoke } from '../../api/ipc'
import { toErrorMessage } from '../../utils/errors'
import { DIFF_COLORS, DIFF_LABELS } from '../../utils/labels'
import { useToast } from '../../components/Toast'

interface Mistake {
  id: number
  problem_id: number
  title: string
  difficulty: string
  tags: string
  error_count: number
  error_types: string
  last_wrong_code: string
  correct_code: string | null
  ai_analysis: string | null
  updated_at: string
}

// Memoized individual mistake card to prevent re-rendering all cards
// when only one card's analysis state changes
const MistakeItem = memo(function MistakeItem({
  mistake,
  isAnalyzing,
  onAnalyze,
  onDelete,
  onRetry,
}: {
  mistake: Mistake
  isAnalyzing: boolean
  onAnalyze: (mistake: Mistake) => void
  onDelete: (id: number) => void
  onRetry: (problemId: number) => void
}) {
  const difficultyLabel = DIFF_LABELS[mistake.difficulty] ?? mistake.difficulty

  return (
    <div className="ui-card p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--theme-text-primary)]">
            {mistake.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`text-sm ${DIFF_COLORS[mistake.difficulty]}`}>{difficultyLabel}</span>
            <span className="ui-chip-danger">错误 {mistake.error_count} 次</span>
            {mistake.error_types && <span className="ui-chip">{mistake.error_types}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onRetry(mistake.problem_id)}
            title="重新做题"
            aria-label="重新做题"
            className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
          <button
            onClick={() => {
              if (window.confirm('确定要删除该错题记录？')) {
                onDelete(mistake.id)
              }
            }}
            title="删除"
            aria-label="删除错题记录"
            className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {mistake.ai_analysis ? (
        <div className="ui-card-soft max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 text-[var(--theme-text-secondary)]">
          {mistake.ai_analysis}
        </div>
      ) : (
        <button
          onClick={() => onAnalyze(mistake)}
          disabled={isAnalyzing}
          className="ui-btn-accent flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Bot size={14} />
          {isAnalyzing ? 'AI 分析中...' : 'AI 分析错误'}
        </button>
      )}
    </div>
  )
})

export function MistakesView() {
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [analyzing, setAnalyzing] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const setActiveModule = useAppStore((s) => s.setActiveModule)
  const setActiveProblem = useProblemStore((s) => s.setActiveProblem)
  const toast = useToast()

  const loadMistakes = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await typedInvoke('mistakes-list')
      setMistakes(data as Mistake[])
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMistakes()
  }, [])

  const handleAnalyze = useCallback(
    async (mistake: Mistake) => {
      setAnalyzing(mistake.id)

      try {
        const prompt = `请分析以下代码的错误原因，并给出改进建议。

题目：${mistake.title}

错误代码：
\`\`\`
${mistake.last_wrong_code}
\`\`\`

${
  mistake.correct_code
    ? `正确代码：
\`\`\`
${mistake.correct_code}
\`\`\`
`
    : ''
}请用中文回答，简洁明了。`

        const result = await typedInvoke('ai-chat', {
          messages: [{ role: 'user', content: prompt }],
          requestId: `mistake-${mistake.id}-${Date.now()}`,
          includeMemories: false,
        })

        if (result.content?.trim()) {
          await typedInvoke('mistakes-update-analysis', mistake.id, result.content)
        }

        await loadMistakes()
        toast('success', 'AI 分析完成')
      } catch (error) {
        const msg = toErrorMessage(error)
        toast('error', `分析失败：${msg}`)
      } finally {
        setAnalyzing(null)
      }
    },
    [toast],
  )

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await typedInvoke('mistakes-delete', id)
        await loadMistakes()
        toast('success', '错题记录已删除')
      } catch (err) {
        toast('error', `删除失败：${toErrorMessage(err)}`)
      }
    },
    [toast],
  )

  const handleRetry = useCallback(
    async (problemId: number) => {
      await setActiveProblem(problemId)
      setActiveModule('problems')
    },
    [setActiveProblem, setActiveModule],
  )

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="ui-section-title text-2xl">错题本</h1>
          <p className="mt-2 text-sm text-[var(--theme-text-muted)]">
            集中复盘做错的题目、错误类型和 AI 给出的改进建议。
          </p>
        </div>
        <span className="ui-chip">{mistakes.length} 条记录</span>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--theme-danger-soft)] px-4 py-3 text-sm text-[var(--theme-danger)]">
          <AlertCircle size={16} className="shrink-0" />
          <div className="flex-1">
            <span>{error}</span>
            <span className="block mt-1 text-xs text-[var(--theme-text-muted)]">
              请检查 API 配置或网络连接
            </span>
          </div>
          <button
            onClick={() => void loadMistakes()}
            className="flex items-center gap-1 text-xs underline hover:no-underline shrink-0"
          >
            <RefreshCw size={12} />
            重试
          </button>
        </div>
      )}

      {loading && (
        <div className="grid max-w-6xl grid-cols-1 gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ui-card p-5 space-y-3">
              <div className="h-5 w-2/3 animate-pulse rounded-xl bg-[var(--theme-bg-hover)]" />
              <div className="flex gap-2">
                <div className="h-4 w-12 animate-pulse rounded-xl bg-[var(--theme-bg-hover)]" />
                <div className="h-4 w-16 animate-pulse rounded-xl bg-[var(--theme-bg-hover)]" />
              </div>
              <div className="h-20 w-full animate-pulse rounded-2xl bg-[var(--theme-bg-hover)]" />
            </div>
          ))}
        </div>
      )}

      {!loading && mistakes.length === 0 && (
        <div className="ui-card mx-auto max-w-3xl px-8 py-14 text-center text-[var(--theme-text-muted)]">
          <AlertTriangle size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium text-[var(--theme-text-primary)]">
            暂时还没有错题记录
          </p>
          <p className="mt-2 text-sm">做题提交失败后，这里会自动沉淀你的高频错误和分析结果。</p>
        </div>
      )}

      {!loading && mistakes.length > 0 && (
        <div className="grid max-w-6xl grid-cols-1 gap-4 xl:grid-cols-2">
          {mistakes.map((mistake) => (
            <MistakeItem
              key={mistake.id}
              mistake={mistake}
              isAnalyzing={analyzing === mistake.id}
              onAnalyze={handleAnalyze}
              onDelete={handleDelete}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}
    </div>
  )
}
