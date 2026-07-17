import type Database from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import { arch, release } from 'os'
import { getDB } from '../db/index'
import { listDatabaseBackups } from '../db/databaseBackup'
import { getKnowledgeRetrievalStatus } from '../db/knowledgeRetrievalRepository'
import { getAgentToolDefinitions } from './agentTools'
import { detectToolchainsAsync } from './toolchainDetect'
import { getLocalRunnerHostReadiness, type LocalRunnerHostReadiness } from './codeRunnerSupervisor'
import type { AgentToolDefinition } from '../../src/shared/agentContract'
import type { KnowledgeRetrievalStatus } from '../../src/shared/knowledgeRetrievalContract'
import type {
  AgentCapabilityStatus,
  AIProviderCapabilityStatus,
  CapabilityState,
  DatabaseBackupCapabilityStatus,
  DatabaseCapabilityStatus,
  DatabaseSchemaVersion,
  ExecutionCapabilityStatus,
  KnowledgeCapabilityStatus,
  RuntimeCapabilityStatus,
  SystemCapabilityRequest,
  SystemCapabilityStatus,
} from '../../src/shared/capabilityStatusContract'
import type { ToolchainReport } from './toolchainDetect'

const LOCAL_CONTROLLED_BOUNDARY =
  '本地受控执行提供超时、输出、并发和临时目录限制，但不是文件系统或网络沙箱。SQL 使用独立内存 SQLite utility。'

export interface RuntimeBackupSummary {
  state?: CapabilityState
  directoryAvailable: boolean
  backupCount: number
  warningCount?: number
  reason: string
}

export interface RuntimeCapabilityInfo {
  isPackaged: boolean
  appVersion: string
  platform: string
  arch: string
  osVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
}

export interface RuntimeCapabilityDependencies {
  getDatabase: () => Database.Database
  detectToolchains: (force?: boolean) => Promise<ToolchainReport>
  getKnowledgeStatus: (database: Database.Database) => KnowledgeRetrievalStatus
  getAgentTools: (
    database: Database.Database,
    toolchains?: ToolchainReport,
  ) => Promise<AgentToolDefinition[]>
  getRuntimeInfo: () => RuntimeCapabilityInfo
  getLocalRunnerHostReadiness: () => LocalRunnerHostReadiness
  getCredentialStorageStatus: () => { available: boolean; reason: string }
  getBackupSummary?: () => RuntimeBackupSummary | Promise<RuntimeBackupSummary>
  now: () => number
}

const defaultDependencies: RuntimeCapabilityDependencies = {
  getDatabase: getDB,
  detectToolchains: detectToolchainsAsync,
  getKnowledgeStatus: getKnowledgeRetrievalStatus,
  getAgentTools: getAgentToolDefinitions,
  getRuntimeInfo: () => ({
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: arch(),
    osVersion: release(),
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    nodeVersion: process.versions.node ?? '',
  }),
  getLocalRunnerHostReadiness,
  getCredentialStorageStatus: () => {
    const backend =
      process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function'
        ? safeStorage.getSelectedStorageBackend()
        : 'platform'
    const available = safeStorage.isEncryptionAvailable() && backend !== 'basic_text'
    return {
      available,
      reason: available
        ? '操作系统安全存储可用；能力报告不会读取或返回密钥。'
        : backend === 'basic_text'
          ? '系统仅提供 basic_text 后端，CodeHelper 拒绝把它当作安全凭据存储。'
          : '操作系统安全存储不可用，新的 AI 凭据将被拒绝保存。',
    }
  },
  getBackupSummary: () => {
    const result = listDatabaseBackups()
    return {
      state: result.warnings.length > 0 ? 'degraded' : 'ready',
      directoryAvailable: true,
      backupCount: result.backups.length,
      warningCount: result.warnings.length,
      reason:
        result.warnings.length > 0
          ? `备份目录可用，但有 ${result.warnings.length} 条清单警告。`
          : `备份目录可用，已记录 ${result.backups.length} 份完整数据库备份。`,
    }
  },
  now: Date.now,
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.trim().slice(0, 500) || '未知错误'
}

function runtimeStatus(info: RuntimeCapabilityInfo): RuntimeCapabilityStatus {
  return {
    state: 'ready',
    mode: info.isPackaged ? 'packaged' : 'development',
    ...info,
    inAppUpdaterAvailable: false,
    updateMetadataAvailable: true,
    updateReason: '发布产物包含 latest.yml/blockmap，但应用内检查、下载与安装更新器尚未接入。',
  }
}

