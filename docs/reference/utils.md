# 工具函数参考

本文档列出 CodeHelper 中的工具函数。

## src/utils/errors.ts — 错误处理工具

渲染进程中统一的错误处理工具集。

### toErrorMessage(error: unknown): string

将任意类型的错误标准化为可读字符串。

```typescript
import { toErrorMessage } from '../utils/errors'

toErrorMessage(new Error('网络错误')) // → '网络错误'
toErrorMessage('字符串错误') // → '字符串错误'
toErrorMessage({ message: '对象错误' }) // → '对象错误'
toErrorMessage(42) // → '42'
toErrorMessage(null) // → 'null'
```

### safeAsync\<T\>(fn: () => Promise\<T\>): Promise\<[T, null] | [null, Error]\>

安全执行异步操作，返回结果元组。

```typescript
import { safeAsync } from '../utils/errors'

const [data, err] = await safeAsync(async () => {
  return await typedInvoke('problems-list')
})

if (err) {
  console.error('加载失败:', err.message)
} else {
  console.log('题目数量:', data.length)
}
```

### safeSync\<T\>(fn: () => T): [T, null] | [null, Error]

安全执行同步操作，返回结果元组。

```typescript
import { safeSync } from '../utils/errors'

const [data, err] = safeSync(() => JSON.parse(rawJson))
if (err) {
  console.error('JSON 解析失败:', err.message)
}
```

### parseJsonSafe\<T\>(raw: string, fallback: T): T

安全解析 JSON，失败时返回默认值。

```typescript
import { parseJsonSafe } from '../utils/errors'

const config = parseJsonSafe<Config>(raw, defaultConfig)
```

### categorizeError(error: unknown): ErrorCategory

根据错误消息分类。

```typescript
import { categorizeError } from '../utils/errors'

type ErrorCategory = 'network' | 'validation' | 'auth' | 'not-found' | 'timeout' | 'unknown'

categorizeError(new Error('fetch failed')) // → 'network'
categorizeError(new Error('401 Unauthorized')) // → 'auth'
categorizeError(new Error('request timed out')) // → 'timeout'
categorizeError(new Error('404 not found')) // → 'not-found'
categorizeError(new Error('invalid input')) // → 'validation'
categorizeError(new Error('something went wrong')) // → 'unknown'
```

### getUserMessage(error: unknown): string

获取用户友好的错误信息。优先返回原始错误消息，如果无法识别则返回分类对应的默认消息。

```typescript
import { getUserMessage } from '../utils/errors'

// 网络错误的默认消息
getUserMessage(new Error('ECONNREFUSED'))
// → '网络连接失败，请检查网络后重试'

// 可识别的错误返回原始消息
getUserMessage(new Error('未配置AI模型，请先在设置中添加'))
// → '未配置AI模型，请先在设置中添加'
```

默认消息映射：

| 分类         | 默认消息                         |
| ------------ | -------------------------------- |
| `network`    | `网络连接失败，请检查网络后重试` |
| `auth`       | `认证失败，请检查 API Key 配置`  |
| `timeout`    | `请求超时，请稍后重试`           |
| `not-found`  | `请求的资源不存在`               |
| `validation` | `输入数据不合法，请检查后重试`   |
| `unknown`    | `发生未知错误，请稍后重试`       |

---

## src/api/ipc.ts — IPC 调用封装

### typedInvoke\<K\>(channel, ...args): Promise\<Result\>

类型安全的 IPC 调用封装。

```typescript
import { typedInvoke } from '../api/ipc'

// 类型自动推断
const problems = await typedInvoke('problems-list', { difficulty: 'easy' })
// problems 类型为 Problem[]

const result = await typedInvoke('problems-submit', {
  problemId: 1,
  code: '...',
  language: 'python',
})
// result 类型为 SubmitResult
```

### typedOn\<K\>(channel, callback): () => void

类型安全的 IPC 事件监听封装。返回取消订阅函数。

```typescript
import { typedOn } from '../api/ipc'

const unsub = typedOn('ai-chat-chunk', (payload) => {
  // payload 类型为 StreamChunkPayload
  console.log(payload.chunk)
})

// 取消订阅
unsub()
```

---

## src/constants/index.ts — 全局常量

### IPC 通道名

```typescript
export const IPC = {
  CHAT: 'ai-chat',
  CHAT_CHUNK: 'ai-chat-chunk',
  CHAT_DONE: 'ai-chat-done',
  RUN_CODE: 'run-code',
  PROBLEMS_LIST: 'problems-list',
  PROBLEMS_GET: 'problems-get',
  PROBLEMS_SUBMIT: 'problems-submit',
  KNOWLEDGE_LIST: 'knowledge-list',
  KNOWLEDGE_UPLOAD: 'knowledge-upload',
  KNOWLEDGE_SEARCH: 'knowledge-search',
  KNOWLEDGE_DELETE: 'knowledge-delete',
  // ... 更多通道
} as const
```

### 应用默认值

