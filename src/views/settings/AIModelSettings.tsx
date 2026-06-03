import React, { useEffect, useState } from 'react'
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
    setError(null)
    setNotice(null)
  }

  const handleFetchModels = async () => {
    if (!form.base_url.trim()) {
      setError('请先填写 API 地址')
      return
    }
    setFetchingModels(true)
    setError(null)
    setNotice(null)
    try {
      const list = await fetchModels(form.base_url.trim(), (form.api_key || '').trim())
      const arr = Array.isArray(list) ? list : []
      setModels(arr)
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

  const canSave = Boolean(form.name.trim() && form.base_url.trim() && form.model.trim() && !saving)

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await saveAIConfig({
        ...form,
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        model: form.model.trim(),
        api_key: (form.api_key || '').trim() || undefined,
      })
      setNotice(editingId != null ? '已更新模型配置' : '已添加模型配置')
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
                    className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-bg-hover)] transition-colors"
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
              className="text-xs text-[var(--color-text-muted)] hover:text-white flex items-center gap-1 transition-colors"
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
              onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
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
              {models.length > 0 ? (
                <select
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  className={cn(INPUT_CLS, 'flex-1 appearance-none')}
                >
                  {form.model && !models.includes(form.model) && (
                    <option value={form.model}>{form.model}</option>
                  )}
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="如：gpt-4o-mini"
                  className={cn(INPUT_CLS, 'flex-1')}
                />
              )}
              <button
                onClick={handleFetchModels}
                disabled={fetchingModels}
                className="px-3 py-2 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-panel)] text-sm text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-accent-purple)] transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
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
              填写地址与密钥后点"获取"自动拉取可用模型；也可手动输入模型名。
            </p>
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
                className="text-sm text-[var(--color-text-muted)] hover:text-white transition-colors"
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
