# 外部 API

本文档介绍 CodeHelper 调用的外部 API。

## AI 模型 API

CodeHelper 使用 OpenAI 兼容的 Chat Completions API 与 AI 模型通信。

### API 端点

#### Chat Completions

**URL**: `{base_url}/chat/completions`

**方法**: POST

**请求头**:

```
Content-Type: application/json
Authorization: Bearer {api_key}
```

**请求体**:

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "你是一个编程助手..." },
    { "role": "user", "content": "解释一下快速排序" },
    { "role": "assistant", "content": "快速排序是一种..." },
    { "role": "user", "content": "时间复杂度是多少？" }
  ],
  "stream": true
}
```

**关键参数**：

| 参数       | 类型    | 说明                          |
| ---------- | ------- | ----------------------------- |
| `model`    | string  | 模型名称，从配置中读取        |
| `messages` | array   | 对话消息列表                  |
| `stream`   | boolean | 始终为 `true`（启用流式响应） |

**流式响应格式** (SSE):

```
data: {"choices":[{"delta":{"content":"快"},"index":0}]}
data: {"choices":[{"delta":{"content":"速"},"index":0}]}
data: {"choices":[{"delta":{"content":"排"},"index":0}]}
data: [DONE]
```

#### 获取模型列表

**URL**: `{base_url}/models`

**方法**: GET

**请求头**:

```
Authorization: Bearer {api_key}
```

**响应**:

```json
{
  "data": [
    {"id": "gpt-4o", "object": "model", ...},
    {"id": "gpt-4o-mini", "object": "model", ...}
  ]
}
```

### 支持的 AI 提供商

CodeHelper 使用 OpenAI 兼容的 API 格式，支持以下提供商：

| 提供商       | Base URL                                                            | 模型示例            |
| ------------ | ------------------------------------------------------------------- | ------------------- |
| OpenAI       | `https://api.openai.com/v1`                                         | gpt-4o, gpt-4o-mini |
| Azure OpenAI | `https://{resource}.openai.azure.com/openai/deployments/{model}/v1` | gpt-4o              |
| 通义千问     | `https://dashscope.aliyuncs.com/compatible-mode/v1`                 | qwen-plus           |
| DeepSeek     | `https://api.deepseek.com/v1`                                       | deepseek-chat       |
| Moonshot     | `https://api.moonshot.cn/v1`                                        | moonshot-v1-8k      |
| 本地模型     | `http://localhost:11434/v1` (Ollama)                                | llama3              |

### 记忆注入

当 `includeMemories` 为 `true` 时，主进程会在消息列表前插入系统记忆：

```json
{
  "role": "system",
  "content": "以下是用户的跨对话长期记忆，仅在相关时使用，不要生硬复述：\n1. [preference] 用户偏好使用 Python\n2. [skill] 用户熟悉数据结构与算法"
}
```

记忆检索算法：

1. 从 `memories` 表中获取所有 `enabled = 1` 的记忆
2. 对每条记忆计算相关性分数：
   - 置顶记忆基础分 +50
   - 关键词匹配加分（按匹配词长度）
   - 完整匹配加分 +20
3. 取分数最高的 6 条注入
4. 如无匹配，取最近的 3 条置顶记忆

### 错误处理

AI API 的错误会被捕获并传递到渲染进程：

| HTTP 状态码 | 错误信息                                   |
| ----------- | ------------------------------------------ |
| 401         | `AI API 错误 (401): Invalid API key`       |
| 403         | `AI API 错误 (403): Forbidden`             |
| 429         | `AI API 错误 (429): Rate limit exceeded`   |
| 500         | `AI API 错误 (500): Internal server error` |
| 网络错误    | `fetch failed` / `ECONNREFUSED`            |
| 超时        | 请求被 `AbortController` 取消              |

### 请求限制

| 限制项          | 值             | 说明             |
| --------------- | -------------- | ---------------- |
| 消息数量        | 最多 200 条    | 防止上下文过长   |
| 单条消息长度    | 最长 100KB     | 防止超长内容     |
| API Key 长度    | 最长 2000 字符 | 足够覆盖各类 API |
| Base URL 长度   | 最长 2000 字符 | 支持长 URL       |
| Request ID 长度 | 最长 200 字符  | 防止注入         |

### 请求取消

AI 请求支持通过 `AbortController` 取消：

```typescript
// electron/ipc/ai.ts
const controller = new AbortController()
activeRequests.set(requestId, controller)

// 取消之前的请求
const existing = activeRequests.get(requestId)
if (existing) existing.abort()

// 在 fetch 中使用
const response = await fetch(url, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ ... }),
  signal: controller.signal,
})
```

## 当新请求使用相同 `requestId` 时，之前的请求会被自动取消。

## See Also

- [API 参考 - AI 集成](../api.md#ai-集成) -- AI 请求格式与流式响应
- [API 参考 - AI 对话](../api.md#ai-对话) -- ai-chat IPC 通道
- [安全模型](../concepts/security-model.md#api-密钥保护) -- API Key 加密
- [AI 对话指南](../user-guide/ai-chat-guide.md) -- AI 助手使用说明
- [术语表](../glossary.md) -- SSE、OpenAI 兼容 API 等术语
