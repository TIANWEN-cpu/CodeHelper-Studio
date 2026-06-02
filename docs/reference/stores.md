# Zustand Stores 参考

本文档详细说明每个 Zustand Store 的状态字段和 Actions。

## useAppStore — 应用全局状态

管理模块切换、主题和侧栏状态。

### 状态字段

| 字段               | 类型       | 默认值       | 说明         |
| ------------------ | ---------- | ------------ | ------------ |
| `activeModule`     | `ModuleId` | `'problems'` | 当前活动模块 |
| `theme`            | `ThemeId`  | `'mocha'`    | 当前主题     |
| `sidebarCollapsed` | `boolean`  | `false`      | 侧栏是否折叠 |

**ModuleId 类型**：

```typescript
type ModuleId =
  | 'problems'
  | 'editor'
  | 'ai-chat'
  | 'mistakes'
  | 'knowledge'
  | 'settings'
  | 'stats'
  | 'search'
```

**ThemeId 类型**：

```typescript
type ThemeId = 'mocha' | 'fjord' | 'ember'
```

### Actions

| Action            | 参数             | 返回值          | 说明             |
| ----------------- | ---------------- | --------------- | ---------------- |
| `setActiveModule` | `id: ModuleId`   | `void`          | 切换当前模块     |
| `setTheme`        | `theme: ThemeId` | `Promise<void>` | 设置主题并持久化 |
| `loadTheme`       | 无               | `Promise<void>` | 从数据库加载主题 |
| `toggleSidebar`   | 无               | `void`          | 切换侧栏折叠状态 |

### 使用示例

```typescript
// 切换模块
const setActiveModule = useAppStore((s) => s.setActiveModule)
setActiveModule('editor')

// 读取当前模块
const activeModule = useAppStore((s) => s.activeModule)

// 切换主题
const setTheme = useAppStore((s) => s.setTheme)
await setTheme('fjord')

// 读取主题
const theme = useAppStore((s) => s.theme)

// 切换侧栏
const toggleSidebar = useAppStore((s) => s.toggleSidebar)
toggleSidebar()
```

---

## useChatStore — AI 对话状态

管理对话会话、消息、流式响应、预设和记忆。

### 状态字段

| 字段               | 类型             | 默认值  | 说明             |
| ------------------ | ---------------- | ------- | ---------------- |
| `sessions`         | `Session[]`      | `[]`    | 会话列表         |
| `activeSessionId`  | `string \| null` | `null`  | 当前会话 ID      |
| `messages`         | `Message[]`      | `[]`    | 当前会话消息     |
| `streaming`        | `boolean`        | `false` | 是否正在流式接收 |
| `currentRequestId` | `string \| null` | `null`  | 当前请求 ID      |
| `error`            | `string \| null` | `null`  | 错误信息         |
| `presets`          | `PromptPreset[]` | `[]`    | 提示词预设       |
| `memories`         | `MemoryItem[]`   | `[]`    | 记忆列表         |

### Actions

| Action          | 参数                    | 返回值            | 说明                |
| --------------- | ----------------------- | ----------------- | ------------------- |
| `loadSessions`  | 无                      | `Promise<void>`   | 加载会话列表        |
| `createSession` | `systemPrompt?, title?` | `Promise<string>` | 创建新会话，返回 ID |
| `switchSession` | `id: string`            | `Promise<void>`   | 切换到指定会话      |
| `deleteSession` | `id: string`            | `Promise<void>`   | 删除会话            |
| `renameSession` | `id, title`             | `Promise<void>`   | 重命名会话          |
| `sendMessage`   | `content, configId?`    | `Promise<void>`   | 发送消息            |
| `appendChunk`   | `payload`               | `void`            | 追加流式响应 chunk  |
| `finishStream`  | `payload`               | `Promise<void>`   | 流式响应结束        |
| `loadPresets`   | 无                      | `Promise<void>`   | 加载提示词预设      |
| `loadMemories`  | `search?`               | `Promise<void>`   | 加载记忆列表        |
| `saveMemory`    | `memory`                | `Promise<void>`   | 保存记忆            |
| `deleteMemory`  | `id: number`            | `Promise<void>`   | 删除记忆            |

