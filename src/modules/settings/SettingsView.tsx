import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  ClipboardPaste,
  MessageSquare,
  Brain,
  Sparkles,
} from 'lucide-react'
import { useSettingsStore, type AIConfig } from '../../stores/settingsStore'
import { useChatStore, type MemoryItem } from '../../stores/chatStore'
import { useAppStore, type ThemeId } from '../../stores/appStore'
import { themeOptions } from '../../theme/themes'

const emptyConfig: AIConfig = {
  name: '',
  api_key: '',
  base_url: 'https://api.openai.com/v1',
  model: '',
  is_default: 0,
  task_type: null,
}

const memoryCategories = [
  { value: 'general', label: '通用' },
  { value: 'preference', label: '偏好' },
  { value: 'goal', label: '目标' },
  { value: 'constraint', label: '约束' },
  { value: 'fact', label: '事实' },
]

type SettingsTab = 'ai' | 'presets' | 'memories'

export function SettingsView() {
  const { aiConfigs, loadConfigs, saveConfig, deleteConfig } = useSettingsStore()
  const { presets, loadPresets, memories, loadMemories, saveMemory, deleteMemory } = useChatStore()
  const { theme, setTheme } = useAppStore()
  const [editing, setEditing] = useState<AIConfig | null>(null)
  const [modelList, setModelList] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [smartPaste, setSmartPaste] = useState('')
  const [editingPreset, setEditingPreset] = useState<{
    id?: number
    name: string
    prompt: string
  } | null>(null)
  const [editingMemory, setEditingMemory] = useState<
    (Partial<MemoryItem> & { content: string; category: string }) | null
  >(null)
  const [memorySearch, setMemorySearch] = useState('')
  const [tab, setTab] = useState<SettingsTab>('ai')

  useEffect(() => {
    void loadConfigs()
    void loadPresets()
    void loadMemories()
  }, [])

  const handleSmartPaste = () => {
    if (!smartPaste.trim()) {
      return
    }

    const text = smartPaste.trim()
    const updates: Partial<AIConfig> = {}

    const urlMatch = text.match(/(https?:\/\/[^\s,;]+)/i)
    if (urlMatch) {
      let url = urlMatch[1].replace(/\/+$/, '')
      if (!url.endsWith('/v1')) {
        url += '/v1'
      }
      updates.base_url = url
    }

    const keyMatch = text.match(/(sk-[a-zA-Z0-9_-]{20,})/i) || text.match(/([a-zA-Z0-9_-]{32,})/i)
    if (keyMatch) {
      updates.api_key = keyMatch[1]
    }

    if (editing && (updates.base_url || updates.api_key)) {
      setEditing({ ...editing, ...updates })
      setSmartPaste('')
      return
    }

    if (!editing) {
      setEditing({ ...emptyConfig, ...updates })
      setSmartPaste('')
    }
  }

  const handleFetchModels = async () => {
    if (!editing?.api_key || !editing?.base_url) {
      return
    }

    setFetchingModels(true)
    setFetchError('')

    try {
      const models = (await window.api.invoke('ai-fetch-models', {
        api_key: editing.api_key,
        base_url: editing.base_url,
      })) as string[]
      setModelList(models)

      if (models.length > 0 && !editing.model) {
        setEditing({ ...editing, model: models[0] })
      }
    } catch (error: unknown) {
      setFetchError(String(error))
      setModelList([])
    } finally {
      setFetchingModels(false)
    }
  }

  const handleSave = async () => {
    if (!editing) {
      return
    }

    const normalizedBaseUrl = editing.base_url.trim()
    const normalizedApiKey = editing.api_key.trim()
    const normalizedModel = editing.model.trim()
    const normalizedName =
      editing.name.trim() || buildConfigName(normalizedBaseUrl, normalizedModel)

    if (!normalizedBaseUrl) {
      setSaveError('请先填写 Base URL。')
      setSaveSuccess('')
      return
    }

    if (!normalizedApiKey) {
      setSaveError('请先填写 API Key。')
      setSaveSuccess('')
      return
    }

    if (!normalizedModel) {
      setSaveError('请先填写或选择模型。')
      setSaveSuccess('')
      return
    }

    setSaving(true)
    setSaveError('')
    setSaveSuccess('')

    try {
      await saveConfig({
        ...editing,
        name: normalizedName,
        base_url: normalizedBaseUrl,
        api_key: normalizedApiKey,
        model: normalizedModel,
      })
      setEditing(null)
      setModelList([])
      setSaveSuccess(`已保存配置：${normalizedName}`)
    } catch (error: unknown) {
      setSaveError(`保存失败：${String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSavePreset = async () => {
    if (!editingPreset || !editingPreset.name || !editingPreset.prompt) {
      return
    }
    await window.api.invoke('chat-preset-save', editingPreset)
    setEditingPreset(null)
    await loadPresets()
  }

  const handleDeletePreset = async (id: number) => {
    await window.api.invoke('chat-preset-delete', id)
    await loadPresets()
  }

  const handleSaveMemory = async () => {
    if (!editingMemory || !editingMemory.content.trim()) {
      return
    }

    await saveMemory({
      id: editingMemory.id,
      content: editingMemory.content.trim(),
      category: editingMemory.category,
      pinned: editingMemory.pinned ?? 0,
      enabled: editingMemory.enabled ?? 1,
      confidence: editingMemory.confidence ?? 1,
    })
    setEditingMemory(null)
  }

  const handleMemorySearch = async (search: string) => {
    setMemorySearch(search)
    await loadMemories(search)
  }

  const toggleMemoryField = async (memory: MemoryItem, field: 'pinned' | 'enabled') => {
    await saveMemory({
      id: memory.id,
      content: memory.content,
      category: memory.category,
      pinned: field === 'pinned' ? (memory.pinned === 1 ? 0 : 1) : memory.pinned,
      enabled: field === 'enabled' ? (memory.enabled === 1 ? 0 : 1) : memory.enabled,
      confidence: memory.confidence,
    })
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="ui-section-title text-3xl">设置</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--theme-text-muted)]">
          这里统一管理界面主题、模型配置、预设提示词和长期记忆。现在主题会影响整个应用的卡片层级、按钮、面板和编辑器颜色。
        </p>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--theme-accent)]" />
          <h2 className="ui-section-title text-lg">界面主题</h2>
        </div>
        <div className="grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-3">
          {themeOptions.map((option) => (
            <ThemeCard
              key={option.id}
              active={theme === option.id}
              option={option}
              onClick={() => void setTheme(option.id)}
            />
          ))}
        </div>
      </div>

      <div className="mb-5 flex gap-2">
        <TabButton active={tab === 'ai'} label="AI 模型配置" onClick={() => setTab('ai')} />
        <TabButton
          active={tab === 'presets'}
          label="预设提示词"
          onClick={() => setTab('presets')}
        />
        <TabButton active={tab === 'memories'} label="记忆库" onClick={() => setTab('memories')} />
      </div>

      <div className="max-w-6xl">
        {tab === 'ai' && (
          <div className="space-y-4">
            <div className="ui-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardPaste size={16} className="text-[var(--theme-accent)]" />
                <div>
                  <div className="font-medium text-[var(--theme-text-primary)]">智能粘贴</div>
                  <div className="text-xs text-[var(--theme-text-muted)]">
                    自动识别 Base URL 和 API Key，适合复制控制台或网页里的完整文本。
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  value={smartPaste}
                  onChange={(event) => setSmartPaste(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleSmartPaste()}
                  className="ui-input flex-1 px-4 py-3 text-sm"
                  placeholder="粘贴包含 API Key 和 Base URL 的文本..."
                />
                <button onClick={handleSmartPaste} className="ui-btn-accent px-4 py-3 text-sm">
                  识别
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="ui-section-title text-xl">AI 模型配置</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                  支持多套模型配置，并可指定默认模型供聊天和刷题 AI 使用。
                </p>
              </div>
              <button
                onClick={() => setEditing({ ...emptyConfig })}
                className="ui-btn-accent flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Plus size={14} />
                添加配置
              </button>
            </div>

            {aiConfigs.length === 0 && !editing && (
              <div className="ui-card py-14 text-center text-[var(--theme-text-muted)]">
                暂无 AI 配置，请点击“添加配置”或使用智能粘贴。
              </div>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              {aiConfigs.map((config) => (
                <div key={config.id} className="ui-card flex items-start justify-between gap-4 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-[var(--theme-text-primary)]">
                        {config.name}
                      </span>
                      {config.is_default === 1 && <span className="ui-chip-warning">默认</span>}
                    </div>
                    <div className="mt-2 text-sm text-[var(--theme-text-secondary)]">
                      {config.model}
                    </div>
                    <div className="mt-1 text-xs text-[var(--theme-text-muted)]">
                      {config.base_url}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing({ ...config })}
                      className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-text-primary)]"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() =>
                        config.id &&
                        window.confirm('确定要删除该 AI 配置？') &&
                        void deleteConfig(config.id)
                      }
                      className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-danger)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {editing && (
              <div className="ui-card p-5">
                <h3 className="ui-section-title text-lg">{editing.id ? '编辑配置' : '新建配置'}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="名称">
                    <input
                      value={editing.name}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      className="ui-input px-4 py-3 text-sm"
                      placeholder="如：OpenAI"
                    />
                  </Field>
                  <Field label="Base URL">
                    <input
                      value={editing.base_url}
                      onChange={(event) => setEditing({ ...editing, base_url: event.target.value })}
                      className="ui-input px-4 py-3 text-sm"
                      placeholder="https://api.openai.com/v1"
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="API Key">
                    <input
                      type="password"
                      value={editing.api_key}
                      onChange={(event) => setEditing({ ...editing, api_key: event.target.value })}
                      className="ui-input px-4 py-3 text-sm"
                      placeholder="sk-..."
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">
                      模型
                    </label>
                    <button
                      onClick={() => void handleFetchModels()}
                      disabled={fetchingModels || !editing.api_key || !editing.base_url}
                      className="ui-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <RefreshCw size={11} className={fetchingModels ? 'animate-spin' : ''} />
                      {fetchingModels ? '获取中...' : '获取模型列表'}
                    </button>
                  </div>

                  {modelList.length > 0 ? (
                    <select
                      value={editing.model}
                      onChange={(event) => setEditing({ ...editing, model: event.target.value })}
                      className="ui-select px-4 py-3 text-sm"
                    >
                      {!editing.model && <option value="">请选择模型</option>}
                      {modelList.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={editing.model}
                      onChange={(event) => setEditing({ ...editing, model: event.target.value })}
                      className="ui-input px-4 py-3 text-sm"
                      placeholder="输入模型名，或点击右上角自动获取"
                    />
                  )}

                  {fetchError && (
                    <div className="mt-2 text-xs text-[var(--theme-danger)]">{fetchError}</div>
                  )}
                </div>

                <label className="mt-4 flex items-center gap-2 text-sm text-[var(--theme-text-primary)]">
                  <input
                    id="is_default"
                    type="checkbox"
                    checked={editing.is_default === 1}
                    onChange={(event) =>
                      setEditing({ ...editing, is_default: event.target.checked ? 1 : 0 })
                    }
                    className="accent-[var(--theme-accent)]"
                  />
                  设为默认模型
                </label>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="ui-btn-success px-4 py-2 text-sm"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="ui-btn-secondary px-4 py-2 text-sm"
                  >
                    取消
                  </button>
                </div>
                {saveError && (
                  <div className="mt-3 text-sm text-[var(--theme-danger)]">{saveError}</div>
                )}
                {saveSuccess && (
                  <div className="mt-3 text-sm text-[var(--theme-success)]">{saveSuccess}</div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'presets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="ui-section-title text-xl">预设提示词</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                  把常用角色整理成预设，开启新对话时就能一键复用。
                </p>
              </div>
              <button
                onClick={() => setEditingPreset({ name: '', prompt: '' })}
                className="ui-btn-accent flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Plus size={14} />
                添加预设
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {presets.map((preset) => (
                <div key={preset.id} className="ui-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={15} className="text-[var(--theme-accent)]" />
                        <span className="font-semibold text-[var(--theme-text-primary)]">
                          {preset.name}
                        </span>
                        {preset.is_builtin === 1 && <span className="ui-chip">内置</span>}
                      </div>
                      <div className="mt-3 line-clamp-3 text-sm leading-7 text-[var(--theme-text-muted)]">
                        {preset.prompt}
                      </div>
                    </div>
                    {preset.is_builtin === 0 && (
                      <div className="flex gap-1">
                        <button
                          onClick={() =>
                            setEditingPreset({
                              id: preset.id,
                              name: preset.name,
                              prompt: preset.prompt,
                            })
                          }
                          className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-text-primary)]"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => void handleDeletePreset(preset.id)}
                          className="ui-btn-ghost flex h-9 w-9 items-center justify-center hover:text-[var(--theme-danger)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {editingPreset && (
              <div className="ui-card p-5">
                <h3 className="ui-section-title text-lg">
                  {editingPreset.id ? '编辑预设' : '新建预设'}
                </h3>
                <div className="mt-4 space-y-4">
                  <Field label="名称">
                    <input
                      value={editingPreset.name}
                      onChange={(event) =>
                        setEditingPreset({ ...editingPreset, name: event.target.value })
                      }
                      className="ui-input px-4 py-3 text-sm"
                      placeholder="如：Python 专家"
                    />
                  </Field>
                  <Field label="系统提示词">
                    <textarea
                      value={editingPreset.prompt}
                      onChange={(event) =>
                        setEditingPreset({ ...editingPreset, prompt: event.target.value })
                      }
                      rows={5}
                      className="ui-textarea resize-none px-4 py-3 text-sm"
                      placeholder="你是一名..."
                    />
                  </Field>
                </div>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => void handleSavePreset()}
                    className="ui-btn-success px-4 py-2 text-sm"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingPreset(null)}
                    className="ui-btn-secondary px-4 py-2 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'memories' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="ui-section-title text-xl">记忆库</h2>
                <p className="mt-1 text-sm text-[var(--theme-text-muted)]">
                  AI 会在新对话里自动召回相关长期记忆，你也可以手动整理它们。
                </p>
              </div>
              <button
                onClick={() =>
                  setEditingMemory({ content: '', category: 'general', pinned: 0, enabled: 1 })
                }
                className="ui-btn-accent flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Plus size={14} />
                添加记忆
              </button>
            </div>

            <div className="ui-card p-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  value={memorySearch}
                  onChange={(event) => void handleMemorySearch(event.target.value)}
                  className="ui-input flex-1 px-4 py-3 text-sm"
                  placeholder="搜索记忆内容或分类..."
                />
                <div className="ui-card-soft flex items-center justify-center rounded-xl px-4 text-sm text-[var(--theme-text-muted)]">
                  已启用 {memories.filter((memory) => memory.enabled === 1).length} 条
                </div>
              </div>
            </div>

            {memories.length === 0 && !editingMemory && (
              <div className="ui-card py-14 text-center text-[var(--theme-text-muted)]">
                <Brain size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-base font-medium text-[var(--theme-text-primary)]">
                  还没有长期记忆
                </p>
                <p className="mt-2 text-sm">
                  你可以手动添加，或者在聊天里直接说“记住我更喜欢先看思路”。
                </p>
              </div>
            )}

            <div className="space-y-3">
              {memories.map((memory) => (
                <div key={memory.id} className="ui-card p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="ui-chip">{categoryLabel(memory.category)}</span>
                        {memory.pinned === 1 && <span className="ui-chip-warning">置顶</span>}
                        {memory.enabled === 0 && <span className="ui-chip-danger">已停用</span>}
                        <span className="ui-chip">来源 {memory.source}</span>
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--theme-text-primary)]">
                        {memory.content}
                      </div>
                      <div className="mt-3 text-xs text-[var(--theme-text-muted)]">
                        更新于 {formatDateTime(memory.updated_at)}
                        {memory.last_used_at
                          ? ` · 最近使用 ${formatDateTime(memory.last_used_at)}`
                          : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void toggleMemoryField(memory, 'pinned')}
                        className="ui-btn-secondary px-3 py-2 text-xs"
                      >
                        {memory.pinned === 1 ? '取消置顶' : '置顶'}
                      </button>
                      <button
                        onClick={() => void toggleMemoryField(memory, 'enabled')}
                        className="ui-btn-secondary px-3 py-2 text-xs"
                      >
                        {memory.enabled === 1 ? '停用' : '启用'}
                      </button>
                      <button
                        onClick={() => setEditingMemory({ ...memory })}
                        className="ui-btn-secondary flex h-9 w-9 items-center justify-center"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => void deleteMemory(memory.id)}
                        className="ui-btn-secondary flex h-9 w-9 items-center justify-center hover:text-[var(--theme-danger)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {editingMemory && (
              <div className="ui-card p-5">
                <h3 className="ui-section-title text-lg">
                  {editingMemory.id ? '编辑记忆' : '新建记忆'}
                </h3>
                <div className="mt-4 space-y-4">
                  <Field label="记忆内容">
                    <textarea
                      value={editingMemory.content}
                      onChange={(event) =>
                        setEditingMemory({ ...editingMemory, content: event.target.value })
                      }
                      rows={5}
                      className="ui-textarea resize-none px-4 py-3 text-sm"
                      placeholder="例如：用户偏好我用中文回答，并优先给出可直接执行的方案。"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="分类">
                      <select
                        value={editingMemory.category}
                        onChange={(event) =>
                          setEditingMemory({ ...editingMemory, category: event.target.value })
                        }
                        className="ui-select px-4 py-3 text-sm"
                      >
                        {memoryCategories.map((category) => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="flex items-end gap-6 pb-1">
                      <label className="flex items-center gap-2 text-sm text-[var(--theme-text-primary)]">
                        <input
                          type="checkbox"
                          checked={Number(editingMemory.pinned ?? 0) === 1}
                          onChange={(event) =>
                            setEditingMemory({
                              ...editingMemory,
                              pinned: event.target.checked ? 1 : 0,
                            })
                          }
                          className="accent-[var(--theme-accent)]"
                        />
                        置顶
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[var(--theme-text-primary)]">
                        <input
                          type="checkbox"
                          checked={Number(editingMemory.enabled ?? 1) === 1}
                          onChange={(event) =>
                            setEditingMemory({
                              ...editingMemory,
                              enabled: event.target.checked ? 1 : 0,
                            })
                          }
                          className="accent-[var(--theme-accent)]"
                        />
                        启用
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => void handleSaveMemory()}
                    className="ui-btn-success px-4 py-2 text-sm"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingMemory(null)}
                    className="ui-btn-secondary px-4 py-2 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ThemeCard({
  option,
  active,
  onClick,
}: {
  option: {
    id: ThemeId
    name: string
    description: string
    accent: string
    panel: string
    glow: string
  }
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`theme-card ${active ? 'shadow-[0_0_0_1px_var(--theme-accent)]' : ''}`}
      style={
        {
          background: `linear-gradient(180deg, color-mix(in srgb, ${option.panel} 92%, #ffffff 8%), ${option.panel})`,
          borderColor: active ? option.accent : undefined,
          boxShadow: active ? `0 0 0 1px ${option.accent}, 0 22px 48px ${option.glow}` : undefined,
          ['--card-glow' as string]: option.glow,
        } as CSSProperties
      }
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-white">{option.name}</div>
            <div className="mt-2 text-sm leading-6 text-white/70">{option.description}</div>
          </div>
          {active && <span className="ui-chip-accent border-0 bg-white/12 text-white">当前</span>}
        </div>
        <div className="mt-5 flex gap-2">
          <div
            className="h-10 flex-1 rounded-2xl border border-white/10"
            style={{ background: option.panel }}
          />
          <div className="h-10 w-16 rounded-2xl" style={{ background: option.accent }} />
        </div>
      </div>
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">
        {label}
      </label>
      {children}
    </div>
  )
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] shadow-[0_12px_24px_var(--theme-glow)]'
          : 'bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)]'
      }`}
    >
      {label}
    </button>
  )
}

function categoryLabel(category: string) {
  return memoryCategories.find((item) => item.value === category)?.label ?? category
}

function buildConfigName(baseUrl: string, model: string) {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '')
    const provider = host.split('.').find((segment) => /[a-z]/i.test(segment)) || 'AI'
    return `${provider}-${model}`.slice(0, 60)
  } catch {
    return model ? `AI-${model}`.slice(0, 60) : 'AI 配置'
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value.replace('T', ' ').slice(0, 19)
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
