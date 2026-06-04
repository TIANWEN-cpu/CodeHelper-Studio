import { invoke } from './ipc'
import { track } from './analyticsService'

export interface Track {
  id: string
  title: string
  icon: string
  summary: string
  modules: Module[]
}

export interface Module {
  id: string
  title: string
  summary: string
  lessons: Lesson[]
}

export interface Lesson {
  id: string
  title: string
  summary: string
  path: string
  difficulty?: string
  estimated_minutes?: number
  tags?: string[]
}

export interface LessonProgress {
  lesson_id: string
  status: string
  completed: boolean
  last_opened?: string
}

export async function getTracks(): Promise<Track[]> {
  return invoke<Track[]>('lessons-list')
}

export async function getLessonContent(
  lessonId: string,
): Promise<{ markdown: string; title: string }> {
  return invoke<{ markdown: string; title: string }>('lessons-get', lessonId)
}

export async function getLessonProgress(trackId: string): Promise<LessonProgress[]> {
  return invoke<LessonProgress[]>('lessons-progress', trackId)
}

export async function markLessonOpened(lessonId: string, trackId: string): Promise<void> {
  return invoke<void>('lessons-mark-opened', lessonId, trackId)
}

export async function markLessonCompleted(lessonId: string, trackId: string): Promise<void> {
  await invoke<void>('lessons-mark-completed', lessonId, trackId)
  track('lesson_completed', { lessonId, trackId })
}

export async function getLessonNote(lessonId: string): Promise<string> {
  return invoke<string>('lessons-notes-get', lessonId)
}

export async function saveLessonNote(lessonId: string, content: string): Promise<void> {
  return invoke<void>('lessons-notes-save', lessonId, content)
}

export async function searchLessons(query: string): Promise<string[]> {
  return invoke<string[]>('lessons-search', query)
}
