import { create } from 'zustand'

export interface Problem {
  id: number
  title: string
  description: string
  difficulty: string
  source?: string
  tracks?: string
  platform?: string
  mode?: string
  exam_style?: string
  year?: number | null
  official_url?: string | null
  estimated_time?: number | null
  tags: string
  languages: string
  examples: string
  test_cases: string
  starter_code: string
  solved: number
}

export interface SubmitResult {
  status: string
  passed: number
  total: number
  results: { input: string; expected: string; actual: string; passed: boolean }[]
  duration: number
}

interface ProblemState {
  problems: Problem[]
  activeProblemId: number | null
  activeProblem: Problem | null
  submitResult: SubmitResult | null
  submitting: boolean
  selectedLanguage: string
  filters: {
    difficulty?: string
    tag?: string
    search?: string
    language?: string
    source?: string
    track?: string
    platform?: string
    mode?: string
  }
  listCollapsed: boolean
  aiPanelOpen: boolean
  aiPanelWidth: number
  loadProblems: () => Promise<void>
  setActiveProblem: (id: number) => Promise<void>
  setFilters: (filters: {
    difficulty?: string
    tag?: string
    search?: string
    language?: string
    source?: string
    track?: string
    platform?: string
    mode?: string
  }) => void
  setSelectedLanguage: (lang: string) => void
  setListCollapsed: (v: boolean) => void
  setAIPanelOpen: (v: boolean) => void
  setAIPanelWidth: (width: number) => void
  submit: (code: string, language: string) => Promise<void>
  clearResult: () => void
}

export const useProblemStore = create<ProblemState>((set, get) => ({
  problems: [],
  activeProblemId: null,
  activeProblem: null,
  submitResult: null,
  submitting: false,
  selectedLanguage: 'python',
  filters: {},
  listCollapsed: false,
  aiPanelOpen: false,
  aiPanelWidth: 420,

  loadProblems: async () => {
    const problems = (await window.api.invoke('problems-list', get().filters)) as Problem[]
    set({ problems })
  },

  setActiveProblem: async (id: number) => {
    const problem = (await window.api.invoke('problems-get', id)) as Problem
    set({ activeProblemId: id, activeProblem: problem, submitResult: null })
  },

  setFilters: (filters) => {
    set({ filters })
    get().loadProblems()
  },

  setSelectedLanguage: (lang) => set({ selectedLanguage: lang }),
  setListCollapsed: (v) => set({ listCollapsed: v }),
  setAIPanelOpen: (v) => set({ aiPanelOpen: v }),
  setAIPanelWidth: (width) => set({ aiPanelWidth: width }),

  submit: async (code: string, language: string) => {
    const { activeProblemId } = get()
    if (!activeProblemId) return
    set({ submitting: true, submitResult: null })
    try {
      const result = (await window.api.invoke('problems-submit', {
        problemId: activeProblemId,
        code,
        language,
      })) as SubmitResult
      set({ submitResult: result })
      get().loadProblems()
    } finally {
      set({ submitting: false })
    }
  },

  clearResult: () => set({ submitResult: null }),
}))
