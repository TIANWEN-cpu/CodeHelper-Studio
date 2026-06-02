import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock typedInvoke before importing the store
const mockInvoke = vi.fn()
vi.mock('../src/api/ipc', () => ({
  typedInvoke: (...args: unknown[]) => mockInvoke(...args),
  typedOn: vi.fn(),
  invalidateCache: vi.fn(),
  clearIpcCache: vi.fn(),
}))

const { useOnboardingStore } = await import('../src/modules/onboarding/onboardingStore')

describe('onboardingStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    // Reset store to initial state
    useOnboardingStore.setState({
      wizardCompleted: false,
      tourCompleted: false,
      checklist: {
        'api-configured': false,
        'first-problem-solved': false,
        'first-ai-chat': false,
        'knowledge-imported': false,
      },
      hydrated: false,
    })
  })

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------
  describe('initial state', () => {
    it('wizardCompleted is false', () => {
      expect(useOnboardingStore.getState().wizardCompleted).toBe(false)
    })

    it('tourCompleted is false', () => {
      expect(useOnboardingStore.getState().tourCompleted).toBe(false)
    })

    it('all checklist items are false', () => {
      const { checklist } = useOnboardingStore.getState()
      expect(checklist['api-configured']).toBe(false)
      expect(checklist['first-problem-solved']).toBe(false)
      expect(checklist['first-ai-chat']).toBe(false)
      expect(checklist['knowledge-imported']).toBe(false)
    })

    it('hydrated is false', () => {
      expect(useOnboardingStore.getState().hydrated).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // completeWizard
  // ---------------------------------------------------------------------------
  describe('completeWizard', () => {
    it('sets wizardCompleted to true', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().completeWizard()
      expect(useOnboardingStore.getState().wizardCompleted).toBe(true)
    })

    it('persists setting via IPC', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().completeWizard()
      expect(mockInvoke).toHaveBeenCalledWith('db-set-setting', 'onboarding-complete', 'true')
    })
  })

  // ---------------------------------------------------------------------------
  // completeTour
  // ---------------------------------------------------------------------------
  describe('completeTour', () => {
    it('sets tourCompleted to true', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().completeTour()
      expect(useOnboardingStore.getState().tourCompleted).toBe(true)
    })

    it('persists tour-completed setting', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().completeTour()
      expect(mockInvoke).toHaveBeenCalledWith('db-set-setting', 'onboarding-tour-completed', 'true')
    })
  })

  // ---------------------------------------------------------------------------
  // skipTour
  // ---------------------------------------------------------------------------
  describe('skipTour', () => {
    it('sets tourCompleted to true when skipped', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().skipTour()
      expect(useOnboardingStore.getState().tourCompleted).toBe(true)
    })

    it('persists tour-skipped setting (not tour-completed)', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().skipTour()
      expect(mockInvoke).toHaveBeenCalledWith('db-set-setting', 'onboarding-tour-skipped', 'true')
      // Should NOT write to tour-completed
      const tourCompletedCalls = mockInvoke.mock.calls.filter(
        (c: unknown[]) => c[0] === 'db-set-setting' && c[1] === 'onboarding-tour-completed',
      )
      expect(tourCompletedCalls).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // markChecklistItem
  // ---------------------------------------------------------------------------
  describe('markChecklistItem', () => {
    it('marks a single item as true', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().markChecklistItem('api-configured')
      expect(useOnboardingStore.getState().checklist['api-configured']).toBe(true)
    })

    it('does not affect other items', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().markChecklistItem('first-ai-chat')
      const { checklist } = useOnboardingStore.getState()
      expect(checklist['api-configured']).toBe(false)
      expect(checklist['first-problem-solved']).toBe(false)
      expect(checklist['first-ai-chat']).toBe(true)
      expect(checklist['knowledge-imported']).toBe(false)
    })

    it('persists the checklist item', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().markChecklistItem('knowledge-imported')
      expect(mockInvoke).toHaveBeenCalledWith(
        'db-set-setting',
        'checklist-knowledge-imported',
        'true',
      )
    })

    it('handles all four checklist keys', async () => {
      mockInvoke.mockResolvedValue(undefined)
      const keys = [
        'api-configured',
        'first-problem-solved',
        'first-ai-chat',
        'knowledge-imported',
      ] as const
      for (const key of keys) {
        await useOnboardingStore.getState().markChecklistItem(key)
      }
      const { checklist } = useOnboardingStore.getState()
      for (const key of keys) {
        expect(checklist[key]).toBe(true)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // resetChecklistItem
  // ---------------------------------------------------------------------------
  describe('resetChecklistItem', () => {
    it('resets a marked item to false', async () => {
      mockInvoke.mockResolvedValue(undefined)
      // First mark it
      await useOnboardingStore.getState().markChecklistItem('api-configured')
      expect(useOnboardingStore.getState().checklist['api-configured']).toBe(true)

      // Then reset
      await useOnboardingStore.getState().resetChecklistItem('api-configured')
      expect(useOnboardingStore.getState().checklist['api-configured']).toBe(false)
    })

    it('persists false value', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().resetChecklistItem('first-problem-solved')
      expect(mockInvoke).toHaveBeenCalledWith(
        'db-set-setting',
        'checklist-first-problem-solved',
        'false',
      )
    })
  })

  // ---------------------------------------------------------------------------
  // hydrate
  // ---------------------------------------------------------------------------
  describe('hydrate', () => {
    it('sets hydrated to true on success', async () => {
      mockInvoke.mockResolvedValue(null)
      await useOnboardingStore.getState().hydrate()
      expect(useOnboardingStore.getState().hydrated).toBe(true)
    })

    it('reads wizard completion from settings', async () => {
      mockInvoke.mockImplementation(async (channel: string, key: string) => {
        if (channel === 'db-get-setting' && key === 'onboarding-complete') return 'true'
        return null
      })
      await useOnboardingStore.getState().hydrate()
      expect(useOnboardingStore.getState().wizardCompleted).toBe(true)
    })

    it('reads tour completion from settings', async () => {
      mockInvoke.mockImplementation(async (channel: string, key: string) => {
        if (channel === 'db-get-setting' && key === 'onboarding-tour-completed') return 'true'
        return null
      })
      await useOnboardingStore.getState().hydrate()
      expect(useOnboardingStore.getState().tourCompleted).toBe(true)
    })

    it('treats tour-skipped as tour completed', async () => {
      mockInvoke.mockImplementation(async (channel: string, key: string) => {
        if (channel === 'db-get-setting' && key === 'onboarding-tour-skipped') return 'true'
        return null
      })
      await useOnboardingStore.getState().hydrate()
      expect(useOnboardingStore.getState().tourCompleted).toBe(true)
    })

    it('reads checklist items from settings', async () => {
      mockInvoke.mockImplementation(async (channel: string, key: string) => {
        if (channel === 'db-get-setting' && key === 'checklist-api-configured') return 'true'
        if (channel === 'db-get-setting' && key === 'checklist-first-ai-chat') return 'true'
        return null
      })
      await useOnboardingStore.getState().hydrate()
      const { checklist } = useOnboardingStore.getState()
      expect(checklist['api-configured']).toBe(true)
      expect(checklist['first-problem-solved']).toBe(false)
      expect(checklist['first-ai-chat']).toBe(true)
      expect(checklist['knowledge-imported']).toBe(false)
    })

    it('sets hydrated even when all settings are null (fresh install)', async () => {
      mockInvoke.mockResolvedValue(null)
      await useOnboardingStore.getState().hydrate()
      const state = useOnboardingStore.getState()
      expect(state.hydrated).toBe(true)
      expect(state.wizardCompleted).toBe(false)
      expect(state.tourCompleted).toBe(false)
      expect(state.checklist['api-configured']).toBe(false)
    })

    it('sets hydrated even on IPC error', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC failed'))
      await useOnboardingStore.getState().hydrate()
      expect(useOnboardingStore.getState().hydrated).toBe(true)
    })

    it('handles non-"true" string values as false', async () => {
      mockInvoke.mockImplementation(async (channel: string, key: string) => {
        if (channel === 'db-get-setting' && key === 'onboarding-complete') return 'yes'
        if (channel === 'db-get-setting' && key === 'onboarding-tour-completed') return '1'
        return null
      })
      await useOnboardingStore.getState().hydrate()
      expect(useOnboardingStore.getState().wizardCompleted).toBe(false)
      expect(useOnboardingStore.getState().tourCompleted).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------
  describe('wizard completion flow', () => {
    it('wizard can complete, then hydrate preserves state', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().completeWizard()
      expect(useOnboardingStore.getState().wizardCompleted).toBe(true)

      // Simulate hydrate reading back the persisted value
      mockInvoke.mockImplementation(async (channel: string, key: string) => {
        if (channel === 'db-get-setting' && key === 'onboarding-complete') return 'true'
        return null
      })
      await useOnboardingStore.getState().hydrate()
      expect(useOnboardingStore.getState().wizardCompleted).toBe(true)
    })
  })

  describe('tour completion flow', () => {
    it('complete then skip still results in tourCompleted=true', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().completeTour()
      expect(useOnboardingStore.getState().tourCompleted).toBe(true)

      // Skip doesn't change the already-true state
      await useOnboardingStore.getState().skipTour()
      expect(useOnboardingStore.getState().tourCompleted).toBe(true)
    })
  })

  describe('checklist progress', () => {
    it('can mark and reset items independently', async () => {
      mockInvoke.mockResolvedValue(undefined)
      await useOnboardingStore.getState().markChecklistItem('api-configured')
      await useOnboardingStore.getState().markChecklistItem('first-problem-solved')

      expect(useOnboardingStore.getState().checklist['api-configured']).toBe(true)
      expect(useOnboardingStore.getState().checklist['first-problem-solved']).toBe(true)

      await useOnboardingStore.getState().resetChecklistItem('api-configured')
      expect(useOnboardingStore.getState().checklist['api-configured']).toBe(false)
      expect(useOnboardingStore.getState().checklist['first-problem-solved']).toBe(true)
    })
  })
})
