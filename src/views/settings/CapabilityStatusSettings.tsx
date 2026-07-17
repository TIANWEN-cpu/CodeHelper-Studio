import type { ComponentType } from 'react'
import {
  Activity,
  Bot,
  Box,
  BrainCircuit,
  Database,
  Loader2,
  RefreshCw,
  ServerCog,
  Terminal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCapabilityStatus } from '../../hooks/useCapabilityStatus'
import type { CapabilityState, SystemCapabilityStatus } from '../../shared/capabilityStatusContract'

const STATE_LABELS: Record<CapabilityState, string> = {
  ready: '可用',
  degraded: '降级',
  unavailable: '不可用',
  unknown: '未验证',
}

const STATE_STYLES: Record<CapabilityState, string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  unavailable: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  unknown:
    'border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-muted)]',
}

const SECTION_CLASS =
  'rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-4'

export interface CapabilityStatusSettingsProps {
  status?: SystemCapabilityStatus | null
  loading?: boolean
  error?: string | null
  onRefresh?: () => void | Promise<void>
}

export function formatCapabilityTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未知'
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function StateBadge({ state, label }: { state: CapabilityState; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        STATE_STYLES[state],
      )}
    >
      {label ?? STATE_LABELS[state]}
    </span>
  )
}

function CapabilitySection({
  icon: Icon,
  title,
  state,
  testId,
  children,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  state: CapabilityState
  testId: string
  children: React.ReactNode
}) {
  return (
    <section className={SECTION_CLASS} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
          <Icon size={16} className="shrink-0 text-[var(--color-accent-purple)]" />
          <span className="truncate">{title}</span>
        </h3>
        <StateBadge state={state} />
      </div>
      {children}
    </section>
  )
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-1 text-xs">
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <span className="min-w-0 break-words text-right text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  )
}

