// workspaceService.ts
// Code execution and workspace features

import { invoke } from './ipc'

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
  duration_ms: number
}

export interface SubmitResult {
  passed: boolean
  score: number
  details: {
    case: string
    passed: boolean
    expected: string
    actual: string
  }[]
}

export interface Problem {
  id: string
  title: string
  description: string
  difficulty: string
  tags: string[]
  languages: string[]
  starter_code: string
  test_cases: string
}

export interface ProblemFilters {
  difficulty?: string
  tag?: string
  status?: string
  source?: string
}

export interface Submission {
  id: string
  language: string
  code: string
  status: string
  passed_cases: number
  total_cases: number
  duration_ms: number
  created_at: string
}

export async function runCode(code: string, language: string): Promise<RunResult> {
  return invoke<RunResult>('run-code', { code, language })
}

export async function submitToProblem(
  problemId: string,
  code: string,
  language: string,
): Promise<SubmitResult> {
  return invoke<SubmitResult>('problems-submit', {
    problemId: Number(problemId),
    code,
    language,
  })
}

export async function getProblem(id: string): Promise<Problem> {
  return invoke<Problem>('problems-get', Number(id))
}

export async function getProblems(filters?: ProblemFilters): Promise<Problem[]> {
  return invoke<Problem[]>('problems-list', filters)
}

export async function getSubmissions(problemId: string): Promise<Submission[]> {
  return invoke<Submission[]>('problems-submissions', Number(problemId))
}
