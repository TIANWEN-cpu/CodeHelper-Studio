import React from 'react'
import {
  RotateCcw,
  Clock,
  Play,
  FileCode,
  Sparkles,
  XCircle,
  PanelRight,
  PanelRightClose,
  PanelLeft,
  PanelLeftClose,
  Maximize2,
  Minimize2,
  AlertCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { useReviewData } from '@/hooks/useReviewData'
import { useAppStore } from '@/store'
import { formatDate } from '@/lib/locale'
import { quickAsk } from '@/services/aiService'

export function ReviewView() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const dateRegion = useAppStore((s) => s.dateRegion)
  const {
    mistakes,
    filteredMistakes,
    isLoadingMistakes,
    loadMistakes,
    currentMistake,
    isLoadingDetail,
    selectMistake,
    filters,
    setFilters,
    deleteMistake,
    dueReviews,
    loadDueReviews,
    updateReview,
    updateAnalysis,
    stats,
    getStats,
    error,
    clearError,
  } = useReviewData()

  const [activeTab, setActiveTab] = React.useState('题目详情')
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(false)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(false)
  const [isMaximized, setIsMaximized] = React.useState(false)
  const [showCorrectCode, setShowCorrectCode] = React.useState(false)
  const [sortMode, setSortMode] = React.useState<'recent' | 'oldest' | 'errors'>('recent')
  const [aiAnalyzing, setAiAnalyzing] = React.useState(false)
  const setAIContext = useAppStore((s) => s.setAIContext)

  // Auto-select first item when list loads
  React.useEffect(() => {
    if (filteredMistakes.length > 0 && !currentMistake) {
      selectMistake(filteredMistakes[0].id)
    }
  }, [filteredMistakes, currentMistake, selectMistake])

  // Load all data on mount
  React.useEffect(() => {
    loadMistakes()
    loadDueReviews()
    getStats()
  }, [loadMistakes, loadDueReviews, getStats])

  // Derive display values
  const totalCount = filteredMistakes.length
  const dueCount = stats?.totalDue ?? dueReviews.length
  const masteredCount = stats?.mastered ?? 0
  const reviewRate = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0

  // 错题列表真实排序：最近/最早添加，或按错误类型数量多到少。
  const sortedMistakes = React.useMemo(() => {
    const arr = [...filteredMistakes]
    if (sortMode === 'errors') {
      arr.sort((a, b) => b.error_types.length - a.error_types.length)
    } else {
      arr.sort((a, b) => {
        const ta = new Date(a.created_at).getTime()
        const tb = new Date(b.created_at).getTime()
        return sortMode === 'oldest' ? ta - tb : tb - ta
      })
    }
    return arr
  }, [filteredMistakes, sortMode])

  const selected = currentMistake
  const displayTitle = selected?.problem_title ?? '请选择一道错题'
  const displayStatus =
    dueReviews.some((r) => r.exercise_id === selected?.problem_id) ||
    selected?.difficulty === '待复习'
      ? '待复习'
      : '已掌握'
  const isDue = displayStatus === '待复习'

  // Review schedule for selected mistake
  const reviewForSelected = dueReviews.find((r) => r.exercise_id === selected?.problem_id)
  const reviewSchedule = reviewForSelected
    ? [
        {
          label: '下次复习',
          date: reviewForSelected.next_review,
          days: `(${reviewForSelected.interval_days}天后)`,
        },
      ]
    : []

  const difficultyOptions = Array.from(new Set(mistakes.map((m) => m.difficulty).filter(Boolean)))
  const tagOptions = Array.from(new Set(mistakes.flatMap((m) => m.tags).filter(Boolean)))
  const errorTypeOptions = Array.from(
    new Set(mistakes.flatMap((m) => m.error_types).filter(Boolean)),
  )

  // 选中错题时写入 AI 上下文，使 AI 面板提问自动带入错误代码与类型；离开页面清空。
  React.useEffect(() => {
    if (selected) {
      setAIContext({
        kind: 'mistake',
        title: selected.problem_title,
        code: selected.last_wrong_code,
        detail: selected.error_types.join('、') || undefined,
      })
    }
  }, [selected, setAIContext])
  React.useEffect(() => () => setAIContext(null), [setAIContext])

  const generateLocalAnalysis = () => {
    if (!selected) return ''
    const errorTypes =
      selected.error_types.length > 0 ? selected.error_types.join('、') : '未分类错误'
    const tags = selected.tags.length > 0 ? selected.tags.join('、') : '暂无标签'
    const code = selected.last_wrong_code?.trim()
    const codeHints: string[] = []
    if (code?.includes('range(')) codeHints.push('检查循环边界和 off-by-one 问题')
    if (code?.includes('return')) codeHints.push('确认所有分支都返回了预期结果')
    if (code?.includes('dict') || code?.includes('{}'))
      codeHints.push('核对哈希表 key/value 更新时机')
    if (code?.includes('while')) codeHints.push('确认 while 循环终止条件不会遗漏或死循环')
    if (code?.includes('sort')) codeHints.push('排序后注意原始下标/稳定性是否仍满足题意')

    return [
      `【错题】${selected.problem_title}`,
      `【错误类型】${errorTypes}`,
      `【关联知识点】${tags}`,
      '',
      '【复盘建议】',
      '1. 先重新读题，明确输入、输出、边界条件和复杂度要求。',
      '2. 对照错误代码，找出导致失败的最小反例，并手动走一遍变量变化。',
      `3. 针对本题重点关注：${codeHints.length > 0 ? codeHints.join('；') : '边界条件、状态更新顺序、返回值格式与测试用例覆盖'}。`,
      '4. 修正后至少补 2 个边界用例再提交，避免只修当前失败样例。',
      '',
      '【下次练习】建议先独立重写一遍，再查看正确代码或题解。',
    ].join('\n')
  }

  // Handlers
  const handleReviewPlan = async () => {
    if (!selected) return
    try {
      await updateReview(selected.problem_id, 3)
      await getStats()
    } catch {
      /* error handled by hook */
    }
  }

  // 组装错题分析提示词：题面 + 错误类型 + 知识点 + 错误代码（含参考正确代码）。
  const buildMistakePrompt = () => {
    if (!selected) return ''
    const parts = [
      '你是编程错题复盘助手。请用简洁中文针对这道做错的题给出复盘：1) 错误根因；2) 修正思路；3) 举一反三的注意点。不超过 300 字。',
      `【题目】${selected.problem_title}`,
      `【错误类型】${selected.error_types.join('、') || '未分类'}`,
      `【相关知识点】${selected.tags.join('、') || '无'}`,
    ]
    if (selected.last_wrong_code?.trim())
      parts.push(`【我的错误代码】\n${selected.last_wrong_code}`)
    if (selected.correct_code?.trim()) parts.push(`【参考正确代码】\n${selected.correct_code}`)
    return parts.join('\n')
  }

  const handleAiAnalysis = async () => {
    if (!selected || aiAnalyzing) return
    setAiAnalyzing(true)
    try {
      let text: string
      try {
        // 真·AI 复盘：调用已配置的 AI 模型，结合错误代码生成分析。
        const ai = (await quickAsk(buildMistakePrompt())).trim()
        text = ai || generateLocalAnalysis()
      } catch {
        // 未配置 AI 模型或调用失败时，诚实回退到本地规则复盘并标注。
        text =
          generateLocalAnalysis() +
          '\n\n（以上为本地规则复盘；在设置中配置 AI 模型后，可获得结合代码的 AI 深度分析。）'
      }
      await updateAnalysis(selected.id, text)
    } finally {
      setAiAnalyzing(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (!selected) return
    if (!window.confirm(`确定删除错题「${selected.problem_title}」？`)) return
    await deleteMistake(selected.id)
  }

  const handleRedoPractice = () => {
    setCurrentView('practice')
  }

  const renderTabContent = () => {
    if (isLoadingDetail) {
      return <div className="h-40 bg-[var(--color-bg-card)] rounded-xl animate-pulse" />
    }

    if (!selected) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-sm text-[var(--color-text-muted)]">
          <RotateCcw size={32} className="mb-3 opacity-40" />
          请从左侧选择一道错题
        </div>
      )
    }

    if (activeTab === '题目详情') {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-white text-[15px] mb-3">题目描述</h3>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
              {selected.description || '暂无题目描述'}
            </p>
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <XCircle size={18} className="text-[#EF4444]" />
              <span className="text-[14px] font-medium text-[#EF4444]">错误类型</span>
              <span className="text-[13px] text-[var(--color-text-secondary)] border-l border-red-500/20 pl-3 ml-1">
                {selected.error_types.length > 0 ? selected.error_types.join(', ') : '未分类'}
              </span>
            </div>
          </div>
        </div>
      )
    }

    if (activeTab === '我的代码') {
      return (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold text-white text-[15px] mb-3">我的错误代码</h3>
            <div className="rounded-xl border border-red-500/30 overflow-hidden relative shadow-sm">
              <div className="absolute right-3 top-3 text-[11px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-base)] px-2 py-0.5 rounded border border-[var(--color-border-subtle)]">
                wrong
              </div>
              <pre className="bg-[#1C2030]/80 p-5 text-[13px] font-mono leading-relaxed text-[#E5E7EB] overflow-x-auto whitespace-pre-wrap">
                {selected.last_wrong_code || '暂无代码记录'}
              </pre>
            </div>
          </div>
          {showCorrectCode && selected.correct_code && (
            <div>
              <h3 className="font-semibold text-white text-[15px] mb-3">参考正确代码</h3>
              <div className="rounded-xl border border-[#10B981]/30 overflow-hidden relative shadow-sm">
                <div className="absolute right-3 top-3 text-[11px] font-mono text-[#10B981] bg-[var(--color-bg-base)] px-2 py-0.5 rounded border border-[#10B981]/20">
                  accepted
                </div>
                <pre className="bg-[#102018]/80 p-5 text-[13px] font-mono leading-relaxed text-[#D1FAE5] overflow-x-auto whitespace-pre-wrap">
                  {selected.correct_code}
                </pre>
              </div>
            </div>
          )}
        </div>
      )
    }

    if (activeTab === '错误分析') {
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-white text-[15px]">复盘分析</h3>
          {selected.ai_analysis ? (
            <pre className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-4 text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
              {selected.ai_analysis}
            </pre>
          ) : (
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-4 text-sm text-[var(--color-text-muted)]">
              还没有复盘分析。点击下方「生成复盘建议」会基于错题标题、错误类型、标签和错误代码生成一份本地规则复盘，并保存到错题记录。
            </div>
          )}
        </div>
      )
    }

    if (activeTab === '知识点') {
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-white text-[15px]">相关知识点</h3>
          <div className="flex flex-wrap gap-2">
            {selected.tags.length > 0 ? (
              selected.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setFilters({ ...filters, tag })}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] border border-[var(--color-accent-purple)]/20 hover:bg-[var(--color-accent-purple)]/20 transition-colors"
                >
                  {tag}
                </button>
              ))
            ) : (
              <span className="text-sm text-[var(--color-text-muted)]">暂无知识点标签</span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            点击标签会把左侧错题列表筛选到同一知识点，便于集中复习。
          </p>
        </div>
      )
    }

    if (activeTab === '复习笔记') {
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-white text-[15px]">复习建议</h3>
          <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-4 text-sm text-[var(--color-text-secondary)] leading-relaxed space-y-2">
            <p>1. 先遮住正确答案，独立复现思路。</p>
            <p>2. 针对错误类型写一个最小反例。</p>
            <p>3. 用 0-5 的质量分完成一次复习后，系统会通过 SM-2 更新下次复习时间。</p>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-white text-[15px]">历史记录</h3>
        <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-4 text-sm text-[var(--color-text-secondary)]">
          <p>
            创建时间：
            {formatDate(selected.created_at, dateRegion, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="mt-2">题目 ID：{selected.problem_id}</p>
          <p className="mt-2">
            错误类型：{selected.error_types.length > 0 ? selected.error_types.join('、') : '未分类'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-base)] overflow-hidden">
      <div
        className={cn(
          'max-w-[1400px] w-full mx-auto flex flex-col h-full transition-all duration-300',
          isMaximized ? 'p-0 max-w-none' : 'p-4 space-y-3',
        )}
      >
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-red-400"
            >
              <AlertCircle size={14} />
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="text-xs text-red-400 hover:text-red-300 ml-2">
                关闭
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header & Stats Container */}
        <AnimatePresence initial={false}>
          {!isMaximized && (
            <motion.div
              layout
              initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
              animate={{ height: 'auto', opacity: 1, overflow: 'visible' }}
              exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
              className="flex items-center gap-4 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-4 py-2 shrink-0 overflow-hidden shadow-sm flex-wrap"
            >
              <div className="flex items-center gap-2 pr-4 border-r border-[var(--color-border-subtle)] shrink-0">
                <RotateCcw size={14} className="text-[var(--color-accent-primary)]" />
                <span className="text-sm font-bold text-white">错题复习</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[var(--color-text-muted)]">总数</span>
                  <span className="text-white font-medium">{totalCount}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[var(--color-text-muted)]">待复习</span>
                  <span className="text-[#3B82F6] font-medium">{dueCount}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[var(--color-text-muted)]">已掌握</span>
                  <span className="text-[#10B981] font-medium">{masteredCount}</span>
                </div>
                <div className="flex items-baseline gap-1.5 ml-auto">
                  <span className="text-[var(--color-text-muted)]">复习率</span>
                  <span className="text-[var(--color-accent-purple)] font-medium">
                    {reviewRate}%
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className={cn('flex-1 flex gap-4 overflow-hidden', isMaximized ? 'pt-0' : 'pt-0')}>
          {/* Left Sidebar (List) */}
          <AnimatePresence initial={false}>
            {!leftPanelCollapsed && !isMaximized && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 256, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="shrink-0 overflow-hidden"
              >
                <div className="flex flex-col min-h-0 h-full w-[256px] pr-4">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-white">筛选</span>
                    <div className="flex items-center gap-2 relative">
                      <button
                        onClick={() => setFilters({})}
                        className="text-xs text-[var(--color-accent-primary)] hover:text-[#4F46E5]"
                      >
                        重置
                      </button>
                      <button
                        onClick={() => setLeftPanelCollapsed(true)}
                        className="text-[var(--color-text-muted)] hover:text-white p-1 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors absolute -right-3"
                        title="收起侧边栏"
                      >
                        <PanelLeftClose size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-4 shrink-0">
                    <select
                      value={filters.difficulty ?? ''}
                      onChange={(e) =>
                        setFilters({ ...filters, difficulty: e.target.value || undefined })
                      }
                      className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded py-1 px-2 text-[11px] text-white focus:outline-none appearance-none"
                    >
                      <option value="">全部难度</option>
                      {difficultyOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filters.tag ?? ''}
                      onChange={(e) => setFilters({ ...filters, tag: e.target.value || undefined })}
                      className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded py-1 px-2 text-[11px] text-white focus:outline-none appearance-none"
                    >
                      <option value="">全部标签</option>
                      {tagOptions.map((tag) => (
                        <option key={tag} value={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filters.errorType ?? ''}
                      onChange={(e) =>
                        setFilters({ ...filters, errorType: e.target.value || undefined })
                      }
                      className="col-span-2 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded py-1 px-2 text-[11px] text-white focus:outline-none appearance-none"
                    >
                      <option value="">全部错误类型</option>
                      {errorTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between mb-2 mt-2 px-1">
                    <span className="text-xs font-semibold text-white">
                      错题列表 ({totalCount})
                    </span>
                    <select
                      value={sortMode}
                      onChange={(e) =>
                        setSortMode(e.target.value as 'recent' | 'oldest' | 'errors')
                      }
                      className="text-[10px] text-[var(--color-text-muted)] bg-transparent border-none outline-none cursor-pointer hover:text-white focus-visible:text-white"
                      title="排序方式"
                    >
                      <option value="recent">最近添加</option>
                      <option value="oldest">最早添加</option>
                      <option value="errors">错误类型多</option>
                    </select>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {isLoadingMistakes && filteredMistakes.length === 0 && (
                      <div className="flex items-center justify-center py-8 text-xs text-[var(--color-text-muted)]">
                        加载中...
                      </div>
                    )}
                    {!isLoadingMistakes && filteredMistakes.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-xs text-[var(--color-text-muted)]">
                        <RotateCcw
                          size={24}
                          className="mb-2 opacity-30 text-[var(--color-accent-purple)]"
                        />
                        暂无错题记录
                      </div>
                    )}
                    {sortedMistakes.map((item, index) => {
                      const isActive = currentMistake?.id === item.id
                      const isDue = dueReviews.some((r) => r.exercise_id === item.problem_id)
                      const statusLabel = isDue ? '待复习' : '已掌握'
                      const formattedDate = formatDate(item.created_at, dateRegion, {
                        month: 'short',
                        day: 'numeric',
                      })

                      return (
                        <div
                          key={item.id}
                          onClick={() => selectMistake(item.id)}
                          className={cn(
                            'p-3 rounded-lg border cursor-pointer transition-colors flex gap-2.5',
                            isActive
                              ? 'bg-[var(--color-accent-purple)]/10 border-[var(--color-accent-purple)]/30'
                              : 'bg-[var(--color-bg-panel)] border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)]',
                          )}
                        >
                          <span
                            className={cn(
                              'text-xs font-mono font-medium mt-0.5',
                              isActive
                                ? 'text-[var(--color-accent-purple)]'
                                : 'text-[var(--color-text-muted)]',
                            )}
                          >
                            {index + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h4
                              className={cn(
                                'text-sm font-medium truncate mb-1.5',
                                isActive ? 'text-white' : 'text-white',
                              )}
                            >
                              {item.problem_title}
                            </h4>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.error_types.map((t) => (
                                <span
                                  key={t}
                                  className="text-[9px] bg-[var(--color-bg-base)] text-[var(--color-text-secondary)] px-1 py-0.5 rounded border border-[var(--color-border-subtle)]"
                                >
                                  {t}
                                </span>
                              ))}
                              <span className="text-[9px] text-[#F59E0B]">{item.difficulty}</span>
                              <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                                {formattedDate}
                              </span>
                              <span
                                className={cn(
                                  'text-[9px] px-1 rounded-sm',
                                  isDue
                                    ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
                                    : 'bg-[#10B981]/20 text-[#10B981]',
                                )}
                              >
                                {statusLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Middle Column (Main Content) */}
          <div className="flex-1 flex flex-col min-h-0 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-[var(--color-border-subtle)] shrink-0 bg-[var(--color-bg-card)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {(leftPanelCollapsed || isMaximized) && (
                    <button
                      onClick={() => {
                        if (isMaximized) setIsMaximized(false)
                        setLeftPanelCollapsed(false)
                      }}
                      className="p-1.5 -ml-1.5 rounded-md hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-white transition-colors"
                      title="展开题目列表"
                    >
                      <PanelLeft size={16} />
                    </button>
                  )}
                  <h2 className="text-lg font-bold text-white">{displayTitle}</h2>
                  <span
                    className={cn(
                      'px-2 py-0.5 text-xs font-medium rounded-md',
                      isDue ? 'bg-[#F59E0B]/20 text-[#F59E0B]' : 'bg-[#10B981]/20 text-[#10B981]',
                    )}
                  >
                    {displayStatus}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)] text-[#F59E0B] font-medium">
                  {selected?.difficulty ?? '--'}
                </span>
                {selected?.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-base)]"
                  >
                    {tag}
                  </span>
                ))}
                <span className="ml-2 flex items-center gap-1">
                  <Clock size={12} />{' '}
                  {selected
                    ? `最后复习: ${formatDate(selected.created_at, dateRegion, { year: 'numeric', month: 'short', day: 'numeric' })}`
                    : '--'}
                </span>
                <span className="flex items-center gap-1">
                  <RotateCcw size={12} /> 错误类型: {selected?.error_types.length ?? 0}
                </span>
                <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-2"></div>
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1 hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-white rounded transition-colors"
                  title={isMaximized ? '还原' : '最大化'}
                >
                  {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>

            <div className="flex px-4 border-b border-[var(--color-border-subtle)] shrink-0">
              {['题目详情', '我的代码', '错误分析', '知识点', '复习笔记', '历史记录'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap',
                    activeTab === tab
                      ? 'text-[var(--color-accent-purple)] border-[var(--color-accent-purple)]'
                      : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-text-primary)]',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto hide-scrollbar p-5 bg-[var(--color-bg-base)] custom-scrollbar">
              <div className="max-w-4xl mx-auto">{renderTabContent()}</div>
            </div>

            {/* Action Bar */}
            <div className="p-4 border-t border-[var(--color-border-subtle)] shrink-0 flex items-center justify-between bg-[var(--color-bg-card)]">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRedoPractice}
                  disabled={!selected}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-accent-purple)] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <Play size={14} /> 重新练习
                </button>
                {selected?.correct_code && (
                  <button
                    onClick={() => {
                      setShowCorrectCode(true)
                      setActiveTab('我的代码')
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] rounded-lg text-sm font-medium transition-colors"
                  >
                    <FileCode size={14} /> 查看正确代码
                  </button>
                )}
                {selected && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/15 rounded-lg text-sm font-medium transition-colors"
                  >
                    <XCircle size={14} /> 删除错题
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReviewPlan}
                  disabled={!selected}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] hover:text-white text-[var(--color-text-secondary)] rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <Clock size={14} /> 完成本次复习
                </button>
                <button
                  onClick={handleAiAnalysis}
                  disabled={!selected || aiAnalyzing}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[var(--color-accent-primary)]/10 to-[var(--color-accent-purple)]/10 border border-[var(--color-accent-purple)]/30 text-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <Sparkles size={14} /> {aiAnalyzing ? '分析中…' : '生成复盘建议'}
                </button>
                <button
                  onClick={() => {
                    if (isMaximized) setIsMaximized(false)
                    setRightPanelCollapsed(false)
                  }}
                  className={cn(
                    'ml-2 p-2 rounded-lg transition-colors border border-[var(--color-border-subtle)]',
                    rightPanelCollapsed || isMaximized
                      ? 'text-white bg-[var(--color-bg-hover)]'
                      : 'text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-hover)] hidden',
                  )}
                  title="展开信息面板"
                >
                  <PanelRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Right Column (Info) */}
          <AnimatePresence initial={false}>
            {!rightPanelCollapsed && !isMaximized && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 300, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="shrink-0 overflow-hidden"
              >
                <div className="flex flex-col gap-4 min-h-0 h-full w-[300px] pl-4 overflow-y-auto hide-scrollbar">
                  {/* Error Analysis */}
                  <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4 shadow-sm relative group overflow-hidden shrink-0">
                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setRightPanelCollapsed(true)}
                        className="text-[var(--color-text-muted)] hover:text-white p-1 rounded-md hover:bg-[var(--color-bg-hover)] transition-colors"
                      >
                        <PanelRightClose size={14} />
                      </button>
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-2 pr-6">错误原因</h3>
                    {isLoadingDetail ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-[var(--color-bg-card)] rounded animate-pulse" />
                        <div className="h-12 bg-[var(--color-bg-card)] rounded animate-pulse" />
                      </div>
                    ) : selected?.ai_analysis ? (
                      <div className="bg-red-500/5 rounded p-2 border border-red-500/10 mb-2">
                        <p className="text-xs font-semibold text-[#EF4444] mb-1">
                          {selected.error_types[0] ?? '错误分析'}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                          {selected.ai_analysis}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-[var(--color-bg-card)] rounded p-2 border border-[var(--color-border-subtle)]">
                        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                          点击下方「生成复盘建议」获取智能分析
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Knowledge Points */}
                  <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4 shadow-sm shrink-0">
                    <h3 className="text-sm font-semibold text-white mb-3">相关知识点</h3>
                    <div className="flex flex-wrap gap-2">
                      {selected?.tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setFilters({ ...filters, tag })}
                          className="text-[11px] px-2 py-1 rounded-md cursor-pointer transition-colors bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] border border-[var(--color-accent-purple)]/20 hover:bg-[var(--color-accent-purple)]/20"
                        >
                          {tag}
                        </button>
                      ))}
                      {(!selected || selected.tags.length === 0) && (
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          暂无知识点
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Review Schedule (Spaced Repetition Timeline) */}
                  <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4 shadow-sm shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">复习计划</h3>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] mb-3 flex items-center gap-1">
                      <Sparkles size={12} className="text-[var(--color-accent-purple)]" />{' '}
                      智能推荐复习时间
                    </p>

                    {reviewSchedule.length > 0 ? (
                      <div className="space-y-3 relative before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-px before:bg-[var(--color-border-subtle)]">
                        {reviewSchedule.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3 relative">
                            <div className="w-3 h-3 rounded-full bg-[var(--color-bg-panel)] border-2 border-[var(--color-text-muted)] mt-0.5 shrink-0 z-10 box-content"></div>
                            <div className="flex-1 flex justify-between items-center text-xs">
                              <span className="text-[var(--color-text-secondary)]">
                                {item.label}
                              </span>
                              <span className="text-[var(--color-text-muted)] font-mono">
                                {formatDate(item.date, dateRegion, {
                                  month: 'short',
                                  day: 'numeric',
                                })}{' '}
                                <span className="text-[10px]">{item.days}</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--color-text-muted)] py-2">
                        暂无复习计划
                      </div>
                    )}
                  </div>

                  {/* Recommended Practice */}
                  <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4 shadow-sm flex-1 min-h-0 mb-4 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">同类推荐练习</h3>
                    </div>
                    {dueReviews.length > 0 ? (
                      <div className="space-y-2 overflow-y-auto pr-1">
                        {dueReviews.slice(0, 3).map((review, idx) => (
                          <button
                            key={review.exercise_id}
                            onClick={handleRedoPractice}
                            className="w-full flex items-center justify-between p-2 rounded hover:bg-[var(--color-bg-card)] transition-colors text-xs text-left"
                          >
                            <span className="text-[var(--color-text-secondary)] flex items-center gap-2">
                              <span className="text-[var(--color-text-muted)] font-mono">
                                {idx + 1}
                              </span>{' '}
                              {review.title}
                            </span>
                            <span className="text-[#F59E0B] scale-90">{review.difficulty}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--color-text-muted)] py-2">
                        暂无推荐
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
