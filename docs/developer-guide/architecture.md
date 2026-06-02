# 架构详解

本文档详细描述 CodeHelper 的系统架构、进程模型、数据流和安全设计。

## 技术栈总览

| 类别       | 技术                            | 版本   |
| ---------- | ------------------------------- | ------ |
| 桌面框架   | Electron                        | 41     |
| 前端框架   | React                           | 19     |
| 类型系统   | TypeScript（strict 模式）       | 6      |
| 构建工具   | Vite + electron-vite            | 8 / 5  |
| 状态管理   | Zustand                         | 5      |
| 代码编辑器 | Monaco Editor                   | 0.55   |
| 样式方案   | TailwindCSS                     | 4      |
| 数据库     | better-sqlite3 (SQLite)         | 12     |
| 图标库     | Lucide React                    | 1.7    |
| 文档渲染   | react-markdown + remark-gfm     | 10 / 4 |
| 测试框架   | Vitest                          | 3      |
| 代码规范   | ESLint (flat config) + Prettier | 9 / 3  |
| 打包工具   | electron-builder                | 26     |

## 三进程模型

CodeHelper 遵循 Electron 的标准三进程架构：

```
+------------------------------------------+
|  Main Process (Node.js)                  |
|  electron/main.ts                        |
|  ├─ 窗口管理与应用生命周期               |
|  ├─ 应用菜单注册                         |
|  ├─ IPC 路由注册                         |
|  └─ 性能监控定时器                        |
+----------+-------------------------------+
           |
           | contextBridge (安全桥接)
           v
+------------------------------------------+
|  Preload Script (沙箱)                   |
|  electron/preload.ts                     |
|  ├─ IPC 通道白名单校验                   |
|  ├─ 参数序列化检查                       |
|  └─ 暴露 typedInvoke / on API            |
+----------+-------------------------------+
           |
           | window.api.invoke()
           v
+------------------------------------------+
|  Renderer Process (Chromium)             |
|  src/                                    |
|  ├─ React 19 SPA                         |
|  ├─ Zustand 状态管理                     |
|  ├─ Monaco Editor                        |
|  └─ 功能模块组件                         |
+------------------------------------------+
```

### Main Process

**入口文件**: `electron/main.ts`

Main 进程运行在 Node.js 环境中，负责：

1. **应用生命周期管理** - `app.whenReady()`、`window-all-closed`、`activate` 事件处理
2. **窗口创建与管理** - BrowserWindow 实例、CSP 策略注入、右键菜单
3. **IPC 处理器注册** - 调用 `register*IPC()` 函数注册所有业务处理器
4. **应用菜单** - 文件、编辑、视图、窗口、帮助菜单
5. **外部链接安全** - 协议白名单校验（仅 http/https）
6. **性能监控** - 定时输出 IPC 调用统计

### Preload Script

**入口文件**: `electron/preload.ts`

Preload 脚本作为 Main 进程和 Renderer 进程之间的安全桥接层：

- **通道白名单** - 维护 `allowedInvokeChannels`（35 个 invoke 通道）和 `allowedEventChannels`（2 个事件通道）
- **参数序列化检查** - `isSerializable()` 函数递归检查参数是否可安全序列化，拒绝函数、Symbol、BigInt 等类型
- **类型检查** - 验证 channel 为字符串、回调为函数
- **安全暴露** - 通过 `contextBridge.exposeInMainWorld` 仅暴露 `api` 对象

### Renderer Process

**入口文件**: `src/main.tsx`

Renderer 进程运行在 Chromium 沙箱中：

- React 19 单页应用 (SPA)
- 通过 `window.api.invoke()` 调用 Main 进程功能
- 通过 `window.api.on()` 监听 Main 进程推送的事件
- 使用 Zustand 进行客户端状态管理
- Monaco Editor 提供代码编辑功能

## 目录结构

