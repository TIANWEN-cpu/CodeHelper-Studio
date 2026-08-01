# IPC 协议文档

CodeHelper 采用 Electron IPC（进程间通信）机制在渲染进程和主进程之间传递数据。所有 IPC 调用通过 `preload.ts` 中暴露的 `window.api` 接口进行，主进程通过 `electron/ipc/*.ts` 中注册的 handler 响应请求。

---

## 目录

- [通信架构](#通信架构)
- [安全机制](#安全机制)
- [频道一览](#频道一览)
- [代码运行 (runner)](#代码运行-runner)
- [数据库/设置 (database)](#数据库设置-database)
- [AI 对话 (ai)](#ai-对话-ai)
- [Agent 工具链 (agent)](#agent-工具链-agent)
- [聊天会话管理 (chat)](#聊天会话管理-chat)
- [题目管理 (problems)](#题目管理-problems)
- [错题本 (mistakes)](#错题本-mistakes)
- [知识库 RAG (rag)](#知识库-rag-rag)
- [运行器诊断 (runner)](#运行器诊断-runner)
- [平台信息与关闭握手](#平台信息与关闭握手)
- [聊天增强 (chat)](#聊天增强-chat)
- [复习计划 (review)](#复习计划-review)
- [知识库高级 (rag)](#知识库高级-rag)
- [统计与首页 (analytics / home)](#统计与首页-analytics--home)
- [数据导出与导入 (export / import)](#数据导出与导入-export--import)
- [备份、恢复与系统能力](#备份恢复与系统能力)
- [课程 (lessons)](#课程-lessons)
- [练习 (exercises)](#练习-exercises)
- [编辑器工作区 (editor-workspace)](#编辑器工作区-editor-workspace)
- [桌面伙伴 (pets)](#桌面伙伴-pets)
- [学习记录 (learning-records)](#学习记录-learning-records)
- [事件频道 (event)](#事件频道-event)
- [外部链接](#外部链接)
- [错误处理](#错误处理)
- [使用示例](#使用示例)

---

## 通信架构

```
渲染进程 (React)          主进程 (Electron)
┌────────────────┐        ┌──────────────────────────┐
│  window.api    │───────>│  ipcMain.handle(...)     │
│  .invoke(ch,..)│        │  electron/ipc/*.ts       │
│                │<───────│  return result / throw    │
│  window.api    │        │                          │
│  .on(ch, cb)   │<───────│  win.webContents.send()  │
└────────────────┘        └──────────────────────────┘
```

- **invoke/handle**：请求-响应模式，渲染进程发起，主进程返回结果。
- **send/on**：主进程主动推送事件到渲染进程（用于 AI 流式响应）。

---

## 安全机制

`preload.ts` 中实现了以下安全措施：

1. **频道白名单**：仅允许已注册的 invoke 频道和事件频道。
2. **参数序列化检查**：递归验证参数深度不超过 10 层，且不含函数、Symbol、BigInt。
3. **contextBridge 隔离**：渲染进程无法直接访问 Node.js API。
4. **主进程参数校验**：每个 handler 都进行严格的类型和范围检查。

---

## 频道一览

| 频道名                            | 类型   | 方向     | 说明                                                                                                       |
| --------------------------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `run-code`                        | invoke | 渲染->主 | 运行代码片段                                                                                               |
| `runner-detect-toolchains`        | invoke | 渲染->主 | 探测工具链与隔离能力（{ force? } -> ToolchainReport）                                                      |
| `runner-isolation-info`           | invoke | 渲染->主 | 获取运行隔离信息（void -> IsolationInfo）                                                                  |
| `db-get-setting`                  | invoke | 渲染->主 | 读取设置项                                                                                                 |
| `db-set-setting`                  | invoke | 渲染->主 | 写入设置项                                                                                                 |
| `db-get-ai-configs`               | invoke | 渲染->主 | 获取所有 AI 配置                                                                                           |
| `db-save-ai-config`               | invoke | 渲染->主 | 保存 AI 配置                                                                                               |
| `db-delete-ai-config`             | invoke | 渲染->主 | 删除 AI 配置                                                                                               |
| `db-get-default-ai-config`        | invoke | 渲染->主 | 获取默认 AI 配置                                                                                           |
| `platform-info`                   | invoke | 渲染->主 | 获取平台信息（运行时/系统/架构/应用版本）                                                                  |
| `app-close-flush-complete`        | invoke | 渲染->主 | 完成关闭握手（{ requestId, ok, error?, recoveryAvailable? } -> { accepted }）                              |
| `ai-fetch-models`                 | invoke | 渲染->主 | 获取可用模型列表                                                                                           |
| `ai-chat`                         | invoke | 渲染->主 | 发送 AI 聊天请求                                                                                           |
| `ai-chat-cancel`                  | invoke | 渲染->主 | 取消指定 AI 请求                                                                                           |
| `agent-tools-list`                | invoke | 渲染->主 | 获取 Agent 工具白名单                                                                                      |
| `agent-runs-list`                 | invoke | 渲染->主 | 查询 Agent 运行历史                                                                                        |
| `agent-audit-list`                | invoke | 渲染->主 | 查询 Agent 审计事件                                                                                        |
| `agent-run-create`                | invoke | 渲染->主 | 创建并准备 Agent 运行                                                                                      |
| `agent-run-approve`               | invoke | 渲染->主 | 批准单个工具调用                                                                                           |
| `agent-run-reject`                | invoke | 渲染->主 | 拒绝单个工具调用                                                                                           |
| `agent-run-cancel`                | invoke | 渲染->主 | 取消 Agent 运行                                                                                            |
| `agent-run-model-started`         | invoke | 渲染->主 | 记录模型合成开始（{ runId, requestId? } -> AgentRunRecord）                                                |
| `agent-run-complete`              | invoke | 渲染->主 | 标记 Agent 运行完成（{ runId } -> AgentRunRecord）                                                         |
| `agent-run-fail`                  | invoke | 渲染->主 | 标记 Agent 运行失败（{ runId, note? } -> AgentRunRecord）                                                  |
| `problems-list`                   | invoke | 渲染->主 | 获取题目列表                                                                                               |
| `problems-get`                    | invoke | 渲染->主 | 获取单个题目                                                                                               |
| `problems-submit`                 | invoke | 渲染->主 | 提交代码                                                                                                   |
| `problems-submissions`            | invoke | 渲染->主 | 获取提交记录                                                                                               |
| `mistakes-list`                   | invoke | 渲染->主 | 获取错题列表                                                                                               |
| `mistakes-get`                    | invoke | 渲染->主 | 获取单个错题                                                                                               |
| `mistakes-update-analysis`        | invoke | 渲染->主 | 更新错题 AI 分析                                                                                           |
| `mistakes-delete`                 | invoke | 渲染->主 | 删除错题                                                                                                   |
| `review-due`                      | invoke | 渲染->主 | 获取到期复习项（无 -> ReviewScheduleRow[]）                                                                |
| `review-update`                   | invoke | 渲染->主 | 更新 SM-2 复习计划（{ exercise_id, quality } -> ReviewScheduleRow）                                        |
| `review-stats`                    | invoke | 渲染->主 | 获取复习统计（无 -> { totalDue, completedToday, mastered }）                                               |
| `review-schedule`                 | invoke | 渲染->主 | 获取单个复习计划（exerciseId -> ReviewScheduleRow \| undefined）                                           |
| `knowledge-upload`                | invoke | 渲染->主 | 上传知识文档                                                                                               |
| `knowledge-list`                  | invoke | 渲染->主 | 获取知识文档列表                                                                                           |
| `knowledge-delete`                | invoke | 渲染->主 | 删除知识文档                                                                                               |
| `knowledge-search`                | invoke | 渲染->主 | 搜索知识库                                                                                                 |
| `knowledge-get`                   | invoke | 渲染->主 | 获取单个文档详情（id -> KnowledgeDocDetail \| null）                                                       |
| `knowledge-link-audit`            | invoke | 渲染->主 | 获取文档链接审计状态（docId -> KnowledgeLinkAuditRecord[]）                                                |
| `knowledge-retrieval-status`      | invoke | 渲染->主 | 获取检索后端状态与索引规模（无 -> KnowledgeRetrievalStatus）                                               |
| `knowledge-semantic-search`       | invoke | 渲染->主 | 语义近似检索（query -> SemanticSearchResult[]）                                                            |
| `knowledge-summarize`             | invoke | 渲染->主 | 生成结果摘要（query -> KnowledgeSummary { summary, keyConcepts }）                                         |
| `knowledge-concept-graph`         | invoke | 渲染->主 | 概念图谱（占位，无 -> { nodes: [], edges: [] }）                                                           |
| `knowledge-concept-detail`        | invoke | 渲染->主 | 概念详情（占位，conceptId -> 合成概念）                                                                    |
| `knowledge-auto-tag`              | invoke | 渲染->主 | 自动标签建议（占位，docId -> []）                                                                          |
| `knowledge-tags`                  | invoke | 渲染->主 | 获取标签列表（占位，无 -> []）                                                                             |
| `knowledge-tag-documents`         | invoke | 渲染->主 | 按标签获取文档（占位，tag -> []）                                                                          |
| `knowledge-rag-context`           | invoke | 渲染->主 | 获取 RAG 上下文（query? -> RAGContext）                                                                    |
| `resource-pack-import`            | invoke | 渲染->主 | 导入外部学习资源包（{ rootPath? } -> ResourcePackImportResult \| null）                                    |
| `open-external`                   | invoke | 渲染->主 | 打开外部链接                                                                                               |
| `analytics-track`                 | invoke | 渲染->主 | 记录本地统计事件（eventType, eventData? -> void）                                                          |
| `analytics-get-events`            | invoke | 渲染->主 | 获取统计事件（filters? -> AnalyticsEvent[]）                                                               |
| `analytics-get-summary`           | invoke | 渲染->主 | 获取活动汇总（days? -> AnalyticsSummary）                                                                  |
| `analytics-get-streak`            | invoke | 渲染->主 | 获取连续学习天数（无 -> 天数）                                                                             |
| `analytics-get-weekly-report`     | invoke | 渲染->主 | 获取周报（weekOffset? -> WeeklyReport）                                                                    |
| `analytics-clear`                 | invoke | 渲染->主 | 清空统计事件（无 -> void）                                                                                 |
| `demo-load-data`                  | invoke | 渲染->主 | 加载演示数据（无 -> DemoLoadResult）                                                                       |
| `home-get-overview`               | invoke | 渲染->主 | 获取首页总览（无 -> HomeOverview）                                                                         |
| `export-data`                     | invoke | 渲染->主 | 导出数据（ExportCategory[] -> { success, filePath?, error? }）                                             |
| `import-data`                     | invoke | 渲染->主 | 导入数据（ImportOptions? -> ImportResult）                                                                 |
| `export-get-counts`               | invoke | 渲染->主 | 获取各分类导出数量（无 -> 各分类计数）                                                                     |
| `database-backups-list`           | invoke | 渲染->主 | 列出数据库备份（无 -> DatabaseBackupListResult）                                                           |
| `database-backup-create`          | invoke | 渲染->主 | 创建数据库快照备份（无 -> DatabaseBackupCreateResult）                                                     |
| `database-backups-open-directory` | invoke | 渲染->主 | 打开备份目录（无 -> OpenBackupDirectoryResult）                                                            |
| `recovery-layer-export`           | invoke | 渲染->主 | 导出恢复层条目（RecoveryLayerEntry[] -> RecoveryLayerExportResult）                                        |
| `system-capabilities-get`         | invoke | 渲染->主 | 获取系统能力状态（{ force? } -> SystemCapabilityStatus）                                                   |
| `perf-get-ipc-stats`              | invoke | 渲染->主 | 获取 IPC 性能统计（无 -> 统计信息）                                                                        |
| `chat-sessions-list`              | invoke | 渲染->主 | 获取聊天会话列表                                                                                           |
| `chat-session-create`             | invoke | 渲染->主 | 创建聊天会话                                                                                               |
| `chat-session-update`             | invoke | 渲染->主 | 更新聊天会话                                                                                               |
| `chat-session-delete`             | invoke | 渲染->主 | 删除聊天会话                                                                                               |
| `chat-messages-load`              | invoke | 渲染->主 | 加载聊天消息                                                                                               |
| `chat-message-save`               | invoke | 渲染->主 | 保存聊天消息                                                                                               |
| `chat-presets-list`               | invoke | 渲染->主 | 获取提示词预设列表                                                                                         |
| `chat-preset-save`                | invoke | 渲染->主 | 保存提示词预设                                                                                             |
| `chat-preset-delete`              | invoke | 渲染->主 | 删除提示词预设                                                                                             |
| `chat-memories-list`              | invoke | 渲染->主 | 获取长期记忆列表                                                                                           |
| `chat-memory-save`                | invoke | 渲染->主 | 保存长期记忆                                                                                               |
| `chat-memory-delete`              | invoke | 渲染->主 | 删除长期记忆                                                                                               |
| `chat-memory-capture`             | invoke | 渲染->主 | 从消息中自动提取记忆                                                                                       |
| `chat-context-preview`            | invoke | 渲染->主 | 预览将注入聊天的本地记忆（{ query?, includeMemories?, memoryCategories? } -> { memories }）                |
| `chat-memories-batch`             | invoke | 渲染->主 | 批量操作记忆（{ ids, action } -> { affected }）                                                            |
| `chat-memory-extract`             | invoke | 渲染->主 | AI 增强记忆提取（{ content, configId?, sessionId? } -> Memory[]）                                          |
| `lessons-list`                    | invoke | 渲染->主 | 获取课程轨道列表（无 -> Track[]）                                                                          |
| `lessons-get`                     | invoke | 渲染->主 | 获取课程内容（lessonId -> Lesson）                                                                         |
| `lessons-progress`                | invoke | 渲染->主 | 获取轨道学习进度（trackId -> LessonProgress[]）                                                            |
| `lessons-mark-opened`             | invoke | 渲染->主 | 标记课程已打开（lessonId, trackId -> { ok: true }）                                                        |
| `lessons-mark-completed`          | invoke | 渲染->主 | 标记课程已完成（lessonId, trackId -> { ok: true }）                                                        |
| `lessons-notes-get`               | invoke | 渲染->主 | 获取课程笔记（lessonId -> note 字符串）                                                                    |
| `lessons-notes-save`              | invoke | 渲染->主 | 保存课程笔记（lessonId, content -> { ok: true }）                                                          |
| `lessons-search`                  | invoke | 渲染->主 | 搜索课程（query -> lesson id[]）                                                                           |
| `lesson-get-progress`             | invoke | 渲染->主 | 获取首页学习进度行（无 -> 进度行）                                                                         |
| `exercises-list`                  | invoke | 渲染->主 | 获取练习列表（{ track_id?, difficulty? } -> Exercise[]）                                                   |
| `exercises-get`                   | invoke | 渲染->主 | 获取单个练习（id -> Exercise）                                                                             |
| `exercises-draft-get`             | invoke | 渲染->主 | 获取练习草稿（exerciseId -> PracticeDraft \| null）                                                        |
| `exercises-draft-save`            | invoke | 渲染->主 | 保存练习草稿（{ exerciseId, code, language, baseRevision, title? } -> DraftMutationResult）                |
| `exercises-draft-clear`           | invoke | 渲染->主 | 清除练习草稿（{ exerciseId, baseRevision } -> DraftMutationResult）                                        |
| `exercises-evaluate`              | invoke | 渲染->主 | 提交练习判题（{ exerciseId, code, language? } -> { passed, score, feedback_lines, stdout, duration_sec }） |
| `editor-workspace-load`           | invoke | 渲染->主 | 加载编辑器工作区（{ workspaceId } -> EditorWorkspaceRecord）                                               |
| `editor-workspace-migrate-legacy` | invoke | 渲染->主 | 迁移旧版工作区（MigrateLegacyEditorWorkspaceInput -> 结果）                                                |
| `editor-tab-save`                 | invoke | 渲染->主 | 保存编辑器标签（SaveEditorTabInput -> EditorTabMutationResult）                                            |
| `editor-tab-update-view-state`    | invoke | 渲染->主 | 保存标签光标/滚动状态（UpdateEditorTabViewStateInput -> 结果）                                             |
| `editor-tab-close`                | invoke | 渲染->主 | 关闭标签（VersionedEditorTabMutationInput -> EditorTabMutationResult）                                     |
| `editor-tab-reopen`               | invoke | 渲染->主 | 重新打开标签（VersionedEditorTabMutationInput -> EditorTabMutationResult）                                 |
| `editor-tab-delete`               | invoke | 渲染->主 | 删除标签（VersionedEditorTabMutationInput -> EditorTabMutationResult）                                     |
| `editor-workspace-set-active`     | invoke | 渲染->主 | 设置活动标签（{ workspaceId, tabId } -> SetActiveEditorTabResult）                                         |
| `pets-list`                       | invoke | 渲染->主 | 列出已安装伙伴（无 -> CodexPetDefinition[]）                                                               |
| `pets-install-slug`               | invoke | 渲染->主 | 按 slug 安装伙伴（slug -> PetInstallResult）                                                               |
| `pets-import-file`                | invoke | 渲染->主 | 从文件导入伙伴（系统对话框 -> PetInstallResult）                                                           |
| `pets-import-directory`           | invoke | 渲染->主 | 从目录导入伙伴（系统对话框 -> PetInstallResult）                                                           |
| `learning-records-clear`          | invoke | 渲染->主 | 清空学习记录（无 -> LearningRecordsClearResult）                                                           |
| `ai-chat-chunk`                   | event  | 主->渲染 | AI 流式响应分片                                                                                            |
| `ai-chat-done`                    | event  | 主->渲染 | AI 流式响应完成                                                                                            |
| `app-before-close`                | event  | 主->渲染 | 窗口关闭前冲刷持久化（{ requestId }）                                                                      |
| `editor-workspace-changed`        | event  | 主->渲染 | 编辑器工作区变更通知（EditorWorkspaceChangedEvent）                                                        |

---

## 代码运行 (runner)

### `run-code`

运行代码片段，支持多种编程语言。

**请求参数：**

| 参数       | 类型     | 必填 | 限制              | 说明                           |
| ---------- | -------- | ---- | ----------------- | ------------------------------ |
| `code`     | `string` | 是   | 最大 100,000 字符 | 源代码                         |
| `language` | `string` | 是   | 最大 50 字符      | 编程语言（如 `python`、`sql`） |
| `stdin`    | `string` | 否   | 最大 100,000 字符 | 标准输入                       |

**返回类型：**

```typescript
interface RunResult {
  stdout: string // 标准输出
  stderr: string // 标准错误
  exitCode: number // 退出码
  stage: string // 执行阶段 ('compile' | 'run')
}
```

**文件位置：** `electron/ipc/runner.ts`

---

## 数据库/设置 (database)

### `db-get-setting`

读取键值对设置项。

**请求参数：**

| 参数  | 类型     | 必填 | 限制          | 说明     |
| ----- | -------- | ---- | ------------- | -------- |
| `key` | `string` | 是   | 最大 256 字符 | 设置键名 |

**返回类型：** `string | null` — 不存在时返回 `null`。

### `db-set-setting`

写入键值对设置项（INSERT OR REPLACE）。

**请求参数：**

| 参数    | 类型     | 必填 | 限制             | 说明     |
| ------- | -------- | ---- | ---------------- | -------- |
| `key`   | `string` | 是   | 最大 256 字符    | 设置键名 |
| `value` | `string` | 是   | 最大 10,000 字符 | 设置值   |

**返回类型：** `void`

### `db-get-ai-configs`

获取所有 AI 模型配置，API Key 自动解密。

**请求参数：** 无

**返回类型：**

```typescript
interface AIConfigDecrypted {
  id: number
  name: string
  api_key: string // 已解密
  base_url: string
  model: string
  is_default: number // 0 或 1
  task_type: string | null
  created_at: string
}
```

### `db-save-ai-config`

保存 AI 配置（新建或更新）。API Key 自动加密存储。若 `is_default` 为 `true`，其他配置的默认标记会被清除。

**请求参数：**

| 参数         | 类型      | 必填 | 限制            | 说明                         |
| ------------ | --------- | ---- | --------------- | ---------------------------- |
| `id`         | `number`  | 否   | 正整数          | 存在时为更新，不存在时为新建 |
| `name`       | `string`  | 是   | 最大 200 字符   | 配置名称                     |
| `api_key`    | `string`  | 是   | 最大 2,000 字符 | API Key                      |
| `base_url`   | `string`  | 是   | 最大 2,000 字符 | API 基础 URL                 |
| `model`      | `string`  | 是   | 最大 200 字符   | 模型名称                     |
| `is_default` | `boolean` | 否   | —               | 是否为默认配置               |
| `task_type`  | `string`  | 否   | 最大 100 字符   | 任务类型                     |

**返回类型：** `number` — 配置 ID。

### `db-delete-ai-config`

删除 AI 配置。

**请求参数：**

| 参数 | 类型     | 必填 | 限制   | 说明    |
| ---- | -------- | ---- | ------ | ------- |
| `id` | `number` | 是   | 正整数 | 配置 ID |

**返回类型：** `void`

### `db-get-default-ai-config`

获取默认 AI 配置（优先 `is_default=1`，否则取第一条），API Key 自动解密。

**请求参数：** 无

**返回类型：** `AIConfigDecrypted | null`

**文件位置：** `electron/ipc/database.ts`

---

## AI 对话 (ai)

### `ai-chat`

发送聊天请求到 AI API，支持流式响应。会自动取消前一个未完成的请求。

**请求参数：**

| 参数              | 类型            | 必填 | 限制          | 说明                       |
| ----------------- | --------------- | ---- | ------------- | -------------------------- |
| `messages`        | `ChatMessage[]` | 是   | 1-200 条      | 消息列表                   |
| `configId`        | `number`        | 否   | 正整数        | 指定使用的 AI 配置         |
| `requestId`       | `string`        | 否   | 最大 200 字符 | 请求标识，用于匹配流式分片 |
| `includeMemories` | `boolean`       | 否   | —             | 是否注入相关长期记忆       |

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string // 每条消息最大 100,000 字符
}
```

**返回类型：**

```typescript
{ success: true, requestId: string, content: string }
```

**流式事件：**

| 事件名          | 载荷                                     | 说明         |
| --------------- | ---------------------------------------- | ------------ |
| `ai-chat-chunk` | `{ requestId: string, chunk: string }`   | 增量文本片段 |
| `ai-chat-done`  | `{ requestId: string, content: string }` | 完整响应文本 |

**错误情况：**

- 未配置 AI 模型：抛出 `'未配置AI模型，请先在设置中添加'`
- API 返回非 200：抛出 `'AI API 错误 (status): body'`
- 响应为空：抛出 `'AI 响应为空'`

**文件位置：** `electron/ipc/ai.ts`

---

### `ai-chat-cancel`

按 `requestId` 取消仍在进行的 AI 请求。未知或已经结束的请求返回
`{ cancelled: false }`。

---

## Agent 工具链 (agent)

Agent 工具权威位于 Electron 主进程。Renderer 只能请求白名单工具，不能提交任意命令或
路径。

| Channel                   | 请求                           | 返回                    |
| ------------------------- | ------------------------------ | ----------------------- |
| `agent-tools-list`        | 无                             | `AgentToolDefinition[]` |
| `agent-runs-list`         | `limit?`                       | `AgentRunRecord[]`      |
| `agent-audit-list`        | `runId, limit?`                | `AgentAuditEvent[]`     |
| `agent-run-create`        | `{ goal, context?, tools[] }`  | `AgentRunRecord`        |
| `agent-run-approve`       | `{ runId, toolCallId, note? }` | `AgentRunRecord`        |
| `agent-run-reject`        | `{ runId, toolCallId, note? }` | `AgentRunRecord`        |
| `agent-run-cancel`        | `{ runId, note? }`             | `AgentRunRecord`        |
| `agent-run-model-started` | `{ runId, requestId? }`        | `AgentRunRecord`        |
| `agent-run-complete`      | `{ runId }`                    | `AgentRunRecord`        |
| `agent-run-fail`          | `{ runId, note? }`             | `AgentRunRecord`        |

`strong-code-run` 必须逐次审批且只允许 `executionMode=strong-isolation`。审批十分钟后过期；
工具未完成时，`agent-run-model-started` 和 `agent-run-complete` 会拒绝状态跃迁。

**文件位置：** `electron/ipc/agent.ts`

---

## 聊天会话管理 (chat)

### `chat-sessions-list`

获取所有聊天会话，按更新时间倒序排列。

**请求参数：** 无

**返回类型：**

```typescript
interface Session {
  id: string
  title: string
  system_prompt: string
  created_at: string
  updated_at: string
}
```

### `chat-session-create`

创建新的聊天会话。

**请求参数：**

| 参数            | 类型     | 必填 | 限制             | 说明                  |
| --------------- | -------- | ---- | ---------------- | --------------------- |
| `id`            | `string` | 是   | 最大 200 字符    | 会话 ID               |
| `title`         | `string` | 否   | 最大 500 字符    | 标题，默认 `'新对话'` |
| `system_prompt` | `string` | 否   | 最大 10,000 字符 | 系统提示词            |

**返回类型：** 新创建的 `Session` 对象。

### `chat-session-update`

更新聊天会话的标题或系统提示词。

**请求参数：**

| 参数                | 类型                                         | 说明                     |
| ------------------- | -------------------------------------------- | ------------------------ |
| 第 1 参数 `id`      | `string`                                     | 会话 ID（最大 200 字符） |
| 第 2 参数 `updates` | `{ title?: string, system_prompt?: string }` | 要更新的字段             |

**返回类型：** `void`

### `chat-session-delete`

删除聊天会话及其所有消息（级联删除）。

**请求参数：**

| 参数 | 类型     | 必填 | 限制          | 说明    |
| ---- | -------- | ---- | ------------- | ------- |
| `id` | `string` | 是   | 最大 200 字符 | 会话 ID |

**返回类型：** `void`

### `chat-messages-load`

加载指定会话的所有消息，按创建时间和 ID 升序排列。

**请求参数：**

| 参数        | 类型     | 必填 | 限制          | 说明    |
| ----------- | -------- | ---- | ------------- | ------- |
| `sessionId` | `string` | 是   | 最大 200 字符 | 会话 ID |

**返回类型：**

```typescript
interface ChatHistoryRow {
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model: string | null
  created_at: string
}
```

### `chat-message-save`

保存一条聊天消息，并自动更新会话的 `updated_at`。

**请求参数：**

| 参数         | 类型     | 必填 | 限制                        | 说明         |
| ------------ | -------- | ---- | --------------------------- | ------------ |
| `session_id` | `string` | 是   | 最大 200 字符               | 会话 ID      |
| `role`       | `string` | 是   | `user`/`assistant`/`system` | 角色         |
| `content`    | `string` | 是   | 最大 100,000 字符           | 消息内容     |
| `model`      | `string` | 否   | 最大 200 字符               | 使用的模型名 |

**返回类型：** `void`

### `chat-presets-list`

获取所有提示词预设，内置预设排在前面。

**请求参数：** 无

**返回类型：**

```typescript
interface PromptPreset {
  id: number
  name: string
  prompt: string
  is_builtin: number
  created_at: string
}
```

### `chat-preset-save`

保存提示词预设。有 `id` 时更新（仅限非内置），无 `id` 时新建。

**请求参数：**

| 参数     | 类型     | 必填 | 限制             | 说明       |
| -------- | -------- | ---- | ---------------- | ---------- |
| `id`     | `number` | 否   | 正整数           | 预设 ID    |
| `name`   | `string` | 是   | 最大 200 字符    | 预设名称   |
| `prompt` | `string` | 是   | 最大 10,000 字符 | 提示词内容 |

**返回类型：** `void`

### `chat-preset-delete`

删除提示词预设（仅限非内置）。

**请求参数：**

| 参数 | 类型     | 必填 | 限制   | 说明    |
| ---- | -------- | ---- | ------ | ------- |
| `id` | `number` | 是   | 正整数 | 预设 ID |

**返回类型：** `void`

### `chat-memories-list`

获取所有长期记忆，支持关键词搜索。置顶记忆排在前面。

**请求参数：**

| 参数     | 类型     | 必填 | 限制          | 说明                                   |
| -------- | -------- | ---- | ------------- | -------------------------------------- |
| `search` | `string` | 否   | 最大 500 字符 | 搜索关键词（匹配 content 和 category） |

**返回类型：**

```typescript
interface MemoryRow {
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
```

### `chat-memory-save`

保存长期记忆。有 `id` 时更新；无 `id` 时检查去重（内容不区分大小写），存在则合并更新，不存在则新建。

**请求参数：**

| 参数         | 类型     | 必填     | 限制            | 说明                   |
| ------------ | -------- | -------- | --------------- | ---------------------- | ----------------------- |
| `id`         | `number` | 否       | 正整数          | 记忆 ID                |
| `content`    | `string` | 是       | 最大 1,000 字符 | 记忆内容               |
| `category`   | `string` | 否       | 最大 100 字符   | 分类，默认 `'general'` |
| `source`     | `string` | 否       | 最大 100 字符   | 来源，默认 `'manual'`  |
| `source_ref` | `string` | 否       | 最大 500 字符   | 来源引用               |
| `pinned`     | `number  | boolean` | 否              | —                      | 是否置顶                |
| `enabled`    | `number  | boolean` | 否              | —                      | 是否启用（默认 `true`） |
| `confidence` | `number` | 否       | —               | 置信度，默认 `1`       |

**返回类型：** 保存后的 `MemoryRow` 对象。

### `chat-memory-delete`

删除长期记忆。

**请求参数：**

| 参数 | 类型     | 必填 | 限制   | 说明    |
| ---- | -------- | ---- | ------ | ------- |
| `id` | `number` | 是   | 正整数 | 记忆 ID |

**返回类型：** `void`

### `chat-memory-capture`

从消息文本中自动提取长期记忆候选，基于规则匹配（关键词、模式识别）。

**请求参数：**

| 参数         | 类型     | 必填 | 限制             | 说明          |
| ------------ | -------- | ---- | ---------------- | ------------- |
| `content`    | `string` | 是   | 最大 10,000 字符 | 消息文本      |
| `session_id` | `string` | 否   | 最大 200 字符    | 关联的会话 ID |

**返回类型：** `MemoryRow[]` — 提取并保存的记忆列表。

**文件位置：** `electron/ipc/chat.ts`

---

## 题目管理 (problems)

### `problems-list`

获取题目列表，支持多维度过滤。每道题附带已解出计数。

**请求参数：**

| 参数                 | 类型     | 必填 | 限制          | 说明                         |
| -------------------- | -------- | ---- | ------------- | ---------------------------- |
| `filters`            | `object` | 否   | —             | 过滤条件                     |
| `filters.difficulty` | `string` | 否   | 最大 100 字符 | 难度等级（easy/medium/hard） |
| `filters.tag`        | `string` | 否   | 最大 100 字符 | 标签（模糊匹配）             |
| `filters.status`     | `string` | 否   | 最大 100 字符 | 状态                         |
| `filters.source`     | `string` | 否   | 最大 100 字符 | 来源（精确匹配）             |
| `filters.track`      | `string` | 否   | 最大 100 字符 | 学习路径（JSON 模糊匹配）    |
| `filters.platform`   | `string` | 否   | 最大 100 字符 | 平台（精确匹配）             |
| `filters.mode`       | `string` | 否   | 最大 100 字符 | 模式（精确匹配）             |

**返回类型：**

```typescript
interface Problem {
  id: number
  title: string
  description: string
  difficulty: string
  tags: string // JSON 数组字符串
  languages: string // JSON 数组字符串
  examples: string // JSON 数组字符串
  test_cases: string // JSON 数组字符串
  starter_code: string // JSON 对象字符串
  source: string
  tracks: string // JSON 数组字符串
  platform: string
  mode: string
  exam_style: string
  year: number | null
  official_url: string | null
  estimated_time: number | null
  created_at: string
  solved: number // 该题 accepted 次数
}
```

### `problems-get`

获取单个题目详情。

**请求参数：**

| 参数 | 类型     | 必填 | 限制   | 说明    |
| ---- | -------- | ---- | ------ | ------- |
| `id` | `number` | 是   | 正整数 | 题目 ID |

**返回类型：** `Problem | undefined`

### `problems-submit`

提交代码解答。自动运行测试用例、记录提交、更新错题本。

**请求参数：**

| 参数        | 类型     | 必填 | 限制              | 说明     |
| ----------- | -------- | ---- | ----------------- | -------- |
| `problemId` | `number` | 是   | 正整数            | 题目 ID  |
| `code`      | `string` | 是   | 最大 100,000 字符 | 提交代码 |
| `language`  | `string` | 是   | 最大 50 字符      | 编程语言 |

**返回类型：**

```typescript
interface SubmissionResult {
  status: 'accepted' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout'
  passed: number // 通过的测试用例数
  total: number // 总测试用例数
  results: Array<{
    input: string
    expected: string
    actual: string
    passed: boolean
  }>
  duration: number // 执行耗时（毫秒）
}
```

**副作用：**

- 向 `submissions` 表插入提交记录。
- 失败时向 `mistakes` 表插入或更新错题记录。
- 成功时更新对应错题的 `correct_code`。

### `problems-submissions`

获取指定题目的最近 20 条提交记录。

**请求参数：**

| 参数        | 类型     | 必填 | 限制   | 说明    |
| ----------- | -------- | ---- | ------ | ------- |
| `problemId` | `number` | 是   | 正整数 | 题目 ID |

**返回类型：** `Submission[]` — 按创建时间倒序。

**文件位置：** `electron/ipc/problems.ts`

---

## 错题本 (mistakes)

### `mistakes-list`

获取所有错题，关联题目信息（title、difficulty、tags），按更新时间倒序。

**请求参数：** 无

**返回类型：**

```typescript
interface MistakeListItem {
  id: number
  problem_id: number
  error_count: number
  error_types: string // JSON 数组字符串
  last_wrong_code: string
  correct_code: string | null
  ai_analysis: string | null
  review_count: number
  next_review_at: string | null
  created_at: string
  updated_at: string
  title: string // 来自 problems 表
  difficulty: string // 来自 problems 表
  tags: string // 来自 problems 表
}
```

### `mistakes-get`

获取单个错题详情，关联题目完整信息。

**请求参数：**

| 参数 | 类型     | 必填 | 限制   | 说明    |
| ---- | -------- | ---- | ------ | ------- |
| `id` | `number` | 是   | 正整数 | 错题 ID |

**返回类型：** 包含 `description`、`starter_code` 等额外字段的错题对象。

### `mistakes-update-analysis`

更新错题的 AI 分析内容。

**请求参数：**

| 参数       | 类型     | 必填 | 限制             | 说明        |
| ---------- | -------- | ---- | ---------------- | ----------- |
| `id`       | `number` | 是   | 正整数           | 错题 ID     |
| `analysis` | `string` | 是   | 最大 50,000 字符 | AI 分析文本 |

**返回类型：** `void`

### `mistakes-delete`

删除错题记录。

**请求参数：**

| 参数 | 类型     | 必填 | 限制   | 说明    |
| ---- | -------- | ---- | ------ | ------- |
| `id` | `number` | 是   | 正整数 | 错题 ID |

**返回类型：** `void`

**文件位置：** `electron/ipc/mistakes.ts`

---

## 知识库 RAG (rag)

### `knowledge-upload`

打开文件选择对话框，上传文档到知识库。支持 `.txt`、`.md`、`.pdf` 格式，单文件最大 10MB。文档会自动分块（约 500 字/块）。

**请求参数：** 无（通过系统对话框选择文件）

**返回类型：** `string[] | null` — 上传的文件名列表，取消时返回 `null`。

### `knowledge-list`

获取所有知识文档列表。

**请求参数：** 无

**返回类型：**

```typescript
interface KnowledgeDoc {
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
}
```

### `knowledge-delete`

删除知识文档及其所有分块（级联删除）。

**请求参数：**

| 参数 | 类型     | 必填 | 限制   | 说明    |
| ---- | -------- | ---- | ------ | ------- |
| `id` | `number` | 是   | 正整数 | 文档 ID |

**返回类型：** `void`

### `knowledge-search`

使用 FTS5/BM25、trigram、本地 n-gram 与中英术语扩展进行混合检索，最多返回 12 个融合结果。同一文档最多保留两个片段。

**请求参数：**

| 参数    | 类型     | 必填 | 限制            | 说明     |
| ------- | -------- | ---- | --------------- | -------- |
| `query` | `string` | 是   | 最大 1,000 字符 | 搜索查询 |

**返回类型：**

```typescript
interface KnowledgeSearchResponse {
  query: string
  results: KnowledgeSearchResult[]
  retrieval: KnowledgeRetrievalStatus & {
    candidateCount: number
    durationMs: number
  }
}

interface KnowledgeSearchResult {
  id: number
  doc_id: number
  content: string
  chunk_index: number
  filename: string // 来自 knowledge_docs 表
  score: number // 融合相关度
  keywordScore: number
  semanticScore: number
  channels: Array<'keyword' | 'semantic' | 'fallback'>
  explanation: string
}
```

**文件位置：** `electron/ipc/rag.ts`

### `knowledge-retrieval-status`

返回当前 FTS5/BM25、trigram、本地 n-gram 后端状态、索引规模和降级原因。

**请求参数：** 无

**返回类型：** `KnowledgeRetrievalStatus`

---

## 运行器诊断 (runner)

| Channel                    | 请求         | 返回                                                                                          |
| -------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `runner-detect-toolchains` | `{ force? }` | `ToolchainReport { tools, isolation, platform, detectedAt }`                                  |
| `runner-isolation-info`    | 无           | `IsolationInfo { mode, label, description, strongIsolationAvailable, strongIsolationReason }` |

`runner-detect-toolchains` 异步探测 python/node/gcc/g++/dotnet-or-csc/mcs 与 Docker 强隔离镜像（带缓存），SQL 标记为内置。`runner-isolation-info` 始终如实披露 local-controlled 的非沙箱边界；`strongIsolationAvailable` 仅在 Docker 探测通过后为真，且该调用不会阻塞 UI。

**文件位置：** `electron/ipc/runner.ts`

---

## 平台信息与关闭握手

| Channel                    | 请求                                            | 返回                    |
| -------------------------- | ----------------------------------------------- | ----------------------- |
| `platform-info`            | 无                                              | `PlatformInfo`          |
| `app-close-flush-complete` | `{ requestId, ok, error?, recoveryAvailable? }` | `{ accepted: boolean }` |

`platform-info` 返回运行时、操作系统、架构与应用版本。`app-close-flush-complete` 完成受控的关闭握手：`app-before-close` 事件发出后，渲染进程完成持久化再调用它确认。

**文件位置：** `electron/main.ts`

---

## 聊天增强 (chat)

| Channel                | 请求                                                 | 返回                     |
| ---------------------- | ---------------------------------------------------- | ------------------------ |
| `chat-context-preview` | `{ query?, includeMemories?, memoryCategories? }`    | `{ memories: Memory[] }` |
| `chat-memories-batch`  | `{ ids, action }`（enable/disable/pin/unpin/delete） | `{ affected: number }`   |
| `chat-memory-extract`  | `{ content, configId?, sessionId? }`                 | `Memory[]`               |

`chat-context-preview` 预览将注入聊天请求的本地记忆；`chat-memory-extract` 走 AI 增强提取路径，需要已配置且可达的模型提供商。

**文件位置：** `electron/ipc/chat.ts`

---

## 复习计划 (review)

| Channel           | 请求                       | 返回                                      |
| ----------------- | -------------------------- | ----------------------------------------- |
| `review-due`      | 无                         | `ReviewScheduleRow[]`（到期的间隔复习项） |
| `review-update`   | `{ exercise_id, quality }` | 更新后的 `ReviewScheduleRow`（SM-2 算法） |
| `review-stats`    | 无                         | `{ totalDue, completedToday, mastered }`  |
| `review-schedule` | `exerciseId: string`       | `ReviewScheduleRow \| undefined`          |

**文件位置：** `electron/ipc/review.ts`

---

## 知识库高级 (rag)

| Channel                      | 请求                | 返回                                                          |
| ---------------------------- | ------------------- | ------------------------------------------------------------- |
| `knowledge-get`              | `id: number`        | `KnowledgeDocDetail \| null`                                  |
| `knowledge-link-audit`       | `docId: number`     | `KnowledgeLinkAuditRecord[]`                                  |
| `knowledge-retrieval-status` | 无                  | `KnowledgeRetrievalStatus`                                    |
| `knowledge-semantic-search`  | `query: string`     | `SemanticSearchResult[]`（本地语义近似，非模型嵌入）          |
| `knowledge-summarize`        | `query: string`     | `KnowledgeSummary { summary, keyConcepts }`（确定性降级摘要） |
| `knowledge-concept-graph`    | 无                  | `{ nodes: [], edges: [] }`（占位，始终返回空图）              |
| `knowledge-concept-detail`   | `conceptId: string` | 占位概念详情（文档与关系列表为空）                            |
| `knowledge-auto-tag`         | `docId: number`     | `[]`（占位，始终返回空建议列表）                              |
| `knowledge-tags`             | 无                  | `[]`（占位，始终返回空标签列表）                              |
| `knowledge-tag-documents`    | `tag: string`       | `[]`（占位，校验标签但始终返回空文档列表）                    |
| `knowledge-rag-context`      | `query?: string`    | `RAGContext`（学习历史与资料部分为静态回退）                  |
| `resource-pack-import`       | `{ rootPath? }`     | `ResourcePackImportResult \| null`                            |

`knowledge-link-audit` 只返回已持久化的链接解析与 HTTP 审计状态，不发起网络请求。`knowledge-summarize` 当前是关键词兜底摘要，不是 AI 摘要。

**文件位置：** `electron/ipc/rag.ts`

---

## 统计与首页 (analytics / home)

| Channel                       | 请求                    | 返回                             |
| ----------------------------- | ----------------------- | -------------------------------- |
| `analytics-track`             | `eventType, eventData?` | `void`（仅本地存储，不对外上报） |
| `analytics-get-events`        | `filters?`              | `AnalyticsEvent[]`               |
| `analytics-get-summary`       | `days?: number`         | `AnalyticsSummary`               |
| `analytics-get-streak`        | 无                      | 连续学习天数                     |
| `analytics-get-weekly-report` | `weekOffset?: number`   | `WeeklyReport`                   |
| `analytics-clear`             | 无                      | `void`（隐私清理）               |
| `demo-load-data`              | 无                      | `DemoLoadResult`                 |
| `home-get-overview`           | 无                      | `HomeOverview`                   |

**文件位置：** `electron/ipc/analytics.ts`、`electron/ipc/home.ts`、`electron/ipc/demoData.ts`

---

## 数据导出与导入 (export / import)

| Channel             | 请求               | 返回                             |
| ------------------- | ------------------ | -------------------------------- |
| `export-data`       | `ExportCategory[]` | `{ success, filePath?, error? }` |
| `import-data`       | `ImportOptions?`   | `ImportResult`                   |
| `export-get-counts` | 无                 | 各导出分类的记录数               |

`import-data` 校验可移植 JSON 子集，导入前创建经过验证的 SQLite 备份，任一行出错则整体回滚。

**文件位置：** `electron/ipc/export.ts`

---

## 备份、恢复与系统能力

| Channel                           | 请求                   | 返回                         |
| --------------------------------- | ---------------------- | ---------------------------- |
| `database-backups-list`           | 无                     | `DatabaseBackupListResult`   |
| `database-backup-create`          | 无                     | `DatabaseBackupCreateResult` |
| `database-backups-open-directory` | 无                     | `OpenBackupDirectoryResult`  |
| `recovery-layer-export`           | `RecoveryLayerEntry[]` | `RecoveryLayerExportResult`  |
| `system-capabilities-get`         | `{ force? }`           | `SystemCapabilityStatus`     |
| `perf-get-ipc-stats`              | 无                     | IPC 性能统计                 |

`database-backup-create` 先冲刷所有渲染进程，再创建经 `quick_check` 与 SHA-256 验证的 VACUUM INTO 快照，任一方无法持久化则整体失败。`recovery-layer-export` 仅导出受控的迁移备份/损坏 localStorage 条目，绝不恢复或删除。

**文件位置：** `electron/ipc/maintenance.ts`、`electron/ipc/capabilities.ts`、`electron/main.ts`

---

## 课程 (lessons)

| Channel                  | 请求                | 返回               |
| ------------------------ | ------------------- | ------------------ |
| `lessons-list`           | 无                  | `Track[]`          |
| `lessons-get`            | `lessonId: string`  | `Lesson`           |
| `lessons-progress`       | `trackId: string`   | `LessonProgress[]` |
| `lessons-mark-opened`    | `lessonId, trackId` | `{ ok: true }`     |
| `lessons-mark-completed` | `lessonId, trackId` | `{ ok: true }`     |
| `lessons-notes-get`      | `lessonId: string`  | 笔记字符串         |
| `lessons-notes-save`     | `lessonId, content` | `{ ok: true }`     |
| `lessons-search`         | `query: string`     | 匹配的课程 id 列表 |
| `lesson-get-progress`    | 无                  | 首页进度行         |

**文件位置：** `electron/ipc/lessons.ts`

---

## 练习 (exercises)

| Channel                 | 请求                                                   | 返回                                                      |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `exercises-list`        | `{ track_id?, difficulty? }`                           | `Exercise[]`                                              |
| `exercises-get`         | `id: string`                                           | `Exercise`                                                |
| `exercises-draft-get`   | `exerciseId: string`                                   | `PracticeDraft \| null`                                   |
| `exercises-draft-save`  | `{ exerciseId, code, language, baseRevision, title? }` | `DraftMutationResult`（修订 CAS，重试幂等）               |
| `exercises-draft-clear` | `{ exerciseId, baseRevision }`                         | `DraftMutationResult`（写入版本化墓碑而非无条件删除）     |
| `exercises-evaluate`    | `{ exerciseId, code, language? }`                      | `{ passed, score, feedback_lines, stdout, duration_sec }` |

`exercises-evaluate` 依赖本地代码运行器，因此取决于所选工具链。

**文件位置：** `electron/ipc/exercises.ts`

---

## 编辑器工作区 (editor-workspace)

| Channel                           | 请求                                | 返回                                 |
| --------------------------------- | ----------------------------------- | ------------------------------------ |
| `editor-workspace-load`           | `{ workspaceId }`                   | `EditorWorkspaceRecord`              |
| `editor-workspace-migrate-legacy` | `MigrateLegacyEditorWorkspaceInput` | `MigrateLegacyEditorWorkspaceResult` |
| `editor-tab-save`                 | `SaveEditorTabInput`                | `EditorTabMutationResult`            |
| `editor-tab-update-view-state`    | `UpdateEditorTabViewStateInput`     | `EditorTabViewStateMutationResult`   |
| `editor-tab-close`                | `VersionedEditorTabMutationInput`   | `EditorTabMutationResult`            |
| `editor-tab-reopen`               | `VersionedEditorTabMutationInput`   | `EditorTabMutationResult`            |
| `editor-tab-delete`               | `VersionedEditorTabMutationInput`   | `EditorTabMutationResult`            |
| `editor-workspace-set-active`     | `{ workspaceId, tabId }`            | `SetActiveEditorTabResult`           |

工作区与标签操作均带修订号（revision CAS）与稳定变更 ID，冲突显式恢复。`editor-workspace-migrate-legacy` 以事务方式导入旧版本地标签，冲突保留为恢复副本。

**文件位置：** `electron/ipc/editorWorkspace.ts`

---

## 桌面伙伴 (pets)

| Channel                 | 请求                 | 返回                   |
| ----------------------- | -------------------- | ---------------------- |
| `pets-list`             | 无                   | `CodexPetDefinition[]` |
| `pets-install-slug`     | `slug: string`       | `PetInstallResult`     |
| `pets-import-file`      | 无（系统文件对话框） | `PetInstallResult`     |
| `pets-import-directory` | 无（系统目录对话框） | `PetInstallResult`     |

`pets-install-slug` 需要联网下载已校验的伙伴包；其余导入走本地文件/目录对话框。

**文件位置：** `electron/ipc/pets.ts`

---

## 学习记录 (learning-records)

| Channel                  | 请求 | 返回                         |
| ------------------------ | ---- | ---------------------------- |
| `learning-records-clear` | 无   | `LearningRecordsClearResult` |

事务性清空学习记录，保留应用配置与内容数据。

**文件位置：** `electron/ipc/learningRecords.ts`

---

## 事件频道 (event)

| Channel                    | 载荷                          | 说明                                        |
| -------------------------- | ----------------------------- | ------------------------------------------- |
| `app-before-close`         | `{ requestId }`               | 窗口关闭前发送，让编辑器/练习数据完成持久化 |
| `editor-workspace-changed` | `EditorWorkspaceChangedEvent` | 版本化标签或视图状态变更后通知其他消费者    |

**文件位置：** `electron/main.ts`、`electron/ipc/editorWorkspace.ts`

---

## 外部链接

### `open-external`

在系统默认浏览器中打开外部 URL。

**请求参数：** URL 字符串

**返回类型：** `void`

---

## 错误处理

### 统一错误模式

所有 IPC handler 遵循相同的错误处理模式：

1. **参数校验**：检查类型、范围、长度，不合法时抛出 `'参数无效: {字段名}'`。
2. **业务错误**：抛出描述性中文错误消息（如 `'题目不存在'`、`'未配置AI模型'`）。
3. **外部 API 错误**：包含 HTTP 状态码和响应体。

### 渲染进程错误处理建议

```typescript
import { toErrorMessage, categorizeError } from '../utils/errors'

try {
  const result = await window.api.invoke('some-channel', args)
} catch (error) {
  const message = toErrorMessage(error) // 提取错误信息
  const category = categorizeError(error) // 归类：network/auth/timeout/...
  // 展示给用户或记录日志
}
```

---

## 使用示例

### 通过 preload API 调用

```typescript
// 基础调用
const configs = await window.api.invoke('db-get-ai-configs')

// 带参数调用
const problem = await window.api.invoke('problems-get', 42)

// 带过滤参数
const problems = await window.api.invoke('problems-list', {
  difficulty: 'medium',
  platform: 'leetcode',
})

// 提交代码
const result = await window.api.invoke('problems-submit', {
  problemId: 42,
  code: 'def solve(): ...',
  language: 'python',
})
```

### 监听流式 AI 响应

```typescript
// 注册监听器（返回取消函数）
const unsubscribeChunk = window.api.on('ai-chat-chunk', (payload) => {
  console.log('收到分片:', payload.chunk)
})

const unsubscribeDone = window.api.on('ai-chat-done', (payload) => {
  console.log('完整响应:', payload.content)
})

// 发起 AI 对话
await window.api.invoke('ai-chat', {
  messages: [{ role: 'user', content: '你好' }],
  requestId: 'my-request-123',
  includeMemories: true,
})

// 清理监听器
unsubscribeChunk()
unsubscribeDone()
```

### 通过 typedInvoke（推荐）

项目中推荐使用 `src/api/ipc.ts` 中的 `typedInvoke` 函数，它提供完整的 TypeScript 类型推导：

```typescript
import { typedInvoke } from '../api/ipc'

// 自动类型推导
const memories = await typedInvoke('chat-memories-list', '搜索词')
const result = await typedInvoke('run-code', { code: 'print(1)', language: 'python' })
```
