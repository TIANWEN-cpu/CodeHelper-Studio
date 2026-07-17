import type { AgentToolDefinition } from './agentContract'
import type { KnowledgeRetrievalStatus } from './knowledgeRetrievalContract'

export type CapabilityState = 'ready' | 'degraded' | 'unavailable' | 'unknown'

export interface RuntimeCapabilityStatus {
  state: 'ready'
  mode: 'packaged' | 'development'
  isPackaged: boolean
  appVersion: string
  platform: string
  arch: string
  osVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  inAppUpdaterAvailable: false
  updateMetadataAvailable: true
  updateReason: string
}

export interface DatabaseSchemaVersion {
  component: string
  version: number
  updatedAt?: string
}

export interface DatabaseBackupCapabilityStatus {
  state: CapabilityState
  directoryAvailable: boolean | null
  backupCount: number | null
  reason: string
}

export interface DatabaseCapabilityStatus {
  state: CapabilityState
  quickCheck: 'ok' | 'failed' | 'unavailable'
  quickCheckMessage: string
  applicationSchemaVersion: number | null
  schemaVersions: DatabaseSchemaVersion[]
  backups: DatabaseBackupCapabilityStatus
  reason: string
}

export interface ToolchainCapabilityStatus {
  id: string
  languageIds: string[]
  status: 'ready' | 'missing' | 'degraded'
  version?: string
  message: string
}

export interface ExecutionCapabilityStatus {
  state: CapabilityState
  detectedAt: number
  localControlledAvailable: boolean
  utilityEntryAvailable: boolean
  windowsJobHostRequired: boolean
  windowsJobHostAvailable: boolean
  localControlledBoundary: string
  strongIsolationAvailable: boolean
  strongIsolationReason: string
  toolchains: ToolchainCapabilityStatus[]
  reason: string
}

export interface KnowledgeCapabilityStatus extends KnowledgeRetrievalStatus {
  state: CapabilityState
}

export interface AgentCapabilityStatus {
  state: CapabilityState
  tools: AgentToolDefinition[]
  enabledToolCount: number
  approvalRequiredToolCount: number
  orchestratorState: CapabilityState
  reason: string
}

export interface AIProviderCapabilityStatus {
  state: CapabilityState
  configured: boolean
  configurationCount: number
  connectivity: 'not-checked'
  credentialStorage: 'ready' | 'unavailable'
  credentialStorageReason: string
  reason: string
}

export interface SystemCapabilityStatus {
  generatedAt: number
  runtime: RuntimeCapabilityStatus
  database: DatabaseCapabilityStatus
  execution: ExecutionCapabilityStatus
  knowledge: KnowledgeCapabilityStatus
  agent: AgentCapabilityStatus
  ai: AIProviderCapabilityStatus
}

export interface SystemCapabilityRequest {
  force?: boolean
}
