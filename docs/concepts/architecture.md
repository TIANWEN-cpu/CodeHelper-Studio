# 系统架构

本文档深入介绍 CodeHelper 的整体架构设计、技术栈选型、目录结构和模块职责。

## 架构总览

CodeHelper 是一个基于 Electron 的桌面编程辅助工具，采用经典的三层架构：

```
+----------------------------------------------------------+
|                    渲染进程 (Renderer)                      |
|  React 19 + Zustand + Monaco Editor + Tailwind CSS        |
|  +----------+  +----------+  +----------+  +----------+  |
|  | Problems |  | Editor   |  | AI Chat  |  | Mistakes |  |
|  +----------+  +----------+  +----------+  +----------+  |
|  +----------+  +----------+  +----------+  +----------+  |
|  | Knowledge|  | Settings |  | Stats    |  | Search   |  |
|  +----------+  +----------+  +----------+  +----------+  |
+--------------------------+-------------------------------+
                           |  IPC (contextBridge)
+--------------------------+-------------------------------+
|                    主进程 (Main)                            |
|  Electron Main Process                                    |
|  +----------+  +----------+  +----------+  +----------+  |
|  | Runner   |  | Database |  | AI       |  | Problems |  |
|  +----------+  +----------+  +----------+  +----------+  |
|  +----------+  +----------+  +----------+                |
|  | Chat     |  | Mistakes |  | RAG      |                |
|  +----------+  +----------+  +----------+                |
|                                                           |
|  better-sqlite3 ←→ codehelper.db (WAL 模式)              |
+----------------------------------------------------------+
```

## 技术栈

| 层次       | 技术                | 版本       | 用途                      |
| ---------- | ------------------- | ---------- | ------------------------- |
| 桌面框架   | Electron            | 41.x       | 跨平台桌面应用            |
| 构建工具   | electron-vite       | 5.x        | 主进程 + 渲染进程统一构建 |
| 前端框架   | React               | 19.x       | UI 组件与渲染             |
| 类型系统   | TypeScript          | 6.x        | 类型安全                  |
| 状态管理   | Zustand             | 5.x        | 轻量级全局状态            |
| 代码编辑器 | Monaco Editor       | 0.55.x     | VS Code 同款编辑器        |
| 本地数据库 | better-sqlite3      | 12.x       | 同步 SQLite 访问          |
| CSS 框架   | Tailwind CSS        | 4.x        | 原子化 CSS                |
| 测试框架   | Vitest              | 3.x        | 快速单元/集成测试         |
| 代码规范   | ESLint + Prettier   | 9.x / 3.x  | 代码质量与格式化          |
| Git Hooks  | Husky + lint-staged | 9.x / 16.x | 提交前自动检查            |

## 目录结构

