import { memo, useCallback, useMemo, useState } from 'react'
import { useEffect } from 'react'
import { CheckCircle2, Circle, ChevronsLeft, Search, BookOpen } from 'lucide-react'
import { useProblemStore } from '../../stores/problemStore'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonList } from '../../components/LoadingSpinner'
import {
  parseJsonArray,
  sourceLabel,
  platformLabel,
  modeLabel,
  trackLabel,
  DIFF_COLORS,
  DIFF_LABELS,
  LANGUAGE_OPTIONS,
} from '../../utils/labels'
import type { Problem } from '../../types/problem'

// Memoized individual problem list item to avoid re-rendering all items
// when only the active selection or filters change
const ProblemListItem = memo(function ProblemListItem({
  problem,
  isActive,
  onSelect,
}: {
  problem: Problem
  isActive: boolean
  onSelect: (id: number) => void
}) {
  const tracks = parseJsonArray(problem.tracks)

  return (
    <div
      onClick={() => onSelect(problem.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(problem.id)
        }
      }}
      className={`mb-2 cursor-pointer rounded-2xl border px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] ${
        isActive
          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
          : 'border-transparent hover:border-[var(--theme-border)] hover:bg-[var(--theme-bg-hover)]/40'
      }`}
    >
      <div className="flex items-start gap-3">
        {problem.solved > 0 ? (
          <CheckCircle2
            size={15}
            className="mt-0.5 shrink-0 text-[var(--theme-success)]"
            aria-hidden="true"
          />
        ) : (
          <Circle
            size={15}
            className="mt-0.5 shrink-0 text-[var(--theme-border-strong)]"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--theme-text-primary)]">
            {problem.id}. {problem.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`text-xs ${DIFF_COLORS[problem.difficulty]}`}>
              {DIFF_LABELS[problem.difficulty]}
            </span>
            {problem.source && (
              <span className="ui-chip text-[10px]">{sourceLabel(problem.source)}</span>
            )}
            {problem.platform && (
              <span className="ui-chip text-[10px]">{platformLabel(problem.platform)}</span>
            )}
            {problem.mode && problem.mode !== 'oj' && (
              <span className="ui-chip-info">{modeLabel(problem.mode)}</span>
            )}
          </div>
          {tracks.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tracks.slice(0, 3).map((track) => (
                <span key={track} className="ui-chip text-[10px]">
                  {trackLabel(track)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

// Memoized filter row to prevent re-rendering filter chips on unrelated state changes
const FilterRow = memo(function FilterRow({
  title,
  items,
  current,
  onSelect,
  activeClass,
}: {
  title: string
  items: Array<{ value: string; label: string }>
  current: string
  onSelect: (value: string) => void
  activeClass: string
}) {
  return (
    <div className="border-b px-3 py-3 glass-line">
      <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.value}
            onClick={() => onSelect(item.value)}
            aria-pressed={current === item.value}
            className={`ui-chip ${current === item.value ? activeClass : 'hover:bg-[var(--theme-bg-hover)]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
})

// Static filter item arrays - defined outside component to avoid re-creation on every render
const TRACK_ITEMS = [
  { value: '', label: '全部赛道' },
  { value: 'postgrad-retest', label: '考研复试' },
  { value: 'summer-camp', label: '保研夏令营' },
  { value: 'algo-job', label: '算法校招' },
  { value: 'ic-job', label: '硬件 / IC' },
  { value: 'math-modeling', label: '数学建模' },
]

const DIFFICULTY_ITEMS = [
  { value: '', label: '全部' },
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
]

const SOURCE_ITEMS = [
  { value: '', label: '全部题库' },
  { value: 'builtin', label: '基础题库' },
  { value: 'leetcode', label: 'LeetCode' },
  { value: 'math-modeling', label: '原有建模题库' },
  { value: 'exam-retest-pat', label: '复试 PAT' },
  { value: 'exam-retest-pta', label: '复试 PTA' },
  { value: 'exam-retest-csp', label: '复试 CSP' },
  { value: 'summer-kattis', label: '夏令营 Kattis' },
  { value: 'summer-cf-gym', label: '夏令营 Gym' },
  { value: 'summer-uoj', label: '夏令营 UOJ' },
  { value: 'algo-job-nowcoder', label: '校招牛客' },
  { value: 'algo-job-oa', label: 'OA 模拟' },
  { value: 'ic-job-hdlbits', label: 'IC HDLBits' },
  { value: 'ic-job-nowcoder-verilog', label: 'IC Verilog' },
  { value: 'ic-job-simulation', label: 'IC 仿真' },
  { value: 'modeling-official', label: '建模真题' },
  { value: 'modeling-kaggle', label: 'Kaggle 建模' },
  { value: 'modeling-mathworks', label: 'MathWorks 建模' },
]

const PLATFORM_ITEMS = [
  { value: '', label: '全部平台' },
  { value: 'pat', label: 'PAT' },
  { value: 'pta', label: 'PTA' },
  { value: 'csp', label: 'CSP' },
  { value: 'leetcode', label: 'LeetCode' },
  { value: 'nowcoder', label: '牛客' },
  { value: 'kattis', label: 'Kattis' },
  { value: 'cf-gym', label: 'Gym' },
  { value: 'uoj', label: 'UOJ' },
  { value: 'hackerrank', label: 'HackerRank' },
  { value: 'codesignal', label: 'CodeSignal' },
  { value: 'cumcm', label: '国赛' },
  { value: 'pgmcm', label: '研赛' },
  { value: 'mcm-icm', label: 'MCM/ICM' },
  { value: 'mathorcup', label: 'MathorCup' },
  { value: 'kaggle', label: 'Kaggle' },
  { value: 'mathworks', label: 'MathWorks' },
  { value: 'hdlbits', label: 'HDLBits' },
  { value: 'eda-playground', label: 'EDA Playground' },
  { value: 'internal', label: '内置' },
]

const MODE_ITEMS = [
  { value: '', label: '全部题型' },
  { value: 'oj', label: 'OJ' },
  { value: 'simulation', label: '仿真题' },
  { value: 'data-task', label: '数据题' },
  { value: 'case-study', label: '案例题' },
  { value: 'report-task', label: '报告题' },
]

const LANGUAGE_ITEMS = [{ value: '', label: '全部' }, ...LANGUAGE_OPTIONS]

export function ProblemList() {
  const problems = useProblemStore((s) => s.problems)
  const activeProblemId = useProblemStore((s) => s.activeProblemId)
  const loadProblems = useProblemStore((s) => s.loadProblems)
  const setActiveProblem = useProblemStore((s) => s.setActiveProblem)
  const filters = useProblemStore((s) => s.filters)
  const setFilters = useProblemStore((s) => s.setFilters)
  const setListCollapsed = useProblemStore((s) => s.setListCollapsed)
  const loading = useProblemStore((s) => s.loading)
  const loadError = useProblemStore((s) => s.loadError)
  const [search, setSearch] = useState('')

  useEffect(() => {
    void loadProblems()
  }, [loadProblems])

  // Memoize expensive filtering computation
  const filtered = useMemo(() => {
    return problems.filter((problem) => {
      if (search && !problem.title.toLowerCase().includes(search.toLowerCase())) {
        return false
      }

      if (filters.language) {
        try {
          const languages = JSON.parse(problem.languages) as string[]
          if (!languages.includes(filters.language)) {
            return false
          }
        } catch {
          return false
        }
      }

      if (filters.difficulty && problem.difficulty !== filters.difficulty) {
        return false
      }

      if (filters.source && problem.source !== filters.source) {
        return false
      }

      if (filters.track) {
        const tracks = parseJsonArray(problem.tracks)
        if (!tracks.includes(filters.track)) {
          return false
        }
      }

      if (filters.platform && problem.platform !== filters.platform) {
        return false
      }

      if (filters.mode && problem.mode !== filters.mode) {
        return false
      }

      return true
    })
  }, [problems, search, filters])

  // Stable callbacks to avoid re-rendering memoized children
  const handleCollapse = useCallback(() => setListCollapsed(true), [setListCollapsed])
  const handleSelectProblem = useCallback((id: number) => setActiveProblem(id), [setActiveProblem])
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setFilters({})
  }, [setFilters])

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value)
  }, [])

  const handleTrackSelect = useCallback(
    (value: string) =>
      setFilters({ ...useProblemStore.getState().filters, track: value || undefined }),
    [setFilters],
  )
  const handleDifficultySelect = useCallback(
    (value: string) =>
      setFilters({ ...useProblemStore.getState().filters, difficulty: value || undefined }),
    [setFilters],
  )
  const handleSourceSelect = useCallback(
    (value: string) =>
      setFilters({ ...useProblemStore.getState().filters, source: value || undefined }),
    [setFilters],
  )
  const handlePlatformSelect = useCallback(
    (value: string) =>
      setFilters({ ...useProblemStore.getState().filters, platform: value || undefined }),
    [setFilters],
  )
  const handleModeSelect = useCallback(
    (value: string) =>
      setFilters({ ...useProblemStore.getState().filters, mode: value || undefined }),
    [setFilters],
  )
  const handleLanguageSelect = useCallback(
    (value: string) =>
      setFilters({ ...useProblemStore.getState().filters, language: value || undefined }),
    [setFilters],
  )

  // Difficulty distribution for header badges
  const diffDistribution = useMemo(() => {
    const dist = { easy: 0, medium: 0, hard: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0 }
    for (const p of problems) {
      const diff = p.difficulty?.toLowerCase()
      if (diff === 'easy' || diff === '简单') {
        dist.easy++
        if (p.solved) dist.easySolved++
      } else if (diff === 'medium' || diff === '中等') {
        dist.medium++
        if (p.solved) dist.mediumSolved++
      } else if (diff === 'hard' || diff === '困难') {
        dist.hard++
        if (p.solved) dist.hardSolved++
      }
    }
    return dist
  }, [problems])

  return (
    <div className="ui-toolbar flex w-80 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b px-4 py-3 glass-line">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-text-muted)]">
            题目列表
          </span>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
            {filtered.length} / {problems.length} 道题
          </p>
          {/* Difficulty distribution badges */}
          {problems.length > 0 && (
            <div className="mt-1.5 flex gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-success)]"
                title="简单"
              >
                {diffDistribution.easySolved}/{diffDistribution.easy}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-warning-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-warning)]"
                title="中等"
              >
                {diffDistribution.mediumSolved}/{diffDistribution.medium}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-danger-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-danger)]"
                title="困难"
              >
                {diffDistribution.hardSolved}/{diffDistribution.hard}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleCollapse}
          title="收起题目列表"
          aria-label="收起题目列表"
          className="ui-btn-ghost flex h-9 w-9 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="border-b px-3 py-3 glass-line">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={handleSearchChange}
            placeholder="搜索题目..."
            aria-label="搜索题目"
            className="ui-input py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <FilterRow
        title="赛道"
        items={TRACK_ITEMS}
        current={filters.track ?? ''}
        onSelect={handleTrackSelect}
        activeClass="ui-chip-accent"
      />
      <FilterRow
        title="难度"
        items={DIFFICULTY_ITEMS}
        current={filters.difficulty ?? ''}
        onSelect={handleDifficultySelect}
        activeClass="ui-chip-accent"
      />
      <FilterRow
        title="来源"
        items={SOURCE_ITEMS}
        current={filters.source ?? ''}
        onSelect={handleSourceSelect}
        activeClass="ui-chip-warning"
      />
      <FilterRow
        title="平台"
        items={PLATFORM_ITEMS}
        current={filters.platform ?? ''}
        onSelect={handlePlatformSelect}
        activeClass="ui-chip-warning"
      />
      <FilterRow
        title="题型"
        items={MODE_ITEMS}
        current={filters.mode ?? ''}
        onSelect={handleModeSelect}
        activeClass="ui-chip-info"
      />
      <FilterRow
        title="语言"
        items={LANGUAGE_ITEMS}
        current={filters.language ?? ''}
        onSelect={handleLanguageSelect}
        activeClass="ui-chip-info"
      />

      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {loading && <SkeletonList count={6} />}

        {loadError && !loading && (
          <div className="px-3 py-6 text-center">
            <p className="text-sm text-[var(--theme-danger)]">{loadError}</p>
            <p className="mt-1 text-xs text-[var(--theme-text-muted)]">请检查网络连接或稍后重试</p>
            <button
              onClick={() => void loadProblems()}
              className="ui-btn-accent mt-3 px-4 py-2 text-xs"
            >
              重新加载
            </button>
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title="暂无题目"
            description={
              search
                ? '没有匹配的题目，请调整搜索或筛选条件。'
                : '当前筛选条件下没有题目，请尝试调整筛选。'
            }
            action={
              search || Object.keys(filters).length > 0
                ? { label: '清除筛选', onClick: handleClearFilters }
                : undefined
            }
          />
        )}

        {!loading &&
          !loadError &&
          filtered.map((problem) => (
            <ProblemListItem
              key={problem.id}
              problem={problem}
              isActive={activeProblemId === problem.id}
              onSelect={handleSelectProblem}
            />
          ))}
      </div>
    </div>
  )
}
