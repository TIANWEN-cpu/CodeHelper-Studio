import { useEffect, useState, useCallback } from 'react'
import { Download, Upload, RefreshCw, CheckCircle, AlertCircle, FileJson } from 'lucide-react'
import { typedInvoke } from '../../api/ipc'
import { useToast } from '../../components/Toast'

type ExportCategory =
  | 'problems'
  | 'submissions'
  | 'mistakes'
  | 'chat_sessions'
  | 'chat_history'
  | 'knowledge_docs'
  | 'knowledge_chunks'
  | 'settings'
  | 'memories'
  | 'prompt_presets'

type ConflictResolution = 'skip' | 'merge' | 'overwrite'

const CATEGORY_LABELS: Record<ExportCategory, string> = {
  problems: '题目',
  submissions: '提交记录',
  mistakes: '错题记录',
  chat_sessions: '对话会话',
  chat_history: '对话历史',
  knowledge_docs: '知识文档',
  knowledge_chunks: '知识分块',
  settings: '设置项',
  memories: '长期记忆',
  prompt_presets: '预设提示词',
}

interface ImportResult {
  success: boolean
  imported: Record<string, number>
  skipped: Record<string, number>
  errors: string[]
}

export function ExportImport() {
  const toast = useToast()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Set<ExportCategory>>(
    new Set(Object.keys(CATEGORY_LABELS) as ExportCategory[]),
  )
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution>('skip')
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const loadCounts = useCallback(async () => {
    try {
      const data = await typedInvoke('export-get-counts' as never)
      setCounts(data as Record<string, number>)
    } catch (err) {
      console.error('[ExportImport.loadCounts]', err)
    }
  }, [])

  useEffect(() => {
    void loadCounts()
  }, [loadCounts])

  const toggleCategory = (cat: ExportCategory) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(Object.keys(CATEGORY_LABELS) as ExportCategory[]))
  }

  const selectNone = () => {
    setSelected(new Set())
  }

  const handleExport = async () => {
    if (selected.size === 0) {
      toast('error', '请至少选择一个数据类别')
      return
    }

    setExporting(true)
    try {
      const result = (await typedInvoke('export-data' as never, [...selected])) as {
        success: boolean
        filePath?: string
        error?: string
      }

      if (result.success) {
        toast('success', `导出成功: ${result.filePath}`)
      } else if (result.error !== '用户取消') {
        toast('error', `导出失败: ${result.error}`)
      }
    } catch (err) {
      toast('error', `导出失败: ${String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setImportResult(null)
    try {
      const result = (await typedInvoke('import-data' as never, {
        conflictResolution,
        selectedData: [...selected],
      })) as ImportResult

      setImportResult(result)

      if (result.success) {
        const totalImported = Object.values(result.imported).reduce((a, b) => a + b, 0)
        toast('success', `导入成功: 共导入 ${totalImported} 条记录`)
        void loadCounts()
      } else {
        toast('error', `导入失败: ${result.errors[0] ?? '未知错误'}`)
      }
    } catch (err) {
      toast('error', `导入失败: ${String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  const totalSelected = Object.entries(counts)
    .filter(([key]) => selected.has(key as ExportCategory))
    .reduce((sum, [, count]) => sum + count, 0)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <FileJson size={16} className="text-[var(--theme-accent)]" />
          <h2 className="ui-section-title text-lg">数据导出 / 导入</h2>
        </div>
        <p className="mt-2 text-sm leading-7 text-[var(--theme-text-muted)]">
          选择要导出或导入的数据类别，支持全量和选择性操作。导入时可选择冲突处理策略。
        </p>
      </div>

      {/* Data categories */}
      <div className="ui-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--theme-text-primary)]">数据类别</div>
          <div className="flex gap-2">
            <button onClick={selectAll} className="ui-btn-ghost px-3 py-1 text-xs">
              全选
            </button>
            <button onClick={selectNone} className="ui-btn-ghost px-3 py-1 text-xs">
              全不选
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(CATEGORY_LABELS) as ExportCategory[]).map((cat) => (
            <label
              key={cat}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                selected.has(cat)
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10 text-[var(--theme-text-primary)]'
                  : 'border-[var(--theme-border)] bg-transparent text-[var(--theme-text-muted)] hover:border-[var(--theme-text-muted)]'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(cat)}
                onChange={() => toggleCategory(cat)}
                className="accent-[var(--theme-accent)]"
              />
              <div className="flex-1">
                <div className="font-medium">{CATEGORY_LABELS[cat]}</div>
                <div className="mt-0.5 text-xs opacity-70">
                  {counts[cat] !== undefined ? `${counts[cat]} 条记录` : '...'}
                </div>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-3 text-xs text-[var(--theme-text-muted)]">
          已选 {selected.size} 个类别, 共 {totalSelected} 条记录
        </div>
      </div>

      {/* Conflict resolution for import */}
      <div className="ui-card p-5">
        <div className="mb-3 text-sm font-medium text-[var(--theme-text-primary)]">
          导入冲突策略
        </div>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { value: 'skip', label: '跳过', desc: '已存在的记录将被忽略' },
              { value: 'merge', label: '合并', desc: '已存在的记录将被更新' },
              { value: 'overwrite', label: '覆盖', desc: '已存在的记录将被替换' },
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                conflictResolution === opt.value
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10'
                  : 'border-[var(--theme-border)] hover:border-[var(--theme-text-muted)]'
              }`}
            >
              <input
                type="radio"
                name="conflict"
                value={opt.value}
                checked={conflictResolution === opt.value}
                onChange={() => setConflictResolution(opt.value)}
                className="mt-0.5 accent-[var(--theme-accent)]"
              />
              <div>
                <div className="font-medium text-[var(--theme-text-primary)]">{opt.label}</div>
                <div className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void handleExport()}
          disabled={exporting || selected.size === 0}
          className="ui-btn-accent flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
          {exporting ? '导出中...' : '导出数据'}
        </button>
        <button
          onClick={() => void handleImport()}
          disabled={importing}
          className="ui-btn-secondary flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
          {importing ? '导入中...' : '导入数据'}
        </button>
        <button
          onClick={() => void loadCounts()}
          className="ui-btn-ghost flex items-center gap-2 px-4 py-2.5 text-sm"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      {/* Import result */}
      {importResult && (
        <div
          className={`ui-card p-5 ${
            importResult.success ? 'border-[var(--theme-success)]' : 'border-[var(--theme-danger)]'
          }`}
        >
          <div className="flex items-center gap-2">
            {importResult.success ? (
              <CheckCircle size={16} className="text-[var(--theme-success)]" />
            ) : (
              <AlertCircle size={16} className="text-[var(--theme-danger)]" />
            )}
            <span className="text-sm font-medium text-[var(--theme-text-primary)]">
              {importResult.success ? '导入完成' : '导入失败'}
            </span>
          </div>

          {Object.keys(importResult.imported).length > 0 && (
            <div className="mt-3 space-y-1">
              {Object.entries(importResult.imported).map(([cat, count]) => (
                <div key={cat} className="text-sm text-[var(--theme-text-secondary)]">
                  {(CATEGORY_LABELS as Record<string, string>)[cat] ?? cat}: 导入 {count} 条
                  {importResult.skipped[cat] ? `, 跳过 ${importResult.skipped[cat]} 条` : ''}
                </div>
              ))}
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="mt-3 space-y-1">
              {importResult.errors.slice(0, 10).map((err, i) => (
                <div key={i} className="text-xs text-[var(--theme-danger)]">
                  {err}
                </div>
              ))}
              {importResult.errors.length > 10 && (
                <div className="text-xs text-[var(--theme-text-muted)]">
                  ... 还有 {importResult.errors.length - 10} 个错误
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