```
codehelper/
├── electron/                    # Electron 主进程代码
│   ├── main.ts                  # 应用入口
│   ├── preload.ts               # 预加载脚本（安全桥接）
│   ├── ipc/                     # IPC 处理器
│   │   ├── ai.ts                # AI 对话（流式响应）
│   │   ├── chat.ts              # 聊天会话 + 预设提示词 + 长期记忆
│   │   ├── database.ts          # 设置 + AI 配置管理
│   │   ├── mistakes.ts          # 错题本管理
│   │   ├── problems.ts          # 题库管理 + 自动判题
│   │   ├── rag.ts               # 知识库 RAG 引擎
│   │   └── runner.ts            # 代码执行入口
│   ├── utils/                   # 纯函数工具模块
│   │   ├── codeRunner.ts        # 多语言代码运行器（进程管理）
│   │   ├── sqlUtils.ts          # SQL 分割与判断
│   │   ├── textUtils.ts         # RAG 文本分块与正则转义
│   │   ├── problemMeta.ts       # 题目元数据推断
│   │   ├── chatHelpers.ts       # 聊天辅助函数（预设、记忆提取）
│   │   └── perfMonitor.ts       # 性能监控
│   ├── db/                      # 数据库层
│   │   ├── index.ts             # 数据库连接（单例）
│   │   └── schema.sql           # 建表语句（11 张表）
│   └── types/                   # Main 进程类型定义
│       └── db.ts                # 数据库行类型
├── src/                         # React 渲染进程
│   ├── main.tsx                 # 渲染进程入口
│   ├── App.tsx                  # 应用根组件
│   ├── api/                     # IPC 调用封装
│   │   └── ipc.ts               # typedInvoke 函数
│   ├── components/              # 通用组件
│   │   ├── Sidebar.tsx          # 左侧图标导航栏
│   │   ├── Layout.tsx           # 主布局容器（模块路由）
│   │   ├── StatusBar.tsx        # 底部状态栏
│   │   └── ErrorBoundary.tsx    # React 错误边界
│   ├── modules/                 # 功能模块
│   │   ├── editor/              # Monaco 编辑器
│   │   ├── problems/            # 刷题系统
│   │   ├── ai-chat/             # AI 助手对话
│   │   ├── mistakes/            # 错题本
│   │   ├── knowledge/           # 知识库
│   │   ├── settings/            # 设置面板
│   │   ├── search/              # 全局搜索
│   │   └── stats/               # 统计仪表板
│   ├── stores/                  # Zustand 状态管理
│   │   ├── appStore.ts          # 全局状态（当前模块、侧栏状态）
│   │   ├── editorStore.ts       # 编辑器状态（标签页、代码内容）
│   │   ├── problemStore.ts      # 刷题状态（题目列表、筛选条件）
│   │   ├── chatStore.ts         # 聊天状态（会话、消息）
│   │   └── settingsStore.ts     # 设置状态（AI 配置）
│   ├── types/                   # 前端类型定义
│   ├── constants/               # 共享常量
│   ├── hooks/                   # 自定义 React Hooks
│   ├── theme/                   # 主题系统
│   └── utils/                   # 前端工具函数
├── tests/                       # 单元测试
├── resources/                   # 静态资源
│   ├── problems/                # 题库 JSON 数据文件
│   └── icons/                   # 应用图标
└── scripts/                     # 构建/发布脚本
```

## 数据流

### 标准请求流

```
用户操作
  → React 组件（事件处理）
  → Zustand Store（状态更新 + 调用 action）
  → typedInvoke(channel, args)（类型安全的 IPC 调用）
  → preload.ts（白名单校验 + 序列化检查）
  → ipcMain.handle(channel, handler)（参数验证 + 业务逻辑）
  → SQLite / 子进程 / HTTP 请求
  → 返回结果
  → Store 更新状态
  → UI 重新渲染
```

### AI 流式对话流

