/**
 * Shared type definitions for the Problem module.
 *
 * These interfaces are the single source of truth for problem-related data
 * structures used across stores, views, and tests.
 */

/** A coding problem loaded from the database. */
export interface Problem {
  id: number
  title: string
  description: string
  difficulty: string
  source?: string
  tracks?: string
  platform?: string
  mode?: string
  exam_style?: string
  year?: number | null
  official_url?: string | null
  estimated_time?: number | null
  tags: string
  languages: string
  examples: string
  test_cases: string
  starter_code: string
  solved: number
}

/** A single test case for a problem. */
export interface TestCase {
  input: string
  expected: string
}

/** Result of a single test case execution. */
export interface TestResult extends TestCase {
  actual: string
  passed: boolean
}

/** The full result returned after submitting a solution. */
export interface Submission {
  status: string
  passed: number
  total: number
  results: TestResult[]
  duration: number
}

/** Problem difficulty levels. */
export type Difficulty = 'easy' | 'medium' | 'hard'

/** Problem filters for the problem list view. */
export interface ProblemFilters {
  difficulty?: string
  tag?: string
  search?: string
  language?: string
  source?: string
  track?: string
  platform?: string
  mode?: string
}
