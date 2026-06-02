<p align="center">
  <img src="resources/icons/icon.png" alt="CodeHelper Logo" width="120">
</p>

<h1 align="center">CodeHelper</h1>

<p align="center">
  <strong>AI 驱动的桌面编程助手</strong>
</p>

<p align="center">
  基于 Electron + React + TypeScript 构建的一体化编程学习与开发工具
</p>

<p align="center">
  集成代码编辑器、AI 对话、题库系统、知识库检索与错题追踪，助力高效编程学习
</p>

---

## 功能特性

- **Monaco 代码编辑器** -- VSCode 同款编辑引擎，支持语法高亮、智能补全、多标签页管理
- **AI 智能对话** -- 支持 OpenAI 兼容 API，流式输出，Markdown 渲染与代码块高亮，预设提示词系统
- **题库系统** -- 内置 158+ 道题目，覆盖力扣、牛客、PAT、CSP、数学建模等多来源，支持自动判题与多语言
- **知识库 RAG 检索** -- 支持 PDF / Markdown / TXT 文档导入，自动分块与关键词向量检索
- **错题本** -- 自动记录错误题目，追踪错误次数与类型，AI 分析薄弱知识点，支持一键重做
- **代码运行器** -- 支持 Python、C、C++、C#、Java、JavaScript 六种语言本地执行
- **个性化设置** -- 主题切换（Catppuccin 配色）、AI 模型配置、快捷键自定义、智能粘贴

## 截图预览

> 欢迎补充截图至 `docs/` 目录

## 安装与运行

### 环境要求

- Node.js >= 18
- npm >= 9
- Windows / macOS / Linux

### 开发模式

```bash
# 克隆仓库
git clone https://github.com/TIANWEN-cpu/CodeHelper.git
cd CodeHelper

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 开发环境配置

除 Node.js 外，代码运行器功能需要以下编译器/运行时：

| 语言 | 依赖 | 安装说明 |
|------|------|----------|
| Python | `python` (>= 3.8) | [python.org](https://www.python.org/downloads/) 或系统包管理器 |
| C / C++ | `gcc` / `g++` | Windows: MinGW-w64; macOS: `xcode-select --install`; Linux: `build-essential` |
| Java | `javac` / `java` (>= 11) | [Adoptium](https://adoptium.net/) |
| C# | `dotnet` (>= 6) | [dotnet.microsoft.com](https://dotnet.microsoft.com/download) |
| JavaScript | `node` | 已随 Node.js 安装 |

> 未安装对应编译器的语言仍可正常使用其他功能，仅代码运行器会提示找不到命令。

### 构建打包

```bash
# 构建应用
npm run build

