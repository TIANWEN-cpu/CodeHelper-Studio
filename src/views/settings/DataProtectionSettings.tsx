import React from 'react'
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { exportData, importData } from '../../services/settingsService'
import {
  createDatabaseBackup,
  exportRecoveryLayer,
  listDatabaseBackups,
  openDatabaseBackupDirectory,
} from '../../services/maintenanceService'
import type {
  DatabaseBackupListResult,
  DatabaseBackupRecord,
  PortableImportResult,
  RecoveryLayerEntry,
} from '../../shared/maintenanceContract'

type ActionStatus =
  | { kind: 'idle'; message: '' }
  | { kind: 'loading' | 'success' | 'error'; message: string }

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function backupKindLabel(kind: DatabaseBackupRecord['kind']): string {
  if (kind === 'manual') return '手动完整备份'
  if (kind === 'pre-import') return '导入前自动备份'
  return '迁移前自动备份'
}

function countImportRows(counts: PortableImportResult['imported']): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

function readRecoveryLayerEntries(): RecoveryLayerEntry[] {
  const entries: RecoveryLayerEntry[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (
      !key ||
      !key.startsWith('codehelper-') ||
      (!key.includes('.migration-backup.') && !key.includes('.corrupt.'))
    ) {
      continue
    }
    const value = window.localStorage.getItem(key)
    if (value !== null) entries.push({ key, value })
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key))
}

function StatusMessage({ status }: { status: ActionStatus }) {
  if (status.kind === 'idle') return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 border px-3 py-2 text-xs',
        status.kind === 'error'
          ? 'border-red-500/40 bg-red-500/10 text-red-200'
          : status.kind === 'success'
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
            : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)]',
      )}
    >
      {status.kind === 'loading' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : status.kind === 'success' ? (
        <Check size={14} />
      ) : (
        <AlertTriangle size={14} />
      )}
      <span className="min-w-0 break-words">{status.message}</span>
    </div>
  )
}