function unavailableBackupStatus(): DatabaseBackupCapabilityStatus {
  return {
    state: 'unknown',
    directoryAvailable: null,
    backupCount: null,
    reason: '备份目录状态尚未接入本次能力探测；请以数据保护页的备份记录为准。',
  }
}

function normalizeQuickCheckRows(rows: unknown): string[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (typeof row === 'string') return [row]
    if (!row || typeof row !== 'object') return []
    return Object.values(row as Record<string, unknown>)
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  })
}

function inspectDatabase(
  database: Database.Database,
  backups: DatabaseBackupCapabilityStatus,
): DatabaseCapabilityStatus {
  let quickCheck: DatabaseCapabilityStatus['quickCheck'] = 'unavailable'
  let quickCheckMessage = 'SQLite quick_check 未执行'
  let schemaVersions: DatabaseSchemaVersion[] = []
  let migrationError: string | null = null

  try {
    const messages = normalizeQuickCheckRows(database.pragma('quick_check'))
    const healthy =
      messages.length > 0 && messages.every((message) => message.toLowerCase() === 'ok')
    quickCheck = healthy ? 'ok' : 'failed'
    quickCheckMessage = messages.join('；') || 'SQLite quick_check 未返回结果'
  } catch (error) {
    quickCheckMessage = `SQLite quick_check 失败：${errorMessage(error)}`
  }

  try {
    const rows = database
      .prepare('SELECT component, version, updated_at FROM schema_migrations ORDER BY component')
      .all() as Array<{ component?: unknown; version?: unknown; updated_at?: unknown }>
    schemaVersions = rows
      .filter(
        (row): row is { component: string; version: number; updated_at?: string } =>
          typeof row.component === 'string' &&
          Number.isSafeInteger(row.version) &&
          Number(row.version) >= 0,
      )
      .map((row) => ({
        component: row.component,
        version: Number(row.version),
        ...(typeof row.updated_at === 'string' ? { updatedAt: row.updated_at } : {}),
      }))
  } catch (error) {
    migrationError = errorMessage(error)
  }

  const applicationSchemaVersion =
    schemaVersions.find((migration) => migration.component === 'application')?.version ?? null
  let state: CapabilityState = 'ready'
  if (quickCheck === 'unavailable') state = 'unavailable'
  else if (quickCheck === 'failed' || migrationError || backups.state !== 'ready')
    state = 'degraded'

  const reasons = [quickCheckMessage]
  if (migrationError) reasons.push(`schema_migrations 读取失败：${migrationError}`)
  if (applicationSchemaVersion === null) reasons.push('应用级 schema 版本尚未登记')
  if (backups.state !== 'ready') reasons.push(`完整备份：${backups.reason}`)

  return {
    state,
    quickCheck,
    quickCheckMessage,
    applicationSchemaVersion,
    schemaVersions,
    backups,
    reason: reasons.join('；'),
  }
}

function unavailableDatabase(reason: string): DatabaseCapabilityStatus {
  return {
    state: 'unavailable',
    quickCheck: 'unavailable',
    quickCheckMessage: reason,
    applicationSchemaVersion: null,
    schemaVersions: [],
    backups: unavailableBackupStatus(),
    reason,
  }
}

