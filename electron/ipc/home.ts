/**
 * IPC handlers for the home / dashboard overview.
 *
 * Provides a single aggregated `home-get-overview` channel that returns all the
 * real data the home page needs (greeting, lesson/problem progress, streak, XP /
 * level, and a suggested next lesson). All data is read locally from the SQLite
 * database and the bundled course map — nothing is hard-coded.
 */

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

export interface SuggestedLesson {
  trackId: string
  moduleId: string
  lessonId: string
  title: string
  moduleTitle: string
}

export interface HomeOverview {
  greetingName: string
  completedLessons: number
  totalLessons: number
  solvedProblems: number
  totalProblems: number
  streak: number
  level: number
  xp: number
  xpInLevel: number
  xpForNextLevel: number
  suggestedLesson: SuggestedLesson | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTENT_DIR = resolve(__dirname, '../../content')

// XP awarded per analytics event type.
const XP_PER_EVENT: Record<string, number> = {
  problem_solved: 10,
  lesson_completed: 20,
  code_run: 2,
  ai_chat_sent: 1,
}
const XP_DEFAULT = 1

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

/** Read the configured user name from settings, falling back to '同学'. */
function getGreetingName(db: ReturnType<typeof getDB>): string {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'user_name'").get() as
      | { value: string }
      | undefined
    const name = row?.value?.trim()
    return name && name.length > 0 ? name : '同学'
  } catch {
    return '同学'
  }
}

/** Count lessons that have been completed (status='completed' or completed=1). */
function getCompletedLessons(db: ReturnType<typeof getDB>): number {
  try {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM lesson_progress WHERE completed = 1 OR status = 'completed'",
      )
      .get() as { cnt: number }
    return row.cnt
  } catch {
    return 0
  }
}

/** Total number of lessons across the whole course map. */
function getTotalLessons(courseMap: CourseMap): number {
  let total = 0
  for (const track of courseMap.tracks) {
    for (const mod of track.modules) {
      total += mod.lessons.length
    }
  }
  return total
}

/** Number of distinct problems with at least one accepted submission. */
function getSolvedProblems(db: ReturnType<typeof getDB>): number {
  try {
    const row = db
      .prepare(
        "SELECT COUNT(DISTINCT problem_id) AS cnt FROM submissions WHERE status = 'accepted'",
      )
      .get() as { cnt: number }
    return row.cnt
  } catch {
    return 0
  }
}

/** Total number of problems in the bank. */
function getTotalProblems(db: ReturnType<typeof getDB>): number {
  try {
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM problems').get() as { cnt: number }
    return row.cnt
  } catch {
    return 0
  }
}

/**
 * Current learning streak: consecutive days (ending today or yesterday) that
 * have at least one analytics event. Mirrors the logic of `analytics-get-streak`.
 */
function getStreak(db: ReturnType<typeof getDB>): number {
  let rows: Array<{ day: string }> = []
  try {
    rows = db
      .prepare(
        `SELECT DATE(timestamp) AS day, COUNT(*) AS cnt
         FROM analytics_events
         GROUP BY DATE(timestamp)
         ORDER BY day DESC`,
      )
      .all() as Array<{ day: string }>
  } catch {
    return 0
  }

  if (rows.length === 0) return 0

  const today = new Date().toISOString().slice(0, 10)
  const daySet = new Set(rows.map((r) => r.day))

  let streak = 0
  const d = new Date(today + 'T00:00:00')
  // If today has no events, start checking from yesterday.
  if (!daySet.has(today)) {
    d.setDate(d.getDate() - 1)
  }
  while (daySet.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

/** Total XP accumulated from analytics events, weighted by event type. */
function getTotalXp(db: ReturnType<typeof getDB>): number {
  let rows: Array<{ event_type: string; cnt: number }> = []
  try {
    rows = db
      .prepare('SELECT event_type, COUNT(*) AS cnt FROM analytics_events GROUP BY event_type')
      .all() as Array<{ event_type: string; cnt: number }>
  } catch {
    return 0
  }

  let xp = 0
  for (const row of rows) {
    const weight = XP_PER_EVENT[row.event_type] ?? XP_DEFAULT
    xp += weight * row.cnt
  }
  return xp
}

/**
 * Derive level / progress from total XP.
 *
 * level = floor(sqrt(xp / 50)) + 1
 * Total XP required to reach level L = 50 * L * L  (i.e. floor at level boundary).
 */
function computeLevel(xp: number): {
  level: number
  xpInLevel: number
  xpForNextLevel: number
} {
  const safeXp = Math.max(0, Math.floor(xp))
  const level = Math.floor(Math.sqrt(safeXp / 50)) + 1

  // Cumulative XP needed to *have reached* the current level, and the next one.
  const xpAtCurrentLevel = 50 * (level - 1) * (level - 1)
  const xpAtNextLevel = 50 * level * level

  const xpInLevel = safeXp - xpAtCurrentLevel
  const xpForNextLevel = xpAtNextLevel - xpAtCurrentLevel

  return { level, xpInLevel, xpForNextLevel }
}

/** First lesson in the course map (used as a fallback suggestion). */
function getFirstLesson(courseMap: CourseMap): SuggestedLesson | null {
  for (const track of courseMap.tracks) {
    for (const mod of track.modules) {
      const lesson = mod.lessons[0]
      if (lesson) {
        return {
          trackId: track.id,
          moduleId: mod.id,
          lessonId: lesson.id,
          title: lesson.title,
          moduleTitle: mod.title,
        }
      }
    }
  }
  return null
}

/**
 * Suggested next lesson: the most-recently-opened, not-yet-completed lesson.
 * Falls back to the first lesson in the course map when nothing is in progress.
 */
function getSuggestedLesson(
  db: ReturnType<typeof getDB>,
  courseMap: CourseMap,
): SuggestedLesson | null {
  let row: { lesson_id: string; track_id: string; module_id: string | null } | undefined
  try {
    row = db
      .prepare(
        `SELECT lesson_id, track_id, module_id
         FROM lesson_progress
         WHERE (completed = 0 OR completed IS NULL)
           AND status != 'completed'
           AND last_opened IS NOT NULL
         ORDER BY last_opened DESC
         LIMIT 1`,
      )
      .get() as { lesson_id: string; track_id: string; module_id: string | null } | undefined
  } catch {
    row = undefined
  }

  if (row) {
    // Resolve title / moduleTitle from the course map.
    for (const track of courseMap.tracks) {
      for (const mod of track.modules) {
        for (const lesson of mod.lessons) {
          if (lesson.id === row.lesson_id) {
            return {
              trackId: track.id,
              moduleId: mod.id,
              lessonId: lesson.id,
              title: lesson.title,
              moduleTitle: mod.title,
            }
          }
        }
      }
    }
    // Lesson row exists but is no longer in the course map — fall back below.
  }

  return getFirstLesson(courseMap)
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerHomeHandlers(): void {
  ipcMain.handle(
    'home-get-overview',
    trackPerformance('home-get-overview', (): HomeOverview => {
      const db = getDB()
      const courseMap = loadCourseMap()

      const xp = getTotalXp(db)
      const { level, xpInLevel, xpForNextLevel } = computeLevel(xp)

      return {
        greetingName: getGreetingName(db),
        completedLessons: getCompletedLessons(db),
        totalLessons: getTotalLessons(courseMap),
        solvedProblems: getSolvedProblems(db),
        totalProblems: getTotalProblems(db),
        streak: getStreak(db),
        level,
        xp,
        xpInLevel,
        xpForNextLevel,
        suggestedLesson: getSuggestedLesson(db, courseMap),
      }
    }),
  )
}