export function CapabilityStatusSettings({
  status: statusProp,
  loading: loadingProp,
  error: errorProp,
  onRefresh,
}: CapabilityStatusSettingsProps = {}) {
  const live = useCapabilityStatus()
  const status = statusProp === undefined ? live.status : statusProp
  const loading = loadingProp ?? (statusProp === undefined ? live.loading : false)
  const error = errorProp === undefined ? live.error : errorProp
  const refresh = onRefresh ?? (() => live.refresh(true))

  return (
    <div className="space-y-4" data-testid="capability-status-settings">
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">系统能力状态</h2>
          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
            {status ? `最近检测：${formatCapabilityTime(status.generatedAt)}` : '尚未完成检测'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-muted)] transition-colors hover:text-white disabled:cursor-wait disabled:opacity-60"
          aria-label="刷新系统能力状态"
          title="刷新系统能力状态"
          data-testid="capability-refresh"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!status ? (
        <div className={cn(SECTION_CLASS, 'flex min-h-28 items-center justify-center')}>
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            {loading && <Loader2 size={16} className="animate-spin" />}
            <span>{loading ? '正在检测系统能力' : '能力状态不可用'}</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <CapabilitySection
            icon={ServerCog}
            title="应用运行时"
            state={status.runtime.state}
            testId="capability-runtime"
          >
            <DetailLine
              label="运行模式"
              value={status.runtime.isPackaged ? '已打包应用' : '开发模式'}
            />
            <DetailLine label="应用版本" value={status.runtime.appVersion || '未知'} />
            <DetailLine
              label="平台"
              value={`${status.runtime.platform} ${status.runtime.arch} · ${status.runtime.osVersion}`}
            />
            <DetailLine
              label="运行环境"
              value={`Electron ${status.runtime.electronVersion || '?'} · Node ${status.runtime.nodeVersion || '?'}`}
            />
            <DetailLine label="应用内更新" value="未接入（仅生成更新元数据）" />
          </CapabilitySection>

          <CapabilitySection
            icon={Database}
            title="SQLite 与迁移"
            state={status.database.state}
            testId="capability-database"
          >
            <DetailLine
              label="完整性"
              value={
                <StateBadge
                  state={
                    status.database.quickCheck === 'ok'
                      ? 'ready'
                      : status.database.quickCheck === 'failed'
                        ? 'degraded'
                        : 'unavailable'
                  }
                  label={
                    status.database.quickCheck === 'ok'
                      ? 'quick_check: ok'
                      : status.database.quickCheck
                  }
                />
              }
            />
            <DetailLine
              label="应用 schema"
              value={status.database.applicationSchemaVersion ?? '未登记'}
            />
            <DetailLine
              label="组件迁移"
              value={
                status.database.schemaVersions.length > 0
                  ? status.database.schemaVersions
                      .map((item) => `${item.component} v${item.version}`)
                      .join(' · ')
                  : '无记录'
              }
            />
            <DetailLine
              label="完整备份"
              value={
                status.database.backups.backupCount === null
                  ? status.database.backups.reason
                  : `${status.database.backups.backupCount} 份`
              }
            />
          </CapabilitySection>

          <CapabilitySection
            icon={Terminal}
            title="本地受控执行"
            state={status.execution.state}
            testId="capability-execution"
          >
            <p className="mb-2 text-xs leading-5 text-[var(--color-text-muted)]">
              {status.execution.localControlledBoundary}
            </p>
            <DetailLine
              label="运行宿主"
              value={
                status.execution.localControlledAvailable
                  ? status.execution.windowsJobHostRequired
                    ? 'utility + Windows Job Host'
                    : 'utility（POSIX best-effort）'
                  : status.execution.reason
              }
            />
            <div className="flex flex-wrap gap-1.5">
              {status.execution.toolchains.length > 0 ? (
                status.execution.toolchains.map((tool) => (
                  <span
                    key={tool.id}
                    title={tool.message}
                    className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] px-2 text-xs text-[var(--color-text-primary)]"
                  >
                    {tool.id}
                    <span
                      className={cn(
                        tool.status === 'ready'
                          ? 'text-emerald-300'
                          : tool.status === 'degraded'
                            ? 'text-amber-300'
                            : 'text-rose-300',
                      )}
                    >
                      {tool.version || tool.status}
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">未取得工具链报告</span>
              )}
            </div>
          </CapabilitySection>

          <CapabilitySection
            icon={Box}
            title="Docker 强隔离"
            state={status.execution.strongIsolationAvailable ? 'ready' : 'unavailable'}
            testId="capability-isolation"
          >
            <DetailLine
              label="状态"
              value={
                status.execution.strongIsolationAvailable
                  ? '可用，运行请求保持 fail-closed'
                  : '不可用'
              }
            />
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
              {status.execution.strongIsolationReason}
            </p>
          </CapabilitySection>

          <CapabilitySection
            icon={BrainCircuit}
            title="混合知识检索"
            state={status.knowledge.state}
            testId="capability-knowledge"
          >
            <DetailLine label="检索模式" value={status.knowledge.mode} />
            <DetailLine
              label="后端"
              value={`${status.knowledge.lexicalBackend} · ${status.knowledge.semanticBackend}`}
            />
            <DetailLine
              label="索引规模"
              value={`${status.knowledge.documentCount} 文档 · ${status.knowledge.chunkCount} 片段`}
            />
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
              {status.knowledge.reason}
            </p>
          </CapabilitySection>

          <CapabilitySection
            icon={Bot}
            title="Agent 工具链"
            state={status.agent.state}
            testId="capability-agent"
          >
            <DetailLine
              label="白名单"
              value={`${status.agent.enabledToolCount}/${status.agent.tools.length} 可用`}
            />
            <DetailLine
              label="逐次审批"
              value={`${status.agent.approvalRequiredToolCount} 个工具`}
            />
            <DetailLine
              label="模型编排"
              value={
                status.agent.orchestratorState === 'ready'
                  ? 'Provider 已配置'
                  : status.ai.configured
                    ? '编排不可用，请查看原因'
                    : 'Provider 未配置'
              }
            />
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
              {status.agent.reason}
            </p>
            <div className="mt-2 space-y-1.5">
              {status.agent.tools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex min-w-0 items-center justify-between gap-3 text-xs"
                >
                  <span className="truncate text-[var(--color-text-primary)]" title={tool.boundary}>
                    {tool.label}
                  </span>
                  <StateBadge
                    state={tool.availability === 'unavailable' ? 'unavailable' : 'ready'}
                    label={
                      tool.availability === 'unavailable'
                        ? STATE_LABELS.unavailable
                        : tool.approvalRequired
                          ? '需审批'
                          : STATE_LABELS.ready
                    }
                  />
                </div>
              ))}
            </div>
          </CapabilitySection>

          <CapabilitySection
            icon={Activity}
            title="AI Provider 配置"
            state={status.ai.state}
            testId="capability-ai"
          >
            <DetailLine label="有效配置" value={`${status.ai.configurationCount} 个`} />
            <DetailLine label="连通性" value="未执行连通性检查" />
            <DetailLine
              label="凭据存储"
              value={status.ai.credentialStorage === 'ready' ? '操作系统安全存储可用' : '不可用'}
            />
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
              {status.ai.reason}
            </p>
          </CapabilitySection>
        </div>
      )}
    </div>
  )
}
