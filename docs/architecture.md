# 架构文档

本文档详细描述 CodeHelper 的内部架构设计，包括进程模型、IPC 通信、数据流与安全机制。

## 目录

- [总体架构](#总体架构)
- [进程模型](#进程模型)
- [IPC 通信模式](#ipc-通信模式)
- [数据流](#数据流)
- [数据库设计](#数据库设计)
- [安全模型](#安全模型)
- [模块详细设计](#模块详细设计)

---

## 总体架构

CodeHelper 采用 Electron 多进程架构，结合 React 前端与 SQLite 本地数据库。除主进程、
preload 与渲染进程外，SQL 和非 SQL 代码执行分别使用一次性 utility 进程。

```
+--------------------------------------------------------------------+
|                        Electron 应用                                |
|                                                                     |
|  +---------------------------+   IPC    +-------------------------+ |
|  |    Main Process           | <------> |   Renderer Process      | |
|  |    (Node.js)              |          |   (Chromium)            | |
|  |                           |          |                         | |
|  |  - 窗口管理               |          |  - React 19 SPA         | |
|  |  - IPC 处理               |          |  - Zustand 状态管理      | |
|  |  - SQLite 数据库          |          |  - CodeMirror 编辑器     | |
|  |  - 代码执行引擎           |          |  - TailwindCSS 样式      | |
|  |  - AI API 通信            |          |                         | |
|  |  - 文件系统操作           |          |                         | |
|  +---------------------------+          +-------------------------+ |
|           |                                            |            |
|           v                                            v            |
|  +------------------+                      +-------------------+    |
|  |  Preload Script   |                      |  渲染进程 UI      |    |
|  |  (安全桥接层)     |                      |  (React 组件树)   |    |
|  +------------------+                      +-------------------+    |
+--------------------------------------------------------------------+
```

### 技术栈一览

| 层级     | 技术选型                             | 说明                                                |
| -------- | ------------------------------------ | --------------------------------------------------- |
| 桌面容器 | Electron 41                          | 跨平台桌面运行时                                    |
| 渲染框架 | React 19 + TypeScript 6              | 声明式 UI                                           |
| 构建工具 | Vite 7 + electron-vite               | 快速开发与打包                                      |
| 状态管理 | Zustand 5                            | 轻量级响应式状态                                    |
| 代码编辑 | CodeMirror 6 (@uiw/react-codemirror) | 轻量可扩展的编辑引擎，支持 Python/C/C++/JS/SQL 高亮 |
| 样式方案 | TailwindCSS 4                        | 原子化 CSS                                          |
| 数据库   | better-sqlite3 (SQLite)              | 本地嵌入式数据库                                    |
| 测试框架 | Vitest 4                             | 单元测试与覆盖率                                    |

---

## 进程模型

### Main Process（主进程）

**入口文件**: `electron/main.ts`

主进程运行在 Node.js 环境中，拥有完整的系统访问权限。职责包括：

- **窗口管理**: 创建和管理 `BrowserWindow` 实例，配置安全选项
- **IPC 路由**: 注册并分发所有 IPC 处理器
- **数据库操作**: 通过 better-sqlite3 管理 SQLite 数据库
- **代码执行编排**: 校验请求、异步探测工具链，并把 Python、C/C++、C#、JavaScript 与 SQL 分派到一次性 utility 进程
- **AI 通信**: 与 OpenAI 兼容 API 建立流式 HTTP 连接
- **文件操作**: 知识库文档的导入、解析与分块

```
electron/
├── main.ts              # 应用入口、窗口创建、菜单配置、IPC 注册
├── preload.ts           # 安全桥接：白名单校验、序列化检查
├── ipc/                 # IPC 处理器（按功能域划分）
│   ├── ai.ts            # AI 对话（流式 SSE 解析）
│   ├── chat.ts          # 聊天会话、预设提示词、长期记忆
│   ├── database.ts      # 设置读写、AI 配置管理（加密存储）
│   ├── mistakes.ts      # 错题记录的 CRUD
│   ├── problems.ts      # 题库管理、自动判题引擎
│   ├── rag.ts           # 知识库文档上传、分块、混合检索与 RAG 来源
│   └── runner.ts        # 代码执行入口（参数校验 + 调用 codeRunner）
├── utils/               # 纯函数工具模块
│   ├── codeRunner.ts    # 多语言代码执行引擎（进程管理、超时、资源限制）
│   ├── codeRunnerSupervisor.ts # utility 与 Windows Job Host 生命周期编排
│   ├── codeRunnerUtility.ts    # 非 SQL 代码的一次性执行入口
│   ├── runDirectoryQuota.ts    # 递归临时目录配额监控
│   ├── toolchainDetect.ts      # 非阻塞工具链探测与能力报告
│   ├── sqlUtils.ts      # SQL 语句分割与结果格式化
│   ├── textUtils.ts     # RAG 文本分块与正则转义
│   ├── problemMeta.ts   # 题目元数据推断（来源、赛道、平台、模式）
│   └── chatHelpers.ts   # 聊天辅助（内置预设、记忆候选提取、搜索词构建）
├── db/
│   ├── index.ts         # 数据库连接管理（单例、WAL 模式、Schema 迁移）
│   └── schema.sql       # 建表语句（11 张表）
└── types/
    └── db.ts            # 数据库行类型定义
```

### Preload Script（预加载脚本）

**入口文件**: `electron/preload.ts`

预加载脚本运行在独立的沙箱上下文中，是渲染进程与主进程之间唯一的安全桥梁。

核心职责：

1. **通道白名单**: `allowedInvokeChannels` 和 `allowedEventChannels` 限制可调用的 IPC 通道
2. **序列化检查**: `isSerializable()` 递归校验参数，防止不可序列化数据（函数、Symbol 等）穿越 IPC
3. **类型暴露**: 通过 `contextBridge.exposeInMainWorld('api', api)` 将安全的 `invoke` 和 `on` 方法暴露给渲染进程

```typescript
// preload.ts 暴露的 API 结构
window.api = {
  invoke(channel, ...args): Promise<unknown>   // 双向调用（请求-响应）
  on(channel, callback): () => void             // 事件监听（主进程推送）
}
```

### Renderer Process（渲染进程）

**入口文件**: `src/main.tsx`

渲染进程运行在 Chromium 沙箱中，无 Node.js 访问权限。采用 React SPA 架构。

```
src/
├── main.tsx             # React 根挂载点
├── App.tsx              # 应用根组件（布局 + 模块路由）
├── api/
│   └── ipc.ts           # 类型安全的 IPC 调用封装（typedInvoke / typedOn）
├── components/          # 通用布局组件
│   ├── Sidebar.tsx      # 左侧图标导航栏
│   ├── Layout.tsx       # 主布局容器（侧边栏 + 内容区 + 状态栏）
│   ├── StatusBar.tsx    # 底部状态信息栏
│   └── ErrorBoundary.tsx # React 错误边界
├── modules/             # 功能模块（每个模块独立目录）
│   ├── editor/          # CodeMirror 代码编辑器 + 控制台
│   ├── problems/        # 刷题系统 + AI 侧边栏
│   ├── ai-chat/         # AI 助手对话界面
│   ├── mistakes/        # 错题本管理
│   ├── knowledge/       # 知识库检索
│   └── settings/        # 设置面板（AI 配置、主题等）
├── stores/              # Zustand 状态管理
│   ├── appStore.ts      # 全局状态（当前模块、主题）
│   ├── editorStore.ts   # 编辑器状态（标签页、代码内容）
│   ├── problemStore.ts  # 刷题状态（题目列表、筛选、提交结果）
│   ├── chatStore.ts     # 聊天状态（会话列表、消息、流式输出）
│   └── settingsStore.ts # 设置状态（AI 配置列表）
├── hooks/               # 共享 React Hooks
│   ├── useAIStream.ts   # AI 流式输出监听（自动滚动）
│   ├── useCodeExecution.ts # 代码执行封装
│   └── index.ts         # Hooks 导出
├── types/               # TypeScript 类型定义
│   ├── ipc.ts           # IPC 通道类型映射（IpcChannelMap / IpcEventMap）
│   ├── problem.ts       # 题目相关类型
│   ├── chat.ts          # 聊天相关类型
│   ├── knowledge.ts     # 知识库相关类型
│   └── index.ts         # 类型导出
├── constants/           # 共享常量
│   └── index.ts         # IPC 通道名、默认值、主题配置
└── utils/
    ├── labels.ts        # 标签映射纯函数
    ├── errors.ts        # 错误消息提取
    └── errorHandler.ts  # 全局错误捕获与上报
```

---

## IPC 通信模式

CodeHelper 使用 Electron 标准的 IPC 通信机制，分为两种模式：

### 1. 请求-响应模式（Invoke/Handle）

渲染进程发起请求，主进程处理后返回结果。这是主要的通信方式。

```
Renderer                          Preload                       Main
    |                                |                             |
    | typedInvoke('channel', args)   |                             |
    |------------------------------->|  白名单校验 + 序列化检查     |
    |                                |---------------------------->|
    |                                |  ipcMain.handle() 执行      |
    |                                |<----------------------------|
    |  Promise<result>               |  返回结果                   |
    |<-------------------------------|                             |
```

**类型安全机制**:

`src/types/ipc.ts` 中定义了 `IpcChannelMap`，将每个通道名称映射到其参数类型和返回值类型：

```typescript
interface IpcChannelMap {
  'problems-list': { args: [ProblemListFilters?]; result: Problem[] }
  'problems-submit': { args: [SubmitPayload]; result: SubmitResult }
  'ai-chat': { args: [AIChatPayload]; result: AIChatResult }
  // ...
}
```

渲染进程通过 `typedInvoke` 调用，自动获得完整的类型推导，无需手动类型断言。

### 2. 事件推送模式（Send/On）

主进程主动向渲染进程推送事件，主要用于 AI 流式输出。

```
Main                              Preload                       Renderer
    |                                |                             |
    | win.webContents.send(          |                             |
    |   'ai-chat-chunk', payload)   |                             |
    |------------------------------->|  事件通道白名单校验          |
    |                                |---------------------------->|
    |                                |  typedOn() 回调触发         |
    |                                |                             |
    |  (重复多次直到流结束)           |                             |
    |                                |                             |
    | win.webContents.send(          |                             |
    |   'ai-chat-done', payload)    |                             |
    |------------------------------->|---------------------------->|
```

**事件通道**:

| 事件通道        | 载荷类型             | 说明                  |
| --------------- | -------------------- | --------------------- |
| `ai-chat-chunk` | `StreamChunkPayload` | AI 流式输出的一个片段 |
| `ai-chat-done`  | `StreamDonePayload`  | AI 流式输出完成       |

### IPC 通道注册一览

每个 IPC 处理器模块在 `main.ts` 中通过 `registerXxxIPC()` 函数注册：

```typescript
app.whenReady().then(() => {
  registerRunnerIPC() // run-code
  registerDatabaseIPC() // db-*, ai-fetch-models
  registerAIIPC() // ai-chat
  registerProblemsIPC() // problems-*
  registerMistakesIPC() // mistakes-*
  registerRAGIPC() // knowledge-*
  registerChatIPC() // chat-*
})
```

### 参数校验策略

所有 IPC 处理器在执行业务逻辑前都会进行严格的参数校验：

1. **类型检查**: 验证每个参数的 `typeof`
2. **长度限制**: 对字符串参数进行 `slice()` 截断，防止内存溢出
3. **范围检查**: 数字参数检查 `isFinite` 和最小值
4. **枚举检查**: 字符串枚举值进行 `includes()` 校验
5. **嵌套校验**: 数组和对象进行递归验证

---

## 数据流

### 典型请求数据流

以"提交代码解题"为例，完整的数据流如下：

```
用户点击"提交"按钮
        |
        v
[React 组件] ProblemDetail.tsx
        |
        v
[Zustand Store] problemStore.ts  -- 调用 submitCode()
        |
        v
[IPC 封装] typedInvoke('problems-submit', { problemId, code, language })
        |
        v
[Preload] 白名单检查 -> 序列化检查 -> ipcRenderer.invoke()
        |
        v
[Main] ipc/problems.ts handler
   |-- 参数校验
   |-- 查询题目信息与测试用例
   |-- 逐个运行测试用例：
   |       |-- 调用 codeRunner.ts 执行代码
   |       |-- 比较输出与期望值
   |       |-- 记录通过/失败
   |-- 生成提交记录 -> INSERT INTO submissions
   |-- 如果失败 -> INSERT/UPDATE mistakes
   |-- 如果成功 -> UPDATE mistakes SET correct_code
        |
        v
返回 { status, passed, total, results, duration }
        |
        v
[Store] 更新提交结果状态
        |
        v
[React] UI 自动刷新显示判题结果
```

### AI 流式对话数据流

```
用户发送消息
        |
        v
[chatStore] sendMessage()
   |-- 保存用户消息到数据库 (chat-message-save)
   |-- 调用 typedInvoke('ai-chat', { messages, configId, includeMemories })
        |
        v
[Main] ipc/ai.ts handler
   |-- 查询 AI 配置（加密的 API Key 解密）
   |-- 如果 includeMemories=true，注入长期记忆
   |-- POST 请求到 OpenAI 兼容 API (stream: true)
   |-- SSE 流式读取：
   |       |-- 解析 data: 行
   |       |-- 提取 delta.content
   |       |-- win.webContents.send('ai-chat-chunk', { requestId, chunk })
   |-- 流结束：
   |       |-- win.webContents.send('ai-chat-done', { requestId, content })
   |-- 返回 { success, requestId, content }
        |
        v
[useAIStream Hook] 监听事件
   |-- 'ai-chat-chunk' -> appendChunk() -> 更新消息内容
   |-- 'ai-chat-done' -> finishStream() -> 保存到数据库、自动滚动
```

### 知识库 RAG 数据流

```
用户上传文档
        |
        v
knowledge-upload IPC
   |-- 弹出文件选择对话框（PDF/MD/TXT）
   |-- 读取文件内容（PDF 使用 pdf-parse 解析）
   |-- splitIntoChunks(content, 500) 分块
   |-- INSERT INTO knowledge_docs
   |-- INSERT INTO knowledge_chunks（逐块）
        |
        v
用户搜索知识库
        |
        v
knowledge-search IPC
   |-- 中英术语扩展 -> 查询词集合
   |-- FTS5 unicode61 + BM25 关键词召回
   |-- FTS5 trigram + 本地 n-gram 语义近似
   |-- bounded LIKE 作为明确降级/补充通道
   |-- Reciprocal Rank Fusion + 来源去重
   |-- 返回结果、来源、命中说明和检索能力状态
```

### Agent 工具数据流

```text
AITutorView 选择主进程工具
        ↓ agent-run-create
registerAgentIPC 校验白名单与参数
        ↓
SQLite: agent_runs / agent_tool_calls / agent_approvals / agent_audit_events
        ↓
无需审批：knowledge-search 只读执行
需要审批：strong-code-run 保持 needsApproval
        ↓ agent-run-approve
Docker 强隔离执行（禁止网络、禁止本地回退）
        ↓
completed 工具证据注入 AI；失败/拒绝/取消原样保留
```

Renderer 只负责选择工具和展示状态，不能自行新增工具或把工具调用标记成功。审批与状态迁移
由 Electron 主进程执行；运行中断会在下次数据库初始化时标记失败。

---

## 数据库设计

SQLite 数据库文件存储在用户数据目录下，使用 WAL 模式提升并发读写性能。

### 存储位置

| 操作系统 | 路径                                                     |
| -------- | -------------------------------------------------------- |
| Windows  | `%APPDATA%/codehelper/codehelper.db`                     |
| macOS    | `~/Library/Application Support/codehelper/codehelper.db` |
| Linux    | `~/.config/codehelper/codehelper.db`                     |

### 表结构

#### problems（题目表）

| 字段             | 类型     | 说明                           |
| ---------------- | -------- | ------------------------------ |
| `id`             | INTEGER  | 主键，自增                     |
| `title`          | TEXT     | 题目标题                       |
| `description`    | TEXT     | 题目描述（支持 Markdown）      |
| `difficulty`     | TEXT     | 难度：easy / medium / hard     |
| `tags`           | TEXT     | 标签，JSON 数组                |
| `languages`      | TEXT     | 支持语言，JSON 数组            |
| `examples`       | TEXT     | 示例输入输出，JSON 数组        |
| `test_cases`     | TEXT     | 测试用例，JSON 数组            |
| `starter_code`   | TEXT     | 初始代码模板，JSON 对象        |
| `source`         | TEXT     | 来源（leetcode / nowcoder 等） |
| `tracks`         | TEXT     | 赛道，JSON 数组                |
| `platform`       | TEXT     | 平台标识                       |
| `mode`           | TEXT     | 模式（oj / exam）              |
| `exam_style`     | TEXT     | 考试风格（acm / oi）           |
| `year`           | INTEGER  | 年份                           |
| `official_url`   | TEXT     | 官方链接                       |
| `estimated_time` | INTEGER  | 预估用时（分钟）               |
| `created_at`     | DATETIME | 创建时间                       |

#### submissions（提交记录表）

| 字段                | 类型     | 说明                                                                    |
| ------------------- | -------- | ----------------------------------------------------------------------- |
| `id`                | INTEGER  | 主键，自增                                                              |
| `problem_id`        | INTEGER  | 外键 -> problems(id)                                                    |
| `language`          | TEXT     | 编程语言                                                                |
| `code`              | TEXT     | 提交代码                                                                |
| `status`            | TEXT     | 状态：accepted / wrong_answer / compile_error / runtime_error / timeout |
| `passed_cases`      | INTEGER  | 通过用例数                                                              |
| `total_cases`       | INTEGER  | 总用例数                                                                |
| `duration_ms`       | INTEGER  | 总耗时（毫秒）                                                          |
| `execution_time_ms` | INTEGER  | 执行时间（毫秒）                                                        |
| `created_at`        | DATETIME | 创建时间                                                                |

#### mistakes（错题表）

| 字段              | 类型     | 说明                       |
| ----------------- | -------- | -------------------------- |
| `id`              | INTEGER  | 主键，自增                 |
| `problem_id`      | INTEGER  | 外键 -> problems(id)，唯一 |
| `error_count`     | INTEGER  | 错误次数                   |
| `error_types`     | TEXT     | 错误类型，JSON 数组        |
| `last_wrong_code` | TEXT     | 最后一次错误代码           |
| `correct_code`    | TEXT     | 正确代码（通过后填写）     |
| `ai_analysis`     | TEXT     | AI 分析文本                |
| `review_count`    | INTEGER  | 复习次数                   |
| `next_review_at`  | DATETIME | 下次复习时间               |
| `created_at`      | DATETIME | 创建时间                   |
| `updated_at`      | DATETIME | 更新时间                   |

#### ai_configs（AI 配置表）

| 字段         | 类型     | 说明                              |
| ------------ | -------- | --------------------------------- |
| `id`         | INTEGER  | 主键，自增                        |
| `name`       | TEXT     | 配置名称                          |
| `api_key`    | TEXT     | API 密钥（使用 safeStorage 加密） |
| `base_url`   | TEXT     | API 基础 URL                      |
| `model`      | TEXT     | 模型名称                          |
| `is_default` | INTEGER  | 是否默认配置（0/1）               |
| `task_type`  | TEXT     | 任务类型                          |
| `created_at` | DATETIME | 创建时间                          |

#### chat_sessions（聊天会话表）

| 字段            | 类型     | 说明         |
| --------------- | -------- | ------------ |
| `id`            | TEXT     | 主键（UUID） |
| `title`         | TEXT     | 会话标题     |
| `system_prompt` | TEXT     | 系统提示词   |
| `created_at`    | DATETIME | 创建时间     |
| `updated_at`    | DATETIME | 更新时间     |

#### chat_history（聊天历史表）

| 字段         | 类型     | 说明                            |
| ------------ | -------- | ------------------------------- |
| `id`         | INTEGER  | 主键，自增                      |
| `session_id` | TEXT     | 外键 -> chat_sessions(id)       |
| `role`       | TEXT     | 角色：user / assistant / system |
| `content`    | TEXT     | 消息内容                        |
| `model`      | TEXT     | 使用的模型                      |
| `created_at` | DATETIME | 创建时间                        |

#### prompt_presets（预设提示词表）

| 字段         | 类型     | 说明            |
| ------------ | -------- | --------------- |
| `id`         | INTEGER  | 主键，自增      |
| `name`       | TEXT     | 预设名称        |
| `prompt`     | TEXT     | 提示词内容      |
| `is_builtin` | INTEGER  | 是否内置（0/1） |
| `created_at` | DATETIME | 创建时间        |

#### memories（长期记忆表）

| 字段           | 类型     | 说明                                        |
| -------------- | -------- | ------------------------------------------- |
| `id`           | INTEGER  | 主键，自增                                  |
| `content`      | TEXT     | 记忆内容                                    |
| `category`     | TEXT     | 分类（general / preference / technical 等） |
| `source`       | TEXT     | 来源（manual / chat）                       |
| `source_ref`   | TEXT     | 来源引用（如会话 ID）                       |
| `pinned`       | INTEGER  | 是否置顶（0/1）                             |
| `enabled`      | INTEGER  | 是否启用（0/1）                             |
| `confidence`   | REAL     | 置信度（0.0 - 1.0）                         |
| `created_at`   | DATETIME | 创建时间                                    |
| `updated_at`   | DATETIME | 更新时间                                    |
| `last_used_at` | DATETIME | 最后使用时间                                |

#### knowledge_docs（知识库文档表）

| 字段          | 类型     | 说明         |
| ------------- | -------- | ------------ |
| `id`          | INTEGER  | 主键，自增   |
| `filename`    | TEXT     | 文件名       |
| `file_type`   | TEXT     | 文件类型     |
| `content`     | TEXT     | 原始文本内容 |
| `chunk_count` | INTEGER  | 分块数量     |
| `created_at`  | DATETIME | 创建时间     |

#### knowledge_chunks（知识库分块表）

| 字段          | 类型     | 说明                                 |
| ------------- | -------- | ------------------------------------ |
| `id`          | INTEGER  | 主键，自增                           |
| `doc_id`      | INTEGER  | 外键 -> knowledge_docs(id)，级联删除 |
| `content`     | TEXT     | 分块文本内容                         |
| `embedding`   | TEXT     | 向量嵌入（预留）                     |
| `chunk_index` | INTEGER  | 分块序号                             |
| `created_at`  | DATETIME | 创建时间                             |

#### settings（用户设置表）

| 字段    | 类型 | 说明   |
| ------- | ---- | ------ |
| `key`   | TEXT | 主键   |
| `value` | TEXT | 设置值 |

### Schema 迁移策略

`electron/db/index.ts` 中的 `ensureSchemaColumns()` 函数在每次启动时检查 `problems` 表的列结构，自动添加缺失的列。这是一种轻量级的前向迁移方案：

```typescript
const columns = database.prepare('PRAGMA table_info(problems)').all()
const existing = new Set(columns.map((c) => c.name))
// 逐个检查并添加缺失列
if (!existing.has('tracks')) {
  database.exec("ALTER TABLE problems ADD COLUMN tracks TEXT DEFAULT '[]'")
}
```

---

## 安全模型

### 沙箱隔离

渲染进程使用隔离上下文并禁用 Node.js 集成；当前 BrowserWindow 尚未显式启用
`sandbox: true`，不能把它描述为完整 Chromium 沙箱。关键配置：

```typescript
webPreferences: {
  contextIsolation: true,      // 隔离渲染进程与 preload 脚本的上下文
  nodeIntegration: false,       // 禁止渲染进程访问 Node.js API
  webSecurity: true,            // 同源策略
  navigateOnDragDrop: false,    // 禁止拖拽导航
}
```

### IPC 安全

1. **通道白名单**: preload 中硬编码允许的通道列表，任何未列入的通道调用会抛出异常
2. **序列化检查**: 递归检查所有 IPC 参数，拒绝函数、Symbol 等不可序列化类型
3. **参数校验**: 每个 IPC handler 都必须独立校验；合同矩阵不能替代逐 Handler 审计
4. **长度限制**: 高影响输入应设置明确上限；仍需持续检查新增通道

### API 密钥保护

AI 配置中的 API Key 使用 Electron `safeStorage` API 加密存储：

```typescript
function encryptApiKey(apiKey: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure API key storage is unavailable on this system')
  }
  return 'enc:' + safeStorage.encryptString(apiKey).toString('base64')
}
```

加密后的数据以 `enc:` 前缀标记，读取时自动解密。Linux `basic_text` backend 同样会拒绝新保存；
旧无前缀值仍作为兼容数据读取，详见 [安全审计](security-audit.md)。

### 内容安全策略（CSP）

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data https:;
  connect-src 'self' https:;
  font-src 'self' data:;
```

- 禁止内联脚本执行，防止 XSS
- 仅允许 `self` 来源的脚本
- 样式允许 `unsafe-inline`（TailwindCSS 需要）
- 网络请求仅允许 HTTPS

### 代码执行安全

代码运行器（`electron/utils/codeRunner.ts`）对非 SQL 运行采取以下安全措施：

| 措施               | 值                        | 说明                               |
| ------------------ | ------------------------- | ---------------------------------- |
| 一次性 utility     | 每轮一个                  | 用户代码不在 Electron 主进程执行   |
| 执行超时           | 10 秒                     | 超时后终止运行进程树               |
| 输出大小限制       | 1 MB                      | stdout/stderr 合计超限后终止       |
| 最大并发数         | 5                         | 槽位在 utility 与 Host 退出后释放  |
| 临时目录配额       | 50 MB / 20,000 项         | 递归监控，失败时保守终止           |
| Windows Job Object | 32 进程 / 384 MB / 768 MB | 单进程内存与整个 Job 内存分别限制  |
| POSIX 限制         | 分语言 `ulimit` + 进程组  | Node/dotnet 无严格 RSS，不等同容器 |

上述机制是本地资源与生命周期控制，不是安全沙箱。本地受控模式下运行代码仍保留当前用户的
文件系统与网络权限。

当 Docker 与固定 digest 镜像可用时，`strongIsolationAvailable` 可为 `true`：强隔离将
Python/Node/C/C++/C# 放入 hardening 后的容器（无网络、只读根、cap-drop、非 root、资源限制），
并用 `--cidfile` + `docker rm -f` 保证超时/中止后清理。SQL 不进入 Docker。Docker 不可用时
强隔离 fail-closed，绝不静默退回本地执行。

Windows 正常收尾时，Job Host 会在终止 Job 后等待活动进程计数归零再退出。异常路径若必须
强制结束 Host，则由 `kill-on-close` 继续终止 Job，不能把 Host 退出等同为逐进程等待句柄确认。

SQL 使用独立的 SQLite utility 和内存数据库，不进入 Windows Job，也不使用非 SQL 目录配额；
其边界为 3 秒、256 KB 输入、100 条语句、1000 行、512 KB 输出与 64 KB/单元格，并在 SQLite
支持时尝试设置 128 MB `hard_heap_limit`。

### 外部链接安全

`main.ts` 中的 `setWindowOpenHandler` 拦截所有新窗口请求，仅允许 `http:` 和 `https:` 协议的链接在外部浏览器中打开，阻止其他协议（如 `file:`、`javascript:`）。

---

## 模块详细设计

### 刷题模块（Problems）

**核心流程**:

1. 应用启动时，`syncProblems()` 从 `resources/problems/*.json` 同步题目到数据库
2. 题目元数据（来源、赛道、平台）由 `problemMeta.ts` 自动推断
3. 判题引擎逐个运行测试用例，支持 SQL 判题（结果比较）和代码执行判题
4. 失败的提交自动记录到错题本

**支持的题目来源**: leetcode、nowcoder、pat、csp、math-modeling、custom

### AI 对话模块

**核心特性**:

- 兼容 OpenAI Chat Completions API 格式
- SSE 流式输出，逐字符渲染
- 长期记忆系统：自动从对话中提取用户偏好，跨会话注入
- 预设提示词：内置 + 自定义 system prompt

### Agent 工具模块

- 主进程白名单：`knowledge-search`、`strong-code-run`
- 每次强隔离运行单独审批，十分钟过期
- SQLite 持久化运行、工具调用、审批与审计事件
- 取消 AI 请求和 Agent 工具控制器，迟到结果不能覆盖终态
- 工具完成后清除敏感输入正文，仅保留摘要与真实输出

### 知识库 RAG 模块

**当前实现**: 离线本地混合检索

- 文档上传后自动分块；资源包使用较大的 1500 字符块
- FTS5 BM25、trigram、本地 n-gram 和中英术语扩展共同召回
- 使用 RRF 融合并限制单文档片段数量，结果附带来源路径和命中通道
- FTS 不可用时降级为 bounded LIKE，UI 显示具体原因
- RAG 注入片段包含 `filename#片段序号`，便于回答时追溯
- 固定评测集用 Recall@3 与 MRR 阻止相关性回归
- `embedding` 字段仍为未来模型向量后端预留，当前不声称使用模型 embedding

### 错题本模块

**功能**:

- 自动从失败的提交中收集错题
- 追踪错误次数和错误类型
- 支持 AI 分析薄弱知识点
- 记录正确代码，支持一键重做

---

## See Also

- [API 参考](api.md) -- 所有 IPC 通道的详细参数与返回值定义
- [IPC 通信模式](concepts/ipc-patterns.md) -- IPC 请求-响应和事件推送的深入解析
- [安全模型](concepts/security-model.md) -- 安全架构详解（沙箱、加密、CSP）
- [数据流](concepts/data-flow.md) -- 数据从用户操作到持久化的完整路径
- [状态管理](concepts/state-management.md) -- Zustand 状态管理模式与最佳实践
- [数据库 Schema 参考](reference/database-schema.md) -- 完整表结构与索引定义
- [IPC 通道参考](reference/ipc-channels.md) -- 所有 IPC 通道一览
- [ADR-001: Electron 选型](adr/001-electron-choice.md) -- 为什么选择 Electron
- [ADR-003: SQLite 选型](adr/003-sqlite-choice.md) -- 为什么选择 better-sqlite3
- [术语表](glossary.md) -- 技术名词解释
