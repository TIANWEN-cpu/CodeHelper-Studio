# 状态管理

本文档介绍 CodeHelper 使用 Zustand 进行状态管理的设计模式和最佳实践。

## 为什么选择 Zustand

详见 [ADR-002: 选择 Zustand 而非 Redux](../adr/002-zustand-over-redux.md)。

核心原因：

- API 简洁，样板代码极少
- 原生支持 TypeScript 类型推断
- 无需 Provider 包裹
- 支持选择器优化（减少不必要的重渲染）

## Store 架构概览

```
src/stores/
├── appStore.ts        # 全局应用状态
├── chatStore.ts       # AI 对话状态
├── editorStore.ts     # 编辑器状态
├── problemStore.ts    # 题目状态
└── settingsStore.ts   # 设置状态
```

每个 Store 负责管理一个领域的状态和操作：

| Store              | 职责           | 关键状态                                                   |
| ------------------ | -------------- | ---------------------------------------------------------- |
| `useAppStore`      | 应用级全局状态 | `activeModule`, `theme`, `sidebarCollapsed`                |
| `useChatStore`     | AI 对话管理    | `sessions`, `messages`, `streaming`, `presets`, `memories` |
| `useEditorStore`   | 编辑器标签管理 | `tabs`, `activeTabId`                                      |
| `useProblemStore`  | 刷题系统状态   | `problems`, `activeProblem`, `submitResult`, `filters`     |
| `useSettingsStore` | AI 配置管理    | `aiConfigs`, `loading`, `saving`                           |

## Store 创建模式

### 基础结构

所有 Store 使用相同的创建模式：

```typescript
import { create } from 'zustand'

interface MyState {
  // 状态字段
  data: DataType[]
  loading: boolean
  error: string | null

  // 操作方法
  loadData: () => Promise<void>
  updateItem: (id: number, updates: Partial<DataType>) => void
}

export const useMyStore = create<MyState>((set, get) => ({
  // 初始状态
  data: [],
  loading: false,
  error: null,

  // 操作实现
  loadData: async () => {
    set({ loading: true, error: null })
    try {
      const data = await typedInvoke('my-channel')
      set({ data })
    } catch (error: unknown) {
      set({ error: toErrorMessage(error) })
    } finally {
      set({ loading: false })
    }
  },

  updateItem: (id, updates) => {
    set((state) => ({
      data: state.data.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }))
  },
}))
```

### 使用类型重导出保持向后兼容

Store 文件通常会重导出类型，使得消费方只需从一个地方导入：

```typescript
// src/stores/problemStore.ts
import type { Problem, Submission, ProblemFilters } from '../types/problem'

// 重导出，使已有的消费者不会被破坏
export type { Problem, Submission as SubmitResult }
export type { ProblemFilters }
```

## 各 Store 详解

### appStore — 应用全局状态

管理应用级别的状态：当前活动模块、主题、侧栏折叠状态。

```typescript
export type ModuleId =
  | 'problems'
  | 'editor'
  | 'ai-chat'
  | 'mistakes'
  | 'knowledge'
  | 'settings'
  | 'stats'
  | 'search'

export type ThemeId = 'mocha' | 'fjord' | 'ember'

interface AppState {
  activeModule: ModuleId // 当前显示的模块
  theme: ThemeId // 当前主题
  sidebarCollapsed: boolean // 侧栏是否折叠

  setActiveModule: (id: ModuleId) => void
  setTheme: (theme: ThemeId) => Promise<void>
  loadTheme: () => Promise<void>
  toggleSidebar: () => void
}
```

**主题持久化**：主题通过 `db-set-setting` / `db-get-setting` IPC 通道存入数据库。

```typescript
setTheme: async (theme) => {
  applyTheme(theme)      // 更新 DOM 属性
  set({ theme })         // 更新 Store
  await typedInvoke('db-set-setting', THEME_SETTING_KEY, theme)  // 持久化
},

loadTheme: async () => {
  const saved = await typedInvoke('db-get-setting', THEME_SETTING_KEY)
  const theme = saved && THEMES.includes(saved) ? saved : DEFAULT_THEME
  applyTheme(theme)
  set({ theme })
},
```

### chatStore — AI 对话状态

最复杂的 Store，管理对话会话、消息、流式响应、预设和记忆。

