import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getExercises,
  getExercise,
  submitCode as svcSubmitCode,
  getDraft,
  saveDraft as svcSaveDraft,
  clearDraft,
  getReviewDue as svcGetReviewDue,
  type Exercise,
  type SubmitResult,
  type ReviewItem,
} from '../services/practiceService'
import { reportError } from '@/utils/errorHandler'
import { DraftAutosaveCoordinator } from '@/utils/draftAutosave'
import { clearDraftRecovery, readDraftRecovery, writeDraftRecovery } from '@/utils/draftRecovery'

// ---- Types ----

export interface UsePracticeDataReturn {
  // Exercise list
  exercises: Exercise[]
  loading: boolean
  error: string | null
  loadExercises: (trackId?: string, difficulty?: string) => Promise<void>

  // Current exercise
  currentExercise: Exercise | null
  loadingExercise: boolean
  selectExercise: (id: string) => Promise<boolean>

  // Code draft (auto-saved)
  code: string
  setCode: (code: string) => void
  language: string
  setLanguage: (lang: string) => void
  draftSaving: boolean
  draftDirty: boolean
  draftError: string | null
  saveDraft: (exerciseId: string, code: string) => Promise<void>
  flushDraft: () => Promise<void>
  loadDraft: (exerciseId: string) => Promise<string | null>
  clearCurrentDraft: () => Promise<void>

  // Submission
  submitResult: SubmitResult | null
  submitting: boolean
  submitCode: (exerciseId: string, code: string, language: string) => Promise<void>
  clearSubmitResult: () => void

  // Review
  reviewDue: ReviewItem[]
  getReviewDue: () => Promise<void>

  // Utility
  clearError: () => void
}

// ---- Hook ----

