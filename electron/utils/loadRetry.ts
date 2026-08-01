/**
 * Bounded retry policy for the initial renderer load. A failed first load must
 * not leave the user with a blank window forever: retry a couple of times, then
 * surface a user-visible failure dialog (see electron/main.ts).
 */

/** Maximum number of automatic retries of the initial renderer load. */
export const MAX_INITIAL_LOAD_RETRIES = 2

/** Delay between a failed initial load and its automatic retry. */
export const INITIAL_LOAD_RETRY_DELAY_MS = 500

/**
 * Whether another automatic retry of the initial renderer load is allowed,
 * given how many failures have been observed so far.
 */
export function shouldRetryLoad(failureCount: number): boolean {
  return (
    Number.isSafeInteger(failureCount) &&
    failureCount >= 0 &&
    failureCount < MAX_INITIAL_LOAD_RETRIES
  )
}
