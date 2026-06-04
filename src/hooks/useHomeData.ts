import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  WeeklyStatItem,
  DailyTask,
  ActivityItem,
  ReviewItem,
  HeatmapItem,
  HomeOverview,
} from '../services/homeService'
import * as homeService from '../services/homeService'

// ---- Types ----

interface HomeData {
  weeklyStats: WeeklyStatItem[]
  streak: number
  dailyTasks: DailyTask[]
  recentActivity: ActivityItem[]
  reviewReminders: ReviewItem[]
  heatmapData: HeatmapItem[]
  overview: HomeOverview | null
}

interface UseHomeDataResult extends HomeData {
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// ---- Initial State ----

const INITIAL_DATA: HomeData = {
  weeklyStats: [],
  streak: 0,
  dailyTasks: [],
  recentActivity: [],
  reviewReminders: [],
  heatmapData: [],
  overview: null,
}

// ---- Hook ----

export function useHomeData(): UseHomeDataResult {
  const [data, setData] = useState<HomeData>(INITIAL_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [
        weeklyStats,
        streak,
        dailyTasks,
        recentActivity,
        reviewReminders,
        heatmapData,
        overview,
      ] = await Promise.all([
        homeService.getWeeklyStats(),
        homeService.getStreakData(),
        homeService.getDailyTasks(),
        homeService.getRecentActivity(),
        homeService.getReviewReminders(),
        homeService.getHeatmapData(),
        homeService.getOverview(),
      ])

      if (mountedRef.current) {
        setData({
          weeklyStats,
          streak,
          dailyTasks,
          recentActivity,
          reviewReminders,
          heatmapData,
          overview,
        })
      }
    } catch (e) {
      if (mountedRef.current) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message || 'Failed to load dashboard data')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    return () => {
      mountedRef.current = false
    }
  }, [fetchData])

  return { ...data, loading, error, refresh: fetchData }
}
