import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SystemCapabilityStatus } from '../src/shared/capabilityStatusContract'
import {
  CapabilityStatusSettings,
  formatCapabilityTime,
} from '../src/views/settings/CapabilityStatusSettings'

vi.mock('../src/services/capabilityService', () => ({
  getSystemCapabilities: vi.fn(),
}))

const status: SystemCapabilityStatus = {
  generatedAt: 1_750_000_000_000,
  runtime: {
    state: 'ready',
    mode: 'packaged',
    isPackaged: true,
    appVersion: '2.4.0',
    platform: 'win32',
    arch: 'x64',
    osVersion: '10.0.26100',
    electronVersion: '41.7.1',
    chromeVersion: '142',
    nodeVersion: '24',
  },
  database: {
    state: 'ready',
    quickCheck: 'ok',
    quickCheckMessage: 'ok',
    applicationSchemaVersion: 1,
    schemaVersions: [{ component: 'application', version: 1 }],
    backups: {
      state: 'ready',
      directoryAvailable: true,
      backupCount: 2,
      reason: 'ready',
    },
    reason: 'ok',
  },
  execution: {
    state: 'ready',
    detectedAt: 456,
    localControlledAvailable: true,
    localControlledBoundary: '本地受控执行不是网络或文件系统沙箱。',
    strongIsolationAvailable: false,
    strongIsolationReason: 'Docker daemon stopped; fails closed.',
    toolchains: [
      {
        id: 'python',
        languageIds: ['python'],
        status: 'ready',
        version: 'Python 3.12',
        message: 'ready',
      },
    ],
    reason: 'ready',
  },
  knowledge: {
    state: 'degraded',
    available: true,
    degraded: true,
    mode: 'keyword-fallback',
    lexicalBackend: 'bounded-like',
    semanticBackend: 'local-ngram-rerank',
    reason: 'FTS5 unavailable, bounded fallback active.',
    documentCount: 3,
    chunkCount: 9,
    indexedAt: 789,
  },
  agent: {
    state: 'degraded',
    orchestratorState: 'unavailable',
    enabledToolCount: 1,
    approvalRequiredToolCount: 0,
    reason: 'one tool available',
    tools: [
      {
        id: 'knowledge-search',
        label: '知识库检索',
        description: 'read only',
        availability: 'available',
        risk: 'read-only',
        approvalRequired: false,
        boundary: 'local only',
        reason: 'ready',
        timeoutMs: 5_000,
      },
      {
        id: 'strong-code-run',
        label: '强隔离代码运行',
        description: 'isolated',
        availability: 'unavailable',
        risk: 'isolated-execution',
        approvalRequired: true,
        boundary: 'approval required',
        reason: 'Docker stopped',
        timeoutMs: 15_000,
      },
    ],
  },
  ai: {
    state: 'unknown',
    configured: true,
    configurationCount: 2,
    connectivity: 'not-checked',
    reason: '已保存配置，但未自动联网。',
  },
}

describe('CapabilityStatusSettings', () => {
  it('renders degraded and unavailable states without claiming AI connectivity', () => {
    const html = renderToStaticMarkup(
      createElement(CapabilityStatusSettings, { status, loading: false, error: null }),
    )

    expect(html).toContain('系统能力状态')
    expect(html).toContain('quick_check: ok')
    expect(html).toContain('keyword-fallback')
    expect(html).toContain('Docker daemon stopped; fails closed.')
    expect(html).toContain('编排不可用，请查看原因')
    expect(html).toContain('one tool available')
    expect(html).toContain('未执行连通性检查')
    expect(html).toContain('2 个')
    expect(html).not.toMatch(/api[_ -]?key/i)
  })

  it('uses a stable fallback for invalid detection timestamps', () => {
    expect(formatCapabilityTime(0)).toBe('未知')
    expect(formatCapabilityTime(Number.NaN)).toBe('未知')
  })
})
