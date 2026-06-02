/**
 * WelcomeWizard - First-run onboarding wizard.
 *
 * 5-step flow:
 *  1. Welcome screen
 *  2. AI API configuration
 *  3. Theme selection
 *  4. Learning interests
 *  5. Feature quick tour
 *
 * Completion state is persisted via onboardingStore.
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  Sparkles,
  Key,
  Palette,
  Target,
  Map,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  AlertCircle,
  Sun,
  Moon,
  BookOpen,
  Code2,
  Brain,
  Database,
  Bot,
  X,
} from 'lucide-react'
import { useOnboardingStore } from './onboardingStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAppStore } from '../../stores/appStore'
import { THEMES, DEFAULT_THEME } from '../../constants'
import { toErrorMessage } from '../../utils/errors'
import type { ThemeId } from '../../stores/appStore'
import type { ChatConfig } from '../../types/chat'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WizardStep {
  id: string
  title: string
  icon: typeof Sparkles
  content: (props: StepProps) => ReactNode
}

interface StepProps {
  onNext: () => void
  onBack: () => void
  isFirst: boolean
  isLast: boolean
  wizardState: WizardData
  setWizardState: React.Dispatch<React.SetStateAction<WizardData>>
}

interface WizardData {
  apiKey: string
  apiBaseUrl: string
  apiProvider: string
  apiModel: string
  testStatus: 'idle' | 'testing' | 'success' | 'error'
  testError: string
  selectedTheme: ThemeId
  interests: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
  },
  { id: 'custom', name: '自定义', baseUrl: '', models: [] },
] as const

const THEME_META: Record<
  ThemeId,
  { label: string; description: string; icon: typeof Sun; preview: string }
> = {
  mocha: {
    label: '摩卡',
    description: '温暖深色主题，适合长时间编码',
    icon: Moon,
    preview: 'bg-gradient-to-br from-[#1e1818] to-[#2d2520]',
  },
  fjord: {
    label: '峡湾',
    description: '冷色调深色主题，清新自然',
    icon: Moon,
    preview: 'bg-gradient-to-br from-[#171d27] to-[#1e2a3a]',
  },
  ember: {
    label: '余烬',
    description: '暖色调深色主题，活力十足',
    icon: Sun,
    preview: 'bg-gradient-to-br from-[#1c1412] to-[#2a1a14]',
  },
}

const INTEREST_OPTIONS = [
  { id: 'algorithms', label: '算法', desc: '排序、搜索、动态规划等', icon: Brain },
  { id: 'data-structures', label: '数据结构', desc: '链表、树、图、哈希表等', icon: Database },
  { id: 'system-design', label: '系统设计', desc: '架构设计、分布式系统', icon: Map },
  { id: 'python', label: 'Python 编程', desc: '语法、标准库、最佳实践', icon: Code2 },
  { id: 'interview', label: '面试准备', desc: '高频题目、模拟面试', icon: Target },
  { id: 'ai-ml', label: 'AI / 机器学习', desc: '基础概念与实践', icon: Bot },
] as const

// ---------------------------------------------------------------------------
// Step 1: Welcome
// ---------------------------------------------------------------------------

function WelcomeStep({ onNext, isFirst, isLast, wizardState: _ }: StepProps) {
  void _
  void isFirst
  void isLast
  return (
    <div className="flex flex-col items-center text-center gap-6 max-w-lg mx-auto">
      <div className="w-20 h-20 rounded-2xl bg-[var(--theme-accent)] flex items-center justify-center shadow-lg">
        <Sparkles size={40} className="text-[var(--theme-accent-contrast)]" />
      </div>
      <h2 className="text-2xl font-bold text-[var(--theme-text-primary)]">欢迎使用 CodeHelper</h2>
      <p className="text-[var(--theme-text-secondary)] leading-relaxed">
        CodeHelper 是你的 AI 驱动编程学习助手。它集成了智能刷题、代码编辑器、 AI
        对话、错题本和知识库，帮助你系统化地提升编程能力。
      </p>
      <div className="grid grid-cols-2 gap-3 w-full mt-2">
        {[
          { icon: BookOpen, text: '智能刷题系统' },
          { icon: Code2, text: '内置代码编辑器' },
          { icon: Bot, text: 'AI 编程助手' },
          { icon: Brain, text: '错题分析与知识库' },
        ].map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] text-sm"
          >
            <Icon size={16} className="text-[var(--theme-accent)] shrink-0" />
            {text}
          </div>
        ))}
      </div>
      <button
        onClick={onNext}
        className="mt-4 px-8 py-2.5 rounded-lg bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] font-medium hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
      >
        开始设置 <ChevronRight size={16} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: API Configuration
// ---------------------------------------------------------------------------

function ApiConfigStep({ onNext, onBack, wizardState, setWizardState }: StepProps) {
  const { saveConfig } = useSettingsStore()

  const currentProvider = useMemo(
    () => API_PROVIDERS.find((p) => p.id === wizardState.apiProvider) ?? API_PROVIDERS[0],
    [wizardState.apiProvider],
  )

  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = API_PROVIDERS.find((p) => p.id === providerId) ?? API_PROVIDERS[0]
      setWizardState((s) => ({
        ...s,
        apiProvider: providerId,
        apiBaseUrl: provider.baseUrl,
        apiModel: provider.models[0] ?? '',
        testStatus: 'idle',
        testError: '',
      }))
    },
    [setWizardState],
  )

  const handleTest = useCallback(async () => {
    setWizardState((s) => ({ ...s, testStatus: 'testing', testError: '' }))
    try {
      const config: ChatConfig = {
        name: 'wizard-test',
        api_key: wizardState.apiKey,
        base_url: wizardState.apiBaseUrl,
        model: wizardState.apiModel,
        is_default: 1,
        task_type: null,
      }
      await saveConfig(config)
      setWizardState((s) => ({ ...s, testStatus: 'success' }))
    } catch (error) {
      setWizardState((s) => ({
        ...s,
        testStatus: 'error',
        testError: toErrorMessage(error),
      }))
    }
  }, [wizardState.apiKey, wizardState.apiBaseUrl, wizardState.apiModel, saveConfig, setWizardState])

  const canTest = wizardState.apiKey.trim().length > 0 && wizardState.apiBaseUrl.trim().length > 0

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      <div className="text-center mb-2">
        <div className="w-12 h-12 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center mx-auto mb-3">
          <Key size={24} className="text-[var(--theme-accent)]" />
        </div>
        <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">配置 AI 服务</h2>
        <p className="text-sm text-[var(--theme-text-muted)] mt-1">
          选择 AI 提供商并输入 API 密钥以启用智能功能
        </p>
      </div>

      {/* Provider selection */}
      <div>
        <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-2">
          AI 提供商
        </label>
        <div className="grid grid-cols-2 gap-2">
          {API_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleProviderChange(p.id)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                wizardState.apiProvider === p.id
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10 text-[var(--theme-accent)]'
                  : 'border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:border-[var(--theme-accent)]/50'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1.5">
          API 密钥
        </label>
        <input
          type="password"
          value={wizardState.apiKey}
          onChange={(e) =>
            setWizardState((s) => ({ ...s, apiKey: e.target.value, testStatus: 'idle' }))
          }
          placeholder="sk-..."
          className="w-full px-3 py-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] placeholder:text-[var(--theme-text-muted)]"
        />
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1.5">
          API 地址
        </label>
        <input
          type="text"
          value={wizardState.apiBaseUrl}
          onChange={(e) =>
            setWizardState((s) => ({ ...s, apiBaseUrl: e.target.value, testStatus: 'idle' }))
          }
          placeholder="https://api.openai.com/v1"
          className="w-full px-3 py-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] placeholder:text-[var(--theme-text-muted)]"
        />
      </div>

      {/* Model */}
      <div>
        <label className="block text-sm font-medium text-[var(--theme-text-secondary)] mb-1.5">
          模型
        </label>
        {currentProvider.models.length > 0 ? (
          <select
            value={wizardState.apiModel}
            onChange={(e) =>
              setWizardState((s) => ({ ...s, apiModel: e.target.value, testStatus: 'idle' }))
            }
            className="w-full px-3 py-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]"
          >
            {currentProvider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={wizardState.apiModel}
            onChange={(e) =>
              setWizardState((s) => ({ ...s, apiModel: e.target.value, testStatus: 'idle' }))
            }
            placeholder="model-name"
            className="w-full px-3 py-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg-input)] text-[var(--theme-text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] placeholder:text-[var(--theme-text-muted)]"
          />
        )}
      </div>

      {/* Test connection */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={!canTest || wizardState.testStatus === 'testing'}
          className="px-4 py-2 rounded-lg border border-[var(--theme-accent)] text-[var(--theme-accent)] text-sm font-medium hover:bg-[var(--theme-accent)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
        >
          {wizardState.testStatus === 'testing' ? (
            <>
              <Loader2 size={14} className="animate-spin" /> 测试中...
            </>
          ) : (
            '测试连接'
          )}
        </button>
        {wizardState.testStatus === 'success' && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <Check size={14} /> 连接成功
          </span>
        )}
        {wizardState.testStatus === 'error' && (
          <span className="text-sm text-red-400 flex items-center gap-1">
            <AlertCircle size={14} /> {wizardState.testError || '连接失败'}
          </span>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-4">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft size={16} /> 上一步
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] font-medium hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
        >
          下一步 <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Theme Selection
// ---------------------------------------------------------------------------

function ThemeStep({ onNext, onBack, wizardState, setWizardState }: StepProps) {
  const setTheme = useAppStore((s) => s.setTheme)

  const handleSelect = useCallback(
    (theme: ThemeId) => {
      setWizardState((s) => ({ ...s, selectedTheme: theme }))
      void setTheme(theme)
    },
    [setWizardState, setTheme],
  )

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      <div className="text-center mb-2">
        <div className="w-12 h-12 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center mx-auto mb-3">
          <Palette size={24} className="text-[var(--theme-accent)]" />
        </div>
        <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">选择主题</h2>
        <p className="text-sm text-[var(--theme-text-muted)] mt-1">选择你喜欢的界面主题</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {THEMES.map((themeId) => {
          const meta = THEME_META[themeId]
          const Icon = meta.icon
          const isSelected = wizardState.selectedTheme === themeId
          return (
            <button
              key={themeId}
              onClick={() => handleSelect(themeId)}
              className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/5'
                  : 'border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] hover:border-[var(--theme-accent)]/40'
              }`}
            >
              <div
                className={`w-14 h-14 rounded-lg ${meta.preview} flex items-center justify-center shrink-0`}
              >
                <Icon size={20} className="text-white/80" />
              </div>
              <div className="text-left flex-1">
                <div className="font-medium text-[var(--theme-text-primary)]">{meta.label}</div>
                <div className="text-sm text-[var(--theme-text-muted)]">{meta.description}</div>
              </div>
              {isSelected && (
                <div className="w-6 h-6 rounded-full bg-[var(--theme-accent)] flex items-center justify-center shrink-0">
                  <Check size={14} className="text-[var(--theme-accent-contrast)]" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex justify-between mt-4">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft size={16} /> 上一步
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] font-medium hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
        >
          下一步 <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Learning Interests
// ---------------------------------------------------------------------------

function InterestsStep({ onNext, onBack, wizardState, setWizardState }: StepProps) {
  const toggleInterest = useCallback(
    (id: string) => {
      setWizardState((s) => ({
        ...s,
        interests: s.interests.includes(id)
          ? s.interests.filter((i) => i !== id)
          : [...s.interests, id],
      }))
    },
    [setWizardState],
  )

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      <div className="text-center mb-2">
        <div className="w-12 h-12 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center mx-auto mb-3">
          <Target size={24} className="text-[var(--theme-accent)]" />
        </div>
        <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">学习方向</h2>
        <p className="text-sm text-[var(--theme-text-muted)] mt-1">
          选择你感兴趣的方向，我们会为你推荐相关内容
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {INTEREST_OPTIONS.map(({ id, label, desc, icon: Icon }) => {
          const isSelected = wizardState.interests.includes(id)
          return (
            <button
              key={id}
              onClick={() => toggleInterest(id)}
              className={`flex flex-col items-start gap-2 p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/5'
                  : 'border-[var(--theme-border)] bg-[var(--theme-bg-secondary)] hover:border-[var(--theme-accent)]/40'
              }`}
            >
              <div className="flex items-center gap-2 w-full">
                <Icon
                  size={18}
                  className={
                    isSelected ? 'text-[var(--theme-accent)]' : 'text-[var(--theme-text-muted)]'
                  }
                />
                <span className="font-medium text-sm text-[var(--theme-text-primary)]">
                  {label}
                </span>
                {isSelected && <Check size={14} className="text-[var(--theme-accent)] ml-auto" />}
              </div>
              <span className="text-xs text-[var(--theme-text-muted)] leading-snug">{desc}</span>
            </button>
          )
        })}
      </div>

      <div className="flex justify-between mt-4">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft size={16} /> 上一步
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] font-medium hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
        >
          下一步 <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5: Feature Tour Summary
// ---------------------------------------------------------------------------

function TourSummaryStep({ onNext, onBack, isFirst: _1, isLast: _2 }: StepProps) {
  void _1
  void _2
  const features = [
    { icon: BookOpen, title: '刷题系统', desc: '按难度筛选题目，自动记录做题历史与通过率' },
    { icon: Code2, title: '代码编辑器', desc: 'Monaco 编辑器，支持语法高亮与代码运行' },
    { icon: Bot, title: 'AI 助手', desc: '与 AI 实时对话，获取代码提示与思路讲解' },
    { icon: X, title: '错题本', desc: '自动收录错误题目，支持分析与重练' },
    { icon: Brain, title: '知识库', desc: '上传笔记与资料，构建个人知识体系' },
    { icon: Map, title: '统计面板', desc: '可视化学习进度与能力分布' },
  ]

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      <div className="text-center mb-2">
        <div className="w-12 h-12 rounded-xl bg-[var(--theme-accent)]/10 flex items-center justify-center mx-auto mb-3">
          <Map size={24} className="text-[var(--theme-accent)]" />
        </div>
        <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">核心功能一览</h2>
        <p className="text-sm text-[var(--theme-text-muted)] mt-1">
          这些是 CodeHelper 的主要功能模块
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {features.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-3 p-3 rounded-lg bg-[var(--theme-bg-secondary)] border border-[var(--theme-border)]"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent)]/10 flex items-center justify-center shrink-0 mt-0.5">
              <Icon size={16} className="text-[var(--theme-accent)]" />
            </div>
            <div>
              <div className="font-medium text-sm text-[var(--theme-text-primary)]">{title}</div>
              <div className="text-xs text-[var(--theme-text-muted)] mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-4">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] transition-colors flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft size={16} /> 上一步
        </button>
        <button
          onClick={onNext}
          className="px-8 py-2.5 rounded-lg bg-[var(--theme-accent)] text-[var(--theme-accent-contrast)] font-medium hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
        >
          <Check size={16} /> 开始使用
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

const WIZARD_STEPS: WizardStep[] = [
  { id: 'welcome', title: '欢迎', icon: Sparkles, content: WelcomeStep },
  { id: 'api', title: 'AI 配置', icon: Key, content: ApiConfigStep },
  { id: 'theme', title: '主题', icon: Palette, content: ThemeStep },
  { id: 'interests', title: '兴趣', icon: Target, content: InterestsStep },
  { id: 'tour', title: '功能', icon: Map, content: TourSummaryStep },
]

export function WelcomeWizard() {
  const [currentStep, setCurrentStep] = useState(0)
  const [wizardState, setWizardState] = useState<WizardData>({
    apiKey: '',
    apiBaseUrl: API_PROVIDERS[0].baseUrl,
    apiProvider: API_PROVIDERS[0].id,
    apiModel: API_PROVIDERS[0].models[0],
    testStatus: 'idle',
    testError: '',
    selectedTheme: DEFAULT_THEME,
    interests: [],
  })

  const completeWizard = useOnboardingStore((s) => s.completeWizard)

  const handleNext = useCallback(async () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      // Persist interests preference if desired (future extension)
      await completeWizard()
    }
  }, [currentStep, completeWizard])

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1))
  }, [])

  const handleSkip = useCallback(async () => {
    await completeWizard()
  }, [completeWizard])

  const step = WIZARD_STEPS[currentStep]

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative bg-[var(--theme-bg-primary)] rounded-2xl shadow-2xl border border-[var(--theme-border)] w-full max-w-xl mx-4 overflow-hidden">
        {/* Header with step indicators */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-8 bg-[var(--theme-accent)]'
                    : i < currentStep
                      ? 'w-3 bg-[var(--theme-accent)]/60'
                      : 'w-3 bg-[var(--theme-border)]'
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors cursor-pointer"
          >
            跳过设置
          </button>
        </div>

        {/* Step title */}
        <div className="px-6 pb-2">
          <div className="text-xs text-[var(--theme-text-muted)] uppercase tracking-wider">
            {currentStep + 1} / {WIZARD_STEPS.length} - {step.title}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 min-h-[420px] flex items-center">
          <div className="w-full">
            <step.content
              onNext={handleNext}
              onBack={handleBack}
              isFirst={currentStep === 0}
              isLast={currentStep === WIZARD_STEPS.length - 1}
              wizardState={wizardState}
              setWizardState={setWizardState}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