export function DataProtectionSettings() {
  const [backups, setBackups] = React.useState<DatabaseBackupListResult | null>(null)
  const [recoveryEntries, setRecoveryEntries] = React.useState<RecoveryLayerEntry[]>(() =>
    readRecoveryLayerEntries(),
  )
  const [backupStatus, setBackupStatus] = React.useState<ActionStatus>({
    kind: 'idle',
    message: '',
  })
  const [portableStatus, setPortableStatus] = React.useState<ActionStatus>({
    kind: 'idle',
    message: '',
  })
  const [recoveryStatus, setRecoveryStatus] = React.useState<ActionStatus>({
    kind: 'idle',
    message: '',
  })
  const [confirmImport, setConfirmImport] = React.useState(false)

  const refreshBackups = React.useCallback(async () => {
    const result = await listDatabaseBackups()
    setBackups(result)
    return result
  }, [])

  React.useEffect(() => {
    void refreshBackups().catch((error) => {
      setBackupStatus({ kind: 'error', message: errorMessage(error, '读取备份列表失败') })
    })
  }, [refreshBackups])

  const handleCreateBackup = async () => {
    setBackupStatus({ kind: 'loading', message: '正在保存所有窗口并创建完整数据库备份...' })
    try {
      const result = await createDatabaseBackup()
      const successMessage = `备份已验证：${result.backup?.filePath ?? ''}`
      try {
        await refreshBackups()
        setBackupStatus({ kind: 'success', message: successMessage })
      } catch (refreshError) {
        setBackupStatus({
          kind: 'success',
          message: `${successMessage}；但列表刷新失败：${errorMessage(refreshError, '未知错误')}`,
        })
      }
    } catch (error) {
      setBackupStatus({ kind: 'error', message: errorMessage(error, '创建数据库备份失败') })
    }
  }

  const handleOpenDirectory = async () => {
    try {
      await openDatabaseBackupDirectory()
    } catch (error) {
      setBackupStatus({ kind: 'error', message: errorMessage(error, '无法打开备份目录') })
    }
  }

  const handlePortableExport = async () => {
    setPortableStatus({ kind: 'loading', message: '正在导出便携数据子集...' })
    try {
      const result = await exportData()
      setPortableStatus({
        kind: 'success',
        message: `便携数据已导出：${result.filePath ?? ''}`,
      })
    } catch (error) {
      setPortableStatus({ kind: 'error', message: errorMessage(error, '导出便携数据失败') })
    }
  }

  const handlePortableImport = async () => {
    if (!confirmImport) {
      setConfirmImport(true)
      setPortableStatus({
        kind: 'error',
        message: '再次点击“确认导入”后选择文件。导入前会自动创建完整数据库备份。',
      })
      return
    }
    setConfirmImport(false)
    setPortableStatus({ kind: 'loading', message: '正在验证文件并创建导入前备份...' })
    try {
      const result = await importData()
      const imported = countImportRows(result.imported)
      const skipped = countImportRows(result.skipped)
      setPortableStatus({
        kind: 'success',
        message: `导入已提交：写入 ${imported} 条，跳过 ${skipped} 条。导入前备份：${result.backup?.filePath ?? '已创建'}。所有窗口即将重新加载。`,
      })
    } catch (error) {
      setPortableStatus({ kind: 'error', message: errorMessage(error, '导入便携数据失败') })
    }
  }

  const handleRefreshRecovery = () => {
    setRecoveryEntries(readRecoveryLayerEntries())
    setRecoveryStatus({ kind: 'idle', message: '' })
  }

  const handleExportRecovery = async () => {
    setRecoveryStatus({ kind: 'loading', message: '正在导出诊断恢复层...' })
    try {
      const result = await exportRecoveryLayer(recoveryEntries)
      setRecoveryStatus({
        kind: 'success',
        message: `已导出 ${result.entryCount ?? recoveryEntries.length} 项：${result.filePath ?? ''}`,
      })
    } catch (error) {
      setRecoveryStatus({ kind: 'error', message: errorMessage(error, '导出恢复层失败') })
    }
  }

  return (
    <div className="space-y-6 pb-4" data-testid="data-protection-settings">
      <section className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Database className="mt-0.5 shrink-0 text-[var(--color-accent-purple)]" size={20} />
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                完整数据库备份
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                包含全部已提交的 SQLite 数据。创建前会请求所有窗口完成持久化，并验证 quick_check 与
                SHA-256。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleOpenDirectory()}
              title="打开备份目录"
              className="flex h-9 w-9 items-center justify-center border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              <FolderOpen size={17} />
            </button>
            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              disabled={backupStatus.kind === 'loading'}
              className="flex h-9 items-center gap-2 bg-[var(--color-accent-secondary-solid)] px-3 text-sm font-medium text-[var(--color-on-accent)] disabled:opacity-60"
            >
              {backupStatus.kind === 'loading' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ShieldCheck size={16} />
              )}
              创建备份
            </button>
          </div>
        </div>

        <div className="mt-4">
          <StatusMessage status={backupStatus} />
        </div>
        {backups?.warnings.map((warning) => (
          <p key={warning} className="mt-2 text-xs text-amber-300">
            {warning}
          </p>
        ))}

        <div className="mt-4 divide-y divide-[var(--color-border-subtle)] border-y border-[var(--color-border-subtle)]">
          {backups === null ? (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">备份列表尚未成功读取。</p>
          ) : backups.backups.length === 0 ? (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">尚无已登记的数据库备份。</p>
          ) : (
            backups.backups.map((backup) => (
              <div
                key={backup.id}
                className="grid gap-2 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto]"
                data-testid="database-backup-record"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--color-text-primary)]">
                      {backupKindLabel(backup.kind)}
                    </span>
                    <span
                      className={cn(
                        'border px-1.5 py-0.5',
                        backup.integrity === 'ok'
                          ? 'border-emerald-500/40 text-emerald-300'
                          : 'border-red-500/40 text-red-300',
                      )}
                    >
                      {backup.integrity === 'ok' ? '完整性通过' : '完整性失败'}
                    </span>
                  </div>
                  <p
                    className="mt-1 truncate text-[var(--color-text-muted)]"
                    title={backup.filePath}
                  >
                    {backup.filePath}
                  </p>
                  <p
                    className="mt-1 truncate font-mono text-[var(--color-text-muted)]"
                    title={backup.sha256}
                  >
                    SHA-256 {backup.sha256}
                  </p>
                </div>
                <div className="text-left text-[var(--color-text-muted)] sm:text-right">
                  <p>{new Date(backup.createdAt).toLocaleString()}</p>
                  <p className="mt-1">{formatBytes(backup.sizeBytes)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-5">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 shrink-0 text-sky-300" size={20} />
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
              便携数据子集
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
              JSON
              仅用于跨设备迁移题目、提交、错题、对话、知识、设置、记忆与提示词。它不包含工作区、练习草稿、课程进度、Agent
              审计或 AI 密钥。
            </p>
          </div>
        </div>
        <div className="mt-4">
          <StatusMessage status={portableStatus} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handlePortableExport()}
            disabled={portableStatus.kind === 'loading'}
            className="flex h-9 items-center gap-2 border border-[var(--color-border-subtle)] px-3 text-sm text-[var(--color-text-primary)] disabled:opacity-60"
          >
            <Download size={16} />
            导出 JSON
          </button>
          <button
            type="button"
            onClick={() => void handlePortableImport()}
            disabled={portableStatus.kind === 'loading'}
            className={cn(
              'flex h-9 items-center gap-2 border px-3 text-sm disabled:opacity-60',
              confirmImport
                ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
                : 'border-[var(--color-border-subtle)] text-[var(--color-text-primary)]',
            )}
          >
            <Upload size={16} />
            {confirmImport ? '确认导入' : '导入 JSON'}
          </button>
        </div>
      </section>

      <section className="border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={20} />
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
                临时恢复层
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                migration/corrupt
                项只用于诊断和异常恢复，不属于完整数据库备份，也不会在此自动删除或恢复。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefreshRecovery}
            title="刷新恢复层列表"
            className="flex h-9 w-9 items-center justify-center border border-[var(--color-border-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="mt-4">
          <StatusMessage status={recoveryStatus} />
        </div>
        <div className="mt-4 divide-y divide-[var(--color-border-subtle)] border-y border-[var(--color-border-subtle)]">
          {recoveryEntries.length === 0 ? (
            <p className="py-4 text-sm text-[var(--color-text-muted)]">
              当前没有迁移或损坏恢复项。
            </p>
          ) : (
            recoveryEntries.map((entry) => (
              <div key={entry.key} className="flex items-center justify-between gap-4 py-2 text-xs">
                <span className="min-w-0 truncate font-mono text-[var(--color-text-secondary)]">
                  {entry.key}
                </span>
                <span className="shrink-0 text-[var(--color-text-muted)]">
                  {formatBytes(new Blob([entry.value]).size)}
                </span>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleExportRecovery()}
          disabled={recoveryEntries.length === 0 || recoveryStatus.kind === 'loading'}
          className="mt-4 flex h-9 items-center gap-2 border border-[var(--color-border-subtle)] px-3 text-sm text-[var(--color-text-primary)] disabled:opacity-50"
        >
          <Download size={16} />
          导出诊断副本
        </button>
      </section>
    </div>
  )
}
