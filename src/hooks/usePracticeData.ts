import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearDraft,
  getDraft,
  getExercise,
  getExercises,
  getReviewDue as svcGetReviewDue,
  saveDraft as svcSaveDraft,
  submitCode as svcSubmitCode,
  type Exercise,
  type PracticeDraft,
  type ReviewItem,
  type SubmitResult,
} from '../services/practiceService'
import { reportError } from '@/utils/errorHandler'
import {
  DraftAutosaveCoordinator,
  DraftConflictError,
  type DraftSnapshot,
} from '@/utils/draftAutosave'
import {
  clearDraftRecovery,
  readDraftRecoveryWithStatus,
  writeDraftRecovery,
} from '@/utils/draftRecovery'
import { resolvePracticeDraft } from '@/utils/practiceDraftResolution'
import { bindDraftFlushLifecycle } from '@/utils/draftLifecycle'
import { registerAppCloseFlushHandler } from '@/services/appCloseLifecycle'

interface DraftConflictState {
  current: PracticeDraft | null
}

export type DraftDurability = 'database' | 'recovery' | 'none'

export interface DraftFlushResult {
  durability: DraftDurability
  error: string | null
}

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
  draftConflict: boolean
  flushDraft: () => Promise<DraftFlushResult>
  deactivateExercise: () => Promise<DraftFlushResult>
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
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null)
  const [loadingExercise, setLoadingExercise] = useState(false)
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('python')
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftConflict, setDraftConflict] = useState<DraftConflictState | null>(null)
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reviewDue, setReviewDue] = useState<ReviewItem[]>([])

  const mountedRef = useRef(true)
  const activeExerciseId = useRef<string | null>(null)
  const codeRef = useRef('')
  const languageRef = useRef('python')
  const exerciseRequestId = useRef(0)
  const listRequestId = useRef(0)
  const submitRequestId = useRef(0)
  const autosaveRef = useRef<DraftAutosaveCoordinator | null>(null)

  if (!autosaveRef.current) {
    autosaveRef.current = new DraftAutosaveCoordinator(
      async (exerciseId, snapshot, baseRevision) => {
        const result = await svcSaveDraft(
          exerciseId,
          snapshot.code,
          snapshot.language,
          baseRevision,
        )
        if (result.status === 'conflict') {
          if (mountedRef.current) setDraftConflict({ current: result.current })
          throw new DraftConflictError()
        }
        return { revision: result.draft.revision, updatedAt: result.draft.updatedAt }
      },
      {
        onSavingChange: (saving) => {
          if (!mountedRef.current) return
          setDraftSaving(saving)
          if (!saving) setDraftDirty(autosaveRef.current?.hasPending() ?? false)
        },
        onError: (autosaveError) => {
          if (!mountedRef.current) return
          setDraftError(
            autosaveError instanceof DraftConflictError
              ? autosaveError.message
              : autosaveError instanceof Error
                ? `自动保存草稿失败：${autosaveError.message}`
                : '自动保存草稿失败，将在下次编辑时重试',
          )
          setDraftDirty(true)
        },
        onSaved: (event) => {
          if (event.pending && event.pendingLocalVersion) {
            writeDraftRecovery(
              event.exerciseId,
              event.pending,
              event.revision,
              event.pendingLocalVersion,
            )
          } else {
            clearDraftRecovery(event.exerciseId, { snapshot: event.saved })
          }
          if (mountedRef.current) {
            setDraftError(null)
            setDraftConflict(null)
          }
        },
      },
    )
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      exerciseRequestId.current += 1
      listRequestId.current += 1
      submitRequestId.current += 1
      void autosaveRef.current?.dispose().catch(() => undefined)
    }
  }, [])

  const safeUpdate = useCallback(<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (mountedRef.current) setter(value)
  }, [])

  const flushPendingDraft = useCallback(async (): Promise<DraftFlushResult> => {
    const coordinator = autosaveRef.current
    const state = coordinator?.getState()
    if (!coordinator || !state || !coordinator.hasPending()) {
      return { durability: 'database', error: null }
    }

    const recoveryError = writeDraftRecovery(
      state.exerciseId,
      state.snapshot,
      state.baseRevision,
      state.localVersion,
    )
    try {
      await coordinator.flush()
      if (!coordinator.hasPending()) return { durability: 'database', error: null }
      return recoveryError
        ? { durability: 'none', error: recoveryError }
        : { durability: 'recovery', error: null }
    } catch (flushError) {
      const message = flushError instanceof Error ? flushError.message : '练习草稿数据库保存失败'
      return recoveryError
        ? { durability: 'none', error: `${message}；${recoveryError}` }
        : { durability: 'recovery', error: message }
    }
  }, [])

  useEffect(
    () =>
      bindDraftFlushLifecycle(async () => {
        await flushPendingDraft()
      }),
    [flushPendingDraft],
  )

  useEffect(
    () =>
      registerAppCloseFlushHandler('practice-draft', async () => {
        const result = await flushPendingDraft()
        return result.durability !== 'none'
          ? { ok: true }
          : { ok: false, error: result.error ?? '练习草稿仍未完成持久化' }
      }),
    [flushPendingDraft],
  )

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

  const selectExercise = useCallback(
    async (id: string) => {
      if (activeExerciseId.current === id) {
        const result = await flushPendingDraft()
        return result.durability !== 'none'
      }

      const requestId = ++exerciseRequestId.current
      if ((await flushPendingDraft()).durability === 'none') return false
      if (exerciseRequestId.current !== requestId) return false

      submitRequestId.current += 1
      safeUpdate(setSubmitting, false)
      safeUpdate(setLoadingExercise, true)
      safeUpdate(setError, null)
      safeUpdate(setSubmitResult, null)

      try {
        const [exercise, draft] = await Promise.all([getExercise(id), getDraft(id)])
        if (exerciseRequestId.current !== requestId) return false
        if ((await flushPendingDraft()).durability === 'none') return false
        if (exerciseRequestId.current !== requestId) return false
        const preferredLanguage = exercise.languages?.[0] || 'python'
        const recoveryResult = readDraftRecoveryWithStatus(id)
        const recovery = recoveryResult.entry
        const resolved = resolvePracticeDraft(
          draft,
          recovery,
          exercise.starter_code ?? '',
          preferredLanguage,
        )

        if (resolved.discardRecovery) clearDraftRecovery(id)
        autosaveRef.current?.setActive(id, resolved.snapshot, resolved.baseRevision, {
          dirty: resolved.dirty,
          localVersion: resolved.localVersion,
          autosave: resolved.autosave,
          conflict: resolved.conflict,
        })
        const recoveryWriteError =
          resolved.dirty && !resolved.conflict
            ? writeDraftRecovery(
                id,
                resolved.snapshot,
                resolved.baseRevision,
                resolved.localVersion,
              )
            : null

        activeExerciseId.current = id
        codeRef.current = resolved.snapshot.code
        languageRef.current = resolved.snapshot.language
        safeUpdate(setCode, resolved.snapshot.code)
        safeUpdate(setLanguage, resolved.snapshot.language)
        safeUpdate(setDraftDirty, resolved.dirty)
        safeUpdate(
          setDraftError,
          resolved.conflict
            ? '检测到本地草稿与已保存版本冲突，请选择处理方式'
            : (recoveryResult.error ?? recoveryWriteError),
        )
        safeUpdate(setDraftConflict, resolved.conflict ? { current: draft } : null)
        safeUpdate(setCurrentExercise, exercise)
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

  const persistRecoverySnapshot = useCallback(
    (snapshot: DraftSnapshot) => {
      const exerciseId = activeExerciseId.current
      const state = autosaveRef.current?.getState()
      if (!exerciseId || !state || state.exerciseId !== exerciseId) return
      safeUpdate(
        setDraftError,
        writeDraftRecovery(exerciseId, snapshot, state.baseRevision, state.localVersion),
      )
    },
    [safeUpdate],
  )

  const handleSetCode = useCallback(
    (newCode: string) => {
      codeRef.current = newCode
      safeUpdate(setCode, newCode)
      const snapshot = { code: newCode, language: languageRef.current }
      autosaveRef.current?.update(snapshot)
      safeUpdate(setDraftDirty, true)
      persistRecoverySnapshot(snapshot)
    },
    [persistRecoverySnapshot, safeUpdate],
  )

  const handleSetLanguage = useCallback(
    (newLanguage: string) => {
      const normalized = newLanguage.trim()
      if (!normalized) return
      languageRef.current = normalized
      safeUpdate(setLanguage, normalized)
      const snapshot = { code: codeRef.current, language: normalized }
      autosaveRef.current?.update(snapshot)
      safeUpdate(setDraftDirty, true)
      persistRecoverySnapshot(snapshot)
    },
    [persistRecoverySnapshot, safeUpdate],
  )

  const clearCurrentDraft = useCallback(async () => {
    try {
      const cleared = await autosaveRef.current?.clearActive(async (exerciseId, baseRevision) => {
        const result = await clearDraft(exerciseId, baseRevision)
        if (result.status === 'conflict') {
          safeUpdate(setDraftConflict, { current: result.current })
          throw new DraftConflictError()
        }
        return { revision: result.draft.revision, updatedAt: result.draft.updatedAt }
      })
      if (!cleared) return
      const coordinator = autosaveRef.current
      const state = coordinator?.getState()
      const hasPending = coordinator?.hasPending() ?? false
      if (hasPending && state?.exerciseId === cleared.exerciseId) {
        writeDraftRecovery(state.exerciseId, state.snapshot, state.baseRevision, state.localVersion)
      } else {
        clearDraftRecovery(cleared.exerciseId)
      }
      safeUpdate(setDraftDirty, hasPending)
      safeUpdate(setDraftError, null)
      safeUpdate(setDraftConflict, null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '清除草稿失败'
      safeUpdate(setDraftError, message)
      safeUpdate(setError, message)
    }
  }, [safeUpdate])

  const keepLocalDraft = useCallback(() => {
    const state = autosaveRef.current?.getState()
    if (!state || !draftConflict) return
    const nextBaseRevision = draftConflict.current?.revision ?? 0
    autosaveRef.current?.resolveConflict(nextBaseRevision)
    writeDraftRecovery(state.exerciseId, state.snapshot, nextBaseRevision, state.localVersion)
    setDraftConflict(null)
    setDraftError(null)
    setDraftDirty(true)
  }, [draftConflict])

  const reloadPersistedDraft = useCallback(() => {
    const exerciseId = activeExerciseId.current
    if (!exerciseId || !currentExercise || !draftConflict) return
    const persisted = draftConflict.current
    const snapshot: DraftSnapshot =
      persisted && !persisted.deleted
        ? {
            code: persisted.code,
            language: persisted.language || currentExercise.languages?.[0] || 'python',
          }
        : {
            code: currentExercise.starter_code ?? '',
            language: currentExercise.languages?.[0] || 'python',
          }
    const baseRevision = persisted?.revision ?? 0
    autosaveRef.current?.setActive(exerciseId, snapshot, baseRevision)
    clearDraftRecovery(exerciseId)
    codeRef.current = snapshot.code
    languageRef.current = snapshot.language
    setCode(snapshot.code)
    setLanguage(snapshot.language)
    setDraftDirty(false)
    setDraftError(null)
    setDraftConflict(null)
  }, [currentExercise, draftConflict])

  const deactivateExercise = useCallback(async (): Promise<DraftFlushResult> => {
    exerciseRequestId.current += 1
    submitRequestId.current += 1
    const result = await flushPendingDraft()
    if (result.durability === 'none') {
      safeUpdate(setDraftError, result.error ?? '练习草稿未能写入数据库或恢复区')
      return result
    }
    autosaveRef.current?.deactivate()
    activeExerciseId.current = null
    codeRef.current = ''
    languageRef.current = 'python'
    safeUpdate(setCurrentExercise, null)
    safeUpdate(setCode, '')
    safeUpdate(setLanguage, 'python')
    safeUpdate(setDraftDirty, false)
    safeUpdate(setDraftConflict, null)
    safeUpdate(setSubmitResult, null)
    safeUpdate(setSubmitting, false)
    if (result.durability === 'database') safeUpdate(setDraftError, null)
    return result
  }, [flushPendingDraft, safeUpdate])

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
        reportError(err, 'practice.submitCode', { showToast: true })
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

  const clearError = useCallback(() => setError(null), [])

  useEffect(() => {
    void loadExercises()
    void getReviewDue()
  }, [loadExercises, getReviewDue])

  return {
    exercises,
    loading,
    error,
    loadExercises,
    currentExercise,
    loadingExercise,
    selectExercise,
    code,
    setCode: handleSetCode,
    language,
    setLanguage: handleSetLanguage,
    draftSaving,
    draftDirty,
    draftError,
    draftConflict: Boolean(draftConflict),
    flushDraft: flushPendingDraft,
    deactivateExercise,
    clearCurrentDraft,
    keepLocalDraft,
    reloadPersistedDraft,
    submitResult,
    submitting,
    submitCode,
    clearSubmitResult,
    reviewDue,
    getReviewDue,
    clearError,
  }
}
