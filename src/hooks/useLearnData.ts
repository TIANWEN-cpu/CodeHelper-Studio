import { useState, useCallback } from 'react'
import {
  Track,
  LessonProgress,
  getTracks,
  getLessonContent,
  getLessonProgress,
  markLessonOpened,
  markLessonCompleted,
  getLessonNote,
  saveLessonNote,
  searchLessons,
} from '../services/learnService'

// ---- Types ----

export interface CurrentLesson {
  lessonId: string
  markdown: string
  title: string
  progress: LessonProgress | null
  note: string
}

export interface UseLearnDataReturn {
  // Course tree
  tracks: Track[]
  loading: boolean
  error: string | null
  loadTracks: () => Promise<void>

  // Current lesson
  currentLesson: CurrentLesson | null
  loadingLesson: boolean
  selectLesson: (lessonId: string, trackId?: string) => Promise<void>

  // Progress
  markingOpened: boolean
  markOpened: (lessonId: string, trackId: string) => Promise<void>
  markingCompleted: boolean
  markCompleted: (lessonId: string, trackId: string) => Promise<void>

  // Notes
  savingNote: boolean
  saveNote: (lessonId: string, content: string) => Promise<void>

  // Search
  searchResults: string[]
  searching: boolean
  search: (query: string) => Promise<void>
}

// ---- Hook ----

export function useLearnData(): UseLearnDataReturn {
  // Course tree state
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Current lesson state
  const [currentLesson, setCurrentLesson] = useState<CurrentLesson | null>(null)
  const [loadingLesson, setLoadingLesson] = useState(false)

  // Progress state
  const [markingOpened, setMarkingOpened] = useState(false)
  const [markingCompleted, setMarkingCompleted] = useState(false)

  // Notes state
  const [savingNote, setSavingNote] = useState(false)

  // Search state
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [searching, setSearching] = useState(false)

  // ---- Actions ----

  const loadTracks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getTracks()
      setTracks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载课程列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const selectLesson = useCallback(async (lessonId: string, trackId?: string) => {
    setLoadingLesson(true)
    setError(null)
    try {
      const [content, note] = await Promise.all([
        getLessonContent(lessonId),
        getLessonNote(lessonId),
      ])

      let progress: LessonProgress | null = null
      if (trackId) {
        const progressList = await getLessonProgress(trackId)
        progress = progressList.find((p) => p.lesson_id === lessonId) ?? null
      }

      setCurrentLesson({
        lessonId,
        markdown: content.markdown,
        title: content.title,
        progress,
        note,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载课程内容失败')
    } finally {
      setLoadingLesson(false)
    }
  }, [])

  const markOpened = useCallback(async (lessonId: string, trackId: string) => {
    setMarkingOpened(true)
    setError(null)
    try {
      await markLessonOpened(lessonId, trackId)
      setCurrentLesson((prev) => {
        if (!prev || prev.lessonId !== lessonId) return prev
        return {
          ...prev,
          progress: {
            ...(prev.progress ?? { lesson_id: lessonId, status: 'opened', completed: false }),
            last_opened: new Date().toISOString(),
          },
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记已读失败')
    } finally {
      setMarkingOpened(false)
    }
  }, [])

  const markCompleted = useCallback(async (lessonId: string, trackId: string) => {
    setMarkingCompleted(true)
    setError(null)
    try {
      await markLessonCompleted(lessonId, trackId)
      setCurrentLesson((prev) => {
        if (!prev || prev.lessonId !== lessonId) return prev
        return {
          ...prev,
          progress: {
            ...(prev.progress ?? { lesson_id: lessonId, status: 'opened', completed: false }),
            completed: true,
            status: 'completed',
          },
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记完成失败')
    } finally {
      setMarkingCompleted(false)
    }
  }, [])

  const saveNote = useCallback(async (lessonId: string, content: string) => {
    setSavingNote(true)
    setError(null)
    try {
      await saveLessonNote(lessonId, content)
      setCurrentLesson((prev) => {
        if (!prev || prev.lessonId !== lessonId) return prev
        return { ...prev, note: content }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存笔记失败')
    } finally {
      setSavingNote(false)
    }
  }, [])

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    setError(null)
    try {
      const results = await searchLessons(query)
      setSearchResults(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败')
    } finally {
      setSearching(false)
    }
  }, [])

  return {
    tracks,
    loading,
    error,
    loadTracks,
    currentLesson,
    loadingLesson,
    selectLesson,
    markingOpened,
    markOpened,
    markingCompleted,
    markCompleted,
    savingNote,
    saveNote,
    searchResults,
    searching,
    search,
  }
}