```
用户发送消息
  → chatStore 发起 invoke('ai-chat', {messages, configId, requestId})
  → preload 校验
  → ai.ts IPC handler
    → 查询 AI 配置（数据库）
    → 注入相关长期记忆
    → fetch() 请求外部 API（stream: true）
    → SSE 逐块读取
    → win.webContents.send('ai-chat-chunk', {requestId, chunk})
    → 流结束时 send('ai-chat-done', {requestId, content})
  → chatStore 监听事件更新消息内容
  → UI 实时渲染
```

### 代码执行流

```
用户点击运行
  → editorStore 调用 runCode
  → invoke('run-code', {code, language, stdin})
  → runner.ts 校验参数
  → codeRunner.ts
    → 根据语言选择执行策略
    → Python: spawn python 子进程
    → C/C++: spawnSync 编译 + spawn 运行
    → C#: spawnSync csc 编译 + spawn 运行
    → SQL: 内存 SQLite 执行
  → 返回 {stdout, stderr, exitCode, stage}
  → 控制台面板展示结果
```

## 安全设计

### 渲染进程隔离

```typescript
webPreferences: {
  contextIsolation: true,      // 渲染进程与 Node.js 环境隔离
  nodeIntegration: false,      // 禁止渲染进程直接访问 Node.js
  webSecurity: true,           // 启用同源策略
  navigateOnDragDrop: false,   // 禁止拖拽导航
}
```

### CSP 内容安全策略

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data https:;
connect-src 'self' https:;
font-src 'self' data:;
```

### API Key 加密

使用 Electron 的 `safeStorage` API 对 API Key 进行操作系统级加密：

```typescript
// 加密
safeStorage.encryptString(apiKey) → Buffer → 'enc:' + base64

// 解密
'enc:' 前缀检测 → base64 解码 → safeStorage.decryptString(buffer)
```

### IPC 安全

- **白名单机制** - 只有注册在 `allowedInvokeChannels` 中的通道才能被调用
- **序列化检查** - 拒绝包含函数、Symbol 等不可序列化参数的调用
- **参数验证** - 每个 IPC handler 都进行严格的参数类型和范围检查
- **输入截断** - 所有字符串参数有长度上限，防止内存溢出

### 代码执行安全

- **无 Shell 模式** - 子进程执行不使用 `shell: true`，防止命令注入
- **超时保护** - 所有执行默认 10 秒超时
- **输出限制** - stdout/stderr 各限制 1MB
- **并发控制** - 最多同时运行 5 个进程
- **临时文件隔离** - 使用 UUID 命名临时文件，避免冲突

### 外部链接安全

```typescript
// 仅允许 http/https 协议
const parsed = new URL(details.url)
if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
  shell.openExternal(details.url)
} else {
  // 阻止并记录警告
}
```

## 性能设计

### 前端优化

- **React.memo** - 侧栏按钮等静态组件使用 memo 避免不必要的重渲染
- **useMemo/useCallback** - 缓存计算结果和回调函数
- **Zustand 选择器** - 使用细粒度选择器减少订阅范围
- **Monaco Editor 懒加载** - 按需加载编辑器组件

### 后端优化

- **数据库索引** - 在高频查询字段上建立索引
- **性能监控** - `trackPerformance` 包装器自动记录慢操作
- **事务批处理** - 多条写操作使用 SQLite 事务包装
- **预编译语句** - 使用 `db.prepare()` 缓存 SQL 编译结果

---

## See Also

- [系统架构 (concepts)](../concepts/architecture.md) -- 架构设计理念
- [IPC 通信模式](../concepts/ipc-patterns.md) -- IPC 通信深入解析
- [安全模型](../concepts/security-model.md) -- 安全架构详解
- [架构文档 (docs/)](../architecture.md) -- 完整架构与表结构
- [ADR-001: Electron 选型](../adr/001-electron-choice.md) -- 框架选型决策
- [术语表](../glossary.md) -- 技术名词解释
