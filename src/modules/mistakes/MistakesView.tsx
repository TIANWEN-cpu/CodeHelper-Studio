import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, RefreshCw, Trash2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { useProblemStore } from '../../stores/problemStore'

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

const diffColors: Record<string, string> = {
  easy: 'text-[var(--theme-success)]',
  medium: 'text-[var(--theme-warning)]',
  hard: 'text-[var(--theme-danger)]',
}

export function MistakesView() {
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [analyzing, setAnalyzing] = useState<number | null>(null)
  const { setActiveModule } = useAppStore()
  const { setActiveProblem } = useProblemStore()

  const loadMistakes = async () => {
    const data = await window.api.invoke('mistakes-list') as Mistake[]
    setMistakes(data)
  }

  useEffect(() => {
    void loadMistakes()
  }, [])

  const handleAnalyze = async (mistake: Mistake) => {
    setAnalyzing(mistake.id)

    try {
      const prompt = `请分析以下代码的错误原因，并给出改进建议。

题目：${mistake.title}

错误代码：
\`\`\`
${mistake.last_wrong_code}
\`\`\`

${mistake.correct_code ? `正确代码：
\`\`\`
${mistake.correct_code}
\`\`\`
` : ''}请用中文回答，简洁明了。`

      const result = await window.api.invoke('ai-chat', {
        messages: [{ role: 'user', content: prompt }],
        requestId: `mistake-${mistake.id}-${Date.now()}`,
        includeMemories: false,
      }) as { content?: string }

      if (result.content?.trim()) {
        await window.api.invoke('mistakes-update-analysis', mistake.id, result.content)
      }

      await loadMistakes()
    } catch (error) {
      console.error(error)
    } finally {
      setAnalyzing(null)
    }
  }

  const handleDelete = async (id: number) => {
    await window.api.invoke('mistakes-delete', id)
    await loadMistakes()
  }

  const handleRetry = async (problemId: number) => {
    await setActiveProblem(problemId)
    setActiveModule('problems')
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="ui-section-title text-2xl">错题本</h1>
          <p className="mt-2 text-sm text-[var(--theme-text-muted)]">集中复盘做错的题目、错误类型和 AI 给出的改进建议。</p>
        </div>
        <span className="ui-chip">{mistakes.length} 条记录</span>
      </div>

      {mistakes.length === 0 && (
        <div className="ui-card mx-auto max-w-3xl px-8 py-14 text-center text-[var(--theme-text-muted)]">
          <AlertTriangle size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium text-[var(--theme-text-primary)]">暂时还没有错题记录</p>
          <p className="mt-2 text-sm">做题提交失败后，这里会自动沉淀你的高频错误和分析结果。</p>
        </div>
      )}

      <div className="grid max-w-6xl grid-cols-1 gap-4 xl:grid-cols-2">
        {mistakes.map((mistake) => (
          <div key={mistake.id} className="ui-card p-5">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--theme-text-primary)]">{mistake.title}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`text-sm ${diffColors[mistake.difficulty]}`}>
                    {mistake.difficulty === 'easy' ? '简单' : mistake.difficulty === 'medium' ? '中等' : '困难'}
                  </span>
                  <span className="ui-chip-danger">错误 {mistake.error_count} 次</span>
                  {mistake.error_types && <span className="ui-chip">{mistake.error_types}</span>}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => void handleRetry(mistake.problem_id)}
                  title="重新做题"
                  className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-text-primary)]"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('确定要删除该错题记录？')) {
                      void handleDelete(mistake.id)
                    }
                  }}
                  title="删除"
                  className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-danger)]"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {mistake.ai_analysis ? (
              <div className="ui-card-soft max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl p-4 text-sm leading-7 text-[var(--theme-text-secondary)]">
                {mistake.ai_analysis}
              </div>
            ) : (
              <button
                onClick={() => void handleAnalyze(mistake)}
                disabled={analyzing === mistake.id}
                className="ui-btn-accent flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Bot size={14} />
                {analyzing === mistake.id ? 'AI 分析中...' : 'AI 分析错误'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
