/**
 * IPC handlers for achievements.
 *
 * Manages achievement definitions, progress tracking, and unlock checking.
 * Achievements are grouped into 5 categories: learning, practice, streak,
 * feature, and special. Progress is tracked via the achievement_progress table
 * and achievements are unlocked when current_value >= threshold.
 */

import { ipcMain } from 'electron'
import { getDB } from '../db/index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AchievementSeed {
  id: string
  title: string
  description: string
  icon: string
  category: string
  threshold: number
}

export interface AchievementRow {
  id: string
  title: string
  description: string
  icon: string
  category: string
  threshold: number
  current_value: number
  unlocked: number
  unlocked_at: string | null
}

// ---------------------------------------------------------------------------
// Seed data — 20 achievements in 5 categories
// ---------------------------------------------------------------------------

const SEED_DATA: AchievementSeed[] = [
  // ── learning ──────────────────────────────────────────────────────────────
  {
    id: 'first_lesson',
    title: '初窥门径',
    description: '完成第一节课',
    icon: '📖',
    category: 'learning',
    threshold: 1,
  },
  {
    id: 'lessons_5',
    title: '勤学初成',
    description: '完成 5 节课',
    icon: '📚',
    category: 'learning',
    threshold: 5,
  },
  {
    id: 'lessons_10',
    title: '学有所得',
    description: '完成 10 节课',
    icon: '🎓',
    category: 'learning',
    threshold: 10,
  },
  {
    id: 'lessons_25',
    title: '融会贯通',
    description: '完成 25 节课',
    icon: '🧠',
    category: 'learning',
    threshold: 25,
  },
  {
    id: 'lessons_50',
    title: '博学多才',
    description: '完成 50 节课',
    icon: '🏆',
    category: 'learning',
    threshold: 50,
  },

  // ── practice ──────────────────────────────────────────────────────────────
  {
    id: 'first_exercise',
    title: '牛刀小试',
    description: '完成第一道练习',
    icon: '✏️',
    category: 'practice',
    threshold: 1,
  },
  {
    id: 'exercises_10',
    title: '笔耕不辍',
    description: '完成 10 道练习',
    icon: '💪',
    category: 'practice',
    threshold: 10,
  },
  {
    id: 'exercises_50',
    title: '百炼成钢',
    description: '完成 50 道练习',
    icon: '🔥',
    category: 'practice',
    threshold: 50,
  },
  {
    id: 'exercises_100',
    title: '练习大师',
    description: '完成 100 道练习',
    icon: '👑',
    category: 'practice',
    threshold: 100,
  },
  {
    id: 'perfect_score',
    title: '满分达人',
    description: '获得一次满分练习成绩',
    icon: '💯',
    category: 'practice',
    threshold: 1,
  },

  // ── streak ────────────────────────────────────────────────────────────────
  {
    id: 'streak_3',
    title: '三日之约',
    description: '连续学习 3 天',
    icon: '🔥',
    category: 'streak',
    threshold: 3,
  },
  {
    id: 'streak_7',
    title: '一周坚持',
    description: '连续学习 7 天',
    icon: '⭐',
    category: 'streak',
    threshold: 7,
  },
  {
    id: 'streak_14',
    title: '两周不懈',
    description: '连续学习 14 天',
    icon: '🌟',
    category: 'streak',
    threshold: 14,
  },
  {
    id: 'streak_30',
    title: '月度之星',
    description: '连续学习 30 天',
    icon: '🌙',
    category: 'streak',
    threshold: 30,
  },

  // ── feature ───────────────────────────────────────────────────────────────
  {
    id: 'first_bookmark',
    title: '收藏达人',
    description: '收藏第一道题目',
    icon: '⭐',
    category: 'feature',
    threshold: 1,
  },
  {
    id: 'notes_5',
    title: '笔记能手',
    description: '撰写 5 条课堂笔记',
    icon: '📝',
    category: 'feature',
    threshold: 5,
  },
  {
    id: 'speed_demon',
    title: '速度之王',
    description: '在 5 分钟内完成一道练习',
    icon: '⚡',
    category: 'feature',
    threshold: 1,
  },
  {
    id: 'note_exporter',
    title: '笔记导出者',
    description: '导出一次笔记',
    icon: '📤',
    category: 'feature',
    threshold: 1,
  },

  // ── special ───────────────────────────────────────────────────────────────
  {
    id: 'data_backup',
    title: '数据守护',
    description: '进行一次数据备份',
    icon: '🛡️',
    category: 'special',
    threshold: 1,
  },
  {
    id: 'review_master',
    title: '复习达人',
    description: '完成 10 次间隔复习',
    icon: '🔄',
    category: 'special',
    threshold: 10,
  },
]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Event types understood by achievements-check and the achievement IDs they map to. */
const EVENT_ACHIEVEMENT_MAP: Record<string, string[]> = {
  lesson_completed: ['first_lesson', 'lessons_5', 'lessons_10', 'lessons_25', 'lessons_50'],
  exercise_completed: ['first_exercise', 'exercises_10', 'exercises_50', 'exercises_100'],
  perfect_score: ['perfect_score'],
  streak_day: ['streak_3', 'streak_7', 'streak_14', 'streak_30'],
  bookmark_added: ['first_bookmark'],
  note_created: ['notes_5'],
  fast_exercise: ['speed_demon'],
  note_exported: ['note_exporter'],
  data_backup: ['data_backup'],
  review_completed: ['review_master'],
}

const VALID_EVENT_TYPES = new Set(Object.keys(EVENT_ACHIEVEMENT_MAP))

