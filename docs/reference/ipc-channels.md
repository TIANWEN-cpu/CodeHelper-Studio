# IPC 通道参考

本文档列出 CodeHelper 中所有 IPC 通道的完整参考，包括参数类型和返回值。

## 请求-响应通道 (invoke/handle)

### 代码执行

#### `run-code`

执行用户代码（Python、C、C++、C#、SQL）。

**参数**：

```typescript
interface RunCodePayload {
  code: string // 代码内容（最长 100KB）
  language: string // 'python' | 'c' | 'cpp' | 'csharp' | 'sql'
  stdin?: string // 标准输入（最长 100KB）
}
```

**返回值**：

```typescript
interface RunCodeResult {
  stdout: string // 标准输出
  stderr: string // 标准错误
  exitCode: number // 退出码（0 表示成功）
  stage?: string // 'compile' | 'run' | 'sql'
}
```

---

### 题目管理

#### `problems-list`

获取题目列表，支持筛选。

**参数**：

```typescript
interface ProblemListFilters {
  difficulty?: string // 'easy' | 'medium' | 'hard'
  tag?: string // 标签筛选
  status?: string // 完成状态
  source?: string // 来源
  track?: string // 专题
  platform?: string // 平台
  mode?: string // 模式
}
```

**返回值**：`Problem[]`

#### `problems-get`

获取单个题目详情。

**参数**：`id: number`（题目 ID）

**返回值**：`Problem | undefined`

#### `problems-submit`

提交代码解答。

**参数**：

```typescript
interface SubmitPayload {
  problemId: number // 题目 ID
  code: string // 代码（最长 100KB）
  language: string // 编程语言（最长 50 字符）
}
```

**返回值**：

```typescript
interface SubmitResult {
  status: string // 'accepted' | 'wrong_answer' | 'compile_error' | 'runtime_error' | 'timeout'
  passed: number // 通过的测试用例数
  total: number // 总测试用例数
  results: Array<{
    input: string // 输入
    expected: string // 期望输出
    actual: string // 实际输出
    passed: boolean // 是否通过
  }>
  duration: number // 执行耗时（ms）
}
```

#### `problems-submissions`

获取某题目的历史提交记录。

**参数**：`problemId: number`

**返回值**：`Submission[]`

---

### AI 对话

#### `ai-chat`

发送 AI 对话请求（流式响应）。

**参数**：

```typescript
interface AIChatPayload {
  messages: Array<{ role: string; content: string }> // 消息列表（最多 200 条）
  configId?: number // AI 配置 ID（可选，默认使用默认配置）
  requestId?: string // 请求 ID（用于匹配流式响应）
  includeMemories?: boolean // 是否注入记忆
}
```

**返回值**：

```typescript
interface AIChatResult {
  success: boolean
  requestId: string
  content: string // 完整的 AI 回复内容
}
```

#### `ai-fetch-models`

从 AI API 获取可用模型列表。

**参数**：

```typescript
{
  api_key: string // API 密钥（最长 2000 字符）
  base_url: string // API 基础 URL（最长 2000 字符）
}
```

**返回值**：`string[]`（模型 ID 列表）

---

### 聊天会话管理

#### `chat-sessions-list`

获取所有聊天会话（按更新时间降序）。

**参数**：无

**返回值**：`Session[]`

#### `chat-session-create`

创建新的聊天会话。

**参数**：

```typescript
interface ChatSessionCreatePayload {
  id: string // 会话 ID（最长 200 字符）
  title?: string // 标题（最长 500 字符，默认 "新对话"）
  system_prompt?: string // 系统提示词（最长 10000 字符）
}
```

**返回值**：`Session | undefined`

#### `chat-session-update`

更新聊天会话。

**参数**：`id: string`, `updates: { title?: string; system_prompt?: string }`

**返回值**：`void`

#### `chat-session-delete`

删除聊天会话及其历史消息。

**参数**：`id: string`

**返回值**：`void`

#### `chat-messages-load`

加载某会话的所有消息。

**参数**：`sessionId: string`

**返回值**：

```typescript
interface ChatHistoryRow {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}
```

#### `chat-message-save`

保存一条聊天消息。

**参数**：

```typescript
interface ChatMessageSavePayload {
  session_id: string // 会话 ID（最长 200 字符）
  role: string // 'user' | 'assistant' | 'system'
  content: string // 消息内容（最长 100KB）
  model?: string // 模型名称（最长 200 字符）
}
```

**返回值**：`void`

---

### 聊天预设

#### `chat-presets-list`

获取所有提示词预设（内置优先）。

**参数**：无

**返回值**：`PromptPreset[]`

#### `chat-preset-save`

创建或更新提示词预设（内置预设不可编辑）。

**参数**：

```typescript
interface ChatPresetSavePayload {
  id?: number // 更新时传入
  name: string // 名称（最长 200 字符）
  prompt: string // 提示词（最长 10000 字符）
}
```

**返回值**：`void`

#### `chat-preset-delete`

删除自定义提示词预设（内置预设不可删除）。

**参数**：`id: number`

