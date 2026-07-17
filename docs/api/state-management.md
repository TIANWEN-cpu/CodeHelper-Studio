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
  kind: 'file' | 'problem' | 'exercise' // 普通文件、题目或练习
  filename: string // 文件名（用于显示和语言推断）
  language: string // 编程语言（CodeMirror 语法高亮）
  content: string // 编辑器内容
  cursorPosition?: { lineNumber: number; column: number } // 光标位置（SQLite + 轻量 recovery）
  scrollTop?: number // 滚动位置（SQLite + 轻量 recovery）
  revision?: number // SQLite 乐观并发 revision
  syncConflict?: boolean // 仍需用户处理的数据库或恢复分支冲突
  localOnly?: boolean // 尚未完全由 SQLite 承载
  recoverySourceKeys?: string[] // 冲突分支对应的 Renderer recovery 来源
  recoveryOriginalId?: string // .recovered 副本的原始标签 ID
}
```

**默认标签页：** 应用启动时包含一个 `welcome.py` 标签页，内容为示例代码。SQLite `editor_workspaces` / `editor_tabs` 是 Electron 中的持久化事实来源；localStorage 工作区快照当前为 **v4**（键 `codehelper-editor-workspace`，`EDITOR_STORAGE_VERSION = 4`），保留为同步降级与崩溃恢复路径，并原地兼容 v1/v2/v3 快照和旧的 `codehelper-editor-tabs` 数组格式。完整快照仍以 500ms 防抖写入；每个发生内容或语言变化的**非练习草稿权威**标签还会同步写入多标签内容恢复日志（`codehelper-editor-workspace-recovery-v2.session.boot-<app-boot>--renderer-<renderer>` + v3 条目结构），并兼容导入旧的无 boot scope session、共享 v2 与单标签 v1 recovery。恢复读取会聚合同一 tab ID 的所有窗口候选：完全相同的内容分支去重并合并 source keys，分叉时保留较新分支在原标签，把其他分支打开为确定性的普通 `.recovered` 文件。光标或滚动变化则在 action 返回前同步写入独立、轻量的视图恢复日志（`codehelper-editor-workspace-view-recovery-v1.session.boot-<app-boot>--renderer-<renderer>`）；条目只包含 tab ID、光标、滚动位置和时间戳，不序列化任何文件或练习代码。启动时先合并内容恢复，再为普通文件、题目和练习标签应用各窗口中最新的视图条目，视图差异不会生成 `.recovered` 文件。内容恢复只有在对应内容成功持久化后才按 source key 清除；视图同步请求会先捕获 source entry 指纹，只有 SQLite 回执与请求的光标和滚动完全一致时才清除未变化的条目，迟到回执不会删除请求期间产生的新视图。同一 app boot 中其他 Renderer 的内容和视图 recovery map 均保持只读，重启后 owner 已退出才清理匹配条目，因此跨窗口清理不会覆盖并发新写入。页面 `pagehide` / `beforeunload` 时通过 `flushPersistTabs()` 强制同步写入。关闭真实 Electron 窗口时，主进程还会发起有界 flush 握手并等待编辑器及练习草稿处理器；SQLite 写入失败但恢复区有效时，关闭对话框明确显示“内容仅保存在恢复区”，不会把它计作完整保存。内容超过 5 MB、存储配额不足或 SQLite 通道不可用时会保留内存与本地恢复内容，并在状态栏明确显示失败或仅本地保存。损坏、不支持版本或没有有效标签的原始快照或恢复日志会备份到 `.corrupt.*` 键，完整备份失败时则锁定原 key 防止覆盖。只要出现损坏，SQLite 仅能证明其中已有记录可用，无法证明损坏快照中不存在尚未同步的标签或视图；因此 UI 保持“工作区恢复降级”并保留具体备份/保护原因，不会宣称完整恢复。题目 starter code 只在 SQLite 初始协调完成后初始化当前可见且真正空白的普通文件标签；即使全局 active tab 仍指向练习标签，也不会错过该可见文件，更不会覆盖已有内容、题目或练习标签。工作区最多保留 50 个标签；最近关闭列表会随版本化快照及 SQLite 状态持久化，最多保留 10 个，重启后仍可通过编辑器标签栏的恢复按钮重新打开。

上述“成功后清理”不适用于尚未解决的分叉恢复。`.recovered` 分支即使已经写入 SQLite，Renderer 仍保留 `syncConflict`、`recoverySourceKeys` 和 `recoveryOriginalId`，普通保存、远端 hydration 或 generation 缺口重载都不得清除它们。只有用户明确选择采用数据库版本、保留本地版本或另存副本，并且对应操作成功后，才同时清除冲突标记和来源 recovery key。这些 provenance 字段只属于 Renderer/localStorage 恢复契约，不扩张 SQLite schema。

来源 key 仍属于同一 app boot 的其他 Renderer，或 localStorage 清理/校验失败时，即使内容已经进入 SQLite，也会继续保留 provenance 并显示同步降级；冲突处理返回未完成，不能先清 UI 标记。owner 退出后的后续启动会在内容精确匹配时重试清理旧来源。

Starter 初始化在每次进入独立工作区时最多尝试一次，只针对当时最初可见的空白普通文件；用户随后点击“新建工作区标签”得到的空白文件不会被异步题目列表回执改造成题目标签。

**Renderer 异常恢复：** 主进程收到非正常 `render-process-gone` 后会保持存活，并以相同位置、尺寸和窗口状态创建替代 BrowserWindow；新 Renderer 仍按上述 SQLite、内容 recovery 与轻量视图 recovery 顺序恢复。顶部“界面进程异常退出”横幅只表示替代窗口已经加载，不表示 SQLite 同步完成；用户仍须以工作区状态栏的“已保存 / 仅本地保存 / 恢复降级”为准。10 秒内连续失败最多自动重试 3 次，超过上限后主进程显示“重新加载 / 关闭窗口”对话框，避免无限崩溃循环。

**练习标签边界：** `kind: 'exercise'` 以及 ID 为 `exercise-*` 的练习入口导入题目（`kind: 'problem'`）与普通文件/独立题目共用 `tabs` 拓扑和最近关闭列表，但持久化的 `content` 必须为空字符串；权威代码位于版本化练习草稿 SQLite 表与其 recovery 区。从 v1/v2/v3 旧快照读到内嵌代码时，会先创建确定性的 `recovered-exercise-*` 普通文件副本，再清空 practice-backed topology 的 content。完整 local topology payload 只导入 `legacy_storage_version === 0` 的未初始化 SQLite 工作区。v1-v3 升级时，显式 recovery/localOnly 内容或与 SQLite 相同 base revision 的本地编辑可以 CAS 重放；远端 revision 已分叉时进入显式冲突，缺少基线的普通快照不会覆盖 SQLite。

练习草稿恢复区的新写入按 app boot + Renderer session 使用 `codehelper-practice-draft-recovery-v2.session.boot-<app-boot>--renderer-<renderer>`，旧的无 boot scope session 及 v1/v2 仍可读取并在匹配内容迁入新 session 后原地清理。启动会聚合所有窗口候选：相同 snapshot/base 去重，分叉进入显式冲突；未选候选生成带窗口 source fingerprint 的普通 `localOnly` 恢复文件。SQLite 成功只清理匹配 snapshot 的 source keys；当前 boot 的其他 Renderer map 不跨窗口改写，旧 boot 的匹配条目在 owner 已退出后清理，不删除任何分叉。恢复区不会为新草稿静默淘汰旧草稿；达到 20 条或 1,000,000 字符总量时，写入返回可见错误并保留全部已有数据；损坏 JSON 会备份到 `.corrupt.*` 键并停止覆盖，直到用户恢复或清理。

### 操作 (Actions)

| 操作                   | 参数                                             | 返回值    | 说明                                                              |
| ---------------------- | ------------------------------------------------ | --------- | ----------------------------------------------------------------- |
| `addTab`               | `tab: EditorTab`                                 | `void`    | 添加新标签页并自动切换到它；练习标签 content 会被规范为空         |
| `closeTab`             | `id: string`                                     | `void`    | 关闭标签页。若关闭的是当前标签，优先切换到前一个                  |
| `reopenTab`            | `id: string`                                     | `boolean` | 按 ID 从最近关闭列表恢复标签；成功返回 true                       |
| `reopenLastClosed`     | 无                                               | `void`    | 恢复最近关闭列表中的第一个标签页                                  |
| `setActiveTab`         | `id: string`                                     | `void`    | 只允许切换到当前存在的标签页                                      |
| `updateTab`            | `id: string, patch: Partial<EditorTab>`          | `void`    | 原子更新文件名、语言、类型、题目标识或其他标签元数据              |
| `updateContent`        | `id: string, content: string`                    | `void`    | 更新指定标签页内容；**练习标签忽略 content 写入**                 |
| `updateCursorPosition` | `id: string, lineNumber: number, column: number` | `void`    | 更新光标并在返回前写入轻量视图恢复日志                            |
| `updateScrollTop`      | `id: string, scrollTop: number`                  | `void`    | 更新滚动位置并在返回前写入轻量视图恢复日志                        |
| `restoreTabs`          | 无                                               | `void`    | 校验并从版本化 localStorage + recovery 恢复；设置 `restoreStatus` |

**导出函数：**

| 函数                 | 说明                                                                      |
| -------------------- | ------------------------------------------------------------------------- |
| `flushPersistTabs()` | 强制将当前标签页状态同步写入 localStorage（通常在 `beforeunload` 时调用） |

产品 UI 不得直接把 `closeTab` 当成持久化关闭完成。关闭必须调用 `requestCloseEditorWorkspaceTab`，等待 SQLite 或显式 recovery durability 结果后再改变界面；`closeTab` 只供同步器完成远端结果落地或明确的“仅本地关闭”降级路径使用。重新打开使用 Store 的 `reopenTab`，同步器会观察该乐观更新并持久化；当前没有 `requestReopenEditorWorkspaceTab` API。

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

| 场景       | 协作方式                                                             |
| ---------- | -------------------------------------------------------------------- |
| 主题切换   | `appStore.setTheme` 同时更新 DOM 和数据库                            |
| 发送消息   | `chatStore.sendMessage` 自动创建会话、保存消息、提取记忆             |
| 提交代码   | `problemStore.submit` 完成后刷新题目列表以更新 `solved` 计数         |
| 编辑器主题 | 应用主题经 `appStore` 持有，编辑器（CodeMirror）据其应用对应代码主题 |
| 编辑器标签 | `editorStore` 持有标签页状态，编辑器组件读取当前标签页代码           |

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