export function usePracticeData(): UsePracticeDataReturn {
  // ---- Exercise list state ----
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- Current exercise state ----
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null)
  const [loadingExercise, setLoadingExercise] = useState(false)

  // ---- Code draft state ----
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  // ---- Submission state ----
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ---- Review state ----
  const [reviewDue, setReviewDue] = useState<ReviewItem[]>([])

  // ---- Refs ----
  const mountedRef = useRef(true)
  const activeExerciseId = useRef<string | null>(null)
  const exerciseRequestId = useRef(0)
  const listRequestId = useRef(0)
  const submitRequestId = useRef(0)
  const autosaveRef = useRef<DraftAutosaveCoordinator | null>(null)

  if (!autosaveRef.current) {
    autosaveRef.current = new DraftAutosaveCoordinator(svcSaveDraft, {
      onSavingChange: (saving) => {
        if (!mountedRef.current) return
        setDraftSaving(saving)
        if (!saving) setDraftDirty(autosaveRef.current?.hasPending() ?? false)
      },
      onError: (autosaveError) => {
        if (!mountedRef.current) return
        setDraftError(
          autosaveError instanceof Error
            ? `自动保存草稿失败：${autosaveError.message}`
            : '自动保存草稿失败，将在下次编辑时重试',
        )
        setDraftDirty(true)
      },
      onSaved: (exerciseId, savedCode) => {
        clearDraftRecovery(exerciseId, savedCode)
        if (mountedRef.current) setDraftError(null)
      },
    })
  }

  // ---- Cleanup on unmount ----
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      exerciseRequestId.current += 1
      listRequestId.current += 1
      submitRequestId.current += 1
      const finalSave = autosaveRef.current?.dispose()
      void finalSave?.catch(() => undefined)
    }
  }, [])

  // ---- Internal helpers ----

  const safeUpdate = useCallback(<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (mountedRef.current) setter(value)
  }, [])

  const flushPendingDraft = useCallback(async () => {
    try {
      await autosaveRef.current?.flush()
      return true
    } catch {
      // Auto-save failure is non-critical; silently ignore
      return false
    }
  }, [])

  const performAutoSave = useCallback(async () => {
    await flushPendingDraft()
  }, [flushPendingDraft])

  // ---- Public: loadExercises ----

  const loadExercises = useCallback(
    async (trackId?: string, difficulty?: string) => {
      const requestId = ++listRequestId.current
      safeUpdate(setLoading, true)
      safeUpdate(setError, null)
      try {
        const data = await getExercises(trackId, difficulty)
        if (listRequestId.current === requestId) safeUpdate(setExercises, data)
      } catch (err) {
        if (listRequestId.current !== requestId) return
        safeUpdate(setError, err instanceof Error ? err.message : '加载练习列表失败')
      } finally {
        if (listRequestId.current === requestId) safeUpdate(setLoading, false)
      }
    },
    [safeUpdate],
  )

  // ---- Public: selectExercise ----

  const selectExercise = useCallback(
    async (id: string) => {
      const requestId = ++exerciseRequestId.current
      // Flush any pending auto-save for the previous exercise
      const flushed = await flushPendingDraft()
      if (!flushed) return false
      submitRequestId.current += 1
      safeUpdate(setSubmitting, false)
      if (exerciseRequestId.current !== requestId) return false

      safeUpdate(setLoadingExercise, true)
      safeUpdate(setError, null)
      safeUpdate(setSubmitResult, null)

      try {
        const [exercise, draft] = await Promise.all([getExercise(id), getDraft(id)])
        if (exerciseRequestId.current !== requestId) return false
        activeExerciseId.current = id
        const preferredLanguage = exercise.languages?.[0]
        if (preferredLanguage) safeUpdate(setLanguage, preferredLanguage)
        const recovered = readDraftRecovery(id)
        const initialCode = recovered?.code ?? draft ?? exercise.starter_code ?? ''
        autosaveRef.current?.setActive(id, initialCode)
        if (recovered) autosaveRef.current?.update(initialCode)
        safeUpdate(setDraftDirty, Boolean(recovered))
        safeUpdate(setDraftError, null)
        safeUpdate(setCurrentExercise, exercise)
        safeUpdate(setCode, initialCode)
        return true
      } catch (err) {
        if (exerciseRequestId.current !== requestId) return false
        safeUpdate(setError, err instanceof Error ? err.message : '加载题目失败')
        return false
      } finally {
        if (exerciseRequestId.current === requestId) safeUpdate(setLoadingExercise, false)
      }
    },
    [flushPendingDraft, safeUpdate],
  )

  // ---- Public: setCode (with auto-save debounce) ----

  const handleSetCode = useCallback(
    (newCode: string) => {
      safeUpdate(setCode, newCode)
      autosaveRef.current?.update(newCode)
      safeUpdate(setDraftDirty, true)
      const exerciseId = activeExerciseId.current
      if (exerciseId) safeUpdate(setDraftError, writeDraftRecovery(exerciseId, newCode))
    },
    [safeUpdate],
  )

  // ---- Public: saveDraft ----

  const saveDraft = useCallback(
    async (exerciseId: string, codeToSave: string) => {
      safeUpdate(setDraftSaving, true)
      try {
        await svcSaveDraft(exerciseId, codeToSave)
        clearDraftRecovery(exerciseId, codeToSave)
        safeUpdate(setDraftError, null)
      } catch (err) {
        safeUpdate(setError, err instanceof Error ? err.message : '保存草稿失败')
      } finally {
        safeUpdate(setDraftSaving, false)
      }
    },
    [safeUpdate],
  )

  // ---- Public: loadDraft ----

  const loadDraft = useCallback(
    async (exerciseId: string): Promise<string | null> => {
      const requestId = ++exerciseRequestId.current
      const flushed = await flushPendingDraft()
      if (!flushed || exerciseRequestId.current !== requestId) return null

      try {
        const draft = await getDraft(exerciseId)
        if (exerciseRequestId.current !== requestId) return null
        const recovered = readDraftRecovery(exerciseId)
        const codeToLoad = recovered?.code ?? draft
        if (mountedRef.current && codeToLoad !== null) {
          submitRequestId.current += 1
          safeUpdate(setSubmitting, false)
          safeUpdate(setSubmitResult, null)
          activeExerciseId.current = exerciseId
          setCode(codeToLoad)
          autosaveRef.current?.setActive(exerciseId, codeToLoad)
          if (recovered) autosaveRef.current?.update(codeToLoad)
          setDraftDirty(Boolean(recovered))
        }
        return codeToLoad
      } catch (err) {
        safeUpdate(setError, err instanceof Error ? err.message : '加载草稿失败')
        return null
      }
    },
    [flushPendingDraft, safeUpdate],
  )

  // ---- Public: clearCurrentDraft ----

  const clearCurrentDraft = useCallback(async () => {
    try {
      const cleared = await autosaveRef.current?.clearActive(clearDraft)
      if (!cleared) return
      clearDraftRecovery(cleared.exerciseId, cleared.code)
      safeUpdate(setDraftDirty, autosaveRef.current?.hasPending() ?? false)
      safeUpdate(setDraftError, null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '清除草稿失败'
      safeUpdate(setDraftError, message)
      safeUpdate(setError, message)
    }
  }, [safeUpdate])

  // ---- Public: submitCode ----

  const submitCode = useCallback(
    async (exerciseId: string, codeToSubmit: string, lang: string) => {
      safeUpdate(setSubmitting, true)
      const requestId = ++submitRequestId.current
      safeUpdate(setSubmitResult, null)
      safeUpdate(setError, null)
      try {
        const result = await svcSubmitCode(exerciseId, codeToSubmit, lang)
        if (submitRequestId.current !== requestId || activeExerciseId.current !== exerciseId) return
        safeUpdate(setSubmitResult, result)
      } catch (err) {
        if (submitRequestId.current !== requestId || activeExerciseId.current !== exerciseId) return
        safeUpdate(setError, err instanceof Error ? err.message : '提交代码失败')
        if (submitRequestId.current !== requestId || activeExerciseId.current !== exerciseId) return
        reportError(err, 'practice.submitCode', { showToast: true })
      } finally {
        if (submitRequestId.current === requestId) safeUpdate(setSubmitting, false)
      }
    },
    [safeUpdate],
  )

  // ---- Public: clearSubmitResult ----

  const clearSubmitResult = useCallback(() => {
    submitRequestId.current += 1
    setSubmitting(false)
    setSubmitResult(null)
  }, [])

  // ---- Public: getReviewDue ----

  const getReviewDue = useCallback(async () => {
    try {
      const items = await svcGetReviewDue()
      safeUpdate(setReviewDue, items)
    } catch {
      // Non-critical; review data is supplementary
    }
  }, [safeUpdate])

  // ---- Public: clearError ----

  const clearError = useCallback(() => setError(null), [])

  // ---- Auto-load on mount ----

  useEffect(() => {
    loadExercises()
    getReviewDue()
  }, [loadExercises, getReviewDue])

  return {
    // Exercise list
    exercises,
    loading,
    error,
    loadExercises,

    // Current exercise
    currentExercise,
    loadingExercise,
    selectExercise,

    // Code draft (auto-saved)
    code,
    setCode: handleSetCode,
    language,
    setLanguage,
    draftSaving,
    draftDirty,
    draftError,
    saveDraft,
    flushDraft: performAutoSave,
    loadDraft,
    clearCurrentDraft,

    // Submission
    submitResult,
    submitting,
    submitCode,
    clearSubmitResult,

    // Review
    reviewDue,
    getReviewDue,

    // Utility
    clearError,
  }
}
