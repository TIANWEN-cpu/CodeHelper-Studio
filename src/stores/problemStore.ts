import { create } from 'zustand'
import { typedInvoke } from '@/api/ipc'

type Problem = Record<string, unknown> & { id: number }
type SubmitResult = {
  status: string
  passed: number
  total: number
  results: unknown[]
  duration: number
}

type ProblemStore = {
  problems: Problem[]
  activeProblemId: number | null
  activeProblem: Problem | null
  submitResult: SubmitResult | null
  submitting: boolean
  selectedLanguage: string
  filters: Record<string, unknown>
  listCollapsed: boolean
  aiPanelOpen: boolean
  aiPanelWidth: number
  loading: boolean
  loadError: string | null
  loadProblems: () => Promise<void>
  setActiveProblem: (id: number) => Promise<void>
  setFilters: (filters: Record<string, unknown>) => void
  setSelectedLanguage: (language: string) => void
  setListCollapsed: (collapsed: boolean) => void
  setAIPanelOpen: (open: boolean) => void
  setAIPanelWidth: (width: number) => void
  submit: (code: string, language: string) => Promise<void>
  clearResult: () => void
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const useProblemStore = create<ProblemStore>((set, get) => ({
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
  loading: false,
  loadError: null,
  loadProblems: async () => {
    set({ loading: true, loadError: null })
    try {
      const problems = await typedInvoke<Problem[]>('problems-list', get().filters)
      set({ problems })
    } catch (error) {
      set({ loadError: message(error) })
    } finally {
      set({ loading: false })
    }
  },
  setActiveProblem: async (id) => {
    try {
      const activeProblem = (await typedInvoke<Problem | undefined>('problems-get', id)) ?? null
      set({ activeProblemId: id, activeProblem, submitResult: null, loadError: null })
    } catch (error) {
      console.error('[ProblemStore.setActiveProblem]', error)
      set({
        activeProblemId: id,
        activeProblem: null,
        submitResult: null,
        loadError: message(error),
      })
    }
  },
  setFilters: (filters) => {
    set({ filters })
    void get().loadProblems()
  },
  setSelectedLanguage: (selectedLanguage) => set({ selectedLanguage }),
  setListCollapsed: (listCollapsed) => set({ listCollapsed }),
  setAIPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  setAIPanelWidth: (aiPanelWidth) => set({ aiPanelWidth }),
  submit: async (code, language) => {
    const id = get().activeProblemId
    if (id == null) return
    set({ submitting: true, submitResult: null })
    try {
      const submitResult = await typedInvoke<SubmitResult>('problems-submit', {
        id,
        code,
        language,
      })
      set({ submitResult })
      await get().loadProblems()
    } catch (error) {
      console.error('[ProblemStore.submit]', message(error))
      set({ submitResult: { status: 'error', passed: 0, total: 0, results: [], duration: 0 } })
    } finally {
      set({ submitting: false })
    }
  },
  clearResult: () => set({ submitResult: null }),
}))
