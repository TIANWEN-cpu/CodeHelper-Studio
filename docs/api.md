# API 参考文档

本文档记录 CodeHelper 所有 IPC 通道、数据库 Schema 与 AI 集成的详细接口定义。

## 目录

- [IPC 通道参考](#ipc-通道参考)
  - [代码执行](#代码执行)
  - [题库管理](#题库管理)
  - [AI 对话](#ai-对话)
  - [聊天会话管理](#聊天会话管理)
  - [聊天消息](#聊天消息)
  - [预设提示词](#预设提示词)
  - [长期记忆](#长期记忆)
  - [知识库](#知识库)
  - [错题本](#错题本)
  - [设置与配置](#设置与配置)
  - [外部链接](#外部链接)
- [事件通道参考](#事件通道参考)
- [数据库 Schema](#数据库-schema)
- [AI 集成](#ai-集成)
- [类型定义](#类型定义)

---

## IPC 通道参考

所有 IPC 通道通过 `preload.ts` 中的白名单控制访问权限。渲染进程使用 `typedInvoke(channel, ...args)` 发起调用，返回值类型由 `src/types/ipc.ts` 中的 `IpcChannelMap` 定义。

### 代码执行

#### `run-code`

执行一段代码并返回运行结果。

**参数**:

```typescript
{
  code: string      // 代码内容（最大 100,000 字符）
  language: string  // 编程语言：python / c / cpp / csharp / sql
  stdin?: string    // 标准输入（最大 100,000 字符）
}
```

**返回值**:

```typescript
{
  stdout: string    // 标准输出
  stderr: string    // 标准错误
  exitCode: number  // 退出码
  stage?: string    // 阶段标识：compile / run / sql
}
```

**实现位置**: `electron/ipc/runner.ts` -> `electron/utils/codeRunner.ts`

**语言支持详情**:

| 语言     | 编译器/运行时  | 编译阶段 | 执行超时            |
| -------- | -------------- | -------- | ------------------- |
| `python` | python         | 无       | 10s                 |
| `c`      | gcc            | 有       | 10s 编译 + 10s 运行 |
| `cpp`    | g++            | 有       | 10s 编译 + 10s 运行 |
| `csharp` | csc            | 有       | 10s 编译 + 10s 运行 |
| `sql`    | better-sqlite3 | 无       | 内存数据库          |

---

### 题库管理

#### `problems-list`

获取题目列表，支持多条件筛选。

**参数**:

```typescript
{
  difficulty?: string  // easy / medium / hard
  tag?: string         // 标签关键词（模糊匹配）
  status?: string      // 筛选状态
  source?: string      // 来源（leetcode / nowcoder / pat 等）
  track?: string       // 赛道
  platform?: string    // 平台
  mode?: string        // 模式（oj / exam）
}
```

**返回值**: `Problem[]`

```typescript
interface Problem {
  id: number
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[]
  languages: string[]
  examples: Array<{ input: string; output: string; explanation?: string }>
  test_cases: Array<{ input: string; expected: string }>
  starter_code: Record<string, string>
  source: string
  tracks: string[]
  platform: string
  mode: string
  exam_style: string
  year?: number
  official_url?: string
  estimated_time?: number
  solved: number // 该题已通过的提交次数
}
```

**实现位置**: `electron/ipc/problems.ts`

#### `problems-get`

获取单个题目的详细信息。

**参数**: `id: number` (题目 ID)

**返回值**: `Problem | undefined`

**实现位置**: `electron/ipc/problems.ts`

#### `problems-submit`

提交代码并自动判题。

**参数**:

```typescript
{
  problemId: number // 题目 ID
  code: string // 提交代码（最大 100,000 字符）
  language: string // 编程语言
}
```

**返回值**:

```typescript
{
  status: 'accepted' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout'
  passed: number // 通过的测试用例数
  total: number // 总测试用例数
  results: Array<{
    input: string
    expected: string
    actual: string
    passed: boolean
  }>
  duration: number // 总耗时（毫秒）
}
```

**副作用**:

- 自动将提交记录写入 `submissions` 表
- 失败时自动记录到 `mistakes` 表
- 通过时更新 `mistakes.correct_code`

**实现位置**: `electron/ipc/problems.ts`

#### `problems-submissions`

获取某个题目的提交历史（最近 20 条）。

**参数**: `problemId: number`

**返回值**: `Submission[]`

```typescript
interface Submission {
  id: number
  problem_id: number
  language: string
  code: string
  status: string
  passed_cases: number
  total_cases: number
  duration_ms: number
  created_at: string
}
```

**实现位置**: `electron/ipc/problems.ts`

---

### AI 对话

#### `ai-chat`

发送 AI 对话请求（流式输出）。

**参数**:

```typescript
{
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string     // 每条消息最大 100,000 字符
  }>                    // 最多 200 条消息
  configId?: number     // AI 配置 ID，不传则使用默认配置
  requestId?: string    // 请求 ID（用于匹配流式响应）
  includeMemories?: boolean  // 是否注入长期记忆（默认 false）
}
```

**返回值**:

```typescript
{
  success: boolean
  requestId: string // 请求标识
  content: string // 完整响应文本
}
```

**流式事件**:

- 在收到响应期间，主进程通过 `ai-chat-chunk` 事件逐步推送内容
- 流结束后通过 `ai-chat-done` 事件通知

**长期记忆注入**:
当 `includeMemories=true` 时，主进程会：

1. 提取最后一条用户消息
2. 搜索相关记忆（关键词匹配 + 置顶优先）
3. 将记忆作为 system message 插入到消息列表最前面

**实现位置**: `electron/ipc/ai.ts`

#### `ai-fetch-models`

从 AI API 获取可用模型列表。

**参数**:

```typescript
{
  api_key: string // API 密钥
  base_url: string // API 基础 URL
}
```

**返回值**: `string[]`（模型 ID 列表，已排序）

**实现位置**: `electron/ipc/database.ts`

---

### 聊天会话管理

#### `chat-sessions-list`

获取所有聊天会话（按更新时间倒序）。

**参数**: 无

**返回值**: `Session[]`

```typescript
interface Session {
  id: string
  title: string
  system_prompt: string
  created_at: string
  updated_at: string
}
```

**实现位置**: `electron/ipc/chat.ts`

#### `chat-session-create`

创建新的聊天会话。

**参数**:

```typescript
{
  id: string             // 会话 UUID
  title?: string         // 标题（默认 "新对话"，最大 500 字符）
  system_prompt?: string // 系统提示词（最大 10,000 字符）
}
```

**返回值**: `Session | undefined`

**实现位置**: `electron/ipc/chat.ts`

#### `chat-session-update`

更新聊天会话信息。

**参数**:

- `id: string` -- 会话 ID
- `updates: { title?: string; system_prompt?: string }`

**返回值**: `void`

**实现位置**: `electron/ipc/chat.ts`

#### `chat-session-delete`

删除聊天会话及其所有消息。

**参数**: `id: string`

**返回值**: `void`

**副作用**: 同时删除 `chat_history` 中该会话的所有消息

**实现位置**: `electron/ipc/chat.ts`

---

### 聊天消息

#### `chat-messages-load`

加载某个会话的所有消息。

**参数**: `sessionId: string`

**返回值**: `ChatHistoryRow[]`（按时间正序排列）

```typescript
interface ChatHistoryRow {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  created_at: string
}
```

**实现位置**: `electron/ipc/chat.ts`

#### `chat-message-save`

保存一条聊天消息。

**参数**:

```typescript
{
  session_id: string  // 会话 ID
  role: string        // user / assistant / system
  content: string     // 消息内容（最大 100,000 字符）
  model?: string      // 使用的模型名称
}
```

**返回值**: `void`

**副作用**: 同时更新对应会话的 `updated_at`

**实现位置**: `electron/ipc/chat.ts`

---

### 预设提示词

#### `chat-presets-list`

获取所有预设提示词（内置排在前面）。

**参数**: 无

**返回值**: `PromptPreset[]`

```typescript
interface PromptPreset {
  id: number
  name: string
  prompt: string
  is_builtin: number // 0 或 1
  created_at: string
}
```

**实现位置**: `electron/ipc/chat.ts`

#### `chat-preset-save`

保存（创建或更新）预设提示词。内置预设不可通过此接口更新。

**参数**:

```typescript
{
  id?: number    // 更新时传入
  name: string   // 名称（最大 200 字符）
  prompt: string // 提示词（最大 10,000 字符）
}
```

**返回值**: `void`

**实现位置**: `electron/ipc/chat.ts`

#### `chat-preset-delete`

删除预设提示词。内置预设不可删除。

**参数**: `id: number`

**返回值**: `void`

**实现位置**: `electron/ipc/chat.ts`

---

### 长期记忆

#### `chat-memories-list`

获取长期记忆列表，可选按关键词筛选。

**参数**: `search?: string`（最大 500 字符，匹配 content 和 category）

**返回值**: `MemoryItem[]`（置顶优先，然后按更新时间倒序）

```typescript
interface MemoryItem {
  id: number
  content: string
  category: string // general / preference / technical 等
  source: string // manual / chat
  source_ref?: string
  pinned: number // 0 或 1
  enabled: number // 0 或 1
  confidence: number // 0.0 - 1.0
  created_at: string
  updated_at: string
  last_used_at?: string
}
```

**实现位置**: `electron/ipc/chat.ts`

#### `chat-memory-save`

保存（创建或更新）长期记忆。相同 content 的记忆会自动合并更新。

**参数**:

```typescript
{
  id?: number
  content: string       // 记忆内容（最大 1,000 字符）
  category?: string     // 分类（最大 100 字符，默认 "general"）
  source?: string       // 来源（最大 100 字符，默认 "manual"）
  source_ref?: string   // 来源引用（最大 500 字符）
  pinned?: boolean      // 是否置顶
  enabled?: boolean     // 是否启用
  confidence?: number   // 置信度（默认 1.0）
}
```

**返回值**: `MemoryItem | undefined`

**实现位置**: `electron/ipc/chat.ts`

#### `chat-memory-delete`

删除一条长期记忆。

**参数**: `id: number`

**返回值**: `void`

**实现位置**: `electron/ipc/chat.ts`

#### `chat-memory-capture`

从用户消息中自动提取记忆候选并保存。

**参数**:

```typescript
{
  content: string       // 消息内容（最大 10,000 字符）
  session_id?: string   // 关联的会话 ID
}
```

**返回值**: `MemoryItem[]`（新提取的记忆列表）

**实现位置**: `electron/ipc/chat.ts`

---

### 知识库

#### `knowledge-upload`

上传文档到知识库。弹出系统文件选择对话框。

**参数**: 无

**返回值**: `string[] | null`（上传成功的文件名列表，取消时返回 null）

**支持格式**: `.txt`、`.md`、`.pdf`（单文件最大 10MB）

**处理流程**:

1. 读取文件内容（PDF 使用 pdf-parse 解析）
2. 按 500 字符分块
3. 写入 `knowledge_docs` 和 `knowledge_chunks` 表

**实现位置**: `electron/ipc/rag.ts`

#### `knowledge-list`

获取知识库文档列表。

**参数**: 无

**返回值**: `Document[]`

```typescript
interface Document {
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
}
```

**实现位置**: `electron/ipc/rag.ts`

#### `knowledge-delete`

删除知识库文档（级联删除所有分块）。

**参数**: `id: number`

**返回值**: `void`

**实现位置**: `electron/ipc/rag.ts`

#### `knowledge-search`

在知识库中搜索相关内容。

**参数**: `query: string`（最大 1,000 字符）

**返回值**: `SearchResult[]`（最多 5 条，按匹配度排序）

```typescript
interface SearchResult {
  id: number
  doc_id: number
  content: string
  chunk_index: number
  filename: string
  score: number // 关键词匹配分数
}
```

**实现位置**: `electron/ipc/rag.ts`

---

### 错题本

#### `mistakes-list`

获取所有错题记录（关联题目信息，按更新时间倒序）。

**参数**: 无

**返回值**: `Mistake[]`

```typescript
interface Mistake {
  id: number
  problem_id: number
  error_count: number
  error_types: string[]
  last_wrong_code: string
  correct_code?: string
  ai_analysis?: string
  title: string // 来自 problems 表
  difficulty: string // 来自 problems 表
  tags: string[] // 来自 problems 表
  created_at: string
  updated_at: string
}
```

**实现位置**: `electron/ipc/mistakes.ts`

#### `mistakes-get`

获取单个错题详情（包含题目完整信息）。

**参数**: `id: number`

**返回值**: 包含 `description`、`starter_code` 等完整题目信息的错题对象

**实现位置**: `electron/ipc/mistakes.ts`

#### `mistakes-update-analysis`

更新错题的 AI 分析文本。

**参数**:

- `id: number` -- 错题 ID
- `analysis: string` -- AI 分析文本（最大 50,000 字符）

**返回值**: `void`

**实现位置**: `electron/ipc/mistakes.ts`

#### `mistakes-delete`

删除错题记录。

**参数**: `id: number`

**返回值**: `void`

**实现位置**: `electron/ipc/mistakes.ts`

---

### 设置与配置

#### `db-get-setting`

获取用户设置值。

**参数**: `key: string`（最大 256 字符）

**返回值**: `string | null`

**实现位置**: `electron/ipc/database.ts`

#### `db-set-setting`

设置用户配置值。

**参数**:

- `key: string`（最大 256 字符）
- `value: string`（最大 10,000 字符）

**返回值**: `void`

**实现位置**: `electron/ipc/database.ts`

#### `db-get-ai-configs`

获取所有 AI 配置（API Key 已解密）。

**参数**: 无

**返回值**: `ChatConfig[]`

```typescript
interface ChatConfig {
  id: number
  name: string
  api_key: string // 已解密
  base_url: string
  model: string
  is_default: number
  task_type?: string
  created_at: string
}
```

**实现位置**: `electron/ipc/database.ts`

#### `db-save-ai-config`

保存（创建或更新）AI 配置。API Key 使用 safeStorage 加密存储。

**参数**:

```typescript
{
  id?: number           // 更新时传入
  name: string          // 配置名称
  api_key: string       // API 密钥
  base_url: string      // API 基础 URL
  model: string         // 模型名称
  is_default?: boolean  // 是否设为默认
  task_type?: string    // 任务类型
}
```

**返回值**: `number | bigint`（配置 ID）

**实现位置**: `electron/ipc/database.ts`

#### `db-delete-ai-config`

删除 AI 配置。

**参数**: `id: number`

**返回值**: `void`

**实现位置**: `electron/ipc/database.ts`

#### `db-get-default-ai-config`

获取默认 AI 配置。优先返回 `is_default=1` 的配置，否则返回第一条。

**参数**: 无

**返回值**: `ChatConfig | null`

**实现位置**: `electron/ipc/database.ts`

---

### 外部链接

#### `open-external`

在系统默认浏览器中打开外部链接。

**参数**: `url: string`（最大 2,000 字符，仅支持 http/https 协议）

**返回值**: `void`

**实现位置**: `electron/main.ts`

---

## 事件通道参考

事件通道由主进程推送到渲染进程，通过 `typedOn(channel, callback)` 订阅。

### `ai-chat-chunk`

AI 流式输出的每个文本片段。

**载荷**:

```typescript
{
  requestId: string // 请求 ID（用于匹配）
  chunk: string // 文本片段
}
```

### `ai-chat-done`

AI 流式输出完成。

**载荷**:

```typescript
{
  requestId: string // 请求 ID
  content: string // 完整响应文本
}
```

---

## 数据库 Schema

完整建表语句位于 `electron/db/schema.sql`。

共 11 张表：`problems`、`submissions`、`mistakes`、`ai_configs`、`chat_sessions`、`chat_history`、`prompt_presets`、`memories`、`knowledge_docs`、`knowledge_chunks`、`settings`。

详细字段说明请参阅 [docs/architecture.md - 数据库设计](./architecture.md#数据库设计) 一节。

---

## AI 集成

### API 兼容性

CodeHelper 的 AI 对话功能兼容 **OpenAI Chat Completions API** 格式，支持任何实现了该接口的服务：

- OpenAI（GPT-4o、GPT-4 等）
- Azure OpenAI
- 本地部署的兼容服务（如 Ollama、vLLM、LocalAI）
- 第三方代理服务

### 请求格式

```
POST {base_url}/chat/completions

Authorization: Bearer {api_key}
Content-Type: application/json

{
  "model": "{model}",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "stream": true
}
```

### 流式响应处理

主进程使用 SSE（Server-Sent Events）格式解析响应流：

1. 读取响应体的 ReadableStream
2. 按 `\n` 分割，提取 `data: ` 前缀的行
3. 解析 JSON，提取 `choices[0].delta.content`
4. 通过 IPC 事件推送到渲染进程
5. 遇到 `data: [DONE]` 结束

### 长期记忆注入

当 `includeMemories=true` 时，AI 请求的消息列表会被修改：

```
原始消息: [
  { role: "system", content: "你是一个编程助手" },
  { role: "user", content: "解释快速排序" }
]

注入后: [
  { role: "system", content: "以下是用户的跨对话长期记忆，仅在相关时使用...\n1. [technical] 用户偏好 Python\n2. [preference] 喜欢简洁的解释" },
  { role: "system", content: "你是一个编程助手" },
  { role: "user", content: "解释快速排序" }
]
```

记忆匹配算法：

1. 从用户最后一条消息中提取搜索词
2. 对所有启用的记忆进行关键词匹配
3. 置顶记忆额外加 50 分
4. 完全包含或被包含的加 20 分
5. 取 Top 6 条返回

### 模型列表获取

通过 `GET {base_url}/models` 接口获取可用模型列表，兼容 OpenAI 的 `/v1/models` 格式。

---

## 类型定义

### 渲染进程类型（`src/types/`）

| 文件           | 主要类型                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| `ipc.ts`       | `IpcChannelMap`、`IpcEventMap`、所有请求/响应类型                        |
| `problem.ts`   | `Problem`、`Submission`、`ProblemFilters`                                |
| `chat.ts`      | `Message`、`Session`、`PromptPreset`、`MemoryItem`、`StreamChunkPayload` |
| `knowledge.ts` | `Document`、`Chunk`、`SearchResult`                                      |

### 主进程类型（`electron/types/`）

| 文件    | 主要类型                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| `db.ts` | `ProblemRow`、`MistakeRow`、`AIConfigRow`、`AIConfigDecrypted`、`KnowledgeChunkRow`、`MemoryRow`、`ChatMessage` |

### 类型安全机制

渲染进程通过 `typedInvoke` 和 `typedOn` 获得完整的类型推导：

```typescript
// 自动推导返回值类型为 Problem[]
const problems = await typedInvoke('problems-list', { difficulty: 'easy' })

// 自动推导载荷类型为 StreamChunkPayload
const unsub = typedOn('ai-chat-chunk', (payload) => {
  // payload.chunk 类型为 string
})
```

类型映射定义在 `src/types/ipc.ts` 的 `IpcChannelMap` 接口中，修改通道签名时需同步更新此文件。

---

## See Also

- [架构文档](architecture.md) -- 系统架构、进程模型与数据库设计
- [IPC 通信模式](concepts/ipc-patterns.md) -- IPC 通信的架构与安全机制
- [IPC 通道参考](reference/ipc-channels.md) -- 精简版 IPC 通道一览表
- [数据库 Schema](reference/database-schema.md) -- 完整表结构定义
- [外部 API](reference/api-endpoints.md) -- AI 模型 API 调用方式
- [组件参考](reference/components.md) -- React 组件树与 Props
- [Stores 参考](reference/stores.md) -- Zustand Store 状态与 Actions
- [安全模型](concepts/security-model.md) -- API Key 加密与 CSP 配置
- [术语表](glossary.md) -- 技术名词解释