```
D:\codehelper\
├── electron/                  # 主进程代码
│   ├── main.ts                # 应用入口，窗口创建，菜单配置
│   ├── preload.ts             # 预加载脚本，IPC 安全桥接
│   ├── db/
│   │   ├── index.ts           # 数据库初始化，WAL 模式，Schema 迁移
│   │   └── schema.sql         # DDL 定义（所有表结构）
│   ├── ipc/
│   │   ├── ai.ts              # AI 对话 IPC，流式响应，记忆注入
│   │   ├── chat.ts            # 聊天会话、预设、记忆管理
│   │   ├── database.ts        # 设置读写、AI 配置管理（含加密）
│   │   ├── mistakes.ts        # 错题本 IPC
│   │   ├── problems.ts        # 题目列表、详情、提交、测试执行
│   │   ├── rag.ts             # 知识库上传、分块、检索
│   │   └── runner.ts          # 代码运行入口（Python/C/C++/SQL）
│   ├── types/
│   │   └── db.ts              # 数据库行类型定义
│   └── utils/
│       ├── chatHelpers.ts     # 聊天辅助函数（预设、记忆提取）
│       ├── codeRunner.ts      # 代码执行引擎
│       ├── perfMonitor.ts     # IPC 性能监控
│       ├── problemMeta.ts     # 题目元数据处理
│       ├── sqlUtils.ts        # SQL 解析工具
│       └── textUtils.ts       # 文本处理工具
├── src/                       # 渲染进程代码
│   ├── main.tsx               # React 应用入口
│   ├── App.tsx                # 根组件（ErrorBoundary + Toast + Layout）
│   ├── api/
│   │   └── ipc.ts             # 类型安全的 IPC 调用封装
│   ├── components/
│   │   ├── Layout.tsx         # 主布局（侧栏 + 模块路由 + 状态栏）
│   │   ├── Sidebar.tsx        # 侧栏导航
│   │   ├── StatusBar.tsx      # 底部状态栏
│   │   ├── CommandPalette.tsx # 命令面板 (Ctrl+Shift+P)
│   │   ├── ErrorBoundary.tsx  # 全局错误边界
│   │   ├── Toast.tsx          # 通知系统
│   │   ├── LoadingSpinner.tsx # 加载指示器
│   │   ├── EmptyState.tsx     # 空状态占位
│   │   └── ErrorWithRetry.tsx # 带重试的错误展示
│   ├── hooks/
│   │   ├── index.ts           # 导出汇总
│   │   ├── useAIStream.ts     # AI 流式响应 Hook
│   │   ├── useCodeExecution.ts# 代码执行 Hook
│   │   └── useKeyboardShortcuts.ts # 全局快捷键
│   ├── modules/               # 功能模块
│   │   ├── ai-chat/           # AI 对话模块
│   │   ├── editor/            # 代码编辑器模块
│   │   ├── knowledge/         # 知识库模块
│   │   ├── mistakes/          # 错题本模块
│   │   ├── problems/          # 刷题系统模块
│   │   ├── search/            # 全局搜索模块
│   │   ├── settings/          # 设置模块
│   │   └── stats/             # 统计模块
│   ├── stores/
│   │   ├── appStore.ts        # 应用全局状态（模块切换、主题、侧栏）
│   │   ├── chatStore.ts       # AI 对话状态（会话、消息、流式响应）
│   │   ├── editorStore.ts     # 编辑器状态（标签页、内容、光标）
│   │   ├── problemStore.ts    # 题目状态（列表、筛选、提交）
│   │   └── settingsStore.ts   # 设置状态（AI 配置管理）
│   ├── constants/
│   │   └── index.ts           # 全局常量定义
│   ├── types/
│   │   ├── index.ts           # 类型导出汇总
│   │   ├── ipc.ts             # IPC 通道类型映射
│   │   ├── problem.ts         # 题目相关类型
│   │   ├── chat.ts            # 聊天相关类型
│   │   └── knowledge.ts       # 知识库相关类型
│   ├── utils/
│   │   ├── errors.ts          # 错误处理工具
│   │   ├── labels.ts          # UI 标签常量
│   │   ├── monacoConfig.ts    # Monaco 编辑器配置
│   │   └── snippets.ts        # 代码片段管理
│   └── theme/
│       ├── themes.ts          # 主题定义（Mocha/Fjord/Ember）
│       └── monacoThemes.ts    # Monaco 编辑器主题映射
├── tests/                     # 测试文件
├── scripts/                   # 构建脚本
├── resources/                 # 打包资源
├── docs/                      # 本文档
└── .github/workflows/         # CI/CD 配置
```

## 模块职责

### 主进程模块

#### main.ts — 应用生命周期

`main.ts` 是 Electron 应用的入口点，负责：

1. **窗口管理**：创建 `BrowserWindow`，配置安全选项（`contextIsolation`、`nodeIntegration: false`）
2. **菜单设置**：创建应用菜单（文件、编辑、视图、窗口、帮助）
3. **IPC 注册**：调用所有 `registerXxxIPC()` 函数注册处理器
4. **安全策略**：设置 CSP 头、限制外部导航协议
5. **性能监控**：每 5 分钟输出 IPC 统计日志

```typescript
// 窗口安全配置
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.mjs'),
    contextIsolation: true, // 关键：隔离上下文
    nodeIntegration: false, // 关键：禁用 Node.js 集成
    webSecurity: true, // 关键：启用 Web 安全
  },
})
```

#### preload.ts — 安全桥接层

`preload.ts` 是渲染进程访问主进程能力的唯一通道，它：

1. **白名单校验**：维护 `allowedInvokeChannels` 和 `allowedEventChannels`
2. **序列化检查**：通过 `isSerializable()` 防止不可序列化的值传入 IPC
3. **类型约束**：确保 channel 参数为字符串，回调为函数

```typescript
const api = {
  invoke: (channel: string, ...args: unknown[]) => {
    if (!allowedInvokeChannels.has(channel)) {
      throw new Error(`不允许的 IPC 调用: ${channel}`)
    }
    if (!args.every((a) => isSerializable(a))) {
      throw new Error('IPC 参数包含不可序列化的值')
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!allowedEventChannels.has(channel)) {
      throw new Error(`不允许的 IPC 事件监听: ${channel}`)
    }
    // ...
  },
}
contextBridge.exposeInMainWorld('api', api)
```