### 使用示例

```typescript
// 发送消息
const sendMessage = useChatStore((s) => s.sendMessage)
await sendMessage('解释快速排序算法', configId)

// 切换会话
const switchSession = useChatStore((s) => s.switchSession)
await switchSession('session-1234')

// 读取消息
const messages = useChatStore((s) => s.messages)

// 流式状态
const streaming = useChatStore((s) => s.streaming)

// 创建会话
const createSession = useChatStore((s) => s.createSession)
const sessionId = await createSession('你是一个编程导师', '编程学习')

// 管理记忆
const saveMemory = useChatStore((s) => s.saveMemory)
await saveMemory({ content: '用户偏好 Python', category: 'preference' })
```

---

## useEditorStore — 编辑器状态

管理多标签页编辑器。使用 localStorage 持久化。

### 状态字段

| 字段          | 类型             | 默认值          | 说明              |
| ------------- | ---------------- | --------------- | ----------------- |
| `tabs`        | `EditorTab[]`    | `[DEFAULT_TAB]` | 标签页列表        |
| `activeTabId` | `string \| null` | `'welcome'`     | 当前活动标签页 ID |

**EditorTab 类型**：

```typescript
interface EditorTab {
  id: string
  filename: string
  language: string
  content: string
  cursorPosition?: { lineNumber: number; column: number }
  scrollTop?: number
}
```

### Actions

| Action                 | 参数             | 返回值 | 说明                       |
| ---------------------- | ---------------- | ------ | -------------------------- |
| `addTab`               | `tab: EditorTab` | `void` | 添加新标签页               |
| `closeTab`             | `id: string`     | `void` | 关闭标签页                 |
| `setActiveTab`         | `id: string`     | `void` | 切换活动标签页             |
| `updateContent`        | `id, content`    | `void` | 更新标签页内容             |
| `updateCursorPosition` | `id, line, col`  | `void` | 更新光标位置               |
| `updateScrollTop`      | `id, scrollTop`  | `void` | 更新滚动位置               |
| `restoreTabs`          | 无               | `void` | 从 localStorage 恢复标签页 |

### 使用示例

```typescript
// 添加新标签页
const addTab = useEditorStore((s) => s.addTab)
addTab({
  id: `file-${Date.now()}`,
  filename: 'solution.py',
  language: 'python',
  content: '# 在此编写代码\n',
})

// 更新代码内容
const updateContent = useEditorStore((s) => s.updateContent)
updateContent(tabId, newCode)

// 读取当前标签页
const tabs = useEditorStore((s) => s.tabs)
const activeTabId = useEditorStore((s) => s.activeTabId)
const activeTab = tabs.find((t) => t.id === activeTabId)
```

---

## useProblemStore — 题目状态

管理题目列表、筛选和提交。

### 状态字段

| 字段               | 类型                 | 默认值     | 说明            |
| ------------------ | -------------------- | ---------- | --------------- |
| `problems`         | `Problem[]`          | `[]`       | 题目列表        |
| `activeProblemId`  | `number \| null`     | `null`     | 当前题目 ID     |
| `activeProblem`    | `Problem \| null`    | `null`     | 当前题目详情    |
| `submitResult`     | `Submission \| null` | `null`     | 提交结果        |
| `submitting`       | `boolean`            | `false`    | 是否提交中      |
| `selectedLanguage` | `string`             | `'python'` | 选择的语言      |
| `filters`          | `ProblemFilters`     | `{}`       | 筛选条件        |
| `listCollapsed`    | `boolean`            | `false`    | 列表是否折叠    |
| `aiPanelOpen`      | `boolean`            | `false`    | AI 面板是否打开 |
| `aiPanelWidth`     | `number`             | `420`      | AI 面板宽度     |
| `loading`          | `boolean`            | `false`    | 是否加载中      |
| `loadError`        | `string \| null`     | `null`     | 加载错误信息    |

