/**
 * IPC handlers for SM-2 spaced repetition review scheduling.
 *
 * Manages the `review_schedule` table: due queries, SM-2 update logic,
 * aggregate stats, and per-exercise schedule retrieval.
 */

import { ipcMain } from 'electron'
import { getDB } from '../db/index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewScheduleRow {
  exercise_id: string
  interval_days: number
  ease_factor: number
  repetitions: number
  next_review: string | null
  last_reviewed: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return today's date as a YYYY-MM-DD string. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Add `days` to a date string (YYYY-MM-DD) and return a new date string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + Math.round(days))
  return d.toISOString().slice(0, 10)
}

/**
 * Core SM-2 algorithm.
 *
 * Given the current schedule state and a quality rating (0-5), compute the
 * next interval, ease factor, and repetition count.
 *
 * Quality scale (standard SM-2):
 *   5 – perfect response
 *   4 – correct after hesitation
 *   3 – correct with serious difficulty
 *   2 – incorrect; when shown the correct answer, it felt familiar
 *   1 – incorrect; correct answer felt vaguely familiar
 *   0 – complete blackout
 */
function computeSM2(
  quality: number,
  repetitions: number,
  easeFactor: number,
  currentInterval: number,
): { repetitions: number; easeFactor: number; interval: number } {
  // Update ease factor (applied even on failure per original SM-2 definition)
  const newEaseFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  )

  if (quality >= 3) {
    // Success path
    let newInterval: number
    if (repetitions === 0) {
      newInterval = 1
    } else if (repetitions === 1) {
      newInterval = 6
    } else {
      newInterval = currentInterval * newEaseFactor
    }
    return {
      repetitions: repetitions + 1,
      easeFactor: newEaseFactor,
      interval: newInterval,
    }
  }

  // Failure path – reset
  return {
    repetitions: 0,
    easeFactor: newEaseFactor,
    interval: 1,
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerReviewIPC(): void {
  // -----------------------------------------------------------------------
  // review-due: exercises whose next_review <= today
  // -----------------------------------------------------------------------
  ipcMain.handle('review-due', () => {
    const today = todayISO()
    // LEFT JOIN problems 取回错题的标题/难度（错题的 review key = problem_id 字符串化）；
    // 非题库来源（如练习 id）CAST 不到 problems 时 title 为空。
    return getDB()
      .prepare(
        `SELECT rs.*, p.title AS title, p.difficulty AS difficulty
         FROM review_schedule rs
         LEFT JOIN problems p ON p.id = CAST(rs.exercise_id AS INTEGER)
         WHERE rs.next_review IS NOT NULL AND rs.next_review <= ?
         ORDER BY rs.next_review ASC`,
      )
      .all(today)
  })

  // -----------------------------------------------------------------------
  // review-update: apply SM-2 after a review attempt
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'review-update',
    (
      _e,
      params: {
        exercise_id: string
        quality: number
      },
    ) => {
      // --- Input validation ---
      if (
        !params ||
        typeof params.exercise_id !== 'string' ||
        params.exercise_id.trim().length === 0
      ) {
        throw new Error('参数无效: exercise_id')
      }
      if (
        typeof params.quality !== 'number' ||
        !Number.isFinite(params.quality) ||
        params.quality < 0 ||
        params.quality > 5
      ) {
        throw new Error('参数无效: quality (须为 0-5 的整数)')
      }

      const exerciseId = params.exercise_id.trim()
      const quality = Math.round(params.quality)
      const db = getDB()
      const today = todayISO()

      // Ensure a schedule row exists (upsert on first review)
      db.prepare(
        `INSERT OR IGNORE INTO review_schedule (exercise_id, interval_days, ease_factor, repetitions, next_review)
         VALUES (?, 1, 2.5, 0, ?)`,
      ).run(exerciseId, today)

      const current = db
        .prepare('SELECT * FROM review_schedule WHERE exercise_id = ?')
        .get(exerciseId) as ReviewScheduleRow

      const result = computeSM2(
        quality,
        current.repetitions,
        current.ease_factor,
        current.interval_days,
      )

      const nextReview = addDays(today, result.interval)

      db.prepare(
        `UPDATE review_schedule
         SET interval_days = ?,
             ease_factor  = ?,
             repetitions  = ?,
             next_review  = ?,
             last_reviewed = ?
         WHERE exercise_id = ?`,
      ).run(result.interval, result.easeFactor, result.repetitions, nextReview, today, exerciseId)

      return {
        exercise_id: exerciseId,
        interval_days: result.interval,
        ease_factor: result.easeFactor,
        repetitions: result.repetitions,
        next_review: nextReview,
        last_reviewed: today,
      } satisfies ReviewScheduleRow & { exercise_id: string }
    },
  )

  // -----------------------------------------------------------------------
  // review-stats: aggregate counts for the dashboard
  // -----------------------------------------------------------------------
  ipcMain.handle(
    'review-stats',
    (): {
      totalDue: number
      completedToday: number
      mastered: number
    } => {
      const db = getDB()
      const today = todayISO()

      const dueToday = (
        db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM review_schedule
           WHERE next_review IS NOT NULL AND next_review <= ?`,
          )
          .get(today) as { cnt: number }
      ).cnt

      const completedToday = (
        db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM review_schedule
           WHERE last_reviewed = ?`,
          )
          .get(today) as { cnt: number }
      ).cnt

      const totalScheduled = (
        db.prepare('SELECT COUNT(*) AS cnt FROM review_schedule').get() as { cnt: number }
      ).cnt

      // "mastered" = scheduled items that are NOT currently due
      const mastered = totalScheduled - dueToday

      return {
        totalDue: dueToday,
        completedToday,
        mastered,
      }
    },
  )

  // -----------------------------------------------------------------------
  // review-schedule: full schedule row for a single exercise
  // -----------------------------------------------------------------------
  ipcMain.handle('review-schedule', (_e, exerciseId: string): ReviewScheduleRow | undefined => {
    if (typeof exerciseId !== 'string' || exerciseId.trim().length === 0) {
      throw new Error('参数无效: exerciseId')
    }
    return getDB()
      .prepare('SELECT * FROM review_schedule WHERE exercise_id = ?')
      .get(exerciseId.trim()) as ReviewScheduleRow | undefined
  })
}
