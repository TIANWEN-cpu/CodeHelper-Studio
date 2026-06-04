import { ipcMain } from 'electron'
import { getDB } from '../db/index'
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { trackPerformance } from '../utils/perfMonitor'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseMapLesson {
  id: string
  title: string
  summary: string
  path: string
  difficulty: string
  estimated_minutes: number
  tags: string[]
  prerequisites: string[]
  outcomes: string[]
}

interface CourseMapModule {
  id: string
  title: string
  summary: string
  lessons: CourseMapLesson[]
}

interface CourseMapTrack {
  id: string
  title: string
  icon: string
  summary: string
  modules: CourseMapModule[]
}

interface CourseMap {
  tracks: CourseMapTrack[]
}

interface LessonProgressRow {
  lesson_id: string
  track_id: string
  module_id: string | null
  status: 'not_started' | 'in_progress' | 'completed'
  completed: number
  last_opened: string | null
  completed_at: string | null
}

interface LessonNoteRow {
  lesson_id: string
  content: string
  tags: string
  code_snippets: string
  updated_at: string | null
}

interface SearchResult {
  trackId: string
  trackTitle: string
  moduleId: string
  moduleTitle: string
  lesson: CourseMapLesson
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTENT_DIR = resolve(__dirname, '../../content')

// ---------------------------------------------------------------------------
// Course map cache
// ---------------------------------------------------------------------------

let cachedCourseMap: CourseMap | null = null

function loadCourseMap(): CourseMap {
  if (cachedCourseMap) return cachedCourseMap

  const mapPath = join(CONTENT_DIR, 'metadata', 'course_map.json')
  if (!existsSync(mapPath)) {
    throw new Error(`课程索引文件不存在: ${mapPath}`)
  }

  try {
    const raw = readFileSync(mapPath, 'utf-8')
    cachedCourseMap = JSON.parse(raw) as CourseMap
    return cachedCourseMap
  } catch (err) {
    throw new Error(`课程索引解析失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a lesson by its id across all tracks and modules.
 * Returns the lesson together with its parent track/module ids.
 */
function findLesson(
  courseMap: CourseMap,
  lessonId: string,
): { track: CourseMapTrack; module: CourseMapModule; lesson: CourseMapLesson } | null {
  for (const track of courseMap.tracks) {
    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        if (lesson.id === lessonId) {
          return { track, module: mod, lesson }
        }
      }
    }
  }
  return null
}

/**
 * Read and return the markdown content for a lesson.
 * The `path` field in course_map.json is relative to the content/ directory.
 */
function readLessonMarkdown(lessonPath: string): string {
  const fullPath = join(CONTENT_DIR, lessonPath)
  if (!existsSync(fullPath)) {
    throw new Error(`课程文件不存在: ${fullPath}`)
  }
  return readFileSync(fullPath, 'utf-8')
}

// Ensure lesson_progress rows exist for every lesson in a track (idempotent).
function ensureProgressRows(
  db: ReturnType<typeof getDB>,
  trackId: string,
  modules: CourseMapModule[],
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO lesson_progress (lesson_id, track_id, module_id)
     VALUES (?, ?, ?)`,
  )
  const insertMany = db.transaction((rows: Array<[string, string, string | null]>) => {
    for (const row of rows) insert.run(...row)
  })

  const rows: Array<[string, string, string | null]> = []
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      rows.push([lesson.id, trackId, mod.id])
    }
  }
  insertMany(rows)
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerLessonsIPC(): void {
  // ---- lessons-list ----
  ipcMain.handle(
    'lessons-list',
    trackPerformance('lessons-list', () => {
      return loadCourseMap().tracks
    }),
  )

  // ---- lessons-get ----
  ipcMain.handle(
    'lessons-get',
    trackPerformance('lessons-get', (_e, lessonId: string) => {
      if (typeof lessonId !== 'string' || !lessonId.trim()) {
        throw new Error('参数无效: lessonId')
      }

      const courseMap = loadCourseMap()
      const found = findLesson(courseMap, lessonId.trim())
      if (!found) throw new Error(`课程不存在: ${lessonId}`)

      const content = readLessonMarkdown(found.lesson.path)

      // Attach progress if available
      let progress: LessonProgressRow | undefined
      try {
        progress = getDB()
          .prepare('SELECT * FROM lesson_progress WHERE lesson_id = ?')
          .get(lessonId.trim()) as LessonProgressRow | undefined
      } catch {
        // progress table may not exist yet – non-fatal
      }

      return {
        ...found.lesson,
        trackId: found.track.id,
        moduleId: found.module.id,
        content,
        progress: progress
          ? {
              status: progress.status,
              lastOpened: progress.last_opened,
              completedAt: progress.completed_at,
            }
          : null,
      }
    }),
  )

  // ---- lessons-progress ----
  ipcMain.handle(
    'lessons-progress',
    trackPerformance('lessons-progress', (_e, trackId: string) => {
      if (typeof trackId !== 'string' || !trackId.trim()) {
        throw new Error('参数无效: trackId')
      }

      const courseMap = loadCourseMap()
      const track = courseMap.tracks.find((t) => t.id === trackId.trim())
      if (!track) throw new Error(`学习路线不存在: ${trackId}`)

      const db = getDB()

      // Make sure every lesson has a progress row
      ensureProgressRows(db, track.id, track.modules)

      const rows = db
        .prepare('SELECT * FROM lesson_progress WHERE track_id = ?')
        .all(track.id) as LessonProgressRow[]

      // Return as an array matching the frontend LessonProgress interface
      return rows.map((row) => ({
        lesson_id: row.lesson_id,
        status: row.status,
        completed: row.completed === 1,
        last_opened: row.last_opened ?? undefined,
      }))
    }),
  )

  // ---- lessons-mark-opened ----
  ipcMain.handle(
    'lessons-mark-opened',
    trackPerformance('lessons-mark-opened', (_e, lessonId: string, trackId: string) => {
      if (typeof lessonId !== 'string' || !lessonId.trim()) throw new Error('参数无效: lessonId')
      if (typeof trackId !== 'string' || !trackId.trim()) throw new Error('参数无效: trackId')

      lessonId = lessonId.trim()
      trackId = trackId.trim()
      const now = new Date().toISOString()

      const db = getDB()
      db.prepare(
        `INSERT INTO lesson_progress (lesson_id, track_id, module_id, status, last_opened)
         VALUES (?, ?, ?, 'in_progress', ?)
         ON CONFLICT(lesson_id) DO UPDATE SET
           status = CASE WHEN lesson_progress.status = 'completed' THEN 'completed' ELSE 'in_progress' END,
           last_opened = excluded.last_opened`,
      ).run(lessonId, trackId, null, now)

      return { ok: true }
    }),
  )

  // ---- lessons-mark-completed ----
  ipcMain.handle(
    'lessons-mark-completed',
    trackPerformance('lessons-mark-completed', (_e, lessonId: string, trackId: string) => {
      if (typeof lessonId !== 'string' || !lessonId.trim()) throw new Error('参数无效: lessonId')
      if (typeof trackId !== 'string' || !trackId.trim()) throw new Error('参数无效: trackId')

      lessonId = lessonId.trim()
      trackId = trackId.trim()
      const now = new Date().toISOString()

      const db = getDB()
      db.prepare(
        `INSERT INTO lesson_progress (lesson_id, track_id, module_id, status, completed, last_opened, completed_at)
         VALUES (?, ?, ?, 'completed', 1, ?, ?)
         ON CONFLICT(lesson_id) DO UPDATE SET
           status = 'completed',
           completed = 1,
           last_opened = excluded.last_opened,
           completed_at = excluded.completed_at`,
      ).run(lessonId, trackId, null, now, now)

      return { ok: true }
    }),
  )

  // ---- lessons-notes-get ----
  ipcMain.handle(
    'lessons-notes-get',
    trackPerformance('lessons-notes-get', (_e, lessonId: string) => {
      if (typeof lessonId !== 'string' || !lessonId.trim()) {
        throw new Error('参数无效: lessonId')
      }

      const row = getDB()
        .prepare('SELECT * FROM lesson_notes WHERE lesson_id = ?')
        .get(lessonId.trim()) as LessonNoteRow | undefined

      if (!row) return null

      return {
        lessonId: row.lesson_id,
        content: row.content,
        tags: JSON.parse(row.tags) as string[],
        codeSnippets: JSON.parse(row.code_snippets) as string[],
        updatedAt: row.updated_at,
      }
    }),
  )

  // ---- lessons-notes-save ----
  ipcMain.handle(
    'lessons-notes-save',
    trackPerformance('lessons-notes-save', (_e, lessonId: string, content: string) => {
      if (typeof lessonId !== 'string' || !lessonId.trim()) {
        throw new Error('参数无效: lessonId')
      }
      if (typeof content !== 'string') throw new Error('参数无效: content')

      lessonId = lessonId.trim()
      content = content.slice(0, 100000)
      const tags = JSON.stringify([])
      const codeSnippets = JSON.stringify([])
      const now = new Date().toISOString()

      const db = getDB()
      db.prepare(
        `INSERT INTO lesson_notes (lesson_id, content, tags, code_snippets, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(lesson_id) DO UPDATE SET
             content = excluded.content,
             tags = excluded.tags,
             code_snippets = excluded.code_snippets,
             updated_at = excluded.updated_at`,
      ).run(lessonId, content, tags, codeSnippets, now)

      return { ok: true }
    }),
  )

  // ---- lessons-search ----
  ipcMain.handle(
    'lessons-search',
    trackPerformance('lessons-search', (_e, query: string) => {
      if (typeof query !== 'string' || !query.trim()) {
        return [] as SearchResult[]
      }

      const q = query.trim().toLowerCase().slice(0, 200)
      const courseMap = loadCourseMap()
      const results: SearchResult[] = []

      for (const track of courseMap.tracks) {
        for (const mod of track.modules) {
          for (const lesson of mod.lessons) {
            const haystack = [
              lesson.title,
              lesson.summary,
              lesson.tags.join(' '),
              ...lesson.outcomes,
            ]
              .join(' ')
              .toLowerCase()

            if (haystack.includes(q)) {
              results.push({
                trackId: track.id,
                trackTitle: track.title,
                moduleId: mod.id,
                moduleTitle: mod.title,
                lesson,
              })
            }
          }
        }
      }

      // Limit results to avoid flooding
      return results.slice(0, 50)
    }),
  )

  // ---- lesson-get-progress ----
  ipcMain.handle(
    'lesson-get-progress',
    trackPerformance('lesson-get-progress', () => {
      const db = getDB()
      const rows = db.prepare('SELECT lesson_id, completed FROM lesson_progress').all() as Array<{
        lesson_id: string
        completed: number
      }>
      return rows.map((r) => ({
        id: r.lesson_id,
        title: r.lesson_id,
        completed: r.completed === 1,
      }))
    }),
  )
}
