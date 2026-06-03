import { invoke } from './ipc'

// --------------- Types ---------------

export interface Mistake {
  id: string
  problem_id: string
  problem_title: string
  difficulty: string
  tags: string[]
  error_types: string[]
  last_wrong_code: string
  created_at: string
}

export interface MistakeDetail extends Mistake {
  description: string
  correct_code?: string
  ai_analysis?: string
}

export interface ReviewItem {
  exercise_id: string
  title: string
  difficulty: string
  next_review: string
  interval_days: number
  repetitions: number
}

// --------------- Mistakes ---------------

/** Fetch all mistakes. */
export async function getMistakes(): Promise<Mistake[]> {
  return invoke<Mistake[]>('mistakes-list')
}

/** Fetch a single mistake by ID with full detail. */
export async function getMistake(id: string): Promise<MistakeDetail> {
  return invoke<MistakeDetail>('mistakes-get', id)
}

/** Update the AI analysis for a mistake. */
export async function updateAnalysis(id: string, analysis: string): Promise<void> {
  return invoke<void>('mistakes-update-analysis', id, analysis)
}

/** Delete a mistake by ID. */
export async function deleteMistake(id: string): Promise<void> {
  return invoke<void>('mistakes-delete', id)
}

// --------------- Spaced Repetition Review ---------------

/** Fetch exercises that are due for review. */
export async function getDueReviews(): Promise<ReviewItem[]> {
  return invoke<ReviewItem[]>('review-due')
}

/** Submit a review result for an exercise. `quality` ranges from 0 to 5 (SM-2 scale). */
export async function updateReview(exerciseId: string, quality: number): Promise<void> {
  return invoke<void>('review-update', { exercise_id: exerciseId, quality })
}

/** Fetch review statistics summary. */
export async function getReviewStats(): Promise<{
  totalDue: number
  completedToday: number
  mastered: number
}> {
  return invoke<{ totalDue: number; completedToday: number; mastered: number }>('review-stats')
}