function inspectAIConfiguration(
  database: Database.Database,
  credentialStorage: { available: boolean; reason: string },
): AIProviderCapabilityStatus {
  try {
    const row = database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM ai_configs
         WHERE TRIM(COALESCE(base_url, '')) <> ''
           AND TRIM(COALESCE(model, '')) <> ''`,
      )
      .get() as { count?: unknown } | undefined
    const configurationCount = Number(row?.count ?? 0)
    const configured = Number.isSafeInteger(configurationCount) && configurationCount > 0
    return {
      state: configured ? (credentialStorage.available ? 'unknown' : 'degraded') : 'unavailable',
      configured,
      configurationCount: configured ? configurationCount : 0,
      connectivity: 'not-checked',
      credentialStorage: credentialStorage.available ? 'ready' : 'unavailable',
      credentialStorageReason: credentialStorage.reason,
      reason: configured
        ? `已保存 ${configurationCount} 个有效 AI 配置；未自动联网，端点连通性和凭据有效性未验证。`
        : '未找到包含端点和模型的 AI 配置；未执行联网探测。',
    }
  } catch (error) {
    return {
      state: 'unavailable',
      configured: false,
      configurationCount: 0,
      connectivity: 'not-checked',
      credentialStorage: credentialStorage.available ? 'ready' : 'unavailable',
      credentialStorageReason: credentialStorage.reason,
      reason: `AI 配置状态读取失败；未执行联网探测：${errorMessage(error)}`,
    }
  }
}

function executionStatus(
  report: ToolchainReport,
  host: LocalRunnerHostReadiness,
): ExecutionCapabilityStatus {
  const readyCount = report.tools.filter((tool) => tool.status === 'ready').length
  const degradedCount = report.tools.filter((tool) => tool.status === 'degraded').length
  const localControlledAvailable = readyCount + degradedCount > 0 && host.available
  const state: CapabilityState = !host.available
    ? 'unavailable'
    : readyCount > 0
      ? 'ready'
      : degradedCount > 0
        ? 'degraded'
        : 'unavailable'
  return {
    state,
    detectedAt: report.detectedAt,
    localControlledAvailable,
    utilityEntryAvailable: host.utilityEntryAvailable,
    windowsJobHostRequired: host.windowsJobHostRequired,
    windowsJobHostAvailable: host.windowsJobHostAvailable,
    localControlledBoundary: LOCAL_CONTROLLED_BOUNDARY,
    strongIsolationAvailable: report.isolation.strongIsolationAvailable,
    strongIsolationReason: report.isolation.strongIsolationReason,
    toolchains: report.tools.map((tool) => ({
      id: tool.id,
      languageIds: [...tool.languageIds],
      status: tool.status,
      ...(tool.version ? { version: tool.version } : {}),
      message: tool.message,
    })),
    reason: !host.available
      ? host.reason
      : localControlledAvailable
        ? `本地受控执行可用：${readyCount} 个就绪，${degradedCount} 个降级。`
        : '没有可用的本地执行工具链。',
  }
}

function unavailableExecution(reason: string, generatedAt: number): ExecutionCapabilityStatus {
  return {
    state: 'unavailable',
    detectedAt: generatedAt,
    localControlledAvailable: false,
    utilityEntryAvailable: false,
    windowsJobHostRequired: process.platform === 'win32',
    windowsJobHostAvailable: process.platform !== 'win32',
    localControlledBoundary: LOCAL_CONTROLLED_BOUNDARY,
    strongIsolationAvailable: false,
    strongIsolationReason: reason,
    toolchains: [],
    reason,
  }
}

function knowledgeStatus(status: KnowledgeRetrievalStatus): KnowledgeCapabilityStatus {
  return {
    ...status,
    state: status.available ? (status.degraded ? 'degraded' : 'ready') : 'unavailable',
  }
}

function unavailableKnowledge(reason: string): KnowledgeCapabilityStatus {
  return {
    state: 'unavailable',
    available: false,
    degraded: true,
    mode: 'unavailable',
    lexicalBackend: 'none',
    semanticBackend: 'none',
    reason,
    documentCount: 0,
    chunkCount: 0,
    indexedAt: 0,
  }
}

function agentStatus(
  tools: AgentToolDefinition[],
  providerConfigured: boolean,
): AgentCapabilityStatus {
  const enabledToolCount = tools.filter((tool) => tool.availability !== 'unavailable').length
  const approvalRequiredToolCount = tools.filter(
    (tool) => tool.availability !== 'unavailable' && tool.approvalRequired,
  ).length
  const unavailableCount = tools.length - enabledToolCount
  const orchestratorState: CapabilityState = providerConfigured ? 'ready' : 'unavailable'
  const state: CapabilityState =
    enabledToolCount === 0
      ? 'unavailable'
      : unavailableCount > 0 || !providerConfigured
        ? 'degraded'
        : 'ready'
  return {
    state,
    tools,
    enabledToolCount,
    approvalRequiredToolCount,
    orchestratorState,
    reason:
      tools.length === 0
        ? 'Agent 工具白名单为空。'
        : `${enabledToolCount}/${tools.length} 个白名单工具可用，其中 ${approvalRequiredToolCount} 个需要逐次审批。${providerConfigured ? '' : ' Agent 模型编排仍被 AI Provider 配置阻塞。'}`,
  }
}

function unavailableAgent(reason: string): AgentCapabilityStatus {
  return {
    state: 'unavailable',
    tools: [],
    enabledToolCount: 0,
    approvalRequiredToolCount: 0,
    orchestratorState: 'unavailable',
    reason,
  }
}

async function backupStatus(
  provider: RuntimeCapabilityDependencies['getBackupSummary'],
): Promise<DatabaseBackupCapabilityStatus> {
  if (!provider) return unavailableBackupStatus()
  try {
    const summary = await provider()
    const warningCount = Number.isSafeInteger(summary.warningCount)
      ? Math.max(0, Number(summary.warningCount))
      : 0
    const backupCount = Number.isFinite(summary.backupCount)
      ? Math.max(0, Math.floor(summary.backupCount))
      : 0
    return {
      state: !summary.directoryAvailable
        ? 'unavailable'
        : warningCount > 0
          ? 'degraded'
          : (summary.state ?? 'ready'),
      directoryAvailable: summary.directoryAvailable,
      backupCount,
      reason: summary.reason,
    }
  } catch (error) {
    return {
      state: 'unavailable',
      directoryAvailable: false,
      backupCount: null,
      reason: `备份目录状态读取失败：${errorMessage(error)}`,
    }
  }
}

export async function getRuntimeCapabilities(
  request: SystemCapabilityRequest = {},
  overrides: Partial<RuntimeCapabilityDependencies> = {},
): Promise<SystemCapabilityStatus> {
  const dependencies: RuntimeCapabilityDependencies = { ...defaultDependencies, ...overrides }
  const generatedAt = dependencies.now()
  const runtime = runtimeStatus(dependencies.getRuntimeInfo())
  const credentialStorage = dependencies.getCredentialStorageStatus()
  const localRunnerHost = dependencies.getLocalRunnerHostReadiness()
  const backupsPromise = backupStatus(dependencies.getBackupSummary)

  let database: Database.Database | null = null
  let databaseFailure: string | null = null
  try {
    database = dependencies.getDatabase()
  } catch (error) {
    databaseFailure = `数据库不可用：${errorMessage(error)}`
  }

  const ai = database
    ? inspectAIConfiguration(database, credentialStorage)
    : {
        state: 'unavailable' as const,
        configured: false,
        configurationCount: 0,
        connectivity: 'not-checked' as const,
        credentialStorage: credentialStorage.available
          ? ('ready' as const)
          : ('unavailable' as const),
        credentialStorageReason: credentialStorage.reason,
        reason: `${databaseFailure ?? '数据库不可用'}；未执行联网探测。`,
      }

  let knowledge: KnowledgeCapabilityStatus
  if (database) {
    try {
      knowledge = knowledgeStatus(dependencies.getKnowledgeStatus(database))
    } catch (error) {
      knowledge = unavailableKnowledge(`知识检索状态读取失败：${errorMessage(error)}`)
    }
  } else {
    knowledge = unavailableKnowledge(databaseFailure ?? '数据库不可用')
  }

  const toolchainsPromise = Promise.resolve().then(() =>
    dependencies.detectToolchains(request.force === true),
  )
  const [toolchainsResult, backups] = await Promise.all([
    Promise.resolve(toolchainsPromise).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    ),
    backupsPromise,
  ])
  const agentToolsResult =
    database && toolchainsResult.ok
      ? await Promise.resolve(dependencies.getAgentTools(database, toolchainsResult.value)).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        )
      : {
          ok: false as const,
          error: new Error(
            databaseFailure ??
              (toolchainsResult.ok ? '数据库不可用' : '工具链探测失败，Agent 状态无法确认'),
          ),
        }

  const databaseStatus = database
    ? inspectDatabase(database, backups)
    : { ...unavailableDatabase(databaseFailure ?? '数据库不可用'), backups }
  const execution = toolchainsResult.ok
    ? executionStatus(toolchainsResult.value, localRunnerHost)
    : unavailableExecution(`工具链探测失败：${errorMessage(toolchainsResult.error)}`, generatedAt)
  const agent = agentToolsResult.ok
    ? agentStatus(agentToolsResult.value, ai.configured)
    : unavailableAgent(`Agent 工具状态读取失败：${errorMessage(agentToolsResult.error)}`)

  return {
    generatedAt,
    runtime,
    database: databaseStatus,
    execution,
    knowledge,
    agent,
    ai,
  }
}
