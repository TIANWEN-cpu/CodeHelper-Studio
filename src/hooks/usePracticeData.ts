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
  selectExercise: (id: string) => Promise<void>

  // Code draft (auto-saved)
  code: string
  setCode: (code: string) => void
  language: string
  setLanguage: (lang: string) => void
  draftSaving: boolean
  saveDraft: (exerciseId: string, code: string) => Promise<void>
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

// ---- Constants ----

const AUTO_SAVE_DELAY_MS = 2000

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

  // ---- Submission state ----
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ---- Review state ----
  const [reviewDue, setReviewDue] = useState<ReviewItem[]>([])

  // ---- Refs ----
  const mountedRef = useRef(true)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeExerciseId = useRef<string | null>(null)
  const latestCode = useRef('')

  // ---- Cleanup on unmount ----
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [])

  // ---- Internal helpers ----

  const safeUpdate = useCallback(<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (mountedRef.current) setter(value)
  }, [])

  const performAutoSave = useCallback(async () => {
    const exerciseId = activeExerciseId.current
    if (!exerciseId) return
    safeUpdate(setDraftSaving, true)
    try {
      await svcSaveDraft(exerciseId, latestCode.current)
    } catch {
      // Auto-save failure is non-critical; silently ignore
    } finally {
      safeUpdate(setDraftSaving, false)
    }
  }, [safeUpdate])

  // ---- Public: loadExercises ----

  const loadExercises = useCallback(
    async (trackId?: string, difficulty?: string) => {
      safeUpdate(setLoading, true)
      safeUpdate(setError, null)
      try {
        const data = await getExercises(trackId, difficulty)
        safeUpdate(setExercises, data)
      } catch (err) {
        safeUpdate(setError, err instanceof Error ? err.message : '加载练习列表失败')
      } finally {
        safeUpdate(setLoading, false)
      }
    },
    [safeUpdate],
  )

  // ---- Public: selectExercise ----

  const selectExercise = useCallback(
    async (id: string) => {
      // Flush any pending auto-save for the previous exercise
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = null
      }
      await performAutoSave()

      safeUpdate(setLoadingExercise, true)
      safeUpdate(setError, null)
      safeUpdate(setSubmitResult, null)

      try {
        const [exercise, draft] = await Promise.all([getExercise(id), getDraft(id)])
        activeExerciseId.current = id
        const initialCode = draft ?? exercise.starter_code ?? ''
        latestCode.current = initialCode
        safeUpdate(setCurrentExercise, exercise)
        safeUpdate(setCode, initialCode)
      } catch (err) {
        safeUpdate(setError, err instanceof Error ? err.message : '加载题目失败')
      } finally {
        safeUpdate(setLoadingExercise, false)
      }
    },
    [safeUpdate, performAutoSave],
  )

  // ---- Public: setCode (with auto-save debounce) ----

  const handleSetCode = useCallback(
    (newCode: string) => {
      safeUpdate(setCode, newCode)
      latestCode.current = newCode

      // Debounce auto-save
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
      if (activeExerciseId.current) {
        autoSaveTimer.current = setTimeout(() => {
          performAutoSave()
        }, AUTO_SAVE_DELAY_MS)
      }
    },
    [safeUpdate, performAutoSave],
  )

  // ---- Public: saveDraft ----

  const saveDraft = useCallback(
    async (exerciseId: string, codeToSave: string) => {
      safeUpdate(setDraftSaving, true)
      try {
        await svcSaveDraft(exerciseId, codeToSave)
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
      try {
        const draft = await getDraft(exerciseId)
        if (mountedRef.current && draft !== null) {
          setCode(draft)
          latestCode.current = draft
        }
        return draft
      } catch (err) {
        safeUpdate(setError, err instanceof Error ? err.message : '加载草稿失败')
        return null
      }
    },
    [safeUpdate],
  )

  // ---- Public: clearCurrentDraft ----

  const clearCurrentDraft = useCallback(async () => {
    const exerciseId = activeExerciseId.current
    if (!exerciseId) return
    try {
      await clearDraft(exerciseId)
    } catch {
      // Non-critical
    }
  }, [])

  // ---- Public: submitCode ----

  const submitCode = useCallback(
    async (exerciseId: string, codeToSubmit: string, lang: string) => {
      safeUpdate(setSubmitting, true)
      safeUpdate(setSubmitResult, null)
      safeUpdate(setError, null)
      try {
        const result = await svcSubmitCode(exerciseId, codeToSubmit, lang)
        safeUpdate(setSubmitResult, result)
      } catch (err) {
        safeUpdate(setError, err instanceof Error ? err.message : '提交代码失败')
      } finally {
        safeUpdate(setSubmitting, false)
      }
    },
    [safeUpdate],
  )

  // ---- Public: clearSubmitResult ----

  const clearSubmitResult = useCallback(() => {
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
    saveDraft,
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