**返回值**：`void`

---

### 记忆管理

#### `chat-memories-list`

获取所有记忆（支持搜索）。

**参数**：`search?: string`（关键词，最长 500 字符）

**返回值**：`MemoryItem[]`

#### `chat-memory-save`

创建或更新记忆（内容去重：相同内容自动更新而非重复创建）。

**参数**：

```typescript
interface MemorySavePayload {
  id?: number // 更新时传入
  content: string // 内容（最长 1000 字符）
  category?: string // 分类（最长 100 字符，默认 "general"）
  source?: string // 来源（最长 100 字符，默认 "manual"）
  source_ref?: string // 来源引用（最长 500 字符）
  pinned?: boolean // 是否置顶
  enabled?: boolean // 是否启用
  confidence?: number // 置信度（0-1）
}
```

**返回值**：`MemoryItem | undefined`

#### `chat-memory-delete`

删除记忆。

**参数**：`id: number`

**返回值**：`void`

#### `chat-memory-capture`

从用户消息中自动提取记忆候选并保存。

**参数**：

```typescript
{
  content: string       // 消息内容（最长 10KB）
  session_id?: string   // 会话 ID
}
```

**返回值**：`MemoryItem[]`（新创建的记忆）

---

### 知识库

#### `knowledge-upload`

弹出文件选择对话框，上传并分块存储文档。

**参数**：无

**返回值**：`string[] | null`（文件名列表，null 表示用户取消）

#### `knowledge-list`

获取所有知识库文档。

**参数**：无

**返回值**：`Document[]`

#### `knowledge-delete`

删除知识库文档及其分块。

**参数**：`docId: number`

**返回值**：`void`

#### `knowledge-search`

在知识库中搜索。

**参数**：`query: string`

**返回值**：`SearchResult[]`

---

### 错题本

#### `mistakes-list`

获取所有错题记录。

**参数**：无

**返回值**：错题记录数组

#### `mistakes-get`

获取单个错题详情。

**参数**：`id: number`

**返回值**：错题记录对象

#### `mistakes-update-analysis`

更新错题的 AI 分析内容。

**参数**：`id: number`, `analysis: string`

**返回值**：`void`

#### `mistakes-delete`

删除错题记录。

**参数**：`id: number`

**返回值**：`void`

---

### 数据库/设置

#### `db-get-setting`

获取设置值。

**参数**：`key: string`（最长 256 字符）

**返回值**：`string | null`

#### `db-set-setting`

保存设置值。

**参数**：`key: string`（最长 256 字符）, `value: string`（最长 10000 字符）

**返回值**：`void`

#### `db-get-ai-configs`

获取所有 AI 配置（API Key 已解密）。

**参数**：无

**返回值**：`ChatConfig[]`

#### `db-save-ai-config`

保存 AI 配置（API Key 自动加密）。

**参数**：

```typescript
interface AIConfigSavePayload {
  id?: number // 更新时传入
  name: string // 名称（最长 200 字符）
  api_key: string // API 密钥（最长 2000 字符）
  base_url: string // 基础 URL（最长 2000 字符）
  model: string // 模型名（最长 200 字符）
  is_default?: boolean // 是否设为默认
  task_type?: string // 任务类型（最长 100 字符）
}
```

**返回值**：`number | bigint`（配置 ID）

#### `db-delete-ai-config`

删除 AI 配置。

**参数**：`id: number`

**返回值**：`void`

#### `db-get-default-ai-config`

获取默认 AI 配置。

**参数**：无

**返回值**：`ChatConfig | null`

---

### 外部链接

#### `open-external`

在系统默认浏览器中打开 URL。

**参数**：`url: string`（最长 2000 字符，仅 http/https 协议）

**返回值**：`void`

---

### 性能监控

#### `perf-get-ipc-stats`

获取 IPC 调用统计信息。

**参数**：无

**返回值**：

```typescript
Record<
  string,
  {
    calls: number // 调用次数
    avgMs: number // 平均耗时
    slowCalls: number // 慢调用次数
    lastCalledAt: number // 最后调用时间戳
  }
>
```

## 事件推送通道 (send/on)

#### `ai-chat-chunk`

AI 流式响应增量推送。

**载荷**：

```typescript
interface StreamChunkPayload {
  requestId: string // 请求 ID
  chunk: string // 增量内容
}
```

#### `ai-chat-done`

AI 流式响应结束通知。

**载荷**：

```typescript
interface StreamDonePayload {
  requestId: string // 请求 ID
  content: string // 完整内容
}
```

---

## See Also

- [API 参考](../api.md) -- 通道详细参数、返回值与 AI 集成
- [IPC 通信模式](../concepts/ipc-patterns.md) -- IPC 架构与安全机制
- [IPC 协议参考 (开发者指南)](../developer-guide/ipc-protocol.md) -- 面向开发者的 IPC 文档
- [架构文档](../architecture.md) -- 系统架构与进程模型
- [数据库 Schema](database-schema.md) -- IPC 操作的数据库表结构
- [术语表](../glossary.md) -- IPC、typedInvoke 等术语解释
