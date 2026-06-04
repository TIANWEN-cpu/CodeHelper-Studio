import { invoke } from './ipc'
import { track } from './analyticsService'

// ============================================================
// Practice Service
// Provides practice exercises, draft management,
// code submission / evaluation, and spaced-repetition review.
// ============================================================

// --------------- Types ---------------

export interface Exercise {
  id: string
  title: string
  track_id: string
  difficulty: string
  prompt: string
  starter_code?: string
  hints?: string[]
  tests?: string[]
}

export interface SubmitResult {
  passed: boolean
  score: number
  feedback_lines: string[]
  stdout: string
  duration_sec: number
}

export interface ReviewItem {
  exercise_id: string
  title: string
  next_review: string
  repetitions: number
  ease_factor: number
}

// --------------- Exercises ---------------

/** Fetch a list of exercises, optionally filtered by track and difficulty. */
export async function getExercises(trackId?: string, difficulty?: string): Promise<Exercise[]> {
  return invoke<Exercise[]>('exercises-list', { track_id: trackId, difficulty })
}

/** Fetch a single exercise by ID. */
export async function getExercise(id: string): Promise<Exercise> {
  return invoke<Exercise>('exercises-get', id)
}

// --------------- Submission / Evaluation ---------------

/** Submit code for an exercise and receive evaluation results. */
export async function submitCode(
  exerciseId: string,
  code: string,
  _language: string,
): Promise<SubmitResult> {
  const result = await invoke<SubmitResult>('exercises-evaluate', { exerciseId, code })
  if (result?.passed) {
    // 练习通过算作"解答通过一道题"。
    track('problem_solved', { exerciseId })
  }
  return result
}

// --------------- Drafts ---------------

/** Retrieve the saved draft code for an exercise, or null if none exists. */
export async function getDraft(exerciseId: string): Promise<string | null> {
  return invoke<string | null>('exercises-draft-get', exerciseId)
}

/** Persist a draft of the user's code for an exercise. */
export async function saveDraft(exerciseId: string, code: string): Promise<void> {
  return invoke<void>('exercises-draft-save', { exerciseId, code })
}

/** Delete the saved draft for an exercise. */
export async function clearDraft(exerciseId: string): Promise<void> {
  return invoke<void>('exercises-draft-clear', exerciseId)
}

// --------------- Spaced-Repetition Review ---------------

/** Fetch exercises that are due for review. */
export async function getReviewDue(): Promise<ReviewItem[]> {
  return invoke<ReviewItem[]>('review-due')
}

/**
 * Update the review schedule for an exercise based on recall quality.
 * `quality` is typically 0-5 (SM-2 scale).
 */
export async function updateReview(exerciseId: string, quality: number): Promise<void> {
  return invoke<void>('review-update', { exercise_id: exerciseId, quality })
}
