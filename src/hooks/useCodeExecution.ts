/**
 * useCodeExecution — shared hook for running code.
 *
 * Encapsulates the IPC invocation for `run-code` along with output state
 * management. Extracted from EditorView.tsx to allow reuse (e.g. in problem
 * submissions or test runners).
 */

import { useState, useCallback } from 'react'
import { toErrorMessage } from '../utils/errors'
import { typedInvoke } from '../api/ipc'

export interface CodeRunResult {
  stdout: string
  stderr: string
}

export interface UseCodeExecutionReturn {
  /** The latest execution output, or null if no run has occurred. */
  output: CodeRunResult | null
  /** Whether a code execution is currently in progress. */
  running: boolean
  /** Execute the given code and language. */
  execute: (code: string, language: string) => Promise<CodeRunResult>
  /** Clear the current output. */
  clearOutput: () => void
}

export function useCodeExecution(): UseCodeExecutionReturn {
  const [output, setOutput] = useState<CodeRunResult | null>(null)
  const [running, setRunning] = useState(false)

  const execute = useCallback(async (code: string, language: string): Promise<CodeRunResult> => {
    setRunning(true)
    setOutput(null)

    try {
      const result = await typedInvoke('run-code', {
        code,
        language,
      })
      setOutput(result)
      return result
    } catch (error: unknown) {
      const errResult: CodeRunResult = { stdout: '', stderr: toErrorMessage(error) }
      setOutput(errResult)
      return errResult
    } finally {
      setRunning(false)
    }
  }, [])

  const clearOutput = useCallback(() => setOutput(null), [])

  return { output, running, execute, clearOutput }
}
