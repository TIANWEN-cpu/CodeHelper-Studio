# 调试指南

> **[< 上一页: 测试指南](testing.md)** | **[下一页: 构建与发布 >](deployment.md)**

本文档介绍 CodeHelper 开发过程中的调试方法和技巧。

## 调试渲染进程

渲染进程运行在 Chromium 中，可以使用 Chrome DevTools。

### 打开 DevTools

```bash
# 启动开发模式
npm run dev
```

在应用窗口中按 `Ctrl+Shift+I`（Windows/Linux）或 `Cmd+Option+I`（macOS）打开 DevTools。

也可通过菜单：**视图 → 切换开发者工具**。

### 常用调试方法

**Console 面板**：

```typescript
// 在组件中输出调试信息
console.log('[debug] state:', state)
console.table(problems)
console.time('render')
// ... 代码 ...
console.timeEnd('render')
```

**Network 面板**：

- 查看 AI API 请求的详细信息
- 检查请求头、响应体、耗时
- 筛选 `chat/completions` 或 `models` 请求

**Components 面板**（需要 React DevTools 扩展）：

- 检查组件树
- 查看 Props 和 State
- 追踪重渲染原因

**Performance 面板**：

- 录制页面加载和交互过程
- 分析长任务和渲染瓶颈

## 调试主进程

主进程运行在 Node.js 中，无法使用浏览器 DevTools。

### 方法 1：终端日志

主进程的 `console.log` / `console.warn` / `console.error` 输出到运行 `npm run dev` 的终端。

```typescript
// electron/ipc/ai.ts
console.log('[ai] Processing request:', args.requestId)
console.warn('[ai] Slow API response:', duration, 'ms')
console.error('[ai] API error:', error.message)
```

### 方法 2：VS Code 调试器

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Electron: Main",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron-vite",
      "runtimeArgs": ["dev"],
      "env": {
        "ELECTRON_DISABLE_SECURITY_WARNINGS": "true"
      }
    }
  ]
}
```

在 `electron/` 目录下的 TypeScript 文件中设置断点，F5 启动调试。

### 方法 3：远程调试

```bash
# 添加 --inspect 标志启动
node --inspect node_modules/.bin/electron-vite dev

# 然后在 Chrome 中访问 chrome://inspect 连接
```

## IPC 调试

### 内置性能监控

CodeHelper 内置了 IPC 性能监控，每 5 分钟自动输出统计信息到终端：

```
[perf] IPC Call Statistics:
  Channel                  | Calls | Avg (ms) | Slow | Last Called
  -------------------------|-------|----------|------|------------
  problems-list            |    12 |      5.3 |    0 | 14:30:25
  ai-chat                  |     3 |   2341.2 |    3 | 14:28:10
  chat-messages-load       |    45 |      1.2 |    0 | 14:30:28
  db-get-setting           |    89 |      0.3 |    0 | 14:30:30
```

- **Slow** 列：耗时超过 1 秒的调用次数
- 在渲染进程中可通过 `perf-get-ipc-stats` 通道查询统计

### 手动追踪 IPC 调用

在主进程处理器中添加日志：

```typescript
ipcMain.handle('my-channel', async (_event, args) => {
  const start = performance.now()
  console.log('[ipc] my-channel called with:', JSON.stringify(args).slice(0, 200))

  try {
    const result = await processRequest(args)
    const duration = performance.now() - start
    console.log(`[ipc] my-channel completed in ${duration.toFixed(1)}ms`)
    return result
  } catch (error) {
    console.error('[ipc] my-channel failed:', error)
    throw error
  }
})
```

### 在渲染进程中追踪 IPC

```typescript
// 临时包装 typedInvoke
import { typedInvoke } from '../api/ipc'

async function debugInvoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['args']
): Promise<IpcChannelMap[K]['result']> {
  console.log(`[ipc-out] ${channel}`, args)
  const start = performance.now()
  try {
    const result = await typedInvoke(channel, ...args)
    console.log(`[ipc-in] ${channel} (${(performance.now() - start).toFixed(1)}ms)`, result)
    return result
  } catch (error) {
    console.error(`[ipc-err] ${channel}:`, error)
    throw error
  }
}
```

## 数据库调试

### 查看数据库文件

SQLite 数据库文件位于：

```
# Windows
%APPDATA%/codehelper/codehelper.db

# macOS
~/Library/Application Support/codehelper/codehelper.db

