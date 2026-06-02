# CodeHelper 项目详情

## 项目概述

**名称**: CodeHelper  
**定位**: AI驱动的本地编程刷题 + IDE + 个性化学习系统桌面应用  
**技术栈**: Electron + React + TypeScript + TailwindCSS + better-sqlite3 + Monaco Editor  
**项目路径**: D:\codehelper  
**交付形式**: Windows .exe 安装包（electron-builder 打包）  
**界面语言**: 中文  
**Git 用户**: <redacted>

## 核心功能模块

### 1. 刷题系统（首页）

- 158 道题目（基础48 + 力扣80 + 数学建模30）
- 支持 5 种语言：Python、C、C++、C#、SQL
- 可收起的题目列表 + 搜索 + 难度/语言/来源筛选
- 可拖拽调整比例的题目描述/编辑器分栏
- 自动判题系统（通过 stdin/stdout 对比输出）
- 自动记录错题

### 2. IDE 编辑器

- Monaco Editor（VSCode 同款引擎）
- 多标签页管理
- 运行代码（调用本地编译器）
- 底部控制台输出

### 3. AI 助手

- 多会话管理（创建/切换/删除/重命名）
- 聊天记录持久化到 SQLite
- 支持流式响应
- Markdown 渲染 + 代码块语法高亮
- 预设提示词系统（4 内置 + 可自定义）
- 智能上下文传递

### 4. 刷题 AI 侧边栏

- 在刷题时可展开的 AI 助手
- 自动携带题目信息作为上下文
- 快捷提示：解释题目、给我提示、分析代码

### 5. 错题本

- 自动记录做错的题目
- 错误次数、错误类型追踪
- AI 分析错误原因
- 一键重做

### 6. 知识库（RAG）

- 上传文件：PDF、Markdown、TXT
- 自动分块存储
- 关键词搜索

### 7. 设置

- AI 模型配置（支持多模型切换）
- 自动获取模型列表（调用 /v1/models）
- 智能粘贴（自动识别 URL 和 API Key）
- 自定义预设提示词

## 技术架构

```
┌──────────────────────────────────────────────┐
│              CodeHelper.exe                   │
│                                              │
│  主进程 (Main)       ⇄ IPC ⇄    渲染进程      │
│  • SQLite 数据库                • React UI    │
│  • 代码执行引擎                • Monaco Editor│
│  • AI API 代理                • Zustand 状态  │
│  • RAG 引擎                   • TailwindCSS   │
│                                              │
│  本地存储层                                   │
│  SQLite (codehelper.db) + 文件系统             │
└──────────────────────────────────────────────┘
```

## 项目目录结构

```
D:\codehelper\
├── electron/                    # Electron 主进程
│   ├── main.ts                  # 应用入口
│   ├── preload.ts               # 预加载脚本
│   ├── ipc/                     # IPC 处理器
│   │   ├── runner.ts            # 代码执行
│   │   ├── database.ts          # 数据库操作 + AI配置
│   │   ├── ai.ts                # AI 对话（流式）
│   │   ├── problems.ts          # 题库管理 + 判题
│   │   ├── mistakes.ts          # 错题本
│   │   ├── rag.ts               # 知识库
│   │   └── chat.ts              # 聊天会话 + 预设词
│   └── db/
│       ├── index.ts             # 数据库连接
│       └── schema.sql           # 建表语句（10张表）
├── src/                         # React 渲染进程
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/              # 通用组件
│   │   ├── Sidebar.tsx          # 左侧图标导航
│   │   ├── Layout.tsx           # 主布局
│   │   └── StatusBar.tsx        # 底部状态栏
│   ├── modules/                 # 功能模块
│   │   ├── editor/              # Monaco编辑器
│   │   ├── problems/            # 刷题系统
│   │   │   ├── ProblemList.tsx  # 题目列表
│   │   │   ├── ProblemDetail.tsx# 做题界面
│   │   │   ├── ProblemsView.tsx # 刷题视图
│   │   │   └── AISidebar.tsx    # AI侧边栏
│   │   ├── ai-chat/             # AI助手
│   │   │   ├── ChatView.tsx     # 聊天界面
│   │   │   ├── SessionList.tsx  # 会话列表
│   │   │   └── MessageBubble.tsx# Markdown消息气泡
│   │   ├── mistakes/            # 错题本
│   │   ├── knowledge/           # 知识库
│   │   └── settings/            # 设置
│   └── stores/                  # Zustand状态管理
│       ├── appStore.ts           # 全局状态
│       ├── editorStore.ts        # 编辑器
│       ├── problemStore.ts       # 刷题
│       ├── chatStore.ts          # 聊天
│       └── settingsStore.ts      # 设置
├── resources/
│   ├── problems/
│   │   ├── basic.json           # 基础题 48道
│   │   ├── leetcode.json        # 力扣经典题 80道
│   │   └── math-modeling.json   # 数学建模题 30道
│   └── icons/
│       └── icon.png
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
└── tailwind.config.js
```

