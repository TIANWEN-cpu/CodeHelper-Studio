import { useState, useCallback } from 'react'
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
} from '@/services/workspaceService'

export interface UseWorkspaceDataReturn {
  // Code editor state
  code: string
  setCode: (code: string) => void
  language: string
  setLanguage: (lang: string) => void

  // Run results
  runResult: RunResult | null
  isRunning: boolean
  runCode: (code?: string, language?: string) => Promise<RunResult | null>

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

  const clearError = useCallback(() => setError(null), [])

  const runCode = useCallback(
    async (overrideCode?: string, overrideLanguage?: string): Promise<RunResult | null> => {
      const c = overrideCode ?? code
      const lang = overrideLanguage ?? language

      setIsRunning(true)
      setError(null)

      try {
        const result = await runCodeService(c, lang)
        setRunResult(result)
        return result
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        return null
      } finally {
        setIsRunning(false)
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
      const c = overrideCode ?? code
      const lang = overrideLanguage ?? language

      setIsSubmitting(true)
      setError(null)

      try {
        const result = await submitToProblemService(problemId, c, lang)
        setSubmitResult(result)
        return result
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        return null
      } finally {
        setIsSubmitting(false)
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
  }
}