#### db/index.ts — 数据库管理

- 使用 `better-sqlite3` 同步访问 SQLite
- 启用 WAL 模式提升并发性能
- 启用外键约束
- 自动执行 Schema 迁移（`ensureSchemaColumns`）

### 渲染进程模块

#### Layout.tsx — 模块路由

`Layout` 组件是渲染进程的核心路由，根据 `appStore.activeModule` 切换显示的模块：

```typescript
const renderModule = () => {
  switch (activeModule) {
    case 'problems':  return <ProblemsView />
    case 'editor':    return <EditorView />
    case 'ai-chat':   return <ChatView />
    case 'mistakes':  return <MistakesView />
    case 'knowledge': return <KnowledgeView />
    case 'settings':  return <SettingsView />
    case 'stats':     return <StatsView />
    case 'search':    return <GlobalSearchView />
  }
}
```

#### 功能模块划分

每个模块位于 `src/modules/<name>/` 目录下，通常包含：

| 模块      | 核心组件                                                     | 功能说明                       |
| --------- | ------------------------------------------------------------ | ------------------------------ |
| problems  | ProblemsView, ProblemList, ProblemDetail, AISidebar          | 刷题、题目浏览、提交、AI 提示  |
| editor    | EditorView, MonacoEditor, EditorTabs, Console, TerminalPanel | 代码编辑、多标签、控制台、终端 |
| ai-chat   | ChatView, MessageBubble, SessionList                         | AI 对话、会话管理、流式响应    |
| mistakes  | MistakesView                                                 | 错题回顾、AI 分析              |
| knowledge | KnowledgeView                                                | 文档上传、知识库检索           |
| settings  | SettingsView                                                 | AI 模型配置、主题切换          |
| stats     | StatsView                                                    | 学习统计、图表展示             |
| search    | GlobalSearchView, GlobalSearch                               | 全局搜索（Ctrl+P）             |

## 通信架构

渲染进程与主进程通过 Electron 的 IPC 机制通信，具体模式详见 [IPC 通信模式](ipc-patterns.md)。

核心通信流程：

```
渲染进程 Store → typedInvoke() → window.api.invoke()
    → preload 白名单校验
    → ipcMain.handle() 处理
    → better-sqlite3 / fetch / child_process
    → 返回结果到渲染进程

流式 AI 响应:
    主进程 → win.webContents.send('ai-chat-chunk')
    → preload.on() → typedOn() → store.appendChunk()
```

## 主题系统

CodeHelper 支持三种深色主题：Mocha（默认）、Fjord、Ember。主题通过 CSS 变量实现：

```css
/* 在 <html> 上设置 data-theme 属性 */
[data-theme='mocha'] {
  --theme-bg-app: #1e1e2e;
  --theme-text-primary: #cdd6f4;
  --theme-accent: #89b4fa;
  /* ... */
}
```

切换主题时，`appStore.setTheme()` 会更新 DOM 属性并持久化到数据库。

## 性能考量

1. **数据库优化**：WAL 模式 + 预编译语句 + 合适的索引
2. **渲染优化**：`React.memo` + `useMemo` + `useCallback` 减少不必要的重渲染
3. **编辑器优化**：Monaco Editor 按需加载，标签页状态持久化
4. **IPC 监控**：`perfMonitor.ts` 自动记录慢操作并定期输出统计
5. **代码执行**：并发限制（最多 5 个进程）+ 超时控制（10 秒）+ 输出限制（1MB）

---

## See Also

- [IPC 通信模式](ipc-patterns.md) -- IPC 请求-响应与事件推送的深入解析
- [安全模型](security-model.md) -- 沙箱、加密与 CSP 详解
- [状态管理](state-management.md) -- Zustand 状态管理模式
- [数据流](data-flow.md) -- 数据从用户操作到持久化的完整路径
- [架构文档 (docs/)](../architecture.md) -- 包含完整表结构的架构详解
- [API 参考](../api.md) -- IPC 通道、数据库 Schema 与 AI 集成
- [ADR-001: Electron 选型](../adr/001-electron-choice.md) -- 为什么选择 Electron
- [ADR-003: SQLite 选型](../adr/003-sqlite-choice.md) -- 为什么选择 better-sqlite3
- [术语表](../glossary.md) -- 技术名词解释
