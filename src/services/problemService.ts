/**
 * Problem service — abstracts problem-related IPC calls.
 *
 * Wraps all `problems-*` IPC channels behind a clean interface
 * that can be mocked for testing.
 */

import { typedInvoke } from '../api/ipc'
import type { ProblemListFilters, SubmitPayload, SubmitResult } from '../types/ipc'
import type { Problem, Submission } from '../types/problem'

export interface IProblemService {
  list(filters?: ProblemListFilters): Promise<Problem[]>
  get(id: number): Promise<Problem | undefined>
  submit(payload: SubmitPayload): Promise<SubmitResult>
  submissions(problemId: number): Promise<Submission[]>
}

class ProblemServiceImpl implements IProblemService {
  list(filters?: ProblemListFilters): Promise<Problem[]> {
    return typedInvoke('problems-list', filters)
  }

  get(id: number): Promise<Problem | undefined> {
    return typedInvoke('problems-get', id)
  }

  submit(payload: SubmitPayload): Promise<SubmitResult> {
    return typedInvoke('problems-submit', payload)
  }

  submissions(problemId: number): Promise<Submission[]> {
    return typedInvoke('problems-submissions', problemId)
  }
}

// ---------------------------------------------------------------------------
// Singleton with swappable implementation
// ---------------------------------------------------------------------------

let instance: IProblemService = new ProblemServiceImpl()

export const problemService: IProblemService = {
  list: (...args) => instance.list(...args),
  get: (...args) => instance.get(...args),
  submit: (...args) => instance.submit(...args),
  submissions: (...args) => instance.submissions(...args),
}

/**
 * Replace the default problem service (useful for testing).
 */
export function setProblemService(service: IProblemService): void {
  instance = service
}
