# IPC 通信模式

本文档介绍 CodeHelper 中 Electron 主进程与渲染进程之间的 IPC（Inter-Process Communication）通信模式。

## 通信架构概览

```
┌─────────────────────────────────────┐
│          渲染进程 (Renderer)          │
│                                     │
│  Store → typedInvoke(channel, args) │
│       → window.api.invoke()         │
│                                     │
│  typedOn(channel, callback)         │
│       → window.api.on()             │
└──────────────┬──────────────────────┘
               │ contextBridge
               │ (白名单校验 + 序列化检查)
┌──────────────┴──────────────────────┐
│          主进程 (Main)                │
│                                     │
│  ipcMain.handle(channel, handler)   │
│  BrowserWindow.send(channel, data)  │
└─────────────────────────────────────┘
```

CodeHelper 使用两种 IPC 模式：

1. **请求-响应模式** (invoke/handle) — 渲染进程发起请求，等待主进程返回结果
2. **事件推送模式** (send/on) — 主进程主动向渲染进程推送事件（用于 AI 流式响应）

## 请求-响应模式 (invoke/handle)

### 类型安全封装

所有 IPC 调用通过 `typedInvoke` 函数进行，它是对 `window.api.invoke` 的类型安全封装。

**类型定义** (`src/types/ipc.ts`):

```typescript
export interface IpcChannelMap {
  'problems-list': { args: [ProblemListFilters?]; result: Problem[] }
  'problems-get': { args: [number]; result: Problem | undefined }
  'problems-submit': { args: [SubmitPayload]; result: SubmitResult }
  'ai-chat': { args: [AIChatPayload]; result: AIChatResult }
  'run-code': { args: [RunCodePayload]; result: RunCodeResult }
  'db-get-setting': { args: [string]; result: string | null }
  // ... 更多通道
}
```

**调用封装** (`src/api/ipc.ts`):

```typescript
export async function typedInvoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['args']
): Promise<IpcChannelMap[K]['result']> {
  return window.api.invoke(channel, ...args) as Promise<IpcChannelMap[K]['result']>
}
```

**使用示例**：

```typescript
// 类型安全：problems 自动推断为 Problem[]
const problems = await typedInvoke('problems-list', { difficulty: 'easy' })

// 类型安全：result 自动推断为 SubmitResult
const result = await typedInvoke('problems-submit', {
  problemId: 1,
  code: 'print("hello")',
  language: 'python',
})
```

### 安全层 — preload.ts

`preload.ts` 担任安全守卫，确保只有合法的 IPC 调用才能到达主进程：

```typescript
// 仅允许的 invoke 通道
const allowedInvokeChannels = new Set([
  'run-code',
  'db-get-setting',
  'db-set-setting',
  'ai-chat',
  'problems-list',
  'problems-get',
  'problems-submit',
  'chat-sessions-list',
  'chat-session-create' /* ... */,
])

// 仅允许的事件通道
const allowedEventChannels = new Set(['ai-chat-chunk', 'ai-chat-done'])
```

校验规则：

1. **通道白名单**：仅允许 `allowedInvokeChannels` 中注册的通道名
2. **类型校验**：channel 必须是字符串，callback 必须是函数
3. **序列化检查**：参数必须可序列化（排除 function、symbol、bigint、自定义类实例）

```typescript
function isSerializable(value: unknown, depth = 0): boolean {
  if (depth > 10) return false // 防止深层嵌套
  if (value === null || value === undefined) return true
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (t === 'function' || t === 'symbol' || t === 'bigint') return false
  if (Array.isArray(value)) return value.every((v) => isSerializable(v, depth + 1))
  if (t === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.constructor && obj.constructor !== Object && obj.constructor !== Array) return false
    return Object.values(obj).every((v) => isSerializable(v, depth + 1))
  }
  return false
}
```

### 主进程处理器注册

每个 IPC 模块导出一个 `registerXxxIPC()` 函数，在 `main.ts` 的 `app.whenReady()` 中统一调用：

```typescript
// main.ts
app.whenReady().then(() => {
  registerRunnerIPC() // 代码执行
  registerDatabaseIPC() // 数据库操作
  registerAIIPC() // AI 对话
  registerProblemsIPC() // 题目管理
  registerMistakesIPC() // 错题本
  registerRAGIPC() // 知识库 RAG
  registerChatIPC() // 聊天会话管理
})
```

每个处理器都进行严格的参数校验：

```typescript
// 以 problems-submit 为例
ipcMain.handle('problems-submit', async (_event, args) => {
  // 1. 类型校验
  if (!args || typeof args !== 'object') throw new Error('参数无效')
  if (typeof args.problemId !== 'number') throw new Error('参数无效: problemId')
  if (typeof args.code !== 'string') throw new Error('参数无效: code')
  if (typeof args.language !== 'string') throw new Error('参数无效: language')

  // 2. 长度限制
  args.code = args.code.slice(0, 100000)
  args.language = args.language.trim().slice(0, 50)

  // 3. 业务处理
  const problem = db.prepare('SELECT * FROM problems WHERE id = ?').get(args.problemId)
  if (!problem) throw new Error('题目不存在')
  // ...
})
```

## 事件推送模式 (send/on)

### AI 流式响应

AI 对话使用 Server-Sent Events 协议，主进程将增量数据推送给渲染进程：

**主进程发送** (`electron/ipc/ai.ts`):

