# IPC 协议参考

本文档详细列出 CodeHelper 中所有 IPC（进程间通信）通道的定义、参数格式和返回值。

## 概述

CodeHelper 的 IPC 通信基于 Electron 的 `ipcMain.handle()` / `ipcRenderer.invoke()` 模式：

- Renderer 进程通过 `window.api.invoke(channel, ...args)` 调用
- Preload 脚本进行白名单校验和序列化检查
- Main 进程的 handler 执行业务逻辑并返回结果

### 事件通道

除 invoke/handle 模式外，AI 流式对话使用事件推送：

| 通道            | 方向            | 说明               |
| --------------- | --------------- | ------------------ |
| `ai-chat-chunk` | Main → Renderer | 流式对话的文本片段 |
| `ai-chat-done`  | Main → Renderer | 流式对话完成       |

---

## 代码执行 (runner.ts)

### `run-code`

执行代码片段并返回结果。

**参数**:

```typescript
{
  code: string       // 代码内容（最大 100,000 字符）
  language: string   // 语言标识（最大 50 字符）
  stdin?: string     // 标准输入（最大 100,000 字符）
}
```

**返回值**:

```typescript
{
  stdout: string // 标准输出
  stderr: string // 标准错误
  exitCode: number // 退出码（0 表示成功）
  stage: 'compile' | 'run' | 'sql' // 执行阶段
}
```

**支持的语言**: `python`, `c`, `cpp`, `csharp`, `sql`

---

## 设置与 AI 配置 (database.ts)

### `db-get-setting`

获取指定键的设置值。

**参数**: `key: string`（最大 256 字符）

**返回值**: `string | null`（设置值，不存在时返回 null）

### `db-set-setting`

设置键值对（存在则更新，不存在则插入）。

**参数**: `key: string`（最大 256 字符）, `value: string`（最大 10,000 字符）

**返回值**: `void`

### `db-get-ai-configs`

获取所有 AI 配置列表（按默认优先排序）。

**参数**: 无

**返回值**:

```typescript
Array<{
  id: number
  name: string
  api_key: string // 已解密的 API Key
  base_url: string
  model: string
  is_default: number // 0 或 1
  task_type: string | null
  created_at: string
}>
```

### `db-save-ai-config`

保存 AI 配置（新建或更新）。设为默认时自动取消其他默认配置。

**参数**:

```typescript
{
  id?: number          // 存在则更新，不存在则新建
  name: string         // 最大 200 字符
  api_key: string      // 最大 2,000 字符（存储时加密）
  base_url: string     // 最大 2,000 字符
  model: string        // 最大 200 字符
  is_default?: boolean
  task_type?: string   // 最大 100 字符
}
```

**返回值**: `number`（配置 ID）

### `db-delete-ai-config`

删除指定的 AI 配置。

**参数**: `id: number`（正整数）

**返回值**: `void`

### `db-get-default-ai-config`

获取默认的 AI 配置（如无默认则返回第一个配置）。

**参数**: 无

**返回值**: AI 配置对象或 `null`

### `ai-fetch-models`

从 API 服务获取可用模型列表。

**参数**:

```typescript
{
  api_key: string // 最大 2,000 字符
  base_url: string // 最大 2,000 字符
}
```

**返回值**: `string[]`（模型 ID 列表，已排序）

---

## AI 对话 (ai.ts)

### `ai-chat`

发起 AI 对话请求，支持流式响应。

**参数**:

```typescript
{
  messages: Array<{      // 最多 200 条消息
    role: 'user' | 'assistant' | 'system'
    content: string      // 每条最大 100,000 字符
  }>
  configId?: number      // 指定 AI 配置 ID
  requestId?: string     // 请求标识（最大 200 字符），用于取消重复请求
  includeMemories?: boolean  // 是否注入长期记忆
}
```

**返回值**:

```typescript
{
  success: boolean
  requestId: string
  content: string // AI 完整回复内容
}
```