```typescript
interface ChatState {
  sessions: Session[] // 会话列表
  activeSessionId: string | null // 当前会话 ID
  messages: Message[] // 当前会话的消息列表
  streaming: boolean // 是否正在流式接收
  currentRequestId: string | null // 当前请求 ID（防止乱序）
  error: string | null
  presets: PromptPreset[] // 预设提示词
  memories: MemoryItem[] // 记忆列表

  // 操作
  loadSessions: () => Promise<void>
  createSession: (systemPrompt?: string, title?: string) => Promise<string>
  switchSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  sendMessage: (content: string, configId?: number) => Promise<void>
  appendChunk: (payload: StreamChunkPayload) => void
  finishStream: (payload: StreamDonePayload) => Promise<void>
  loadPresets: () => Promise<void>
  loadMemories: (search?: string) => Promise<void>
  saveMemory: (memory: Partial<MemoryItem> & { content: string }) => Promise<void>
  deleteMemory: (id: number) => Promise<void>
}
```

**消息发送流程**：

```
sendMessage(content)
  │
  ├─ 1. 如果没有活跃会话 → createSession()
  │
  ├─ 2. 构造用户消息和助手占位消息 → 追加到 messages
  │
  ├─ 3. 持久化用户消息 → typedInvoke('chat-message-save')
  │
  ├─ 4. 自动提取记忆 → typedInvoke('chat-memory-capture')
  │
  ├─ 5. 自动重命名"新对话"会话
  │
  ├─ 6. 构造 API 消息列表（含 system_prompt）
  │
  └─ 7. 发送 AI 请求 → typedInvoke('ai-chat')
         │
         ├─ 流式接收 → appendChunk(payload) 增量更新
         └─ 流结束   → finishStream(payload) 持久化并刷新
```

**请求 ID 防乱序**：

```typescript
appendChunk: (payload) => {
  // 忽略不属于当前请求的 chunk
  if (payload.requestId !== get().currentRequestId) return
  set((state) => {
    const messages = [...state.messages]
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      messages[messages.length - 1] = { ...last, content: last.content + payload.chunk }
    }
    return { messages }
  })
}
```

### editorStore — 编辑器状态

管理多标签页编辑器的状态，并支持 `localStorage` 持久化。

```typescript
interface EditorTab {
  id: string
  filename: string
  language: string
  content: string
  cursorPosition?: { lineNumber: number; column: number }
  scrollTop?: number
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null

  addTab: (tab: EditorTab) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  updateCursorPosition: (id: string, lineNumber: number, column: number) => void
  updateScrollTop: (id: string, scrollTop: number) => void
  restoreTabs: () => void
}
```

**持久化策略**：

使用 `localStorage` 保存标签页元数据和内容，在 Store 初始化时自动恢复：

```typescript
const TABS_STORAGE_KEY = 'codehelper-editor-tabs'
const ACTIVE_TAB_KEY = 'codehelper-active-tab'

function persistTabs(tabs: EditorTab[], activeTabId: string | null) {
  try {
    const tabsMeta = tabs.map((t) => ({
      id: t.id,
      filename: t.filename,
      language: t.language,
      content: t.content,
      cursorPosition: t.cursorPosition,
      scrollTop: t.scrollTop,
    }))
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabsMeta))
    if (activeTabId) localStorage.setItem(ACTIVE_TAB_KEY, activeTabId)
  } catch {
    /* localStorage 可能满了，静默忽略 */
  }
}
```

每次状态变更后自动持久化：

```typescript
addTab: (tab) => set((s) => {
  const newTabs = [...s.tabs, tab]
  persistTabs(newTabs, tab.id)
  return { tabs: newTabs, activeTabId: tab.id }
}),
```

### problemStore — 题目状态

管理题目列表、筛选条件、提交结果。

```typescript
interface ProblemState {
  problems: Problem[] // 题目列表
  activeProblemId: number | null // 当前选中题目 ID
  activeProblem: Problem | null // 当前题目详情
  submitResult: Submission | null // 提交结果
  submitting: boolean // 是否提交中
  selectedLanguage: string // 选择的编程语言
  filters: ProblemFilters // 筛选条件
  listCollapsed: boolean // 题目列表是否折叠
  aiPanelOpen: boolean // AI 面板是否打开
  aiPanelWidth: number // AI 面板宽度
  loading: boolean
  loadError: string | null

  loadProblems: () => Promise<void>
  setActiveProblem: (id: number) => Promise<void>
  setFilters: (filters: ProblemFilters) => void
  submit: (code: string, language: string) => Promise<void>
  clearResult: () => void
}
```

