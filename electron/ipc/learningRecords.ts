import { ipcMain } from 'electron'
import { getDB } from '../db/index'

const LEARNING_RECORD_TABLES = [
  'analytics_events',
  'review_schedule',
  'exercise_drafts',
  'exercise_timers',
  'submissions',
  'mistakes',
] as const

type LearningRecordTable = (typeof LEARNING_RECORD_TABLES)[number]

export interface LearningRecordsClearResult {
  success: boolean
  changed: Record<LearningRecordTable | 'lesson_progress' | 'achievement_progress', number>
}

function clearLearningRecords(): LearningRecordsClearResult {
  const db = getDB()
  const changed = {} as Record<
    LearningRecordTable | 'lesson_progress' | 'achievement_progress',
    number
  >

  const clearAll = db.transaction(() => {
    const lessonProgressResult = db
      .prepare(
        `UPDATE lesson_progress
         SET status = 'not_started',
             completed = 0,
             last_opened = NULL,
             completed_at = NULL`,
      )
      .run()
    changed.lesson_progress = Number(lessonProgressResult.changes ?? 0)

    const achievementProgressResult = db
      .prepare(
        `UPDATE achievement_progress
         SET current_value = 0,
             unlocked = 0,
             unlocked_at = NULL`,
      )
      .run()
    changed.achievement_progress = Number(achievementProgressResult.changes ?? 0)

    for (const table of LEARNING_RECORD_TABLES) {
      const result = db.prepare(`DELETE FROM ${table}`).run()
      changed[table] = Number(result.changes ?? 0)
    }
  })

  clearAll()
  return { success: true, changed }
}

export function registerLearningRecordsIPC(): void {
  ipcMain.handle('learning-records-clear', () => clearLearningRecords())
}