### Actions

| Action                | 参数             | 返回值          | 说明                   |
| --------------------- | ---------------- | --------------- | ---------------------- |
| `loadProblems`        | 无               | `Promise<void>` | 加载题目列表           |
| `setActiveProblem`    | `id: number`     | `Promise<void>` | 设置当前题目           |
| `setFilters`          | `filters`        | `void`          | 设置筛选条件并重新加载 |
| `setSelectedLanguage` | `lang: string`   | `void`          | 设置编程语言           |
| `setListCollapsed`    | `v: boolean`     | `void`          | 折叠/展开列表          |
| `setAIPanelOpen`      | `v: boolean`     | `void`          | 打开/关闭 AI 面板      |
| `setAIPanelWidth`     | `width: number`  | `void`          | 设置 AI 面板宽度       |
| `submit`              | `code, language` | `Promise<void>` | 提交代码               |
| `clearResult`         | 无               | `void`          | 清除提交结果           |

### 使用示例

```typescript
// 加载题目
const loadProblems = useProblemStore((s) => s.loadProblems)
await loadProblems()

// 筛选题目
const setFilters = useProblemStore((s) => s.setFilters)
setFilters({ difficulty: 'hard', tag: '动态规划' })

// 选择题目
const setActiveProblem = useProblemStore((s) => s.setActiveProblem)
await setActiveProblem(42)

// 提交代码
const submit = useProblemStore((s) => s.submit)
await submit('def solve(nums):\n    return sum(nums)', 'python')

// 读取结果
const submitResult = useProblemStore((s) => s.submitResult)
if (submitResult?.status === 'accepted') {
  console.log('通过！')
}
```

---

## useSettingsStore — 设置状态

管理 AI 配置的 CRUD 操作。

### 状态字段

| 字段        | 类型             | 默认值  | 说明         |
| ----------- | ---------------- | ------- | ------------ |
| `aiConfigs` | `ChatConfig[]`   | `[]`    | AI 配置列表  |
| `loading`   | `boolean`        | `false` | 是否加载中   |
| `saving`    | `boolean`        | `false` | 是否保存中   |
| `saveError` | `string \| null` | `null`  | 保存错误信息 |

### Actions

| Action         | 参数                 | 返回值          | 说明             |
| -------------- | -------------------- | --------------- | ---------------- |
| `loadConfigs`  | 无                   | `Promise<void>` | 加载 AI 配置列表 |
| `saveConfig`   | `config: ChatConfig` | `Promise<void>` | 保存 AI 配置     |
| `deleteConfig` | `id: number`         | `Promise<void>` | 删除 AI 配置     |

### 使用示例

```typescript
// 加载配置
const loadConfigs = useSettingsStore((s) => s.loadConfigs)
await loadConfigs()

// 保存配置
const saveConfig = useSettingsStore((s) => s.saveConfig)
await saveConfig({
  name: 'GPT-4o',
  api_key: 'sk-...',
  base_url: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  is_default: true,
})

// 删除配置
const deleteConfig = useSettingsStore((s) => s.deleteConfig)
await deleteConfig(1)

// 读取配置
const configs = useSettingsStore((s) => s.aiConfigs)
const defaultConfig = configs.find((c) => c.is_default)
```

---

## See Also

- [状态管理](../concepts/state-management.md) -- Zustand 设计模式与最佳实践
- [ADR-002: Zustand 选型](../adr/002-zustand-over-redux.md) -- 为什么选择 Zustand
- [React 组件](components.md) -- 组件如何消费 Store 状态
- [IPC 通道参考](ipc-channels.md) -- Store 调用的 IPC 通道
- [数据流](../concepts/data-flow.md) -- Store 在数据流中的位置
- [术语表](../glossary.md) -- Zustand、Store 等术语
