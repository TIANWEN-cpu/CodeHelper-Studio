import { useState, useCallback } from 'react'
import {
  Mistake,
  MistakeDetail,
  ReviewItem,
  getMistakes,
  getMistake,
  updateAnalysis as updateAnalysisService,
  deleteMistake as deleteMistakeService,
  getDueReviews,
  updateReview as updateReviewService,
  getReviewStats,
} from '../services/reviewService'

// ---- Types ----

export interface ReviewStats {
  totalDue: number
  completedToday: number
  mastered: number
}

export interface MistakeFilters {
  difficulty?: string
  tag?: string
  errorType?: string
}

export interface UseReviewDataReturn {
  // Mistake list
  mistakes: Mistake[]
  filteredMistakes: Mistake[]
  filters: MistakeFilters
  setFilters: (filters: MistakeFilters) => void
  isLoadingMistakes: boolean
  loadMistakes: () => Promise<void>

  // Current mistake detail
  currentMistake: MistakeDetail | null
  isLoadingDetail: boolean
  selectMistake: (id: string) => Promise<void>
  clearMistake: () => void

  // Mutation
  updateAnalysis: (id: string, text: string) => Promise<void>
  deleteMistake: (id: string) => Promise<void>

  // Review schedule
  dueReviews: ReviewItem[]
  isLoadingReviews: boolean
  loadDueReviews: () => Promise<void>
  updateReview: (exerciseId: string, quality: number) => Promise<void>

  // Stats
  stats: ReviewStats | null
  isLoadingStats: boolean
  getStats: () => Promise<void>

  // Shared
  error: string | null
  clearError: () => void
}

// ---- Helpers ----

function applyFilters(mistakes: Mistake[], filters: MistakeFilters): Mistake[] {
  return mistakes.filter((m) => {
    if (filters.difficulty && m.difficulty !== filters.difficulty) return false
    if (filters.tag && !m.tags.includes(filters.tag)) return false
    if (filters.errorType && !m.error_types.includes(filters.errorType)) return false
    return true
  })
}

// ---- Hook ----

export function useReviewData(): UseReviewDataReturn {
  // Mistake list state
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [filters, setFilters] = useState<MistakeFilters>({})
  const [isLoadingMistakes, setIsLoadingMistakes] = useState(false)

  // Current detail state
  const [currentMistake, setCurrentMistake] = useState<MistakeDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  // Review state
  const [dueReviews, setDueReviews] = useState<ReviewItem[]>([])
  const [isLoadingReviews, setIsLoadingReviews] = useState(false)

  // Stats state
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  // Shared error
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  // ---- Mistake list ----

  const loadMistakes = useCallback(async () => {
    setIsLoadingMistakes(true)
    setError(null)
    try {
      const list = await getMistakes()
      setMistakes(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载错题列表失败')
    } finally {
      setIsLoadingMistakes(false)
    }
  }, [])

  // ---- Select / clear detail ----

  const selectMistake = useCallback(async (id: string) => {
    setIsLoadingDetail(true)
    setError(null)
    try {
      const detail = await getMistake(id)
      setCurrentMistake(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载错题详情失败')
    } finally {
      setIsLoadingDetail(false)
    }
  }, [])

  const clearMistake = useCallback(() => {
    setCurrentMistake(null)
  }, [])

  // ---- Mutations ----

  const handleUpdateAnalysis = useCallback(async (id: string, text: string) => {
    setError(null)
    try {
      await updateAnalysisService(id, text)
      // Refresh the detail if viewing the same mistake
      setCurrentMistake((prev) => (prev && prev.id === id ? { ...prev, ai_analysis: text } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新分析失败')
    }
  }, [])

  const handleDeleteMistake = useCallback(async (id: string) => {
    setError(null)
    try {
      await deleteMistakeService(id)
      // Remove from local list and clear detail if it was selected
      setMistakes((prev) => prev.filter((m) => m.id !== id))
      setCurrentMistake((prev) => (prev?.id === id ? null : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除错题失败')
    }
  }, [])

  // ---- Review schedule ----

  const handleLoadDueReviews = useCallback(async () => {
    setIsLoadingReviews(true)
    setError(null)
    try {
      const items = await getDueReviews()
      setDueReviews(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载复习计划失败')
    } finally {
      setIsLoadingReviews(false)
    }
  }, [])

  const handleUpdateReview = useCallback(async (exerciseId: string, quality: number) => {
    setError(null)
    try {
      await updateReviewService(exerciseId, quality)
      // Remove the completed item from due list
      setDueReviews((prev) => prev.filter((r) => r.exercise_id !== exerciseId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交复习结果失败')
    }
  }, [])

  // ---- Stats ----

  const handleGetStats = useCallback(async () => {
    setIsLoadingStats(true)
    setError(null)
    try {
      const result = await getReviewStats()
      setStats(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载统计信息失败')
    } finally {
      setIsLoadingStats(false)
    }
  }, [])

  // ---- Derived ----

  const filteredMistakes = applyFilters(mistakes, filters)

  return {
    mistakes,
    filteredMistakes,
    filters,
    setFilters,
    isLoadingMistakes,
    loadMistakes,
    currentMistake,
    isLoadingDetail,
    selectMistake,
    clearMistake,
    updateAnalysis: handleUpdateAnalysis,
    deleteMistake: handleDeleteMistake,
    dueReviews,
    isLoadingReviews,
    loadDueReviews: handleLoadDueReviews,
    updateReview: handleUpdateReview,
    stats,
    isLoadingStats,
    getStats: handleGetStats,
    error,
    clearError,
  }
}
