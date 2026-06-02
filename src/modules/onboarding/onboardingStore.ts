/**
 * Onboarding state store.
 *
 * Persists first-run wizard completion, feature tour state,
 * and setup checklist progress via the settings IPC layer.
 */

import { create } from 'zustand'
import { typedInvoke } from '../../api/ipc'
import { toErrorMessage } from '../../utils/errors'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ONBOARDING_COMPLETE_KEY = 'onboarding-complete'
const TOUR_COMPLETED_KEY = 'onboarding-tour-completed'
const TOUR_SKIPPED_KEY = 'onboarding-tour-skipped'

/** Checklist item keys persisted in the settings DB. */
export type ChecklistKey =
  | 'api-configured'
  | 'first-problem-solved'
  | 'first-ai-chat'
  | 'knowledge-imported'

const CHECKLIST_PREFIX = 'checklist-'

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface OnboardingState {
  /** Whether the welcome wizard has been completed. */
  wizardCompleted: boolean
  /** Whether the feature tour has been completed or skipped. */
  tourCompleted: boolean
  /** Checklist completion map. */
  checklist: Record<ChecklistKey, boolean>
  /** Loading flag for initial hydration. */
  hydrated: boolean

  // Actions
  completeWizard: () => Promise<void>
  completeTour: () => Promise<void>
  skipTour: () => Promise<void>
  markChecklistItem: (key: ChecklistKey) => Promise<void>
  resetChecklistItem: (key: ChecklistKey) => Promise<void>
  hydrate: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readSetting(key: string): Promise<string | null> {
  try {
    return await typedInvoke('db-get-setting', key)
  } catch {
    return null
  }
}

async function writeSetting(key: string, value: string): Promise<void> {
  try {
    await typedInvoke('db-set-setting', key, value)
  } catch (error) {
    console.warn('[OnboardingStore] Failed to write setting:', key, toErrorMessage(error))
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  wizardCompleted: false,
  tourCompleted: false,
  checklist: {
    'api-configured': false,
    'first-problem-solved': false,
    'first-ai-chat': false,
    'knowledge-imported': false,
  },
  hydrated: false,

  hydrate: async () => {
    try {
      const [wizardDone, tourDone, tourSkipped, ...checklistResults] = await Promise.all([
        readSetting(ONBOARDING_COMPLETE_KEY),
        readSetting(TOUR_COMPLETED_KEY),
        readSetting(TOUR_SKIPPED_KEY),
        ...(
          [
            'api-configured',
            'first-problem-solved',
            'first-ai-chat',
            'knowledge-imported',
          ] as ChecklistKey[]
        ).map((k) => readSetting(CHECKLIST_PREFIX + k)),
      ])

      const keys: ChecklistKey[] = [
        'api-configured',
        'first-problem-solved',
        'first-ai-chat',
        'knowledge-imported',
      ]
      const checklist: Record<ChecklistKey, boolean> = {} as Record<ChecklistKey, boolean>
      keys.forEach((k, i) => {
        checklist[k] = checklistResults[i] === 'true'
      })

      set({
        wizardCompleted: wizardDone === 'true',
        tourCompleted: tourDone === 'true' || tourSkipped === 'true',
        checklist,
        hydrated: true,
      })
    } catch {
      set({ hydrated: true })
    }
  },

  completeWizard: async () => {
    set({ wizardCompleted: true })
    await writeSetting(ONBOARDING_COMPLETE_KEY, 'true')
  },

  completeTour: async () => {
    set({ tourCompleted: true })
    await writeSetting(TOUR_COMPLETED_KEY, 'true')
  },

  skipTour: async () => {
    set({ tourCompleted: true })
    await writeSetting(TOUR_SKIPPED_KEY, 'true')
  },

  markChecklistItem: async (key: ChecklistKey) => {
    set((s) => ({ checklist: { ...s.checklist, [key]: true } }))
    await writeSetting(CHECKLIST_PREFIX + key, 'true')
  },

  resetChecklistItem: async (key: ChecklistKey) => {
    set((s) => ({ checklist: { ...s.checklist, [key]: false } }))
    await writeSetting(CHECKLIST_PREFIX + key, 'false')
  },
}))
