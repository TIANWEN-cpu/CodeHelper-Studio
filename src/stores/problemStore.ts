import { create } from 'zustand'
import type { Problem, Submission, ProblemFilters } from '../types/problem'
import { DEFAULT_LANGUAGE } from '../constants'
import { toErrorMessage } from '../utils/errors'
import { typedInvoke } from '../api/ipc'

// Re-export types so existing consumers are not broken
export type { Problem, Submission as SubmitResult }
export type { ProblemFilters }

interface ProblemState {
  problems: Problem[]
  activeProblemId: number | null
  activeProblem: Problem | null
  submitResult: Submission | null
  submitting: boolean
  selectedLanguage: string
  filters: ProblemFilters
  listCollapsed: boolean
  aiPanelOpen: boolean
  aiPanelWidth: number
  loadProblems: () => Promise<void>
  setActiveProblem: (id: number) => Promise<void>
  setFilters: (filters: ProblemFilters) => void
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
  selectedLanguage: DEFAULT_LANGUAGE,
  filters: {},
  listCollapsed: false,
  aiPanelOpen: false,
  aiPanelWidth: 420,

  loadProblems: async () => {
    const problems = await typedInvoke('problems-list', get().filters)
    set({ problems })
  },

  setActiveProblem: async (id: number) => {
    const problem = await typedInvoke('problems-get', id)
    set({ activeProblemId: id, activeProblem: problem ?? null, submitResult: null })
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
      const result = await typedInvoke('problems-submit', {
        problemId: activeProblemId,
        code,
        language,
      })
      set({ submitResult: result })
      get().loadProblems()
    } catch (error: unknown) {
      set({
        submitResult: {
          status: 'error',
          passed: 0,
          total: 0,
          results: [],
          duration: 0,
        },
      })
      console.error('[ProblemStore.submit]', toErrorMessage(error))
    } finally {
      set({ submitting: false })
    }
  },

  clearResult: () => set({ submitResult: null }),
}))
