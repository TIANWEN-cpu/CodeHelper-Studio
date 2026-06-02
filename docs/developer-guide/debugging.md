# 调试指南

本文档提供 CodeHelper 开发过程中的调试技巧和工具推荐。

## Main 进程调试

### 控制台输出

Main 进程的 `console.log` / `console.warn` / `console.error` 输出会出现在运行 `npm run dev` 的终端中。

```typescript
// 在 electron/ 代码中
console.log('[debug]', someVariable)
console.warn('[warning]', message)
console.error('[error]', error)
```

### 启用详细日志

```bash
# 启用 Electron 的 verbose 日志
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

### 性能监控日志

应用内置性能监控系统，每 5 分钟自动在 Main 进程终端输出 IPC 调用统计：

- 各通道的调用次数
- 平均响应时间
- 慢操作标识（超过阈值的调用）

也可以手动获取统计信息：在 Renderer DevTools 控制台中执行：

```javascript
window.api.invoke('perf-get-ipc-stats').then(console.log)
```

## Renderer 进程调试

### 打开 DevTools

- **快捷键**: `Ctrl+Shift+I`（Windows/Linux）或 `Cmd+Option+I`（macOS）
- **菜单**: 视图 → 切换开发者工具

### 使用 debugger 断点

在代码中添加 `debugger` 语句，DevTools 打开时会自动命中断点：

```typescript
function handleSomething() {
  debugger // DevTools 会在此处暂停
  // ...后续代码
}
```

### React DevTools

安装 [React Developer Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi) 浏览器扩展后，可在 DevTools 中查看 React 组件树和状态。

### Console 面板

Renderer 进程的 `console.log` 输出在 DevTools 的 Console 面板中查看。

## IPC 通信调试

### 添加 IPC 日志

在 `electron/preload.ts` 的 `invoke` 函数中临时添加日志：

```typescript
invoke: (channel: string, ...args: unknown[]) => {
  console.log('[IPC invoke]', channel, args) // 临时调试行
  // ...原有逻辑
}
```

### IPC 事件监听调试

在 `electron/preload.ts` 的 `on` 函数中添加日志：

```typescript
on: (channel: string, callback: (...args: unknown[]) => void) => {
  console.log('[IPC on]', channel) // 临时调试行
  // ...原有逻辑
}
```

### IPC 参数验证失败

如果 IPC 调用返回 "参数无效" 错误，检查：

1. 参数类型是否正确
2. 字符串参数是否超长
3. 数值参数是否在有效范围内
4. 通道名称是否在白名单中

## 数据库调试

### 数据库文件位置

| 操作系统 | 路径                                                     |
| -------- | -------------------------------------------------------- |
| Windows  | `%APPDATA%/codehelper/codehelper.db`                     |
| macOS    | `~/Library/Application Support/codehelper/codehelper.db` |
| Linux    | `~/.config/codehelper/codehelper.db`                     |

### 使用 DB Browser for SQLite

1. 下载安装 [DB Browser for SQLite](https://sqlitebrowser.org/)
2. 打开数据库文件
3. 在"执行 SQL"标签页中运行自定义查询
4. 在"浏览数据"标签页中查看表数据

### 常用调试查询

```sql
-- 查看所有表
SELECT name FROM sqlite_master WHERE type='table';

-- 查看题目数量
SELECT COUNT(*) FROM problems;

-- 查看提交统计
SELECT status, COUNT(*) FROM submissions GROUP BY status;

-- 查看错题列表
SELECT m.*, p.title FROM mistakes m JOIN problems p ON m.problem_id = p.id;

-- 查看聊天会话
SELECT * FROM chat_sessions ORDER BY updated_at DESC LIMIT 10;

-- 查看 AI 配置（注意：api_key 是加密的）
SELECT id, name, base_url, model, is_default FROM ai_configs;

-- 查看记忆列表
SELECT * FROM memories ORDER BY updated_at DESC LIMIT 20;

-- 查看知识库文档
SELECT d.*, d.chunk_count FROM knowledge_docs d;
```

### 数据库重置

如需重置数据库，删除 db 文件后重启应用即可重建：

```bash
# Windows
del "%APPDATA%\codehelper\codehelper.db"

# macOS
rm ~/Library/Application\ Support/codehelper/codehelper.db

# Linux
rm ~/.config/codehelper/codehelper.db
```

## AI 对话调试

### 检查 API 配置

在 Renderer DevTools 控制台中执行：

```javascript
window.api.invoke('db-get-ai-configs').then((configs) => {
  configs.forEach((c) => console.log(c.name, c.base_url, c.model))
})
```

### 测试 API 连通性

```javascript
window.api
  .invoke('ai-fetch-models', {
    api_key: 'your-api-key',
    base_url: 'https://api.openai.com/v1',
  })
  .then((models) => console.log('可用模型:', models))
```

### 流式响应调试

AI 对话使用 SSE 流式输出，可以在 Network 面板中查看：

1. 打开 DevTools → Network 标签
2. 发送 AI 消息
3. 找到 `/chat/completions` 请求
4. 查看 EventStream 响应内容

## 代码运行器调试

### 检查编译器可用性

在 Renderer DevTools 控制台中测试各语言：

```javascript
// 测试 Python
window.api.invoke('run-code', { code: 'print("hello")', language: 'python' }).then(console.log)

// 测试 C
window.api
  .invoke('run-code', {
    code: '#include <stdio.h>\nint main() { printf("hello"); return 0; }',
    language: 'c',
  })
  .then(console.log)

// 测试 SQL
window.api
  .invoke('run-code', { code: 'SELECT 1 + 1 AS result;', language: 'sql' })
  .then(console.log)
```

### 常见问题排查

- **"不支持的语言"**: 检查语言标识是否正确（python, c, cpp, csharp, sql）
- **编译错误**: 检查对应编译器是否已安装并在 PATH 中
- **超时**: 代码可能有死循环或计算量过大
- **并发限制**: 最多同时运行 5 个进程，等待其他进程完成

## 构建调试

### 分析构建产物

```bash
# 构建并分析 bundle 大小
npm run build:analyze
```

### 检查打包问题

```bash
# 确保先构建
npm run build

# 然后打包
npm run build:win

# 查看打包日志中的警告信息
```

### Electron 版本检查

```bash
npx electron --version
```

## 常见开发问题

| 问题                      | 解决方案                                                   |
| ------------------------- | ---------------------------------------------------------- |
| 热重载不生效              | 检查终端是否有编译错误，尝试重启 `npm run dev`             |
| 类型检查通过但运行时报错  | 检查 IPC handler 的返回值类型与 `IpcChannelMap` 是否一致   |
| Monaco Editor 加载缓慢    | 首次加载需下载语言包，后续会缓存                           |
| `better-sqlite3` 编译失败 | 安装 C++ 编译工具链                                        |
| Electron 窗口白屏         | 删除 `node_modules` 和 `out` 后重新安装                    |
| 测试失败                  | 确保使用 `npm run test:watch` 查看实时反馈                 |
| Pre-commit hook 失败      | 运行 `npm run lint:fix` 和 `npm run format` 修复后重新提交 |

---

## See Also

- [调试指南 (guides)](../guides/debugging.md) -- docs 目录下的调试指南
- [故障排除](../troubleshooting.md) -- 常见问题与解决方案
- [性能优化](../troubleshooting/performance.md) -- 性能诊断
- [IPC 通信模式](../concepts/ipc-patterns.md) -- IPC 调试参考
- [术语表](../glossary.md) -- 技术名词解释