**筛选联动**：设置筛选条件时自动重新加载列表：

```typescript
setFilters: (filters) => {
  set({ filters })
  get().loadProblems()  // 立即触发加载
},
```

### settingsStore — 设置状态

管理 AI 模型配置的 CRUD 操作。

```typescript
interface SettingsState {
  aiConfigs: ChatConfig[]
  loading: boolean
  saving: boolean
  saveError: string | null

  loadConfigs: () => Promise<void>
  saveConfig: (config: ChatConfig) => Promise<void>
  deleteConfig: (id: number) => Promise<void>
}
```

保存配置时会捕获错误并通过 `saveError` 暴露给 UI：

```typescript
saveConfig: async (config) => {
  set({ saving: true, saveError: null })
  try {
    await typedInvoke('db-save-ai-config', config)
    await get().loadConfigs()
  } catch (error: unknown) {
    set({ saveError: toErrorMessage(error) })
    throw error // 向上层传播
  } finally {
    set({ saving: false })
  }
}
```

## 选择器优化

### 粒度化选择器

使用选择器函数避免组件因无关状态变化而重渲染：

```typescript
// 好：仅在 activeModule 变化时重渲染
const activeModule = useAppStore((s) => s.activeModule)

// 好：仅在 theme 变化时重渲染
const theme = useAppStore((s) => s.theme)

// 不好：整个 store 对象变化时都会重渲染
const store = useAppStore()
```

### 在组件中使用 memo + useCallback

```typescript
// Sidebar.tsx
const SidebarButton = memo(function SidebarButton({ id, icon, label, isActive, onClick }) {
  return (
    <button
      title={label}
      onClick={() => onClick(id)}
      className={isActive ? '...' : '...'}
    >
      <Icon size={18} />
    </button>
  )
})

export function Sidebar() {
  const setActiveModule = useAppStore((s) => s.setActiveModule)

  const handleNavClick = useCallback(
    (id: ModuleId) => setActiveModule(id),
    [setActiveModule]
  )

  return (
    <>
      {items.map((item) => (
        <SidebarButton
          key={item.id}
          {...item}
          isActive={activeModule === item.id}
          onClick={handleNavClick}
        />
      ))}
    </>
  )
}
```

## 错误处理模式

所有异步操作遵循统一的错误处理模式：

```typescript
// 模式 1：loading + error 状态
async operation: () => {
  set({ loading: true, error: null })
  try {
    const result = await typedInvoke('channel')
    set({ data: result })
  } catch (error: unknown) {
    set({ error: toErrorMessage(error) })
  } finally {
    set({ loading: false })
  }
}

// 模式 2：捕获并继续传播
async operation: () => {
  set({ saving: true, saveError: null })
  try {
    await typedInvoke('channel')
  } catch (error: unknown) {
    set({ saveError: toErrorMessage(error) })
    throw error  // 允许调用方处理
  } finally {
    set({ saving: false })
  }
}
```

## 最佳实践

1. **每个 Store 职责单一**：不将不相关的状态放在同一个 Store
2. **使用选择器函数**：避免组件因无关状态变化而重渲染
3. **异步操作统一错误处理**：使用 `toErrorMessage()` 标准化错误
4. **类型安全**：使用 `typedInvoke` 替代 `window.api.invoke`
5. **持久化策略**：数据库存重要配置，localStorage 存 UI 临时状态
6. **请求 ID 匹配**：流式响应使用 requestId 防止乱序数据污染

---

## See Also

- [系统架构](architecture.md) -- 模块职责与目录结构
- [IPC 通信模式](ipc-patterns.md) -- Store 如何通过 typedInvoke 与主进程通信
- [数据流](data-flow.md) -- 状态变更如何驱动 UI 更新
- [Zustand Stores 参考](../reference/stores.md) -- 各 Store 的完整字段与 Actions
- [React 组件参考](../reference/components.md) -- 组件如何消费 Store 状态
- [ADR-002: Zustand 选型](../adr/002-zustand-over-redux.md) -- 为什么选择 Zustand
- [术语表](../glossary.md) -- 技术名词解释