**副作用**: 通过事件通道推送流式数据：

- `ai-chat-chunk`: `{ requestId: string, chunk: string }`
- `ai-chat-done`: `{ requestId: string, content: string }`

**行为说明**:

- 相同 `requestId` 的重复请求会自动取消前一个
- `includeMemories: true` 时自动检索相关记忆并注入上下文
- 模型配置查找优先级：指定 configId → 默认配置 → 第一个配置

---

## 题库管理 (problems.ts)

### `problems-list`

获取题目列表，支持多维度筛选。

**参数**（可选）:

```typescript
{
  difficulty?: string  // 'easy' | 'medium' | 'hard'（最大 100 字符）
  tag?: string         // 标签关键词（模糊匹配）
  status?: string      // 预留
  source?: string      // 来源精确匹配
  track?: string       // 赛道（JSON 包含匹配）
  platform?: string    // 平台精确匹配
  mode?: string        // 模式精确匹配
}
```

**返回值**:

```typescript
Array<{
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
  solved: number // 已通过的提交次数（子查询计算）
  // ...其他字段
}>
```

### `problems-get`

获取单个题目的完整信息。

**参数**: `id: number`（正整数）

**返回值**: 题目对象或 `undefined`

### `problems-submit`

提交代码并自动判题。

**参数**:

