# 架构深入解析

本文档深入解析 CodeHelper 的技术架构，帮助开发者理解系统各层的设计决策和交互方式。

---

## 目录

- [整体架构](#整体架构)
- [主进程 vs 渲染进程](#主进程-vs-渲染进程)
- [IPC 通信机制](#ipc-通信机制)
- [数据库层](#数据库层)
- [AI 集成](#ai-集成)
- [服务层架构](#服务层架构)
- [性能优化策略](#性能优化策略)
- [安全机制](#安全机制)

---

## 整体架构

CodeHelper 基于 **Electron + React + TypeScript** 构建，采用经典的三进程模型。

### 技术栈

| 层级     | 技术                      | 用途             |
| -------- | ------------------------- | ---------------- |
| 框架     | Electron v41              | 桌面应用容器     |
| 构建     | electron-vite + Vite v7   | 开发服务器和打包 |
| 前端     | React v19 + TypeScript v6 | UI 渲染          |
| 状态     | Zustand v5                | 全局状态管理     |
| 编辑器   | Monaco Editor             | 代码编辑         |
| 样式     | Tailwind CSS v4           | 原子化 CSS       |
| 数据库   | better-sqlite3            | 本地 SQLite      |
| 测试     | Vitest                    | 单元和集成测试   |
| 代码质量 | ESLint + Prettier         | Lint 和格式化    |

---

## 主进程 vs 渲染进程

### 主进程 (Main Process)

主进程运行在 Node.js 环境中，负责所有系统级操作。

**入口文件**: `electron/main.ts`

**核心职责**:

- **窗口管理**: 创建和管理 BrowserWindow 实例
- **IPC 处理**: 注册和处理来自渲染进程的请求
- **数据库**: 管理 SQLite 连接和所有数据操作
- **AI 集成**: 调用外部 AI API（支持流式响应）
- **代码执行**: 沙箱中执行用户代码
- **文件系统**: 读写本地文件（知识库上传等）

**IPC 注册顺序**（考虑启动性能）:

```typescript
// electron/main.ts - app.whenReady() 中
// 首屏关键 IPC（立即注册）
registerDatabaseIPC() // 设置、主题
registerProblemsIPC() // 题库列表
registerRunnerIPC() // 代码执行
registerAIIPC() // AI 对话

// 非关键 IPC（延迟注册，减少首屏耗时）
setImmediate(() => {
  registerMistakesIPC() // 错题本
  registerChatIPC() // 聊天会话管理
  registerRAGIPC() // 知识库 RAG
})
```

### 渲染进程 (Renderer Process)

渲染进程运行在 Chromium 中，负责所有 UI 展示和用户交互。

**入口文件**: `src/main.tsx` -> `src/App.tsx`

**核心职责**:

- **UI 渲染**: React 组件树
- **状态管理**: Zustand stores
- **路由导航**: 通过 `appStore.activeModule` 切换视图
- **IPC 调用**: 通过 `typedInvoke` 与主进程通信

### 预加载脚本 (Preload)

**文件**: `electron/preload.ts`

预加载脚本是主进程和渲染进程之间的安全桥梁，运行在隔离上下文中。核心机制:

1. **白名单检查**: 只有 `allowedInvokeChannels` 中的通道允许调用
2. **序列化检查**: 防止传递函数/符号等不可序列化值
3. **转发到主进程**: 通过 `ipcRenderer.invoke(channel, ...args)`
4. **暴露到渲染进程**: 通过 `contextBridge.exposeInMainWorld`

---

## IPC 通信机制

### 通信流程

完整的 IPC 调用链路:

```
1. React 组件触发用户操作
2. Zustand Store action 被调用
3. Store 内部调用 typedInvoke(channel, ...args)
4. typedInvoke 检查缓存（仅限可缓存通道）
5. 检查是否有重复进行中的请求（去重）
6. window.api.invoke(channel, ...args)
7. preload.ts 白名单校验 + 序列化校验
8. ipcRenderer.invoke -> ipcMain.handle
9. IPC handler 执行业务逻辑
10. 查询/操作 SQLite 数据库
11. 返回结果
12. 结果经过缓存层（如适用）
13. 更新 Zustand Store
14. React 组件重渲染
```

### 类型安全

IPC 通信通过 `src/types/ipc.ts` 中的 `IpcChannelMap` 实现类型安全。渲染进程通过 `typedInvoke` 自动推导参数和返回值类型:

```typescript
// 自动推导：参数为 [number]，返回值为 ProblemDetail | null
const problem = await typedInvoke('problems-get', 42)
```

### 缓存与去重

`src/api/ipc.ts` 内置了缓存和请求去重机制:

| 特性       | 说明                                                                               |
| ---------- | ---------------------------------------------------------------------------------- |
| 缓存 TTL   | 30 秒（仅限可缓存通道）                                                            |
| 可缓存通道 | `db-get-setting`, `db-get-ai-configs`, `problems-list`, `mistakes-list` 等只读通道 |
| 去重       | 相同参数的并发请求只发送一次                                                       |
| 缓存失效   | 写操作后调用 `invalidateCache` 手动清除                                            |

### 事件通道

除请求-响应模式外，AI 对话使用事件通道实现流式响应:

- **主进程发送**: `event.sender.send('ai-chat-chunk', { text: '...' })`
- **渲染进程监听**: `typedOn('ai-chat-chunk', callback)`

---

## 数据库层

### 连接管理

**文件**: `electron/db/index.ts`

使用 `better-sqlite3` 进行同步数据库操作:

```typescript
// 单例模式，首次调用时初始化
let db: Database.Database | null = null

export function getDB(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'codehelper.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL') // 写前日志，提升并发性能
    db.pragma('foreign_keys = ON') // 启用外键约束
    // 加载 schema.sql 并执行建表语句
  }
  return db
}
```

### 数据库文件位置

| 系统    | 路径                                                     |
| ------- | -------------------------------------------------------- |
| Windows | `%APPDATA%/codehelper/codehelper.db`                     |
| macOS   | `~/Library/Application Support/codehelper/codehelper.db` |
| Linux   | `~/.config/codehelper/codehelper.db`                     |

### 表结构概览

**文件**: `electron/db/schema.sql`

| 表名               | 用途       | 关键字段                              |
| ------------------ | ---------- | ------------------------------------- |
| `problems`         | 题库       | title, difficulty, tags, test_cases   |
| `submissions`      | 提交记录   | problem_id, language, code, status    |
| `mistakes`         | 错题本     | problem_id, error_count, ai_analysis  |
| `ai_configs`       | AI 配置    | name, api_key, base_url, model        |
| `chat_sessions`    | 聊天会话   | id, title, system_prompt              |
| `chat_history`     | 聊天记录   | session_id, role, content             |
| `knowledge_docs`   | 知识库文档 | filename, content, chunk_count        |
| `knowledge_chunks` | 文档分块   | doc_id, content, embedding            |
| `settings`         | 键值设置   | key (PK), value                       |
| `prompt_presets`   | 预设提示词 | name, prompt, is_builtin              |
| `memories`         | 长期记忆   | content, category, pinned, confidence |

### Schema 迁移策略

项目使用 `IF NOT EXISTS` 建表，确保幂等性。新增列通过 `ensureSchemaColumns()` 函数在启动时检查并添加:

```typescript
function ensureSchemaColumns(database: Database.Database) {
  const columns = database.prepare('PRAGMA table_info(problems)').all()
  const existing = new Set(columns.map((c) => c.name))
  const additions = [
    { name: 'tracks', sql: "ALTER TABLE problems ADD COLUMN tracks TEXT DEFAULT '[]'" },
  ]
  for (const item of additions) {
    if (!existing.has(item.name)) {
      database.exec(item.sql)
    }
  }
}
```

---

## AI 集成

### 对话流程

**文件**: `electron/ipc/ai.ts`

1. 渲染进程发送 `ai-chat` 请求（含消息历史 + 配置 ID）
2. 主进程从数据库加载 AI 配置（API Key、Base URL、Model）
3. 如有启用的记忆，从 `memories` 表检索相关记忆并注入上下文
4. 构造 OpenAI 兼容格式的请求体
5. 使用 `fetch` 调用 AI API（支持 AbortController 超时取消）
6. 解析 SSE 流式响应
7. 通过 `event.sender.send('ai-chat-chunk')` 逐块发送到渲染进程
8. 流结束时发送 `ai-chat-done` 事件
9. 自动捕获记忆（如启用）

### 关键特性

- **流式响应**: 通过 SSE 实现打字机效果
- **请求取消**: 使用 AbortController，新请求自动取消旧请求
- **超时保护**: 120 秒自动超时
- **记忆系统**: 自动从对话中提取关键信息存入 `memories` 表
- **多配置**: 支持多个 AI 配置（不同模型/提供商），可设默认配置

---

## 服务层架构

### 概述

渲染进程内部有一层 Service 抽象，封装 IPC 调用为清晰的接口。

**文件**: `src/services/`

| 服务              | 文件                 | 职责               |
| ----------------- | -------------------- | ------------------ |
| `problemService`  | `problemService.ts`  | 题库 CRUD 和提交   |
| `chatService`     | `chatService.ts`     | 聊天会话和消息管理 |
| `settingsService` | `settingsService.ts` | 用户设置读写       |
| `aiService`       | `aiService.ts`       | AI 模型配置和对话  |
| `editorService`   | `editorService.ts`   | 编辑器配置         |

每个服务都提供了接口定义（如 `IProblemService`），默认实现通过 IPC 调用主进程，测试时可通过 `setProblemService` 注入 mock。

### 中间件模式

**文件**: `electron/utils/middleware.ts`

IPC handler 可以添加中间件，如速率限制:

```typescript
registerIpcHandler(
  'open-external',
  (_event, url) => {
    /* 处理逻辑 */
  },
  [rateLimitMiddleware({ maxCalls: 20, windowMs: 10_000 })],
)
```

---

## 性能优化策略

### 启动优化

- **关键 IPC 优先注册**: 数据库和题库 IPC 立即注册，非关键模块延迟到 `setImmediate`
- **视图懒加载**: `Layout.tsx` 中的模块视图按需加载

### 渲染优化

- **React.memo**: 列表子组件和频繁渲染的组件使用 memo
- **useCallback/useMemo**: 稳定引用，减少子组件重渲染
- **精确订阅**: Zustand store 使用 selector 精确订阅所需字段
- **浅比较**: 使用 `shallow` 比较器避免不必要的重渲染

### IPC 优化

- **请求去重**: `src/api/ipc.ts` 内置并发去重
- **读缓存**: 只读通道结果缓存 30 秒
- **写后失效**: 写操作后自动清除相关缓存

### 数据库优化

- **WAL 模式**: 读写并发，写不阻塞读
- **索引**: 为频繁查询列创建索引
- **预编译语句**: `db.prepare()` 复用 SQL 解析结果

### 监控

**文件**: `electron/utils/perfMonitor.ts`

- IPC 调用耗时监控
- 慢操作日志（> 500ms）
- 每 5 分钟输出统计摘要

---

## 安全机制

### Electron 安全配置

```typescript
// electron/main.ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true, // 渲染进程与 Node.js 隔离
    nodeIntegration: false, // 禁止渲染进程直接使用 Node.js API
    webSecurity: true, // 同源策略
    navigateOnDragDrop: false, // 禁止拖拽导航
  },
})
```

### Content Security Policy

应用设置了严格的 CSP 头:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data https:;
connect-src 'self' https:;
font-src 'self' data:;
```

### IPC 安全

- **白名单**: 只有 `allowedInvokeChannels` 中的通道可以被渲染进程调用
- **序列化检查**: 参数在传递前验证可序列化性
- **输入校验**: IPC handler 内部对参数进行严格校验（类型、长度、范围）
- **外部链接**: 使用 `shell.openExternal()` 且仅允许 http/https 协议

### Electron Fuses

项目配置了 Electron Fuses 增强安全:

- 禁用 `runAsNode`
- 禁用 `nodeOptions`
- 启用 `cookieEncryption`

---

## 相关文档

- [week-1.md](./week-1.md) - 第一周指南
- [common-tasks.md](./common-tasks.md) - 常见任务指南
- [coding-standards.md](./coding-standards.md) - 编码规范
- [docs/architecture.md](../architecture.md) - 更详细的架构文档
- [docs/api.md](../api.md) - IPC 通道参考
