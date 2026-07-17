import type { ExecutionMode, IsolationInfo, ToolchainEntry } from './toolchainDetect'

export type CodeRunStage = 'compile' | 'run' | 'sql'

export interface CodeRunResult {
  stdout: string
  stderr: string
  exitCode: number
  stage: CodeRunStage
  timedOut?: boolean
  toolchain?: ToolchainEntry
  isolation?: IsolationInfo
}

export interface CodeRunnerUtilityRequest {
  kind: 'run-code'
  code: string
  language: string
  stdin?: string
  executionMode?: ExecutionMode
  toolchain?: ToolchainEntry
}

export type CodeRunnerUtilityResponse =
  | { kind: 'result'; result: CodeRunResult }
  | { kind: 'error'; error: string }

export function isCodeRunnerUtilityRequest(value: unknown): value is CodeRunnerUtilityRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<CodeRunnerUtilityRequest>
  return (
    request.kind === 'run-code' &&
    typeof request.code === 'string' &&
    typeof request.language === 'string' &&
    (request.stdin === undefined || typeof request.stdin === 'string') &&
    (request.executionMode === undefined ||
      request.executionMode === 'local-controlled' ||
      request.executionMode === 'strong-isolation')
  )
}

export function isCodeRunnerUtilityResponse(value: unknown): value is CodeRunnerUtilityResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<CodeRunnerUtilityResponse>
  if (response.kind === 'error') return typeof response.error === 'string'
  if (response.kind !== 'result' || !response.result || typeof response.result !== 'object') {
    return false
  }
  const result = response.result as Partial<CodeRunResult>
  return (
    typeof result.stdout === 'string' &&
    typeof result.stderr === 'string' &&
    typeof result.exitCode === 'number' &&
    (result.stage === 'compile' || result.stage === 'run' || result.stage === 'sql')
  )
}
