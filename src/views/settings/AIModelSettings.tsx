import React, { useEffect, useMemo, useState } from 'react'
import { Trash2, Check, Loader2, Star, Pencil, X, RefreshCw, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsData } from '../../hooks/useSettingsData'
import type { AIConfig } from '../../services/settingsService'

const EMPTY_FORM: AIConfig = {
  name: '',
  base_url: '',
  model: '',
  api_key: '',
  is_default: false,
}

const INPUT_CLS =
  'w-full bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent-purple)] transition-colors'
const LABEL_CLS = 'block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5'

/**
 * AI 模型配置：列出、新增、编辑、删除、设为默认，并支持从接口拉取可用模型。
 * 全部接入已有 IPC：db-get-ai-configs / db-save-ai-config / db-delete-ai-config / ai-fetch-models。
 */
export function AIModelSettings() {
  const { aiConfigs, loadAIConfigs, saveAIConfig, deleteAIConfig, fetchModels } = useSettingsData()

  const [form, setForm] = useState<AIConfig>({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [modelFilter, setModelFilter] = useState('')
  const [fetchingModels, setFetchingModels] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    loadAIConfigs().catch(() => {})
  }, [loadAIConfigs])

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setModels([])
    setSelectedModels([])
    setModelFilter('')
    setError(null)
  }

  const startEdit = (cfg: AIConfig) => {
    setEditingId(cfg.id ?? null)
    setForm({
      id: cfg.id,
      name: cfg.name || '',
      base_url: cfg.base_url || '',
      model: cfg.model || '',
      api_key: cfg.api_key || '',
      is_default: !!cfg.is_default,
    })
    setModels(cfg.model ? [cfg.model] : [])
    setSelectedModels(cfg.model ? [cfg.model] : [])
    setModelFilter('')
    setError(null)
    setNotice(null)
  }

  const handleFetchModels = async () => {
    if (!form.base_url.trim()) {
      setError('请先填写 API 地址')
      return
    }
    if (!(form.api_key ?? '').trim()) {
      setError('请先填写 API Key')
      return
    }
    setFetchingModels(true)
    setError(null)
    setNotice(null)
    try {
      const list = await fetchModels(form.base_url.trim(), (form.api_key || '').trim())
      const arr = Array.isArray(list) ? list : []
      setModels(arr)
      setSelectedModels(form.model && arr.includes(form.model) ? [form.model] : [])
      if (arr.length === 0) {
        setError('未获取到模型列表，可手动填写模型名')
      } else {
        setNotice(`获取到 ${arr.length} 个模型`)
        if (!form.model) setForm((f) => ({ ...f, model: arr[0] }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取模型列表失败')
    } finally {
      setFetchingModels(false)
    }
  }

  const filteredModels = useMemo(() => {
    const query = modelFilter.trim().toLowerCase()
    if (!query) return models
    return models.filter((model) => model.toLowerCase().includes(query))
  }, [modelFilter, models])

  const existingModelsForProvider = useMemo(() => {
    const baseUrl = form.base_url.trim()
    return new Set(
      aiConfigs
        .filter((cfg) => cfg.base_url.trim() === baseUrl && cfg.id !== editingId)
        .map((cfg) => cfg.model.trim()),
    )
  }, [aiConfigs, editingId, form.base_url])

  const selectedNewModels = useMemo(
    () =>
      selectedModels
        .map((model) => model.trim())
        .filter((model) => model && !existingModelsForProvider.has(model)),
    [existingModelsForProvider, selectedModels],
  )

  const toggleModelSelection = (model: string) => {
    setSelectedModels((current) => {
      const exists = current.includes(model)
      const next = exists ? current.filter((item) => item !== model) : [...current, model]
      setForm((f) => ({ ...f, model: next[0] ?? f.model }))
      return next
    })
  }

  const selectVisibleModels = () => {
    setSelectedModels((current) => {
      const next = Array.from(new Set([...current, ...filteredModels]))
      setForm((f) => ({ ...f, model: next[0] ?? f.model }))
      return next
    })
  }

  const clearSelectedModels = () => {
    setSelectedModels([])
  }

  const canSave = Boolean(
    form.name.trim() &&
    form.base_url.trim() &&
    (editingId != null || (form.api_key ?? '').trim()) &&
    !saving &&
    (editingId != null
      ? form.model.trim()
      : models.length > 0
        ? selectedNewModels.length > 0
        : form.model.trim()),
  )

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const baseName = form.name.trim()
      const baseUrl = form.base_url.trim()
      const apiKey = (form.api_key || '').trim()

      if (editingId != null) {
        await saveAIConfig({
          ...form,
          name: baseName,
          base_url: baseUrl,
          model: form.model.trim(),
          api_key: apiKey,
        })
        setNotice('已更新模型配置')
      } else if (models.length > 0) {
        const skipped = selectedModels.length - selectedNewModels.length
        for (const [index, model] of selectedNewModels.entries()) {
          await saveAIConfig({
            ...form,
            name: selectedNewModels.length > 1 ? `${baseName} · ${model}` : baseName,
            base_url: baseUrl,
            model,
            api_key: apiKey,
            is_default: !!form.is_default && index === 0,
          })
        }
        setNotice(
          `已添加 ${selectedNewModels.length} 个模型${skipped > 0 ? `，跳过 ${skipped} 个重复模型` : ''}`,
        )
      } else {
        await saveAIConfig({
          ...form,
          name: baseName,
          base_url: baseUrl,
          model: form.model.trim(),
          api_key: apiKey,
        })
        setNotice('已添加模型配置')
      }
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSetDefault = async (cfg: AIConfig) => {
    setError(null)
    try {
      await saveAIConfig({ ...cfg, is_default: true })
      setNotice(`已将「${cfg.name}」设为默认模型`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置默认失败')
    }
  }

  const handleDelete = async (cfg: AIConfig) => {
    if (cfg.id == null) return
    if (!window.confirm(`确定删除模型配置「${cfg.name}」？`)) return
    setError(null)
    try {
      await deleteAIConfig(cfg.id)
      if (editingId === cfg.id) resetForm()
      setNotice('已删除模型配置')
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <>
      {/* 已配置模型列表 */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="font-semibold text-white text-[15px]">AI 模型配置</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            配置用于 AI Tutor、代码解释、错题复盘的大模型接口（兼容 OpenAI 格式）
          </p>
        </div>

        {aiConfigs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-accent-purple)]/10 flex items-center justify-center mb-3">
              <Server size={22} className="text-[var(--color-accent-purple)]" />
            </div>
            <p className="text-sm font-medium text-white mb-1">尚未配置任何模型</p>
            <p className="text-xs text-[var(--color-text-muted)] max-w-xs">
              在下方填写 API 地址与密钥，添加第一个模型后即可在右上角切换使用。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {aiConfigs.map((cfg) => (
              <div
                key={cfg.id ?? cfg.name}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)]"
              >
                <div className="w-9 h-9 rounded-lg bg-[var(--color-accent-purple)]/10 flex items-center justify-center shrink-0">
                  <Server size={18} className="text-[var(--color-accent-purple)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{cfg.name}</p>
                    {cfg.is_default && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] font-medium shrink-0">
                        默认
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">
                    {cfg.model} · {cfg.base_url}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!cfg.is_default && (
                    <button
                      onClick={() => handleSetDefault(cfg)}
                      title="设为默认"
                      className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[#10B981] hover:bg-[var(--color-bg-hover)] transition-colors"
                    >
                      <Star size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(cfg)}
                    title="编辑"
                    className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(cfg)}
                    title="删除"
                    className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[#EF4444] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增 / 编辑表单 */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-[15px]">
            {editingId != null ? '编辑模型' : '添加模型'}
          </h3>
          {editingId != null && (
            <button
              onClick={resetForm}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center gap-1 transition-colors"
            >
              <X size={13} /> 取消编辑
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className={LABEL_CLS}>名称</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：OpenAI GPT-4o / DeepSeek Chat"
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className={LABEL_CLS}>API 地址 (Base URL)</label>
            <input
              value={form.base_url}
              onChange={(e) => {
                setForm((f) => ({ ...f, base_url: e.target.value }))
                setModels([])
                setSelectedModels([])
                setModelFilter('')
              }}
              placeholder="https://api.openai.com/v1"
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className={LABEL_CLS}>API Key</label>
            <input
              type="password"
              value={form.api_key ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              placeholder={editingId != null ? '留空表示不修改' : 'sk-...'}
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className={LABEL_CLS}>模型</label>
            <div className="flex gap-2">
              {models.length > 0 && editingId != null ? (
                <select
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  className={cn(INPUT_CLS, 'flex-1 appearance-none')}
                >
                  {form.model && !models.includes(form.model) && (
                    <option value={form.model}>{form.model}</option>
                  )}
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : models.length > 0 ? (
                <input
                  value={selectedModels.length > 0 ? `已选择 ${selectedModels.length} 个模型` : ''}
                  readOnly
                  placeholder="从下方列表选择一个或多个模型"
                  className={cn(INPUT_CLS, 'flex-1')}
                />
              ) : (
                <input
                  value={form.model}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, model: e.target.value }))
                    setSelectedModels([])
                  }}
                  placeholder="如：gpt-4o-mini"
                  className={cn(INPUT_CLS, 'flex-1')}
                />
              )}
              <button
                onClick={handleFetchModels}
                disabled={fetchingModels}
                className="px-3 py-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-purple)] transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {fetchingModels ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                获取
              </button>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
              填写地址与密钥后点"获取"自动拉取可用模型；添加模式可一次选择多个模型。
            </p>

            {models.length > 0 && editingId == null && (
              <div className="mt-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <input
                    value={modelFilter}
                    onChange={(e) => setModelFilter(e.target.value)}
                    placeholder="筛选模型..."
                    className={cn(INPUT_CLS, 'sm:max-w-xs')}
                  />
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectVisibleModels}
                      className="rounded-md border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                    >
                      选择当前列表
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedModels}
                      className="rounded-md border border-[var(--color-border-subtle)] px-2.5 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="mt-3 max-h-52 space-y-1 overflow-y-auto pr-1">
                  {filteredModels.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-[var(--color-text-muted)]">
                      没有匹配的模型
                    </p>
                  ) : (
                    filteredModels.map((model) => {
                      const duplicate = existingModelsForProvider.has(model)
                      const checked = selectedModels.includes(model)
                      return (
                        <label
                          key={model}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                            duplicate
                              ? 'cursor-not-allowed opacity-50'
                              : checked
                                ? 'settings-soft-selected bg-[var(--color-accent-purple)]/12 text-[var(--color-text-primary)]'
                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={duplicate}
                            onChange={() => toggleModelSelection(model)}
                            className="h-4 w-4 accent-[var(--color-accent-purple)]"
                          />
                          <span className="min-w-0 flex-1 truncate">{model}</span>
                          {duplicate && (
                            <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
                              已添加
                            </span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>

                <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                  已选择 {selectedModels.length} 个，可新增 {selectedNewModels.length} 个。
                </p>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
              className="w-4 h-4 accent-[var(--color-accent-purple)]"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">设为默认模型</span>
          </label>

          {error && <p className="text-xs text-[#EF4444]">{error}</p>}
          {notice && <p className="text-xs text-[#10B981]">{notice}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="bg-[var(--color-accent-purple)] hover:bg-[#7C3AED] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {editingId != null ? '更新' : '添加'}
            </button>
            {editingId == null && (form.name || form.base_url || form.model) && (
              <button
                onClick={resetForm}
                className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                清空
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
