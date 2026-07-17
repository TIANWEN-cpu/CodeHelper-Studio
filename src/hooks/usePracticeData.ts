import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getExercises,
  getReviewDue as svcGetReviewDue,
  submitCode as svcSubmitCode,
  type Exercise,
  type ReviewItem,
  type SubmitResult,
} from '../services/practiceService'
import { reportError } from '@/utils/errorHandler'
import {
  practiceDraftSession,
  type PracticeDraftCloseState,
  type DraftDeactivateResult,
  type DraftFlushResult,
} from '@/services/practiceDraftSession'

export type {
  DraftDeactivateResult,
  DraftDurability,
  DraftFlushResult,
} from '@/services/practiceDraftSession'

export interface UsePracticeDataReturn {
  exercises: Exercise[]
  loading: boolean
  error: string | null
  loadExercises: (trackId?: string, difficulty?: string) => Promise<void>
  currentExercise: Exercise | null
  loadingExercise: boolean
  selectExercise: (id: string) => Promise<boolean>
  code: string
  setCode: (code: string) => void
  language: string
  setLanguage: (lang: string) => void
  draftSaving: boolean
  draftDirty: boolean
  draftError: string | null
  draftDegradedMessage: string | null
  draftRestoreMessage: string | null
  draftConflict: boolean
  flushDraft: () => Promise<DraftFlushResult>
  getRecoveryOnlyDraftCloseState: (exerciseId: string) => PracticeDraftCloseState | null
  deactivateExercise: (expectedExerciseId?: string) => Promise<DraftDeactivateResult>
  clearCurrentDraft: () => Promise<void>
  keepLocalDraft: () => void
  reloadPersistedDraft: () => void
  submitResult: SubmitResult | null
  submitting: boolean
  submitCode: (exerciseId: string, code: string, language: string) => Promise<void>
  clearSubmitResult: () => void
  reviewDue: ReviewItem[]
  getReviewDue: () => Promise<void>
  clearError: () => void
}

export function usePracticeData(): UsePracticeDataReturn {
  const draftSession = useSyncExternalStore(
    practiceDraftSession.subscribe,
    practiceDraftSession.getSnapshot,
    practiceDraftSession.getSnapshot,
  )
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reviewDue, setReviewDue] = useState<ReviewItem[]>([])

  const mountedRef = useRef(true)
  const listRequestId = useRef(0)
  const submitRequestId = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      listRequestId.current += 1
      submitRequestId.current += 1
      void practiceDraftSession.flushDraft()
    }
  }, [])

  const safeUpdate = useCallback(<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (mountedRef.current) setter(value)
  }, [])

  const loadExercises = useCallback(
    async (trackId?: string, difficulty?: string) => {
      const requestId = ++listRequestId.current
      safeUpdate(setLoading, true)
      safeUpdate(setRequestError, null)
      try {
        const data = await getExercises(trackId, difficulty)
        if (listRequestId.current === requestId) safeUpdate(setExercises, data)
      } catch (error) {
        if (listRequestId.current !== requestId) return
        safeUpdate(setRequestError, error instanceof Error ? error.message : '加载练习列表失败')
      } finally {
        if (listRequestId.current === requestId) safeUpdate(setLoading, false)
      }
    },
    [safeUpdate],
  )

  const selectExercise = useCallback(
    async (id: string) => {
      if (practiceDraftSession.getSnapshot().currentExercise?.id !== id) {
        submitRequestId.current += 1
        safeUpdate(setSubmitting, false)
        safeUpdate(setSubmitResult, null)
        safeUpdate(setRequestError, null)
      }
      return practiceDraftSession.selectExercise(id)
    },
    [safeUpdate],
  )

  const deactivateExercise = useCallback(
    async (expectedExerciseId?: string) => {
      const result = await practiceDraftSession.deactivateExercise(expectedExerciseId)
      if (result.deactivated) {
        submitRequestId.current += 1
        safeUpdate(setSubmitting, false)
        safeUpdate(setSubmitResult, null)
      }
      return result
    },
    [safeUpdate],
  )

  const submitCode = useCallback(
    async (exerciseId: string, code: string, language: string) => {
      safeUpdate(setSubmitting, true)
      const requestId = ++submitRequestId.current
      safeUpdate(setSubmitResult, null)
      safeUpdate(setRequestError, null)
      try {
        const result = await svcSubmitCode(exerciseId, code, language)
        if (
          submitRequestId.current !== requestId ||
          practiceDraftSession.getSnapshot().currentExercise?.id !== exerciseId
        ) {
          return
        }
        safeUpdate(setSubmitResult, result)
      } catch (error) {
        if (
          submitRequestId.current !== requestId ||
          practiceDraftSession.getSnapshot().currentExercise?.id !== exerciseId
        ) {
          return
        }
        safeUpdate(setRequestError, error instanceof Error ? error.message : '提交代码失败')
        reportError(error, 'practice.submitCode', { showToast: true })
      } finally {
        if (submitRequestId.current === requestId) safeUpdate(setSubmitting, false)
      }
    },
    [safeUpdate],
  )

  const clearSubmitResult = useCallback(() => {
    submitRequestId.current += 1
    setSubmitting(false)
    setSubmitResult(null)
  }, [])

  const getReviewDue = useCallback(async () => {
    try {
      const items = await svcGetReviewDue()
      safeUpdate(setReviewDue, items)
    } catch {
      // Review data is supplementary.
    }
  }, [safeUpdate])

  const clearError = useCallback(() => {
    setRequestError(null)
    practiceDraftSession.clearError()
  }, [])

  useEffect(() => {
    void loadExercises()
    void getReviewDue()
  }, [loadExercises, getReviewDue])

  return {
    exercises,
    loading,
    error: requestError ?? draftSession.error,
    loadExercises,
    currentExercise: draftSession.currentExercise,
    loadingExercise: draftSession.loadingExercise,
    selectExercise,
    code: draftSession.code,
    setCode: practiceDraftSession.setCode,
    language: draftSession.language,
    setLanguage: practiceDraftSession.setLanguage,
    draftSaving: draftSession.draftSaving,
    draftDirty: draftSession.draftDirty,
    draftError: draftSession.draftError,
    draftDegradedMessage: draftSession.draftDegradedMessage,
    draftRestoreMessage: draftSession.draftRestoreMessage,
    draftConflict: draftSession.draftConflict,
    flushDraft: practiceDraftSession.flushDraft,
    getRecoveryOnlyDraftCloseState: practiceDraftSession.getRecoveryOnlyDraftCloseState,
    deactivateExercise,
    clearCurrentDraft: practiceDraftSession.clearCurrentDraft,
    keepLocalDraft: practiceDraftSession.keepLocalDraft,
    reloadPersistedDraft: practiceDraftSession.reloadPersistedDraft,
    submitResult,
    submitting,
    submitCode,
    clearSubmitResult,
    reviewDue,
    getReviewDue,
    clearError,
  }
}