# 打包为 Windows 安装包
npm run build:win
```

打包产物位置：

| 文件 | 说明 |
|------|------|
| `dist-release/CodeHelper Setup 1.0.0.exe` | NSIS 安装包 |
| `dist-release/win-unpacked/CodeHelper.exe` | 免安装版 |

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 41 |
| 前端框架 | React 19 + TypeScript 6 |
| 构建工具 | Vite 8 + electron-vite |
| 状态管理 | Zustand 5 |
| 代码编辑器 | Monaco Editor 0.55 |
| 样式方案 | TailwindCSS 4 |
| 数据库 | better-sqlite3 (SQLite) |
| 图标库 | Lucide React |
| 文档渲染 | react-markdown + remark-gfm |

## 项目结构

```
codehelper/
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 应用入口
│   ├── preload.ts               # 预加载脚本
│   ├── ipc/                     # IPC 处理器
│   │   ├── runner.ts            # 代码执行引擎
│   │   ├── database.ts          # 数据库操作 + AI 配置
│   │   ├── ai.ts                # AI 对话（流式响应）
│   │   ├── problems.ts          # 题库管理 + 自动判题
│   │   ├── mistakes.ts          # 错题本管理
│   │   ├── rag.ts               # 知识库 RAG 引擎
│   │   └── chat.ts              # 聊天会话 + 预设提示词
│   ├── utils/                   # 纯函数工具模块
│   │   ├── codeRunner.ts        # 代码运行器（进程管理）
│   │   ├── sqlUtils.ts          # SQL 分割与判断
│   │   ├── textUtils.ts         # RAG 文本分块与正则转义
│   │   └── problemMeta.ts       # 题目元数据推断
│   └── db/
│       ├── index.ts             # 数据库连接
│       └── schema.sql           # 建表语句（10 张表）
├── src/                         # React 渲染进程
│   ├── App.tsx                  # 应用根组件
│   ├── main.tsx                 # 渲染进程入口
│   ├── components/              # 通用组件
│   │   ├── Sidebar.tsx          # 左侧图标导航栏
│   │   ├── Layout.tsx           # 主布局容器
│   │   ├── StatusBar.tsx        # 底部状态栏
│   │   └── ErrorBoundary.tsx    # 错误边界
│   ├── modules/                 # 功能模块
│   │   ├── editor/              # Monaco 编辑器
│   │   ├── problems/            # 刷题系统 + AI 侧边栏
│   │   ├── ai-chat/             # AI 助手对话
│   │   ├── mistakes/            # 错题本
│   │   ├── knowledge/           # 知识库
│   │   └── settings/            # 设置面板
│   ├── stores/                  # Zustand 状态管理
│   │   ├── appStore.ts          # 全局状态
│   │   ├── editorStore.ts       # 编辑器状态
│   │   ├── problemStore.ts      # 刷题状态
│   │   ├── chatStore.ts         # 聊天状态
│   │   └── settingsStore.ts     # 设置状态
│   └── utils/
│       └── labels.ts            # 标签映射纯函数
├── tests/                       # 单元测试
│   ├── labels.test.ts           # 标签函数测试
│   ├── sqlUtils.test.ts         # SQL 工具测试
│   ├── problemMeta.test.ts      # 题目元数据测试
│   └── textUtils.test.ts        # 文本工具测试
├── resources/
│   ├── problems/                # 题库数据文件
│   │   ├── basic.json           # 基础题 48 道
│   │   ├── leetcode.json        # 力扣经典题 80 道
│   │   └── math-modeling.json   # 数学建模题 30 道
│   └── icons/                   # 应用图标
├── electron-builder.yml         # 打包配置
├── electron.vite.config.ts      # Vite 构建配置
├── vitest.config.ts             # Vitest 测试配置
├── eslint.config.mjs            # ESLint flat config
├── .prettierrc.json             # Prettier 格式配置
├── package.json
└── tsconfig.json
```

## 数据库设计

SQLite 数据库共 10 张表：

| 表名 | 用途 |
|------|------|
| `problems` | 题目信息 |
| `submissions` | 代码提交记录 |
| `mistakes` | 错题记录 |
| `ai_configs` | AI 模型配置 |
| `chat_sessions` | 聊天会话 |
| `chat_history` | 聊天消息历史 |
| `prompt_presets` | 预设提示词 |
| `knowledge_docs` | 知识库文档 |
| `knowledge_chunks` | 文档分块向量 |
| `settings` | 用户设置 |

## 安全特性

CodeHelper 在安全性方面采取了多项加固措施：

- **Chromium 渲染进程沙箱** -- 启用 `contextIsolation` 与 `nodeIntegration: false`，隔离渲染进程与 Node.js 环境
- **API 密钥加密存储** -- 使用 Electron `safeStorage` API 对敏感配置进行加密
- **CSP 内容安全策略** -- 配置严格的 Content-Security-Policy 头部，防止 XSS 攻击
- **代码执行资源限制** -- 超时控制、输出大小限制、并发数限制，防止资源耗尽
- **IPC 参数验证** -- 所有 IPC 调用进行类型检查与协议白名单校验
- **移除 `shell:true`** -- 子进程执行不使用 shell 模式，防止命令注入
- **外部链接协议白名单** -- 仅允许 `http:` 和 `https:` 协议的外部链接打开

## 配色方案

默认采用 **Catppuccin Mocha** 主题：

| 用途 | 颜色值 |
|------|--------|
| 主背景 | `#1e1e2e` |
| 侧边栏 | `#181825` |
| 强调色 | `#cba6f7` (紫色) |
| 正文 | `#cdd6f4` |
| 次要文字 | `#6c7086` |
| 成功 | `#a6e3a1` |
| 警告 | `#f9e2af` |
| 错误 | `#f38ba8` |
| 信息 | `#89b4fa` |

## 测试

项目使用 [Vitest](https://vitest.dev/) 进行单元测试，覆盖核心纯函数模块。

```bash
# 运行所有测试（单次）
npm run test

# 监听模式（开发时自动重跑）
npm run test:watch

# 可视化测试界面
npm run test:ui
```

测试文件位于 `tests/` 目录：

| 测试文件 | 覆盖模块 |
|----------|----------|
| `labels.test.ts` | 标签映射函数 (`src/utils/labels.ts`) |
| `sqlUtils.test.ts` | SQL 分割与判断 (`electron/utils/sqlUtils.ts`) |
| `problemMeta.test.ts` | 题目元数据推断 (`electron/utils/problemMeta.ts`) |
| `textUtils.test.ts` | RAG 文本分块与正则转义 (`electron/utils/textUtils.ts`) |

## 代码规范

项目使用 ESLint + Prettier 进行代码质量与格式管理。

```bash
# 检查代码规范
npm run lint

# 自动修复规范问题
npm run lint:fix

# 格式化代码
npm run format

# 检查格式（CI 用）
npm run format:check

# 类型检查
npm run typecheck
```

## 贡献指南

欢迎提交 Issue 和 Pull Request。参与贡献前请阅读以下规范：

### 分支策略

- `main` -- 稳定发布分支
- `dev` -- 开发集成分支
- 功能分支命名: `feat/xxx`、`fix/xxx`、`docs/xxx`

### Commit 规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>

feat(problems): 新增数学建模题库导入
fix(rag): 修复文档分块越界问题
docs(readme): 补充开发环境说明
```

常用 type: `feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`

### Pull Request 流程

1. Fork 仓库并创建功能分支
2. 确保 `npm run typecheck`、`npm run lint`、`npm run test` 全部通过
3. 提交 PR 并填写变更说明
4. 等待 Code Review 通过后合并

## 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<p align="center">
  <sub>Built with Electron + React + TypeScript</sub>
</p>
