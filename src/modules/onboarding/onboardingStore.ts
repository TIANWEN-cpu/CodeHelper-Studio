import { create } from 'zustand'
import { typedInvoke } from '@/api/ipc'

type ChecklistKey =
  | 'api-configured'
  | 'first-problem-solved'
  | 'first-ai-chat'
  | 'knowledge-imported'
type Checklist = Record<ChecklistKey, boolean>

type OnboardingStore = {
  wizardCompleted: boolean
  tourCompleted: boolean
  checklist: Checklist
  hydrated: boolean
  completeWizard: () => Promise<void>
  completeTour: () => Promise<void>
  skipTour: () => Promise<void>
  markChecklistItem: (key: ChecklistKey) => Promise<void>
  resetChecklistItem: (key: ChecklistKey) => Promise<void>
  hydrate: () => Promise<void>
}

const emptyChecklist: Checklist = {
  'api-configured': false,
  'first-problem-solved': false,
  'first-ai-chat': false,
  'knowledge-imported': false,
}

async function persist(key: string, value: boolean) {
  await typedInvoke('db-set-setting', key, String(value))
}

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  wizardCompleted: false,
  tourCompleted: false,
  checklist: { ...emptyChecklist },
  hydrated: false,
  completeWizard: async () => {
    set({ wizardCompleted: true })
    await persist('onboarding-complete', true)
  },
  completeTour: async () => {
    set({ tourCompleted: true })
    await persist('onboarding-tour-completed', true)
  },
  skipTour: async () => {
    set({ tourCompleted: true })
    await persist('onboarding-tour-skipped', true)
  },
  markChecklistItem: async (key) => {
    set((state) => ({ checklist: { ...state.checklist, [key]: true } }))
    await persist(`checklist-${key}`, true)
  },
  resetChecklistItem: async (key) => {
    set((state) => ({ checklist: { ...state.checklist, [key]: false } }))
    await persist(`checklist-${key}`, false)
  },
  hydrate: async () => {
    try {
      const keys = Object.keys(emptyChecklist) as ChecklistKey[]
      const [wizard, tourDone, tourSkipped, ...items] = await Promise.all([
        typedInvoke<string | null>('db-get-setting', 'onboarding-complete'),
        typedInvoke<string | null>('db-get-setting', 'onboarding-tour-completed'),
        typedInvoke<string | null>('db-get-setting', 'onboarding-tour-skipped'),
        ...keys.map((key) => typedInvoke<string | null>('db-get-setting', `checklist-${key}`)),
      ])
      set({
        wizardCompleted: wizard === 'true',
        tourCompleted: tourDone === 'true' || tourSkipped === 'true',
        checklist: keys.reduce((acc, key, index) => ({ ...acc, [key]: items[index] === 'true' }), {
          ...emptyChecklist,
        }),
      })
    } catch {
      // Hydration should never block startup.
    } finally {
      set({ hydrated: true })
    }
  },
}))
