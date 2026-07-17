import { useState, useCallback, useRef } from 'react'
import {
  runCode as runCodeService,
  submitToProblem as submitToProblemService,
  getProblem as getProblemService,
  getProblems as getProblemsService,
  getSubmissions as getSubmissionsService,
  type RunResult,
  type SubmitResult,
  type Problem,
  type ProblemFilters,
  type Submission,
  type ExecutionMode,
} from '@/services/workspaceService'
import { reportError } from '@/utils/errorHandler'

export interface UseWorkspaceDataReturn {
  // Code editor state
  code: string
  setCode: (code: string) => void
  language: string
  setLanguage: (lang: string) => void

  // Run results
  runResult: RunResult | null
  isRunning: boolean
  runCode: (
    code?: string,
    language?: string,
    executionMode?: ExecutionMode,
  ) => Promise<RunResult | null>

  // Submit results
  submitResult: SubmitResult | null
  isSubmitting: boolean
  submitToProblem: (
    problemId: string,
    code?: string,
    language?: string,
  ) => Promise<SubmitResult | null>

  // Problem details
  problem: Problem | null
  isLoadingProblem: boolean
  getProblem: (id: string) => Promise<Problem | null>

  // Problem list
  problems: Problem[]
  isLoadingProblems: boolean
  getProblems: (filters?: ProblemFilters) => Promise<Problem[]>

  // Submissions
  submissions: Submission[]
  isLoadingSubmissions: boolean
  getSubmissions: (problemId: string) => Promise<Submission[]>

  // Error state
  error: string | null
  clearError: () => void
  clearExecutionState: () => void
}

export function useWorkspaceData(
  initialCode = '',
  initialLanguage = 'python',
): UseWorkspaceDataReturn {
  // Code editor state
  const [code, setCode] = useState(initialCode)
  const [language, setLanguage] = useState(initialLanguage)

  // Run state
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Submit state
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Problem state
  const [problem, setProblem] = useState<Problem | null>(null)
  const [isLoadingProblem, setIsLoadingProblem] = useState(false)

  // Problem list state
  const [problems, setProblems] = useState<Problem[]>([])
  const [isLoadingProblems, setIsLoadingProblems] = useState(false)

  // Submissions state
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false)

  // Shared error state
  const [error, setError] = useState<string | null>(null)
  const runRequestId = useRef(0)
  const submitRequestId = useRef(0)

  const clearError = useCallback(() => setError(null), [])
  const clearExecutionState = useCallback(() => {
    runRequestId.current += 1
    submitRequestId.current += 1
    setRunResult(null)
    setSubmitResult(null)
    setIsRunning(false)
    setIsSubmitting(false)
    setError(null)
  }, [])

  const runCode = useCallback(
    async (
      overrideCode?: string,
      overrideLanguage?: string,
      executionMode: ExecutionMode = 'local-controlled',
    ): Promise<RunResult | null> => {
      const requestId = ++runRequestId.current
      const c = overrideCode ?? code
      const lang = overrideLanguage ?? language

      setIsRunning(true)
      setError(null)

      try {
        const result = await runCodeService(c, lang, executionMode)
        if (runRequestId.current !== requestId) return null
        setRunResult(result)
        return result
      } catch (err: unknown) {
        if (runRequestId.current !== requestId) return null
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        reportError(err, 'workspace.runCode', { showToast: true })
        return null
      } finally {
        if (runRequestId.current === requestId) setIsRunning(false)
      }
    },
    [code, language],
  )

  const submitToProblem = useCallback(
    async (
      problemId: string,
      overrideCode?: string,
      overrideLanguage?: string,
    ): Promise<SubmitResult | null> => {
      const requestId = ++submitRequestId.current
      const c = overrideCode ?? code
      const lang = overrideLanguage ?? language

      setIsSubmitting(true)
      setError(null)

      try {
        const result = await submitToProblemService(problemId, c, lang)
        if (submitRequestId.current !== requestId) return null
        setSubmitResult(result)
        return result
      } catch (err: unknown) {
        if (submitRequestId.current !== requestId) return null
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        reportError(err, 'workspace.submitToProblem', { showToast: true })
        return null
      } finally {
        if (submitRequestId.current === requestId) setIsSubmitting(false)
      }
    },
    [code, language],
  )

  const getProblem = useCallback(async (id: string): Promise<Problem | null> => {
    setIsLoadingProblem(true)
    setError(null)

    try {
      const result = await getProblemService(id)
      setProblem(result)
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    } finally {
      setIsLoadingProblem(false)
    }
  }, [])

  const getProblems = useCallback(async (filters?: ProblemFilters): Promise<Problem[]> => {
    setIsLoadingProblems(true)
    setError(null)

    try {
      const result = await getProblemsService(filters)
      setProblems(result)
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return []
    } finally {
      setIsLoadingProblems(false)
    }
  }, [])

  const getSubmissions = useCallback(async (problemId: string): Promise<Submission[]> => {
    setIsLoadingSubmissions(true)
    setError(null)

    try {
      const result = await getSubmissionsService(problemId)
      setSubmissions(result)
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return []
    } finally {
      setIsLoadingSubmissions(false)
    }
  }, [])

  return {
    code,
    setCode,
    language,
    setLanguage,
    runResult,
    isRunning,
    runCode,
    submitResult,
    isSubmitting,
    submitToProblem,
    problem,
    isLoadingProblem,
    getProblem,
    problems,
    isLoadingProblems,
    getProblems,
    submissions,
    isLoadingSubmissions,
    getSubmissions,
    error,
    clearError,
    clearExecutionState,
  }
}