```typescript
// 解析 SSE 流
while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data: ')) continue
    const data = trimmed.slice(6)
    if (data === '[DONE]') continue

    try {
      const json = JSON.parse(data)
      const content = json.choices?.[0]?.delta?.content
      if (content && win) {
        fullContent += content
        // 推送增量到渲染进程
        win.webContents.send('ai-chat-chunk', { requestId, chunk: content })
      }
    } catch {
      /* skip malformed JSON */
    }
  }
}

// 流结束通知
win.webContents.send('ai-chat-done', { requestId, content: fullContent })
```

**渲染进程接收** (`src/hooks/useAIStream.ts`):

```typescript
export function useAIStream(options: UseAIStreamOptions = {}) {
  const appendChunk = useChatStore((s) => s.appendChunk)
  const finishStream = useChatStore((s) => s.finishStream)

  useEffect(() => {
    const unsubChunk = typedOn('ai-chat-chunk', (payload) => {
      appendChunk(payload)
    })
    const unsubDone = typedOn('ai-chat-done', (payload) => {
      void finishStream(payload)
    })

    return () => {
      unsubChunk() // 清理订阅
      unsubDone()
    }
  }, [appendChunk, finishStream])
}
```

### 事件类型定义

```typescript
// src/types/ipc.ts
export interface IpcEventMap {
  'ai-chat-chunk': StreamChunkPayload // { requestId: string; chunk: string }
  'ai-chat-done': StreamDonePayload // { requestId: string; content: string }
}
```

**类型安全的事件监听封装** (`src/api/ipc.ts`):

```typescript
export function typedOn<K extends keyof IpcEventMap>(
  channel: K,
  callback: (payload: IpcEventMap[K]) => void,
): () => void {
  return window.api.on(channel, (payload: unknown) => {
    callback(payload as IpcEventMap[K])
  })
}
```

## 性能监控

`electron/utils/perfMonitor.ts` 提供 IPC 调用的性能监控能力：

```typescript
// 包装处理器以记录性能
ipcMain.handle(
  'chat-messages-load',
  trackPerformance('chat-messages-load', (_e, sessionId) => {
    return getDB()
      .prepare('SELECT * FROM chat_history WHERE session_id = ? ORDER BY ...')
      .all(sessionId)
  }),
)
```

监控数据包括：

- 每个通道的调用次数
- 平均耗时（ms）
- 慢调用次数（超过 1 秒阈值）
- 最后调用时间

每 5 分钟自动输出统计摘要，也可通过 `perf-get-ipc-stats` 通道在渲染进程中查询。

## 错误处理模式

### 主进程错误

IPC 处理器中的错误会被 Electron 自动捕获并通过 Promise rejection 传递回渲染进程：

```typescript
// 主进程
ipcMain.handle('problems-submit', async (_event, args) => {
  if (!args || typeof args !== 'object') throw new Error('参数无效')
  // ...
})

// 渲染进程
try {
  const result = await typedInvoke('problems-submit', payload)
} catch (error) {
  // error.message 包含主进程抛出的错误信息
  const msg = toErrorMessage(error)
}
```

### 渲染进程错误处理

使用 `toErrorMessage()` 统一处理各种类型的错误：

```typescript
import { toErrorMessage, categorizeError, getUserMessage } from '../utils/errors'

// 标准化错误信息
const msg = toErrorMessage(unknownError)

// 错误分类
const category = categorizeError(error) // 'network' | 'auth' | 'timeout' | ...

// 用户友好的错误信息
const userMsg = getUserMessage(error)
```

## 新增 IPC 通道的完整步骤

1. **定义类型**：在 `src/types/ipc.ts` 的 `IpcChannelMap` 中添加条目
2. **注册白名单**：在 `electron/preload.ts` 的 `allowedInvokeChannels` 中添加通道名
3. **实现处理器**：在对应的 `electron/ipc/*.ts` 中编写处理器（含参数校验）
4. **注册处理器**：在对应模块的 `registerXxxIPC()` 中添加 `ipcMain.handle()`
5. **创建 Store Action**：在对应的 Zustand store 中添加调用逻辑
6. **类型化调用**：在 Store 中使用 `typedInvoke()` 调用

```typescript
// 1. 类型定义 (src/types/ipc.ts)
'my-new-channel': { args: [string, number]; result: MyResult }

// 2. 白名单 (electron/preload.ts)
allowedInvokeChannels.add('my-new-channel')

// 3. 处理器 (electron/ipc/myModule.ts)
ipcMain.handle('my-new-channel', (_e, strArg: string, numArg: number) => {
  // 校验 + 业务逻辑
})

// 4. 在 Store 中调用 (src/stores/myStore.ts)
const result = await typedInvoke('my-new-channel', 'hello', 42)
```

---

## See Also

- [系统架构](architecture.md) -- 整体架构设计与模块职责
- [安全模型](security-model.md) -- IPC 白名单、序列化检查与参数校验
- [状态管理](state-management.md) -- Zustand Store 如何调用 IPC
- [数据流](data-flow.md) -- IPC 调用在数据流中的位置
- [IPC 通道参考](../reference/ipc-channels.md) -- 所有 IPC 通道一览
- [API 参考](../api.md) -- 通道详细参数与返回值
- [IPC 协议参考 (开发者指南)](../developer-guide/ipc-protocol.md) -- 面向开发者的 IPC 文档
- [术语表](../glossary.md) -- 技术名词解释
