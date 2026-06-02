# 状态管理文档

CodeHelper 使用 **Zustand** 作为前端状态管理方案。每个 Store 是一个独立的 React Hook，管理特定领域的状态和操作。Store 通过 `typedInvoke` 与主进程 IPC 通信。

---

## 目录

- [概述](#概述)
- [appStore — 应用全局状态](#appstore--应用全局状态)
- [chatStore — AI 聊天状态](#chatstore--ai-聊天状态)
- [editorStore — 代码编辑器状态](#editorstore--代码编辑器状态)
- [problemStore — 题目状态](#problemstore--题目状态)
- [settingsStore — 设置状态](#settingsstore--设置状态)
- [Store 间协作](#store-间协作)
- [使用指南](#使用指南)

---

## 概述

- **技术栈**：Zustand（轻量级状态管理）
- **设计原则**：每个领域一个 Store，职责单一
- **IPC 集成**：所有异步操作通过 `typedInvoke` 调用主进程
- **错误处理**：使用 `toErrorMessage` 统一错误格式

---

## appStore — 应用全局状态

**文件位置：** `src/stores/appStore.ts`

**Hook：** `useAppStore`

### 状态形状 (State)

| 字段               | 类型       | 默认值          | 说明               |
| ------------------ | ---------- | --------------- | ------------------ |
| `activeModule`     | `ModuleId` | `'problems'`    | 当前激活的功能模块 |
| `theme`            | `ThemeId`  | `DEFAULT_THEME` | 当前应用主题       |
| `sidebarCollapsed` | `boolean`  | `false`         | 侧边栏是否折叠     |

**类型定义：**

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
type ThemeId = 'mocha' | 'fjord' | 'ember'
```

### 操作 (Actions)

| 操作              | 参数             | 返回值          | 说明                                |
| ----------------- | ---------------- | --------------- | ----------------------------------- |
| `setActiveModule` | `id: ModuleId`   | `void`          | 切换当前功能模块                    |
| `setTheme`        | `theme: ThemeId` | `Promise<void>` | 设置主题，写入 DOM 并持久化到数据库 |
| `loadTheme`       | 无               | `Promise<void>` | 从数据库加载已保存的主题            |
| `toggleSidebar`   | 无               | `void`          | 切换侧边栏折叠/展开状态             |

### 选择器示例

```typescript
// 仅订阅当前模块（减少不必要渲染）
const activeModule = useAppStore((s) => s.activeModule)

// 仅订阅主题
const theme = useAppStore((s) => s.theme)

// 仅订阅折叠状态
const collapsed = useAppStore((s) => s.sidebarCollapsed)
```

### 副作用说明

- `setTheme`：调用 `document.documentElement.dataset.theme` 应用主题到 DOM，同时通过 `db-set-setting` 持久化。
- `loadTheme`：通常在应用启动时调用，从数据库恢复上次保存的主题。

---

## chatStore — AI 聊天状态

**文件位置：** `src/stores/chatStore.ts`

**Hook：** `useChatStore`

### 状态形状 (State)

| 字段               | 类型             | 默认值  | 说明                             |
| ------------------ | ---------------- | ------- | -------------------------------- |
| `sessions`         | `Session[]`      | `[]`    | 所有聊天会话列表                 |
| `activeSessionId`  | `string \| null` | `null`  | 当前激活的会话 ID                |
| `messages`         | `Message[]`      | `[]`    | 当前会话的消息列表               |
| `streaming`        | `boolean`        | `false` | AI 是否正在流式输出              |
| `currentRequestId` | `string \| null` | `null`  | 当前请求标识（用于匹配流式分片） |
| `error`            | `string \| null` | `null`  | 错误信息                         |
| `presets`          | `PromptPreset[]` | `[]`    | 提示词预设列表                   |
| `memories`         | `MemoryItem[]`   | `[]`    | 长期记忆列表                     |

**类型定义：**

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface Session {
  id: string
  title: string
  system_prompt: string
  created_at: string
  updated_at: string
}

interface PromptPreset {
  id: number
  name: string
  prompt: string
  is_builtin: number
  created_at: string
}

interface MemoryItem {
  id: number
  content: string
  category: string
  source: string
  source_ref: string | null
  pinned: number
  enabled: number
  confidence: number
  created_at: string
  updated_at: string
  last_used_at: string | null
}

interface StreamChunkPayload {
  requestId: string
  chunk: string
}

interface StreamDonePayload {
  requestId: string
  content: string
}
```

### 操作 (Actions)

| 操作            | 参数                                                | 返回值            | 说明                                         |
| --------------- | --------------------------------------------------- | ----------------- | -------------------------------------------- |
| `loadSessions`  | 无                                                  | `Promise<void>`   | 加载所有会话列表                             |
| `createSession` | `systemPrompt?: string, title?: string`             | `Promise<string>` | 创建新会话并切换到该会话，返回会话 ID        |
| `switchSession` | `id: string`                                        | `Promise<void>`   | 切换到指定会话，加载其消息                   |
| `deleteSession` | `id: string`                                        | `Promise<void>`   | 删除会话。若删的是当前会话，自动切换到第一个 |
| `renameSession` | `id: string, title: string`                         | `Promise<void>`   | 重命名会话                                   |
| `sendMessage`   | `content: string, configId?: number`                | `Promise<void>`   | 发送消息并触发 AI 响应                       |
| `appendChunk`   | `payload: StreamChunkPayload`                       | `void`            | 追加 AI 流式分片到消息                       |
| `finishStream`  | `payload: StreamDonePayload`                        | `Promise<void>`   | 完成流式响应，保存消息                       |
| `loadPresets`   | 无                                                  | `Promise<void>`   | 加载提示词预设列表                           |
| `loadMemories`  | `search?: string`                                   | `Promise<void>`   | 加载长期记忆列表（支持搜索）                 |
| `saveMemory`    | `memory: Partial<MemoryItem> & { content: string }` | `Promise<void>`   | 保存长期记忆                                 |
| `deleteMemory`  | `id: number`                                        | `Promise<void>`   | 删除长期记忆                                 |

### sendMessage 流程

1. 若无活跃会话，自动创建新会话。
2. 生成唯一 `requestId`。
3. 在消息列表中同时添加用户消息和空的助手消息（乐观更新）。
4. 保存用户消息到数据库。
5. 从消息中自动提取长期记忆（`chat-memory-capture`）。
6. 若会话标题为 `'新对话'`，自动用用户消息内容重命名。
7. 调用 `ai-chat` 发起流式 AI 请求（包含 `includeMemories: true`）。
8. 流式分片通过 `appendChunk` 追加。
9. 完成后通过 `finishStream` 保存助手消息。

### appendChunk / finishStream 机制

这两个操作由外部事件监听器（`ai-chat-chunk` 和 `ai-chat-done`）调用，而非由 `sendMessage` 内部直接调用。`requestId` 用于匹配，防止过期的流式响应污染当前消息。

### 选择器示例

```typescript
const messages = useChatStore((s) => s.messages)
const streaming = useChatStore((s) => s.streaming)
const sessions = useChatStore((s) => s.sessions)
const activeSessionId = useChatStore((s) => s.activeSessionId)
const error = useChatStore((s) => s.error)
```

---

## editorStore — 代码编辑器状态

**文件位置：** `src/stores/editorStore.ts`

**Hook：** `useEditorStore`

### 状态形状 (State)

| 字段          | 类型             | 默认值                  | 说明                   |
| ------------- | ---------------- | ----------------------- | ---------------------- |
| `tabs`        | `EditorTab[]`    | 包含一个 welcome 标签页 | 打开的编辑器标签页列表 |
| `activeTabId` | `string \| null` | `'welcome'`             | 当前激活的标签页 ID    |

**类型定义：**

```typescript
interface EditorTab {
  id: string // 标签页唯一 ID
  filename: string // 文件名（用于显示和语言推断）
  language: string // 编程语言（Monaco 语法高亮）
  content: string // 编辑器内容
  cursorPosition?: { lineNumber: number; column: number } // 光标位置（持久化恢复用）
  scrollTop?: number // 滚动位置（持久化恢复用）
}
```

**默认标签页：** 应用启动时包含一个 `welcome.py` 标签页，内容为示例代码。标签页状态通过 localStorage 持久化，写入时有 500ms 防抖。页面 `beforeunload` 时通过 `flushPersistTabs()` 强制同步写入。

### 操作 (Actions)

| 操作                   | 参数                                             | 返回值 | 说明                                             |
| ---------------------- | ------------------------------------------------ | ------ | ------------------------------------------------ |
| `addTab`               | `tab: EditorTab`                                 | `void` | 添加新标签页并自动切换到它                       |
| `closeTab`             | `id: string`                                     | `void` | 关闭标签页。若关闭的是当前标签，自动切换到第一个 |
| `setActiveTab`         | `id: string`                                     | `void` | 切换到指定标签页                                 |
| `updateContent`        | `id: string, content: string`                    | `void` | 更新指定标签页的编辑器内容                       |
| `updateCursorPosition` | `id: string, lineNumber: number, column: number` | `void` | 更新光标位置（持久化）                           |
| `updateScrollTop`      | `id: string, scrollTop: number`                  | `void` | 更新滚动位置（持久化）                           |
| `restoreTabs`          | 无                                               | `void` | 从 localStorage 恢复标签页状态                   |

**导出函数：**

| 函数                 | 说明                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| `flushPersistTabs()` | 强制将当前标签页状态同步写入 localStorage（通常在 `beforeunload` 时调用） |

### 选择器示例

```typescript
const tabs = useEditorStore((s) => s.tabs)
const activeTabId = useEditorStore((s) => s.activeTabId)
const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
```

---

## problemStore — 题目状态

**文件位置：** `src/stores/problemStore.ts`

**Hook：** `useProblemStore`

### 状态形状 (State)

| 字段               | 类型                 | 默认值             | 说明                    |
| ------------------ | -------------------- | ------------------ | ----------------------- |
| `problems`         | `Problem[]`          | `[]`               | 题目列表                |
| `activeProblemId`  | `number \| null`     | `null`             | 当前选中的题目 ID       |
| `activeProblem`    | `Problem \| null`    | `null`             | 当前选中的题目详情      |
| `submitResult`     | `Submission \| null` | `null`             | 最近一次提交结果        |
| `submitting`       | `boolean`            | `false`            | 是否正在提交            |
| `selectedLanguage` | `string`             | `DEFAULT_LANGUAGE` | 当前选择的编程语言      |
| `filters`          | `ProblemFilters`     | `{}`               | 当前过滤条件            |
| `listCollapsed`    | `boolean`            | `false`            | 题目列表是否折叠        |
| `aiPanelOpen`      | `boolean`            | `false`            | AI 辅助面板是否打开     |
| `aiPanelWidth`     | `number`             | `420`              | AI 辅助面板宽度（像素） |
| `loading`          | `boolean`            | `false`            | 是否正在加载题目        |
| `loadError`        | `string \| null`     | `null`             | 加载错误信息            |

**类型定义：**

```typescript
interface ProblemFilters {
  difficulty?: string
  tag?: string
  status?: string
  source?: string
  track?: string
  platform?: string
  mode?: string
}

interface Submission {
  status: 'accepted' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout' | 'error'
  passed: number
  total: number
  results: Array<{ input: string; expected: string; actual: string; passed: boolean }>
  duration: number
}
```

### 操作 (Actions)

| 操作                  | 参数                             | 返回值          | 说明                          |
| --------------------- | -------------------------------- | --------------- | ----------------------------- |
| `loadProblems`        | 无                               | `Promise<void>` | 根据当前 filters 加载题目列表 |
| `setActiveProblem`    | `id: number`                     | `Promise<void>` | 选中题目并加载详情            |
| `setFilters`          | `filters: ProblemFilters`        | `void`          | 设置过滤条件并自动重新加载    |
| `setSelectedLanguage` | `lang: string`                   | `void`          | 设置当前编程语言              |
| `setListCollapsed`    | `v: boolean`                     | `void`          | 设置题目列表折叠状态          |
| `setAIPanelOpen`      | `v: boolean`                     | `void`          | 设置 AI 面板开关              |
| `setAIPanelWidth`     | `width: number`                  | `void`          | 设置 AI 面板宽度              |
| `submit`              | `code: string, language: string` | `Promise<void>` | 提交代码解答                  |
| `clearResult`         | 无                               | `void`          | 清除提交结果                  |

### submit 流程

1. 设置 `submitting: true`，清除旧结果。
2. 调用 `problems-submit` IPC。
3. 成功时保存结果并刷新题目列表（更新 `solved` 计数）。
4. 失败时保存一个 `status: 'error'` 的兜底结果。
5. 最终设置 `submitting: false`。

### 选择器示例

```typescript
const problems = useProblemStore((s) => s.problems)
const activeProblem = useProblemStore((s) => s.activeProblem)
const submitting = useProblemStore((s) => s.submitting)
const filters = useProblemStore((s) => s.filters)
```

---

## settingsStore — 设置状态

**文件位置：** `src/stores/settingsStore.ts`

**Hook：** `useSettingsStore`

### 状态形状 (State)

| 字段        | 类型             | 默认值  | 说明            |
| ----------- | ---------------- | ------- | --------------- |
| `aiConfigs` | `ChatConfig[]`   | `[]`    | AI 模型配置列表 |
| `loading`   | `boolean`        | `false` | 是否正在加载    |
| `saving`    | `boolean`        | `false` | 是否正在保存    |
| `saveError` | `string \| null` | `null`  | 保存错误信息    |

**类型定义：**

```typescript
interface ChatConfig {
  id?: number
  name: string
  api_key: string
  base_url: string
  model: string
  is_default?: boolean
  task_type?: string
}
```

### 操作 (Actions)

| 操作           | 参数                 | 返回值          | 说明                                   |
| -------------- | -------------------- | --------------- | -------------------------------------- |
| `loadConfigs`  | 无                   | `Promise<void>` | 加载所有 AI 配置                       |
| `saveConfig`   | `config: ChatConfig` | `Promise<void>` | 保存配置（新建或更新），失败时抛出异常 |
| `deleteConfig` | `id: number`         | `Promise<void>` | 删除配置                               |

### 选择器示例

```typescript
const configs = useSettingsStore((s) => s.aiConfigs)
const loading = useSettingsStore((s) => s.loading)
const saving = useSettingsStore((s) => s.saving)
```

---

## Store 间协作

Store 之间通过直接引用其他 Store 的 `getState()` 方法进行协作，无需事件总线：

| 场景       | 协作方式                                                                           |
| ---------- | ---------------------------------------------------------------------------------- |
| 主题切换   | `appStore.setTheme` 同时更新 DOM 和数据库                                          |
| 发送消息   | `chatStore.sendMessage` 自动创建会话、保存消息、提取记忆                           |
| 提交代码   | `problemStore.submit` 完成后刷新题目列表以更新 `solved` 计数                       |
| 编辑器主题 | `monacoConfig.ts` 中的 `useMonacoTheme` 从 `appStore` 读取主题并映射到 Monaco 主题 |
| 编辑器标签 | `monacoConfig.ts` 中的 `useActiveTab` 从 `editorStore` 读取当前标签页              |

---

## 使用指南

### 基础用法

```typescript
import { useProblemStore } from '../stores/problemStore'

function ProblemList() {
  const problems = useProblemStore((s) => s.problems)
  const loading = useProblemStore((s) => s.loading)
  const loadProblems = useProblemStore((s) => s.loadProblems)

  useEffect(() => {
    loadProblems()
  }, [loadProblems])

  if (loading) return <div>加载中...</div>
  return <div>{problems.map(p => <ProblemCard key={p.id} problem={p} />)}</div>
}
```

### 最佳实践

1. **细粒度订阅**：使用选择器函数订阅所需的最小状态，避免全量订阅导致不必要的渲染。

   ```typescript
   // 推荐
   const streaming = useChatStore((s) => s.streaming)
   // 不推荐
   const state = useChatStore()
   ```

2. **操作引用稳定**：Zustand 的 `set` 函数引用是稳定的，可以直接在 `useEffect` 依赖中使用。

3. **错误处理**：所有异步操作的错误由 Store 内部捕获并设置 `error` / `loadError` 字段，组件层读取错误状态即可。`settingsStore.saveConfig` 是例外，它会重新抛出异常。

4. **乐观更新**：`chatStore.sendMessage` 先添加空消息再发起请求，用户能立即看到消息气泡。
