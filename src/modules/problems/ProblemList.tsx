import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, ChevronsLeft, Search } from 'lucide-react'
import { useProblemStore } from '../../stores/problemStore'
import {
  parseJsonArray,
  sourceLabel,
  platformLabel,
  modeLabel,
  trackLabel,
} from '../../utils/labels'

const diffColors: Record<string, string> = {
  easy: 'text-[var(--theme-success)]',
  medium: 'text-[var(--theme-warning)]',
  hard: 'text-[var(--theme-danger)]',
}

const diffLabels: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
}

export function ProblemList() {
  const {
    problems,
    activeProblemId,
    loadProblems,
    setActiveProblem,
    filters,
    setFilters,
    setListCollapsed,
  } = useProblemStore()
  const [search, setSearch] = useState('')

  useEffect(() => {
    void loadProblems()
  }, [])

  const filtered = problems.filter((problem) => {
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
        </div>
        <button
          onClick={() => setListCollapsed(true)}
          title="收起题目列表"
          className="ui-btn-ghost flex h-9 w-9 items-center justify-center"
        >
          <ChevronsLeft size={16} />
        </button>
      </div>

      <div className="border-b px-3 py-3 glass-line">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)]"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索题目..."
            className="ui-input py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      <FilterRow
        title="赛道"
        items={[
          { value: '', label: '全部赛道' },
          { value: 'postgrad-retest', label: '考研复试' },
          { value: 'summer-camp', label: '保研夏令营' },
          { value: 'algo-job', label: '算法校招' },
          { value: 'ic-job', label: '硬件 / IC' },
          { value: 'math-modeling', label: '数学建模' },
        ]}
        current={filters.track ?? ''}
        onSelect={(value) => setFilters({ ...filters, track: value || undefined })}
        activeClass="ui-chip-accent"
      />

      <FilterRow
        title="难度"
        items={[
          { value: '', label: '全部' },
          { value: 'easy', label: '简单' },
          { value: 'medium', label: '中等' },
          { value: 'hard', label: '困难' },
        ]}
        current={filters.difficulty ?? ''}
        onSelect={(value) => setFilters({ ...filters, difficulty: value || undefined })}
        activeClass="ui-chip-accent"
      />

      <FilterRow
        title="来源"
        items={[
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
        ]}
        current={filters.source ?? ''}
        onSelect={(value) => setFilters({ ...filters, source: value || undefined })}
        activeClass="ui-chip-warning"
      />

      <FilterRow
        title="平台"
        items={[
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
        ]}
        current={filters.platform ?? ''}
        onSelect={(value) => setFilters({ ...filters, platform: value || undefined })}
        activeClass="ui-chip-warning"
      />

      <FilterRow
        title="题型"
        items={[
          { value: '', label: '全部题型' },
          { value: 'oj', label: 'OJ' },
          { value: 'simulation', label: '仿真题' },
          { value: 'data-task', label: '数据题' },
          { value: 'case-study', label: '案例题' },
          { value: 'report-task', label: '报告题' },
        ]}
        current={filters.mode ?? ''}
        onSelect={(value) => setFilters({ ...filters, mode: value || undefined })}
        activeClass="ui-chip-info"
      />

      <FilterRow
        title="语言"
        items={[
          { value: '', label: '全部' },
          { value: 'python', label: 'Python' },
          { value: 'c', label: 'C' },
          { value: 'cpp', label: 'C++' },
          { value: 'csharp', label: 'C#' },
          { value: 'sql', label: 'SQL' },
          { value: 'verilog', label: 'Verilog' },
        ]}
        current={filters.language ?? ''}
        onSelect={(value) => setFilters({ ...filters, language: value || undefined })}
        activeClass="ui-chip-info"
      />

      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {filtered.map((problem) => {
          const tracks = parseJsonArray(problem.tracks)
          return (
            <div
              key={problem.id}
              onClick={() => setActiveProblem(problem.id)}
              className={`mb-2 cursor-pointer rounded-2xl border px-3 py-3 transition-colors ${
                activeProblemId === problem.id
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]'
                  : 'border-transparent hover:border-[var(--theme-border)] hover:bg-[var(--theme-bg-hover)]/40'
              }`}
            >
              <div className="flex items-start gap-3">
                {problem.solved > 0 ? (
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--theme-success)]" />
                ) : (
                  <Circle size={15} className="mt-0.5 shrink-0 text-[var(--theme-border-strong)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--theme-text-primary)]">
                    {problem.id}. {problem.title}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`text-xs ${diffColors[problem.difficulty]}`}>
                      {diffLabels[problem.difficulty]}
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
        })}
      </div>
    </div>
  )
}

function FilterRow({
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
            className={`ui-chip ${current === item.value ? activeClass : 'hover:bg-[var(--theme-bg-hover)]'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