/**
 * Ensure every seeded achievement has a matching progress row.
 * This avoids LEFT JOIN NULLs in achievements-list results.
 */
function ensureProgressRows(db: ReturnType<typeof getDB>): void {
  const achievements = db.prepare('SELECT id FROM achievements').all() as Array<{ id: string }>
  const existingProgress = new Set(
    (
      db.prepare('SELECT achievement_id FROM achievement_progress').all() as Array<{
        achievement_id: string
      }>
    ).map((r) => r.achievement_id),
  )

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO achievement_progress (achievement_id, current_value, unlocked) VALUES (?, 0, 0)',
  )
  const insertMany = db.transaction(() => {
    for (const a of achievements) {
      if (!existingProgress.has(a.id)) {
        stmt.run(a.id)
      }
    }
  })
  insertMany()
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

export function registerAchievementsIPC(): void {
  // ── achievements-seed ─────────────────────────────────────────────────────
  ipcMain.handle('achievements-seed', (): { seeded: boolean; count: number } => {
    const db = getDB()
    const existing = db.prepare('SELECT COUNT(*) AS cnt FROM achievements').get() as {
      cnt: number
    }

    if (existing.cnt > 0) {
      // Already seeded — just make sure progress rows exist
      ensureProgressRows(db)
      return { seeded: false, count: existing.cnt }
    }

    const stmt = db.prepare(
      'INSERT INTO achievements (id, title, description, icon, category, threshold) VALUES (?, ?, ?, ?, ?, ?)',
    )
    const insertAll = db.transaction(() => {
      for (const a of SEED_DATA) {
        stmt.run(a.id, a.title, a.description, a.icon, a.category, a.threshold)
      }
    })
    insertAll()

    // Create initial progress rows
    ensureProgressRows(db)

    return { seeded: true, count: SEED_DATA.length }
  })

  // ── achievements-list ─────────────────────────────────────────────────────
  ipcMain.handle('achievements-list', (): AchievementRow[] => {
    const db = getDB()
    return db
      .prepare(
        `
        SELECT
          a.id,
          a.title,
          a.description,
          a.icon,
          a.category,
          a.threshold,
          COALESCE(ap.current_value, 0) AS current_value,
          COALESCE(ap.unlocked, 0)      AS unlocked,
          ap.unlocked_at
        FROM achievements a
        LEFT JOIN achievement_progress ap ON ap.achievement_id = a.id
        ORDER BY
          CASE a.category
            WHEN 'learning' THEN 1
            WHEN 'practice' THEN 2
            WHEN 'streak'   THEN 3
            WHEN 'feature'  THEN 4
            WHEN 'special'  THEN 5
            ELSE 6
          END,
          a.threshold ASC
      `,
      )
      .all() as AchievementRow[]
  })

  // ── achievements-check ────────────────────────────────────────────────────
  ipcMain.handle(
    'achievements-check',
    (
      _e: Electron.IpcMainInvokeEvent,
      eventType: string,
      value: number = 1,
    ): { unlocked: string[] } => {
      // Validate event type
      if (typeof eventType !== 'string' || !VALID_EVENT_TYPES.has(eventType)) {
        throw new Error(`无效的事件类型: ${eventType}`)
      }

      // Validate value
      const v = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1

      const db = getDB()
      const targetIds = EVENT_ACHIEVEMENT_MAP[eventType]

      // Update progress for each related achievement and collect newly-unlocked ones
      const newlyUnlocked: string[] = []
      const now = new Date().toISOString()

      const checkAndUpdate = db.transaction(() => {
        for (const achId of targetIds) {
          const ach = db.prepare('SELECT threshold FROM achievements WHERE id = ?').get(achId) as
            | { threshold: number }
            | undefined
          if (!ach) continue

          // For event types where value represents cumulative count,
          // set current_value to value; otherwise increment by value.
          const isCumulative = [
            'lesson_completed',
            'exercise_completed',
            'streak_day',
            'review_completed',
            'note_created',
          ].includes(eventType)

          if (isCumulative) {
            // Only update if the new value is higher than the current one
            const current = db
              .prepare(
                'SELECT current_value, unlocked FROM achievement_progress WHERE achievement_id = ?',
              )
              .get(achId) as { current_value: number; unlocked: number } | undefined

            if (current) {
              if (v > current.current_value) {
                db.prepare(
                  'UPDATE achievement_progress SET current_value = ? WHERE achievement_id = ?',
                ).run(v, achId)
              }
            } else {
              db.prepare(
                'INSERT INTO achievement_progress (achievement_id, current_value, unlocked) VALUES (?, ?, 0)',
              ).run(achId, v)
            }
          } else {
            // Binary / one-shot events — increment by value
            db.prepare(
              `INSERT INTO achievement_progress (achievement_id, current_value, unlocked)
               VALUES (?, ?, 0)
               ON CONFLICT(achievement_id) DO UPDATE SET
                 current_value = current_value + excluded.current_value`,
            ).run(achId, v)
          }

          // Check if threshold is now met and not yet unlocked
          const progress = db
            .prepare(
              'SELECT current_value, unlocked FROM achievement_progress WHERE achievement_id = ?',
            )
            .get(achId) as { current_value: number; unlocked: number }

          if (progress.current_value >= ach.threshold && !progress.unlocked) {
            db.prepare(
              'UPDATE achievement_progress SET unlocked = 1, unlocked_at = ? WHERE achievement_id = ?',
            ).run(now, achId)
            newlyUnlocked.push(achId)
          }
        }
      })

      checkAndUpdate()

      return { unlocked: newlyUnlocked }
    },
  )
}