# Linux
~/.config/codehelper/codehelper.db
```

可以使用 [DB Browser for SQLite](https://sqlitebrowser.org/) 打开查看。

### 在主进程中执行查询

```typescript
// electron/ipc/database.ts 中添加临时调试通道
ipcMain.handle('debug-query', (_e, sql: string) => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('仅开发模式可用')
  }
  return getDB().prepare(sql).all()
})
```

### 查看数据库大小

```sql
-- 查看各表的行数
SELECT 'problems' as tbl, COUNT(*) as cnt FROM problems
UNION ALL
SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL
SELECT 'mistakes', COUNT(*) FROM mistakes
UNION ALL
SELECT 'chat_history', COUNT(*) FROM chat_history
UNION ALL
SELECT 'knowledge_docs', COUNT(*) FROM knowledge_docs;

-- 查看数据库文件大小
PRAGMA page_count;
PRAGMA page_size;
```

## AI 对话调试

### 查看完整请求/响应

在 `electron/ipc/ai.ts` 中添加调试日志：

```typescript
// 发送前记录完整请求
console.log('[ai] Request:', {
  model: config.model,
  messageCount: messages.length,
  totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
})

// 记录流式 chunk
console.log('[ai] Chunk:', content)

// 记录完成信息
console.log('[ai] Done. Total content length:', fullContent.length)
```

### 测试特定 AI 配置

```typescript
// 在渲染进程 Console 中直接调用
await window.api.invoke('ai-fetch-models', {
  api_key: 'your-key',
  base_url: 'https://api.openai.com/v1',
})
```

## 代码执行调试

### 查看临时文件

代码执行会创建临时文件：

```
# Windows
%TEMP%/codehelper-run/

# 临时文件命名
main_<uuid>.py     # Python
main_<uuid>.c      # C
main_<uuid>.cpp    # C++
Main_<uuid>.cs     # C#
```

执行失败时可以检查这些文件的内容和编译输出。

### 手动测试代码执行

```typescript
// 在渲染进程 Console 中
const result = await window.api.invoke('run-code', {
  code: 'print("Hello")',
  language: 'python',
})
console.log(result)
// { stdout: 'Hello\n', stderr: '', exitCode: 0, stage: 'run' }
```

## 常见调试场景

### 场景 1：组件不更新

**症状**：Store 状态变化但 UI 不更新。

**排查**：

1. 检查选择器是否正确：`useStore((s) => s.xxx)`
2. 检查是否使用了引用相等比较：对象/数组需要返回新引用
3. 使用 React DevTools 的 "Highlight updates" 确认重渲染

```typescript
// 不好：返回同一个引用
const items = useStore((s) => s.items.filter(...))  // 每次创建新数组

// 好：在 Store 中使用 useMemo 或在组件中使用 useMemo
const items = useStore((s) => s.items)
const filtered = useMemo(() => items.filter(...), [items])
```

### 场景 2：IPC 调用超时

**症状**：`typedInvoke` 长时间无响应。

**排查**：

1. 检查终端是否有主进程错误输出
2. 检查是否有死锁（如并发数据库写入）
3. 检查网络请求（AI API）是否超时

### 场景 3：数据库锁定

**症状**：SQLite 报 `database is locked` 错误。

**排查**：

1. 确认 WAL 模式已启用（`db/index.ts` 中的 `pragma('journal_mode = WAL')`）
2. 检查是否有长时间运行的事务
3. 确认没有同时打开多个数据库连接

## 调试工具清单

| 工具                  | 用途           |
| --------------------- | -------------- |
| Chrome DevTools       | 渲染进程调试   |
| VS Code Debugger      | 主进程断点调试 |
| React DevTools        | 组件树检查     |
| DB Browser for SQLite | 数据库查看     |
| Performance Monitor   | IPC 性能监控   |
| `console.*`           | 日志输出       |
| `debugger` 语句       | 代码断点       |

---

## See Also

- [快速上手](getting-started.md) -- 环境搭建与启动
- [日常开发指南](development.md) -- 代码规范与调试技巧概述
- [测试指南](testing.md) -- Mock 策略与测试编写
- [故障排除](../troubleshooting.md) -- 常见问题与解决方案
- [IPC 通信模式](../concepts/ipc-patterns.md) -- IPC 架构与错误处理
- [数据库 Schema](../reference/database-schema.md) -- 表结构查询参考
- [性能优化](../troubleshooting/performance.md) -- 性能诊断与 IPC 监控