## 数据库表结构（10张表）

| 表名             | 用途           |
| ---------------- | -------------- |
| problems         | 题目表         |
| submissions      | 提交记录表     |
| mistakes         | 错题表         |
| ai_configs       | AI模型配置表   |
| chat_history     | 聊天消息历史表 |
| chat_sessions    | 聊天会话表     |
| prompt_presets   | 预设提示词表   |
| knowledge_docs   | 知识库文档表   |
| knowledge_chunks | 知识向量片段表 |
| settings         | 用户设置表     |

## 配色方案（Catppuccin Mocha）

| 用途     | 颜色           |
| -------- | -------------- |
| 主背景   | #1e1e2e        |
| 侧边栏   | #181825        |
| 分割线   | #313244        |
| 强调色   | #cba6f7 (紫色) |
| 正文     | #cdd6f4        |
| 次要文字 | #6c7086        |
| 成功     | #a6e3a1        |
| 警告     | #f9e2af        |
| 错误     | #f38ba8        |
| 信息     | #89b4fa        |

## 运行与打包

```bash
# 开发模式
cd D:\codehelper
npm run dev

# 打包为 Windows 安装包
npm run build:win

# 输出位置
dist-release/CodeHelper Setup 1.0.0.exe    # NSIS安装包
dist-release/win-unpacked/CodeHelper.exe   # 免安装版
```

## Git 提交历史

| 提交    | 说明                                        |
| ------- | ------------------------------------------- |
| 9b8757b | 初始化项目                                  |
| 734cdb8 | Monaco Editor 集成                          |
| 13ad2ea | 代码执行 IPC                                |
| 91879fe | SQLite + AI设置 + 聊天                      |
| 471c6d4 | 刷题系统 + 判题                             |
| ba64466 | 错题本 + 知识库                             |
| 3b052ac | 打包配置                                    |
| ccd6dc7 | UI大改：可收起面板 + AI侧边栏               |
| c2b01c9 | 修复schema路径问题                          |
| 2445198 | 自动获取模型 + 多语言支持                   |
| b6206c3 | C# + SQL 支持                               |
| 7819e8e | 右键菜单                                    |
| 5ffc34a | AI聊天多会话 + Markdown渲染                 |
| 80caaa0 | 修复滚动 + 打字动画 + 自定义预设 + 智能粘贴 |
| bec9796 | 扩充到158题（力扣 + 数模）                  |

## 开发关键决策

1. **单体 Electron 架构** — 主进程处理后端逻辑，渲染进程处理UI，IPC通信
2. **better-sqlite3** — 同步API，零配置，适合本地单用户
3. **electron-vite** — 统一管理主进程和渲染进程构建
4. **Zustand** — 轻量状态管理，比Redux简洁
5. **多题库文件** — 按来源分类加载（basic/leetcode/math-modeling）
6. **流式AI响应** — 通过 Electron IPC 逐块推送，实时显示
7. **代码执行** — 通过 spawn 子进程调用本地编译器/解释器
