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

export function ReviewView() {
  const {
    filteredMistakes,
    isLoadingMistakes,
    loadMistakes,
    currentMistake,
    isLoadingDetail,
    selectMistake,
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
          label: '第1次复习',
          date: reviewForSelected.next_review,
          days: `(${reviewForSelected.interval_days}天后)`,
        },
      ]
    : []

  // Handlers
  const handleReviewPlan = async () => {
    if (!selected) return
    try {
      await updateReview(selected.problem_id, 3)
    } catch {
      /* error handled by hook */
    }
  }

  const handleAiAnalysis = async () => {
    if (!selected) return
    try {
      await updateAnalysis(selected.id, selected.ai_analysis ?? 'AI 分析生成中...')
    } catch {
      /* error handled by hook */
    }
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
                      <button className="text-xs text-[var(--color-accent-primary)] hover:text-[#4F46E5]">
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
                    <select className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded py-1 px-2 text-[11px] text-white focus:outline-none appearance-none">
                      <option>全部状态 ▾</option>
                    </select>
                    <select className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded py-1 px-2 text-[11px] text-white focus:outline-none appearance-none">
                      <option>全部难度 ▾</option>
                    </select>
                    <select className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded py-1 px-2 text-[11px] text-white focus:outline-none appearance-none">
                      <option>全部标签 ▾</option>
                    </select>
                    <select className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded py-1 px-2 text-[11px] text-white focus:outline-none appearance-none">
                      <option>全部错误... ▾</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between mb-2 mt-2 px-1">
                    <span className="text-xs font-semibold text-white">
                      错题列表 ({totalCount})
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] flex items-center">
                      最近复习 ▾
                    </span>
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
                    {filteredMistakes.map((item, index) => {
                      const isActive = currentMistake?.id === item.id
                      const isDue = dueReviews.some((r) => r.exercise_id === item.problem_id)
                      const statusLabel = isDue ? '待复习' : '已掌握'
                      const formattedDate = new Date(item.created_at).toLocaleDateString('zh-CN', {
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
                    ? `最后复习: ${new Date(selected.created_at).toLocaleDateString('zh-CN')}`
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
              <div className="space-y-8 max-w-4xl mx-auto">
                {/* Problem Description */}
                <div>
                  <h3 className="font-semibold text-white text-[15px] mb-3">题目描述</h3>
                  {isLoadingDetail ? (
                    <div className="h-16 bg-[var(--color-bg-card)] rounded-lg animate-pulse" />
                  ) : (
                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      {selected?.description ?? '暂无题目描述'}
                    </p>
                  )}
                </div>

                {/* Wrong Code */}
                <div>
                  <h3 className="font-semibold text-white text-[15px] mb-3">我的错误代码</h3>
                  {isLoadingDetail ? (
                    <div className="h-40 bg-[var(--color-bg-card)] rounded-xl animate-pulse" />
                  ) : (
                    <div className="rounded-xl border border-red-500/30 overflow-hidden relative shadow-sm">
                      <div className="absolute right-3 top-3 text-[11px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-base)] px-2 py-0.5 rounded border border-[var(--color-border-subtle)]">
                        代码
                      </div>
                      <pre className="bg-[#1C2030]/80 p-5 text-[13px] font-mono leading-relaxed text-[#E5E7EB] overflow-x-auto whitespace-pre-wrap">
                        {selected?.last_wrong_code ?? '暂无代码记录'}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Error Result */}
                <div>
                  <h3 className="font-semibold text-white text-[15px] mb-3">错误结果</h3>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <XCircle size={18} className="text-[#EF4444]" />
                      <span className="text-[14px] font-medium text-[#EF4444]">错误类型</span>
                      <span className="text-[13px] text-[var(--color-text-secondary)] border-l border-red-500/20 pl-3 ml-1">
                        {selected?.error_types.join(', ') ?? '未分类'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 border-t border-[var(--color-border-subtle)] shrink-0 flex items-center justify-between bg-[var(--color-bg-card)]">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-accent-purple)] hover:bg-[#7C3AED] text-white rounded-lg text-sm font-medium transition-colors">
                  <Play size={14} /> 重新练习
                </button>
                {selected?.correct_code && (
                  <button className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] hover:border-[var(--color-accent-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] rounded-lg text-sm font-medium transition-colors">
                    <FileCode size={14} /> 查看正确代码
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReviewPlan}
                  disabled={!selected}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] hover:text-white text-[var(--color-text-secondary)] rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <Clock size={14} /> 加入复习计划
                </button>
                <button
                  onClick={handleAiAnalysis}
                  disabled={!selected}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[var(--color-accent-primary)]/10 to-[var(--color-accent-purple)]/10 border border-[var(--color-accent-purple)]/30 text-[var(--color-accent-purple)] hover:bg-[var(--color-accent-purple)]/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <Sparkles size={14} /> AI 复盘建议
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
                          点击下方 "AI 复盘建议" 获取智能分析
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Knowledge Points */}
                  <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-4 shadow-sm shrink-0">
                    <h3 className="text-sm font-semibold text-white mb-3">相关知识点</h3>
                    <div className="flex flex-wrap gap-2">
                      {selected?.tags.map((tag, i) => (
                        <span
                          key={tag}
                          className={cn(
                            'text-[11px] px-2 py-1 rounded-md cursor-pointer transition-colors',
                            i === 0
                              ? 'bg-[var(--color-accent-purple)]/10 text-[var(--color-accent-purple)] border border-[var(--color-accent-purple)]/20 hover:bg-[var(--color-accent-purple)]/20'
                              : 'bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] hover:text-white',
                          )}
                        >
                          {tag}
                        </span>
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
                                {new Date(item.date).toLocaleDateString('zh-CN', {
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
                          <div
                            key={review.exercise_id}
                            onClick={() => selectMistake(review.exercise_id)}
                            className="flex items-center justify-between p-2 rounded hover:bg-[var(--color-bg-card)] transition-colors cursor-pointer text-xs"
                          >
                            <span className="text-[var(--color-text-secondary)] flex items-center gap-2">
                              <span className="text-[var(--color-text-muted)] font-mono">
                                {idx + 1}
                              </span>{' '}
                              {review.title}
                            </span>
                            <span className="text-[#F59E0B] scale-90">{review.difficulty}</span>
                          </div>
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
