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

管理普通文件、题目和练习三类统一多标签编辑器。Electron 中由 SQLite 工作区负责跨重启持久化，`localStorage` 仅保存 v4 工作区快照和逐 app boot / Renderer session 崩溃恢复日志；v1/v2/v3 快照及旧的无 boot scope recovery 会原地迁移，不需要清空用户数据。相同 tab 的同内容恢复候选会去重并合并 source keys；分叉候选全部保留，较旧分支以普通 `.recovered` 文件打开。同一 boot 的其他 Renderer recovery map 不会被跨窗口改写。

### 状态字段

| 字段                 | 类型                   | 默认值          | 说明                                       |
| -------------------- | ---------------------- | --------------- | ------------------------------------------ |
| `tabs`               | `EditorTab[]`          | `[DEFAULT_TAB]` | 打开的统一标签列表                         |
| `activeTabId`        | `string \| null`       | `'welcome'`     | 当前活动标签页 ID                          |
| `recentlyClosedTabs` | `EditorTab[]`          | `[]`            | 可恢复的最近关闭标签                       |
| `databaseStatus`     | `EditorDatabaseStatus` | `'idle'`        | SQLite 同步、降级或冲突状态                |
| `restoreStatus`      | `EditorRestoreStatus`  | `'idle'`        | 启动恢复、恢复副本或损坏快照降级状态       |
| `hydrationEpoch`     | `number`               | `0`             | 权威内容替换时触发编辑器文档重新水合的代次 |

**EditorTab 类型**：

```typescript
interface EditorTab {
  id: string
  kind: 'file' | 'problem' | 'exercise'
  filename: string
  language: string
  content: string
  problemId?: string
  cursorPosition?: { lineNumber: number; column: number }
  scrollTop?: number
  revision?: number
  syncConflict?: boolean
  localOnly?: boolean
  recoverySourceKeys?: string[]
  recoveryOriginalId?: string
}
```

`recoverySourceKeys` 记录未解决分叉恢复的 localStorage 来源，`recoveryOriginalId` 记录 `.recovered` 副本来自哪个原始标签。两者与 `syncConflict` 会跨 SQLite 保存、远端 hydration 和 generation 重载保留，仅在用户选择冲突处理动作且操作成功后清理；它们不属于 SQLite 表字段。

来源 key 清理会重新读取并校验目标 entry，写后还要确认目标已经不存在。清理异常、并发改写或同一 app boot 的 foreign owner 仍存活时返回失败，Store 保留 provenance，工作区保持可见降级并等待安全重试。

### Actions

| Action                 | 参数             | 返回值 | 说明                                                       |
| ---------------------- | ---------------- | ------ | ---------------------------------------------------------- |
| `addTab`               | `tab: EditorTab` | `void` | 添加新标签页                                               |
| `closeTab`             | `id: string`     | `void` | 关闭标签页                                                 |
| `setActiveTab`         | `id: string`     | `void` | 切换活动标签页                                             |
| `updateTab`            | `id, patch`      | `void` | 更新文件名、语言、类型、题目标识等标签元数据               |
| `updateContent`        | `id, content`    | `void` | 更新标签页内容                                             |
| `updateCursorPosition` | `id, line, col`  | `void` | 更新光标，并同步写轻量视图恢复记录                         |
| `updateScrollTop`      | `id, scrollTop`  | `void` | 更新滚动，并同步写轻量视图恢复记录                         |
| `restoreTabs`          | 无               | `void` | 读取版本化快照与逐标签恢复日志，随后由同步器和 SQLite 协调 |

`closeTab` 是同步内存操作，不代表 SQLite 已持久化。产品组件关闭标签时必须使用 `requestCloseEditorWorkspaceTab`；只有同步器应用已确认的远端 mutation，或用户明确接受“仅本地关闭”降级时，才直接调用 `closeTab`。重新打开使用 `reopenTab`，同步器会观察乐观更新并持久化；当前没有独立的 durable reopen 请求函数。practice-backed 标签包括 `kind: 'exercise'` 和 ID 为 `exercise-*` 的导入题目，它们的 `content` 始终为空，代码权威位于版本化练习草稿仓储。光标和滚动 action 在返回前写入独立的 per-boot/per-Renderer 视图 recovery；该记录不含代码，启动时按 `viewUpdatedAt` 与 SQLite 双向协调，且只有匹配的 SQLite 回执才能按捕获指纹清理。

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