```typescript
export const THEMES = ['mocha', 'fjord', 'ember'] as const
export const DEFAULT_THEME = 'mocha'
export const DEFAULT_EDITOR_FONT_SIZE = 14
export const EDITOR_FONT_FAMILY = "'Cascadia Code', 'Fira Code', Consolas, monospace"
export const EDITOR_TAB_SIZE = 4
export const DEFAULT_LANGUAGE = 'python'
export const SESSION_TITLE_MAX_LENGTH = 30
export const THEME_SETTING_KEY = 'ui-theme'
```

### 模块标签

```typescript
export const MODULE_LABELS: Record<string, string> = {
  problems: '刷题系统',
  editor: '代码编辑器',
  'ai-chat': 'AI 助手',
  mistakes: '错题本',
  knowledge: '知识库',
  settings: '设置',
  stats: '统计面板',
  search: '全局搜索',
}
```

---

## electron/utils/codeRunner.ts — 代码执行引擎

### runCodeSnippet(code, language, stdin?): Promise\<CodeRunResult\>

执行用户代码。

```typescript
import { runCodeSnippet } from '../utils/codeRunner'

const result = await runCodeSnippet('print("Hello")', 'python')
// { stdout: 'Hello\n', stderr: '', exitCode: 0, stage: 'run' }

const cResult = await runCodeSnippet('#include <stdio.h>\nint main(){printf("Hi");}', 'c')
// { stdout: 'Hi', stderr: '', exitCode: 0, stage: 'run' }
```

支持的语言：

| 语言     | 编译器/运行时 | 阶段          |
| -------- | ------------- | ------------- |
| `python` | `python`      | run           |
| `c`      | `gcc`         | compile + run |
| `cpp`    | `g++`         | compile + run |
| `csharp` | `csc`         | compile + run |
| `sql`    | 内存 SQLite   | sql           |

安全限制：

- 最大输出：1MB
- 最大并发：5 个进程
- 默认超时：10 秒

---

## electron/utils/perfMonitor.ts — 性能监控

### trackPerformance(channel, handler)

包装 IPC 处理器以记录执行时间。

```typescript
import { trackPerformance } from '../utils/perfMonitor'

ipcMain.handle(
  'my-channel',
  trackPerformance('my-channel', (_e, arg) => {
    return doExpensiveWork(arg)
  }),
)
```

### getIpcStats(): Record\<string, Stats\>

获取所有 IPC 通道的调用统计。

### logIpcStatsSummary()

在控制台输出格式化的统计表格。

---

## electron/utils/sqlUtils.ts — SQL 工具

### splitSqlStatements(sql): string[]

将 SQL 脚本分割为独立语句（正确处理字符串内的分号）。

### isQueryStatement(sql): boolean

判断 SQL 语句是否是查询（SELECT/PRAGMA/EXPLAIN）。

### formatRows(rows): string

将查询结果格式化为可读的表格文本。

---

## electron/utils/chatHelpers.ts — 聊天辅助

### BUILTIN_PRESETS

内置提示词预设列表。

### extractMemoryCandidates(content)

从用户消息中自动提取记忆候选（如偏好声明、自我介绍等）。

### buildSearchTerms(query)

将查询文本拆分为搜索关键词。

---

## src/hooks/useAIStream.ts — AI 流式响应 Hook

### useAIStream(options?): { scrollRef, scrollToBottom }

管理 AI 流式响应的 IPC 事件订阅和自动滚动。

```typescript
import { useAIStream } from '../hooks/useAIStream'

function ChatView() {
  const { scrollRef, scrollToBottom } = useAIStream({ autoScroll: true })

  return (
    <div>
      {/* 消息列表 */}
      <div ref={scrollRef} />
    </div>
  )
}
```

---

## src/hooks/useCodeExecution.ts — 代码执行 Hook

### useCodeExecution(): UseCodeExecutionReturn

管理代码执行状态。

```typescript
import { useCodeExecution } from '../hooks/useCodeExecution'

function EditorConsole() {
  const { output, running, execute, clearOutput } = useCodeExecution()

  const handleRun = async () => {
    const result = await execute(code, 'python')
    console.log(result.stdout)
  }

  return (
    <div>
      <button onClick={handleRun} disabled={running}>
        {running ? '运行中...' : '运行'}
      </button>
      {output && <pre>{output.stdout}</pre>}
    </div>
  )
}
```

---

## src/hooks/useKeyboardShortcuts.ts — 全局快捷键

注册全局键盘快捷键。

| 快捷键         | 功能         |
| -------------- | ------------ |
| `Ctrl+P`       | 打开全局搜索 |
| `Ctrl+Shift+P` | 打开命令面板 |
| `Ctrl+B`       | 切换侧栏折叠 |

---

## See Also

- [测试指南](../guides/testing.md) -- 工具函数的测试编写
- [React 组件](components.md) -- 使用工具函数的组件
- [Zustand Stores](stores.md) -- Store 中使用的工具函数
- [架构文档 - 工具模块](../architecture.md#目录结构) -- electron/utils/ 和 src/utils/ 结构
- [术语表](../glossary.md) -- 技术名词解释
