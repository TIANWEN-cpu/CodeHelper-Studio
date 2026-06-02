# 第一周上手指南

欢迎加入 CodeHelper 开发团队！本指南将帮助你在第一周内搭建开发环境、了解代码库结构，并成功提交你的第一个 PR。

---

## 目录

- [环境搭建](#环境搭建)
- [代码库导览](#代码库导览)
- [核心概念](#核心概念)
- [第一个 PR](#第一个-pr)
- [第一周里程碑](#第一周里程碑)
- [常见问题](#常见问题)

---

## 环境搭建

### 1. 安装必要工具

| 工具    | 版本要求 | 说明                        |
| ------- | -------- | --------------------------- |
| Node.js | >= 18    | 推荐使用 LTS 版本，官网下载 |
| npm     | >= 9     | 随 Node.js 安装             |
| Git     | >= 2.30  | 版本管理                    |
| VS Code | 最新版   | 推荐 IDE                    |

### 2. 安装 VS Code 扩展

- **ESLint** - 代码质量检查
- **Prettier** - 代码格式化
- **Tailwind CSS IntelliSense** - Tailwind 类名补全

### 3. 克隆仓库并安装依赖

```bash
git clone https://github.com/TIANWEN-cpu/CodeHelper.git
cd CodeHelper
npm install
```

如果 `npm install` 报错 `better-sqlite3` 编译失败，需要安装 C++ 编译工具链：

- **Windows**: 安装 Visual Studio Build Tools，选择"使用 C++ 的桌面开发"工作负载

### 4. 验证环境

运行以下三条命令，确保全部通过：

```bash
npm run typecheck
npm run lint
npm test
```

### 5. 启动开发服务器

```bash
npm run dev
```

Electron 窗口将自动打开。修改代码后会自动热重载。

### 6. 环境验证清单

- [ ] `npm run dev` 启动成功，窗口正常显示
- [ ] `Ctrl+Shift+I` 能打开 Chrome DevTools
- [ ] 修改一个 `.tsx` 文件后页面自动刷新
- [ ] `npm test` 全部测试通过
- [ ] `npm run typecheck` 无类型错误

---

## 代码库导览

### 项目根目录

```
codehelper/
├── electron/           # 主进程代码（Node.js 环境）
├── src/                # 渲染进程代码（浏览器环境，React）
├── tests/              # 所有测试文件
├── docs/               # 项目文档
├── resources/          # 打包资源（图标等）
├── scripts/            # 构建辅助脚本
├── electron.vite.config.ts  # Vite 构建配置
├── electron-builder.yml     # 打包配置
└── package.json        # 项目依赖和脚本
```

### 主进程 (`electron/`)

```
electron/
├── main.ts          # 应用入口，窗口管理
├── preload.ts       # 安全桥接，IPC 白名单
├── ipc/             # IPC 处理器
│   ├── ai.ts        # AI 对话（流式响应）
│   ├── chat.ts      # 聊天会话管理
│   ├── database.ts  # 设置和 AI 配置
│   ├── mistakes.ts  # 错题本
│   ├── problems.ts  # 题库管理
│   ├── rag.ts       # 知识库 RAG
│   └── runner.ts    # 代码执行
├── db/              # SQLite 数据库
│   ├── db.ts        # 数据库连接
│   └── schema.sql   # 表结构定义
├── utils/           # 纯函数工具
└── types/           # 主进程类型定义
```

### 渲染进程 (`src/`)

```
src/
├── App.tsx           # 根组件
├── main.tsx          # 入口文件
├── api/
│   └── ipc.ts        # 类型安全的 IPC 调用封装
├── components/       # 通用组件
│   ├── Layout.tsx    # 页面布局（路由映射）
│   ├── Sidebar.tsx   # 侧边栏导航
│   ├── StatusBar.tsx # 底部状态栏
│   ├── CommandPalette.tsx  # 命令面板
│   ├── ErrorBoundary.tsx   # 错误边界
│   └── Toast.tsx     # 通知提示
├── modules/          # 功能模块
│   ├── ai-chat/      # AI 助手
│   ├── editor/       # 代码编辑器
│   ├── knowledge/    # 知识库
│   ├── mistakes/     # 错题本
│   ├── problems/     # 刷题系统
│   ├── search/       # 全局搜索
│   ├── settings/     # 设置
│   └── stats/        # 统计面板
├── stores/           # Zustand 状态管理
├── hooks/            # 自定义 Hooks
├── services/         # 前端服务层
├── constants/        # 共享常量
├── types/            # 共享类型
└── utils/            # 工具函数
```

---

## 核心概念

### 1. Electron 三进程模型

CodeHelper 采用 Electron 的标准三进程架构：

- **主进程 (Main Process)**: 运行在 Node.js 环境中，管理窗口、系统 API、数据库。代码在 `electron/` 目录。
- **渲染进程 (Renderer Process)**: 运行在 Chromium 中，负责 UI 展示。代码在 `src/` 目录。
- **预加载脚本 (Preload)**: 安全桥梁，运行在独立上下文中，通过白名单控制 IPC 通道。代码在 `electron/preload.ts`。

### 2. IPC 通信

渲染进程无法直接访问 Node.js API，必须通过 IPC（进程间通信）与主进程交互。

```
React 组件 → Zustand Store → typedInvoke(channel, args)
  → preload.ts（白名单校验）
  → electron/ipc/*.ts（业务逻辑）
  → electron/db/（SQLite 操作）
  → 返回结果 → 更新 Store → UI 刷新
```

关键文件：

- `src/constants/index.ts` - IPC 通道名定义
- `src/types/ipc.ts` - IPC 类型映射
- `src/api/ipc.ts` - 类型安全的调用封装（含缓存和去重）
- `electron/preload.ts` - 白名单校验

### 3. Zustand 状态管理

每个功能模块有独立的 Zustand store，位于 `src/stores/`：

| Store              | 用途                               |
| ------------------ | ---------------------------------- |
| `appStore.ts`      | 全局状态（当前模块、主题、侧边栏） |
| `chatStore.ts`     | AI 聊天会话                        |
| `editorStore.ts`   | 编辑器标签页和配置                 |
| `problemStore.ts`  | 题库和做题状态                     |
| `settingsStore.ts` | 用户设置                           |

### 4. 模块化架构

每个功能模块是独立的目录，包含该模块的所有组件：

```
src/modules/problems/
├── ProblemsView.tsx    # 主页面
├── ProblemList.tsx     # 题目列表
├── ProblemDetail.tsx   # 题目详情
└── AISidebar.tsx       # AI 辅助侧栏
```

---

## 第一个 PR

推荐的第一个 PR 类型（按难度递增）：

### 选项 A：修复文档错误

最简单的入门方式，熟悉 Git 工作流和 PR 流程。

1. 发现文档中的错别字或不准确描述
2. Fork 仓库，创建分支：`git checkout -b docs/fix-typo`
3. 修改并提交
4. 创建 PR

### 选项 B：修复一个简单的 Bug

从 [Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 中选择标记为 `good first issue` 的任务。

### 选项 C：为现有函数添加测试

为覆盖率不足的模块补充测试：

```bash
# 查看当前覆盖率
npm run test:coverage
```

选择一个覆盖率较低的模块，补充缺失的测试用例。

### PR 完整流程

```bash
# 1. 从 dev 分支创建功能分支
git checkout dev
git pull
git checkout -b feat/你的功能名

# 2. 开发并提交
git add <改动的文件>
git commit -m "feat(scope): 简短描述"

# 3. 提交前检查
npm run typecheck && npm run lint && npm run format:check && npm test

# 4. 推送并创建 PR
git push origin feat/你的功能名
```

### PR 检查清单

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 无错误
- [ ] `npm run format:check` 通过
- [ ] `npm test` 全部通过
- [ ] 新增代码有对应测试（如适用）
- [ ] 无硬编码的 API Key 或敏感信息
- [ ] PR 描述说明了改动目的和测试情况

---

## 第一周里程碑

### 第 1 天：环境搭建

- 安装所有工具和依赖
- 成功启动 `npm run dev`
- 熟悉目录结构

### 第 2-3 天：代码阅读

- 阅读 `architecture-walkthrough.md` 了解架构
- 跟踪一个完整的用户操作（如从 UI 点击到数据库查询）
- 运行测试套件，了解测试结构

### 第 4-5 天：动手实践

- 完成第一个 PR
- 尝试添加一个简单的功能或修复
- 使用 DevTools 调试渲染进程

### 第 6-7 天：深入理解

- 阅读 `common-tasks.md` 了解常见开发模式
- 阅读 `coding-standards.md` 熟悉编码规范
- 尝试一个较复杂的任务（如添加新的 IPC 通道）

---

## 常见问题

### 开发相关

**Q: 启动后窗口白屏怎么办？**

检查终端是否有编译错误。尝试清理后重新安装：

```bash
rm -rf node_modules out
npm install
npm run dev
```

**Q: 修改代码后页面没有刷新？**

确认修改的是 `src/` 或 `electron/` 下的文件。修改 `electron/` 下的代码需要重启应用。

**Q: 如何调试主进程？**

主进程的 `console.log` 输出在启动 `npm run dev` 的终端中。更详细的调试：

```bash
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

**Q: 如何调试渲染进程？**

按 `Ctrl+Shift+I` 打开 Chrome DevTools，可以设置断点、查看网络请求等。

### 测试相关

**Q: 如何只运行某个测试文件？**

```bash
npx vitest run tests/chatStore.test.ts
```

**Q: 测试覆盖率在哪里看？**

```bash
npm run test:coverage
```

生成的报告在 `coverage/` 目录下。

### 数据库相关

**Q: 数据库文件在哪里？**

- Windows: `%APPDATA%/codehelper/codehelper.db`
- macOS: `~/Library/Application Support/codehelper/codehelper.db`
- Linux: `~/.config/codehelper/codehelper.db`

可以用 [DB Browser for SQLite](https://sqlitebrowser.org/) 打开查看。

---

## 获取帮助

- 查看 [CONTRIBUTING.md](../../CONTRIBUTING.md) 了解详细贡献流程
- 查看 [docs/architecture.md](../architecture.md) 了解系统架构
- 查看 [docs/api.md](../api.md) 了解 IPC 通道参考
- 在 [GitHub Issues](https://github.com/TIANWEN-cpu/CodeHelper/issues) 提问

---

## 相关文档

- [architecture-walkthrough.md](./architecture-walkthrough.md) - 架构深入解析
- [common-tasks.md](./common-tasks.md) - 常见任务指南
- [coding-standards.md](./coding-standards.md) - 编码规范