```typescript
{
  problemId: number // 题目 ID
  code: string // 代码（最大 100,000 字符）
  language: string // 语言标识（最大 50 字符）
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

- 在 `submissions` 表中记录提交
- 失败时在 `mistakes` 表中记录/更新错题
- 通过时更新错题的正确代码

### `problems-submissions`

获取指定题目的最近提交记录。

**参数**: `problemId: number`（正整数）

**返回值**: 最近 20 条提交记录数组

---

## 错题本 (mistakes.ts)

### `mistakes-list`

获取所有错题列表（关联题目信息）。

**参数**: 无

**返回值**:

```typescript
Array<{
  id: number
  problem_id: number
  error_count: number
  error_types: string // JSON 数组字符串
  last_wrong_code: string | null
  correct_code: string | null
  ai_analysis: string | null
  review_count: number
  title: string // 关联的题目标题
  difficulty: string
  tags: string
  // ...其他字段
}>
```

### `mistakes-get`

获取单个错题详情（包含完整题目描述）。

**参数**: `id: number`（正整数）

**返回值**: 错题对象（包含 `title`, `description`, `difficulty`, `tags`, `starter_code`）

### `mistakes-update-analysis`

更新错题的 AI 分析结果。

**参数**: `id: number`（正整数）, `analysis: string`（最大 50,000 字符）

**返回值**: `void`

### `mistakes-delete`

删除错题记录。

**参数**: `id: number`（正整数）

**返回值**: `void`

---

## 知识库 RAG (rag.ts)

### `knowledge-upload`

打开文件选择对话框，导入文档到知识库。

**参数**: 无

**返回值**: `string[] | null`（导入的文件名列表，取消时返回 null）

**行为**:

- 支持文件类型：`.txt`, `.md`, `.pdf`
- 支持多选
- 单文件大小限制：10 MB
- 自动分块（约 500 字符/块）
- PDF 使用 `pdf-parse` 库提取文本

### `knowledge-list`

获取知识库中的所有文档。

**参数**: 无

**返回值**:

```typescript
Array<{
  id: number
  filename: string
  file_type: string
  chunk_count: number
  created_at: string
}>
```

### `knowledge-delete`

删除文档及其所有分块（级联删除）。

**参数**: `id: number`（正整数）

**返回值**: `void`

### `knowledge-search`

关键词检索知识库内容。

**参数**: `query: string`（最大 1,000 字符）

**返回值**:

```typescript
Array<{
  id: number
  doc_id: number
  content: string
  chunk_index: number
  filename: string      // 关联的文档文件名
  score: number         // 关键词匹配评分
}>（最多 5 条，按评分降序）
```

---

## 聊天管理 (chat.ts)

### `chat-sessions-list`

获取所有聊天会话列表。

**参数**: 无

**返回值**: 会话数组（按 `updated_at` 降序）

### `chat-session-create`

创建新的聊天会话。

**参数**:

```typescript
{
  id: string              // 会话 ID（最大 200 字符）
  title?: string          // 标题（最大 500 字符，默认"新对话"）
  system_prompt?: string  // 系统提示词（最大 10,000 字符）
}
```

**返回值**: 新创建的会话对象

### `chat-session-update`

更新聊天会话信息。

**参数**: `id: string`, `updates: { title?: string, system_prompt?: string }`

**返回值**: `void`

### `chat-session-delete`

删除会话及其所有消息（级联删除）。

**参数**: `id: string`

**返回值**: `void`

### `chat-messages-load`

加载指定会话的所有消息。

**参数**: `sessionId: string`

**返回值**: 消息数组（按 `created_at` 和 `id` 升序）

### `chat-message-save`

保存一条聊天消息。

**参数**:

```typescript
{
  session_id: string    // 最大 200 字符
  role: 'user' | 'assistant' | 'system'
  content: string       // 最大 100,000 字符
  model?: string        // 最大 200 字符
}
```

**返回值**: `void`

**副作用**: 同时更新会话的 `updated_at` 时间

### `chat-presets-list`

获取所有预设提示词。

**参数**: 无

**返回值**: 预设数组（内置预设排在前面）

### `chat-preset-save`

保存预设提示词（新建或更新）。内置预设不可更新。

**参数**:

```typescript
{
  id?: number           // 存在则更新
  name: string          // 最大 200 字符
  prompt: string        // 最大 10,000 字符
}
```

**返回值**: `void`

### `chat-preset-delete`

删除预设提示词。内置预设不可删除。

**参数**: `id: number`

**返回值**: `void`

### `chat-memories-list`

获取长期记忆列表。

**参数**: `search?: string`（最大 500 字符，可选，按内容/分类过滤）

**返回值**: 记忆数组（置顶优先，然后按更新时间降序）

### `chat-memory-save`

保存长期记忆（新建或更新）。内容相同的记忆会自动合并。

**参数**:

```typescript
{
  id?: number
  content: string       // 最大 1,000 字符
  category?: string     // 最大 100 字符，默认 'general'
  source?: string       // 最大 100 字符，默认 'manual'
  source_ref?: string   // 最大 500 字符
  pinned?: boolean
  enabled?: boolean     // 默认 true
  confidence?: number   // 0-1，默认 1
}
```

**返回值**: 保存后的记忆对象

### `chat-memory-delete`

删除长期记忆。

**参数**: `id: number`

**返回值**: `void`

### `chat-memory-capture`

从消息内容中自动提取记忆候选并保存。

**参数**:

```typescript
{
  content: string       // 最大 10,000 字符
  session_id?: string   // 来源会话 ID
}
```

**返回值**: `MemoryRow[]`（自动提取并保存的记忆列表）

---

## 其他

### `open-external`

在系统默认浏览器中打开外部链接。

**参数**: `url: string`（最大 2,000 字符，仅支持 http/https 协议）

**返回值**: `void`

### `perf-get-ipc-stats`

获取 IPC 调用性能统计数据（用于诊断）。

**参数**: 无

**返回值**: 各通道的调用次数和平均耗时统计对象

---

## See Also

- [IPC 通道参考](../reference/ipc-channels.md) -- IPC 通道一览表
- [IPC 通信模式 (concepts)](../concepts/ipc-patterns.md) -- IPC 架构深入解析
- [API 参考](../api.md) -- 通道详细参数与返回值
- [安全模型](../concepts/security-model.md) -- IPC 安全措施
- [术语表](../glossary.md) -- IPC、typedInvoke 等术语
