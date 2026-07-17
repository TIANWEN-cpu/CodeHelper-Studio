import { createHash } from 'crypto'
import type Database from 'better-sqlite3'
import type { AgentToolDefinition, AgentToolRequest } from '../../src/shared/agentContract'
import {
  getKnowledgeRetrievalStatus,
  searchKnowledgeHybrid,
} from '../db/knowledgeRetrievalRepository'
import { runCodeSnippet } from './codeRunner'
import { detectToolchainsAsync, type ToolchainReport } from './toolchainDetect'

const MAX_AGENT_CODE_CHARS = 100_000
const MAX_AGENT_STDIN_CHARS = 100_000
const MAX_AGENT_TOOL_OUTPUT_CHARS = 20_000
const SUPPORTED_CODE_LANGUAGES = new Set(['python', 'javascript', 'node', 'c', 'cpp', 'csharp'])

export interface ResolvedAgentToolRequest {
  definition: AgentToolDefinition
  input: Record<string, unknown>
  inputSummary: Record<string, unknown>
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function truncateOutput(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_AGENT_TOOL_OUTPUT_CHARS) return { value, truncated: false }
  return { value: value.slice(0, MAX_AGENT_TOOL_OUTPUT_CHARS), truncated: true }
}

export async function getAgentToolDefinitions(
  database: Database.Database,
  toolchainReport?: ToolchainReport,
): Promise<AgentToolDefinition[]> {
  const retrieval = getKnowledgeRetrievalStatus(database)
  const toolchains = toolchainReport ?? (await detectToolchainsAsync())
  const strongIsolationAvailable = toolchains.isolation.strongIsolationAvailable
  return [
    {
      id: 'knowledge-search',
      label: '知识库检索',
      description: '查询本地知识库并把带来源的相关片段交给 Agent。',
      availability: retrieval.available ? 'available' : 'unavailable',
      risk: 'read-only',
      approvalRequired: false,
      boundary: '只读访问本地 SQLite 知识库，不修改文档或外部状态。',
      reason: retrieval.reason,
      timeoutMs: 5_000,
    },
    {
      id: 'strong-code-run',
      label: '强隔离代码运行',
      description: '在 Docker 强隔离容器中运行当前代码并采集真实输出。',
      availability: strongIsolationAvailable ? 'requiresApproval' : 'unavailable',
      risk: 'isolated-execution',
      approvalRequired: true,
      boundary: '每次运行都需要单独批准；仅允许 Docker 强隔离，禁止网络，禁止静默回退到本地执行。',
      reason: toolchains.isolation.strongIsolationReason,
      timeoutMs: 15_000,
    },
  ]
}

function resolveKnowledgeSearch(
  request: AgentToolRequest,
  definition: AgentToolDefinition,
  fallbackQuery: string,
): ResolvedAgentToolRequest {
  const rawQuery = typeof request.input.query === 'string' ? request.input.query : fallbackQuery
  const query = rawQuery.trim().slice(0, 1_000)
  if (!query) throw new Error('知识库检索缺少有效 query')
  const requestedLimit = Number(request.input.limit ?? 5)
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(8, requestedLimit)) : 5
  return {
    definition,
    input: { query, limit },
    inputSummary: { query, limit },
  }
}

function resolveStrongCodeRun(
  request: AgentToolRequest,
  definition: AgentToolDefinition,
): ResolvedAgentToolRequest {
  if (typeof request.input.code !== 'string' || !request.input.code.trim()) {
    throw new Error('强隔离代码运行缺少有效 code')
  }
  if (request.input.code.length > MAX_AGENT_CODE_CHARS) throw new Error('Agent 代码长度超限')
  const language =
    typeof request.input.language === 'string' ? request.input.language.trim().toLowerCase() : ''
  if (!SUPPORTED_CODE_LANGUAGES.has(language)) throw new Error(`Agent 不支持运行语言: ${language}`)
  const stdin = typeof request.input.stdin === 'string' ? request.input.stdin : undefined
  if (stdin && stdin.length > MAX_AGENT_STDIN_CHARS) throw new Error('Agent stdin 长度超限')
  return {
    definition,
    input: { code: request.input.code, language, ...(stdin !== undefined ? { stdin } : {}) },
    inputSummary: {
      language,
      codeChars: request.input.code.length,
      codeSha256: hashText(request.input.code),
      stdinChars: stdin?.length ?? 0,
      executionMode: 'strong-isolation',
    },
  }
}

