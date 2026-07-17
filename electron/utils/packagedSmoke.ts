import type { BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, isAbsolute, join, relative, resolve } from 'path'
import { E2E_USER_DATA_ENV } from './testUserData'

export const PACKAGED_SMOKE_ENV = 'CODEHELPER_PACKAGED_SMOKE'
export const PACKAGED_SMOKE_PHASE_ENV = 'CODEHELPER_PACKAGED_SMOKE_PHASE'
export const PACKAGED_SMOKE_RESULT_ENV = 'CODEHELPER_PACKAGED_SMOKE_RESULT'
export const PACKAGED_SMOKE_PACK_ROOT_ENV = 'CODEHELPER_PACKAGED_SMOKE_PACK_ROOT'

export type PackagedSmokePhase = 'exercise' | 'verify'

export interface PackagedSmokeRequest {
  phase: PackagedSmokePhase
  resultPath: string
  userDataPath: string
  packRoot?: string
}

interface PackagedSmokeOptions {
  isPackaged: boolean
  version: string
  executablePath: string
  userDataPath: string
  appPath: string
  resourcesPath: string
  environment?: NodeJS.ProcessEnv
  tempRoot?: string
}

export interface PackagedResourceChecks {
  appPathIsAsar: boolean
  appAsarPresent: boolean
  jobHostPresent: boolean
  jobHostSha256: string | null
  databaseSchemaPresent: boolean
  courseMetadataPresent: boolean
  allRequiredPresent: boolean
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function collectPackagedResourceChecks(
  appPath: string,
  resourcesPath: string,
): PackagedResourceChecks {
  const appAsarPath = resolve(resourcesPath, 'app.asar')
  const jobHostPath = join(resourcesPath, 'bin', 'win32-x64', 'codehelper-job-host.exe')
  const databaseSchemaPath = join(resourcesPath, 'db', 'schema.sql')
  const courseMetadataPath = join(resourcesPath, 'content', 'metadata', 'course_map.json')
  const appPathIsAsar = resolve(appPath) === appAsarPath
  const appAsarPresent = existsSync(appAsarPath)
  const jobHostPresent = existsSync(jobHostPath)
  const databaseSchemaPresent = existsSync(databaseSchemaPath)
  const courseMetadataPresent = existsSync(courseMetadataPath)

  return {
    appPathIsAsar,
    appAsarPresent,
    jobHostPresent,
    jobHostSha256: jobHostPresent ? sha256(jobHostPath) : null,
    databaseSchemaPresent,
    courseMetadataPresent,
    allRequiredPresent:
      appPathIsAsar &&
      appAsarPresent &&
      jobHostPresent &&
      databaseSchemaPresent &&
      courseMetadataPresent,
  }
}

function resolveTemporaryPath(value: string | undefined, label: string, tempRoot: string): string {
  if (!value || !isAbsolute(value)) throw new Error(`${label} must be an absolute path`)
  const temporaryRoot = resolve(tempRoot)
  const target = resolve(value)
  const relativePath = relative(temporaryRoot, target)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} must be inside the system temporary directory`)
  }
  return target
}

export function resolvePackagedSmokeRequest(
  isPackaged: boolean,
  environment: NodeJS.ProcessEnv = process.env,
  tempRoot = tmpdir(),
): PackagedSmokeRequest | null {
  const userDataPath = resolvePackagedSmokeUserDataPath(isPackaged, environment, tempRoot)
  if (!userDataPath) return null

  const phase = environment[PACKAGED_SMOKE_PHASE_ENV]
  if (phase !== 'exercise' && phase !== 'verify') {
    throw new Error(`Invalid packaged smoke phase: ${phase ?? ''}`)
  }
  const resultPath = resolveTemporaryPath(
    environment[PACKAGED_SMOKE_RESULT_ENV],
    PACKAGED_SMOKE_RESULT_ENV,
    tempRoot,
  )
  const resultName = basename(resultPath)
  if (!resultName.startsWith('codehelper-package-smoke-') || !resultName.endsWith('.json')) {
    throw new Error(`${PACKAGED_SMOKE_RESULT_ENV} has an invalid filename`)
  }

  if (phase === 'verify') return { phase, resultPath, userDataPath }
  return {
    phase,
    resultPath,
    userDataPath,
    packRoot: resolveTemporaryPath(
      environment[PACKAGED_SMOKE_PACK_ROOT_ENV],
      PACKAGED_SMOKE_PACK_ROOT_ENV,
      tempRoot,
    ),
  }
}

export function resolvePackagedSmokeUserDataPath(
  isPackaged: boolean,
  environment: NodeJS.ProcessEnv = process.env,
  tempRoot = tmpdir(),
): string | null {
  if (environment[PACKAGED_SMOKE_ENV] !== '1') return null
  if (!isPackaged) throw new Error('Packaged smoke mode is available only in a packaged build')
  return resolveTemporaryPath(environment[E2E_USER_DATA_ENV], E2E_USER_DATA_ENV, tempRoot)
}

async function runRendererSmoke(
  phase: PackagedSmokePhase,
  packRoot?: string,
): Promise<Record<string, unknown>> {
  const smokeApi = (
    window as unknown as Window & {
      api: { invoke(channel: string, ...args: unknown[]): Promise<unknown> }
    }
  ).api
  const deadline = Date.now() + 30_000
  while (!document.querySelector('[data-testid="nav-home"]')) {
    if (Date.now() >= deadline) throw new Error('Packaged renderer did not become ready')
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }

  if (phase === 'verify') {
    const workspace = (await smokeApi.invoke('editor-workspace-load', {
      workspaceId: 'default',
    })) as { tabs?: Array<{ id?: string; content?: string; status?: string }> }
    const restored = workspace.tabs?.find((tab) => tab.id === 'packaged-smoke-tab')
    if (
      !restored ||
      restored.content !== 'print("PACKAGED_WORKSPACE_OK")' ||
      restored.status !== 'open'
    ) {
      throw new Error('Packaged workspace did not survive restart')
    }
    return { restoredTabId: restored.id, restoredContent: restored.content }
  }

  if (!packRoot) throw new Error('Packaged smoke resource pack is missing')
  const saved = (await smokeApi.invoke('editor-tab-save', {
    workspaceId: 'default',
    mutationId: 'packaged-smoke-save-1',
    clientId: 'packaged-smoke-client',
    id: 'packaged-smoke-tab',
    filename: 'packaged-smoke.py',
    language: 'python',
    content: 'print("PACKAGED_WORKSPACE_OK")',
    kind: 'file',
    problemId: null,
    position: 0,
    baseRevision: 0,
  })) as { status?: string }
  if (saved.status !== 'saved') throw new Error(`Packaged workspace save failed: ${saved.status}`)

  const sql = (await smokeApi.invoke('run-code', {
    code: 'SELECT 42 AS packaged_answer;',
    language: 'sql',
    executionMode: 'local-controlled',
  })) as { stdout?: string; stderr?: string; exitCode?: number; stage?: string }
  if (sql.exitCode !== 0 || sql.stage !== 'sql' || !sql.stdout?.includes('42')) {
    throw new Error(`Packaged SQL smoke failed: ${sql.stderr || sql.stdout || 'unknown error'}`)
  }

  const node = (await smokeApi.invoke('run-code', {
    code: "process.stdout.write('PACKAGED_NODE_OK')",
    language: 'javascript',
    executionMode: 'local-controlled',
  })) as { stdout?: string; stderr?: string; exitCode?: number; stage?: string }
  if (node.exitCode !== 0 || node.stage !== 'run' || node.stdout !== 'PACKAGED_NODE_OK') {
    throw new Error(
      `Packaged Node runner smoke failed: ${node.stderr || node.stdout || 'unknown error'}`,
    )
  }

  await smokeApi.invoke('resource-pack-import', { rootPath: packRoot })
  const search = (await smokeApi.invoke(
    'knowledge-search',
    'packaged release gate auditable source',
  )) as { results?: Array<{ filename?: string }> }
  if (!search.results?.[0]?.filename?.includes('package-smoke/release-gate.md')) {
    throw new Error('Packaged knowledge retrieval did not return the imported source')
  }

  const agentRun = (await smokeApi.invoke('agent-run-create', {
    goal: 'find the packaged release gate requirement',
    context: { view: 'knowledge' },
    tools: [
      {
        toolId: 'knowledge-search',
        input: { query: 'packaged release gate auditable source', limit: 3 },
      },
    ],
  })) as {
    id?: string
    status?: string
    toolCalls?: Array<{
      toolId?: string
      status?: string
      result?: { results?: Array<{ source?: string }> }
    }>
  }
  const agentKnowledgeSource = agentRun.toolCalls?.[0]?.result?.results?.[0]?.source
  if (
    !agentRun.id ||
    agentRun.status !== 'dispatching' ||
    agentRun.toolCalls?.[0]?.toolId !== 'knowledge-search' ||
    agentRun.toolCalls[0].status !== 'completed' ||
    !agentKnowledgeSource?.startsWith('package-smoke/release-gate.md#')
  ) {
    throw new Error('Packaged Agent knowledge tool did not complete')
  }
  const cancelledAgentRun = (await smokeApi.invoke('agent-run-cancel', {
    runId: agentRun.id,
    note: 'Packaged smoke complete.',
  })) as { status?: string }
  if (cancelledAgentRun.status !== 'cancelled') {
    throw new Error('Packaged Agent run did not reach the cancelled terminal state')
  }

  return {
    workspaceSaved: true,
    sqlExitCode: sql.exitCode,
    nodeExitCode: node.exitCode,
    nodeStage: node.stage,
    nodeStdout: node.stdout,
    knowledgeSource: search.results[0].filename,
    agentRunId: agentRun.id,
    agentKnowledgeSource,
    agentCancelled: true,
  }
}

let smokeStarted = false

export async function runPackagedSmokeIfRequested(
  window: BrowserWindow,
  options: PackagedSmokeOptions,
): Promise<boolean> {
  const request = resolvePackagedSmokeRequest(
    options.isPackaged,
    options.environment,
    options.tempRoot,
  )
  if (!request || smokeStarted) return false
  if (resolve(options.userDataPath) !== request.userDataPath) {
    throw new Error('Packaged smoke userData path does not match the configured Electron profile')
  }
  smokeStarted = true

  const resourceChecks = collectPackagedResourceChecks(options.appPath, options.resourcesPath)
  let payload: Record<string, unknown>
  try {
    if (!resourceChecks.allRequiredPresent) {
      throw new Error('Packaged runtime resources are incomplete')
    }
    const script = `(${runRendererSmoke.toString()})(${JSON.stringify(request.phase)}, ${JSON.stringify(request.packRoot)})`
    const result = (await window.webContents.executeJavaScript(script, true)) as Record<
      string,
      unknown
    >
    payload = {
      ok: true,
      isPackaged: options.isPackaged,
      phase: request.phase,
      version: options.version,
      executablePath: options.executablePath,
      userDataPath: options.userDataPath,
      appPath: options.appPath,
      resourcesPath: options.resourcesPath,
      resourceChecks,
      result,
    }
  } catch (error) {
    payload = {
      ok: false,
      isPackaged: options.isPackaged,
      phase: request.phase,
      version: options.version,
      executablePath: options.executablePath,
      userDataPath: options.userDataPath,
      appPath: options.appPath,
      resourcesPath: options.resourcesPath,
      resourceChecks,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  writeFileSync(request.resultPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  return true
}