export async function resolveAgentToolRequests(
  database: Database.Database,
  requests: AgentToolRequest[],
  fallbackQuery: string,
): Promise<ResolvedAgentToolRequest[]> {
  if (!Array.isArray(requests) || requests.length > 2) throw new Error('Agent 工具请求数量无效')
  const definitions = await getAgentToolDefinitions(database)
  const seen = new Set<string>()
  return requests.map((request) => {
    if (!request || typeof request !== 'object' || typeof request.toolId !== 'string') {
      throw new Error('Agent 工具请求格式无效')
    }
    if (seen.has(request.toolId)) throw new Error(`Agent 工具重复请求: ${request.toolId}`)
    seen.add(request.toolId)
    const definition = definitions.find((tool) => tool.id === request.toolId)
    if (!definition) throw new Error(`Agent 工具不在白名单中: ${request.toolId}`)
    if (definition.availability === 'unavailable') {
      throw new Error(`${definition.label} 当前不可用: ${definition.reason}`)
    }
    const normalizedRequest: AgentToolRequest = {
      toolId: definition.id,
      input:
        request.input && typeof request.input === 'object' && !Array.isArray(request.input)
          ? request.input
          : {},
    }
    return definition.id === 'knowledge-search'
      ? resolveKnowledgeSearch(normalizedRequest, definition, fallbackQuery)
      : resolveStrongCodeRun(normalizedRequest, definition)
  })
}

function controlledPromise<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, value?: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(value as T)
    }
    const onAbort = () => finish(new Error('Agent 工具执行已取消'))
    const timer = setTimeout(() => finish(new Error('Agent 工具执行超时')), timeoutMs)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) return onAbort()
    void operation.then(
      (value) => finish(undefined, value),
      (error) => finish(error instanceof Error ? error : new Error(String(error))),
    )
  })
}

export async function executeAgentTool(
  database: Database.Database,
  definition: AgentToolDefinition,
  input: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (definition.id === 'knowledge-search') {
    const query = String(input.query ?? '')
    const limit = Number(input.limit ?? 5)
    return controlledPromise(
      Promise.resolve().then(() => {
        const response = searchKnowledgeHybrid(database, query, limit)
        return {
          query: response.query,
          retrieval: {
            available: response.retrieval.available,
            degraded: response.retrieval.degraded,
            mode: response.retrieval.mode,
            candidateCount: response.retrieval.candidateCount,
          },
          results: response.results.map((result) => ({
            source: `${result.filename}#片段${result.chunk_index + 1}`,
            score: result.score,
            excerpt: result.content.slice(0, 1_500),
          })),
        }
      }),
      signal,
      definition.timeoutMs,
    )
  }

  const code = String(input.code ?? '')
  const language = String(input.language ?? '')
  const stdin = typeof input.stdin === 'string' ? input.stdin : undefined
  return controlledPromise(
    runCodeSnippet(code, language, stdin, 'strong-isolation', signal).then((result) => {
      const stdout = truncateOutput(result.stdout)
      const stderr = truncateOutput(result.stderr)
      return {
        language,
        executionMode: 'strong-isolation',
        stage: result.stage,
        exitCode: result.exitCode,
        stdout: stdout.value,
        stderr: stderr.value,
        outputTruncated: stdout.truncated || stderr.truncated,
      }
    }),
    signal,
    definition.timeoutMs,
  )
}
