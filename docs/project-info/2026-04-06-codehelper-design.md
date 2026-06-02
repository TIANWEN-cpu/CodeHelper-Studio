# CodeHelper 系统设计文档

> AI驱动的本地编程刷题 + IDE + 个性化学习系统

## 1. 产品概述

CodeHelper 是一个面向个人编程学习的桌面应用，集成代码编辑器、刷题系统、AI编程助手、错题分析和本地知识库。最终交付为 Windows .exe 可执行文件。

**核心用户场景：**

- 打开应用 → 选择一道题 → 在内置编辑器中编写代码 → 运行并验证 → AI辅助讲解
- 做错的题自动进入错题本 → AI分析错误模式 → 推荐针对性练习
- 上传学习资料到知识库 → AI基于个人资料回答问题

## 2. 技术架构

### 2.1 架构模式

单体 Electron 应用。主进程处理所有后端逻辑，渲染进程负责UI，通过 IPC 通信。

### 2.2 技术栈

| 层级       | 技术                  | 选型理由                         |
| ---------- | --------------------- | -------------------------------- |
| 桌面框架   | Electron 30           | Monaco Editor 原生支持，生态成熟 |
| 前端框架   | React 18 + TypeScript | 组件化开发，类型安全             |
| 样式方案   | TailwindCSS 3         | 快速开发，一致性好               |
| 代码编辑器 | Monaco Editor         | VSCode 同款引擎，功能完整        |
| 状态管理   | Zustand               | 轻量，API 简洁                   |
| 数据库     | better-sqlite3        | 同步API，性能好，Electron 兼容   |
| 构建工具   | electron-vite         | 统一管理主进程/渲染进程构建      |
| 打包工具   | electron-builder      | 生成 .exe 安装包                 |
| AI 通信    | OpenAI 兼容 API       | 支持多模型，流式响应             |
| 向量检索   | 本地 JS 实现          | 零依赖，余弦相似度               |

### 2.3 进程架构

```
┌─────────────────────────────────────────────┐
│                CodeHelper.exe                │
│                                             │
│  ┌──────────────┐    IPC    ┌─────────────┐ │
│  │  主进程 Main  │ ◄──────► │ 渲染进程     │ │
│  │              │          │ Renderer     │ │
│  │ • SQLite     │          │              │ │
│  │ • 代码执行    │          │ • React UI   │ │
│  │ • AI API代理  │          │ • Monaco     │ │
│  │ • RAG 引擎   │          │ • Zustand    │ │
│  │ • 文件系统    │          │ • TailwindCSS│ │
│  └──────────────┘          └─────────────┘ │
│         │                                   │
│  ┌──────┴──────┐                            │
│  │  本地存储层   │                            │
│  │ SQLite + 文件 │                            │
│  └─────────────┘                            │
└─────────────────────────────────────────────┘
```

## 3. 界面设计

### 3.1 布局方案

采用 VSCode 风格布局：

- **左侧**：48px 窄图标导航栏，垂直排列模块图标
- **主区域**：根据当前模块动态切换内容
- **底部面板**：控制台输出（刷题/编辑模式时显示）

### 3.2 模块导航

左侧图标栏从上到下：

1. 刷题系统（默认首页）
2. 代码编辑器
3. AI 助手
4. 错题本
5. 知识库
6. 设置（底部）

### 3.3 主题

暗色主题为主（Catppuccin Mocha 配色），与代码编辑器风格统一。

## 4. 功能模块设计

### 4.1 IDE 编辑器模块 (`src/modules/editor/`)

**功能：**

- 集成 Monaco Editor，支持 Python / C / C++ / C# / SQL 语法高亮和自动补全
- 多文件标签页管理
- 运行代码：主进程调用本地编译器/解释器（python、gcc、g++、dotnet、sqlite3）
- 底部控制台显示标准输出和标准错误

**代码执行流程：**

```
渲染进程 → IPC(run-code) → 主进程 spawn 子进程 → 捕获 stdout/stderr → IPC 返回结果
```

**支持的运行时：**

- Python: `python` 命令
- C/C++: `gcc`/`g++` 编译后执行
- C#: `dotnet script` 或编译执行
- SQL: 内嵌 SQLite 执行

### 4.2 刷题系统模块 (`src/modules/problems/`)

**题目数据结构：**

```typescript
interface Problem {
  id: number
  title: string
  description: string // Markdown 格式
  difficulty: 'easy' | 'medium' | 'hard'
  tags: string[] // 如 ['数组', '哈希表']
  languages: string[] // 支持的语言
  examples: Example[] // 输入输出示例
  testCases: TestCase[] // 测试用例
  starterCode: Record<string, string> // 各语言的初始代码
}
```

**题目来源：**

- 内置题库：`resources/problems/` 下的 JSON 文件，按分类组织
- 用户导入：支持导入 LeetCode 格式 JSON
- 自定义创建：通过界面创建题目

**刷题界面：**

- 左侧：题目描述（Markdown渲染）+ 示例
- 右侧：Monaco 编辑器 + 语言选择
- 底部：运行结果 / 测试用例通过情况
- 顶部：题目列表筛选（难度、标签、状态）

**判题逻辑：**

- 运行用户代码，将测试用例的输入通过 stdin 传入
- 对比 stdout 输出与期望输出
- 记录：通过/失败、运行时间、内存（粗略）

### 4.3 AI 助手模块 (`src/modules/ai-chat/`)

**功能：**

- 独立对话界面（类似 ChatGPT/Cherry Studio）
- 支持流式响应（SSE）
- 上下文感知：可自动附加当前题目、代码、错误信息
- 预设提示词模板：代码解释、生成解法、Debug分析、复杂问题拆解

**AI 调用流程：**

```
渲染进程构造消息 → IPC(ai-chat) → 主进程发 HTTP 请求到 API
→ 流式返回 → IPC 逐块推送到渲染进程 → 实时显示
```

**高级能力（后续迭代）：**

- 读取做题记录，分析薄弱知识点
- 生成个性化学习路径建议
- 基于错题本推荐复习题目

### 4.4 错题本模块 (`src/modules/mistakes/`)

**自动记录触发条件：**

- 提交代码但测试用例未全部通过

**记录内容：**

- 题目ID、错误次数、错误类型（编译错误/运行时错误/逻辑错误/超时）
- 用户提交的错误代码
- 解题耗时
- 最终正确代码（如有）

**AI 增强：**

- 点击"分析错误"→ 调用 AI 分析错误原因
- 生成改进建议
- 推荐相似题目供复习

### 4.5 知识库模块 (`src/modules/knowledge/`)

**功能：**

- 上传文件：PDF / Markdown / TXT
- 文件解析：提取文本内容
- 分块：将长文本切分为 ~500 字的片段
- 向量化：调用 AI API 的 embedding 接口生成向量
- 存储：向量和文本片段存入 SQLite
- 检索：用户提问 → 生成问题向量 → 余弦相似度匹配 → 取 top-K 片段 → 作为上下文送入 AI

**RAG 流程：**

```
用户提问 → embedding(问题) → 余弦相似度搜索 → top-5 片段
→ 构造 prompt: "基于以下资料回答：{片段}\n问题：{问题}"
→ AI 回答
```

### 4.6 设置模块 (`src/modules/settings/`)

**AI 配置：**

- API Key（加密存储）
- Base URL（默认 https://api.openai.com/v1）
- 模型名称（如 gpt-4o、deepseek-chat）
- 支持多套配置，不同任务可选不同模型

**通用设置：**

- 编辑器字体大小、主题
- 代码执行超时时间
- 编译器路径配置

## 5. 数据库设计

```sql
-- 题目表
CREATE TABLE problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT CHECK(difficulty IN ('easy','medium','hard')),
  tags TEXT,           -- JSON 数组
  languages TEXT,      -- JSON 数组
  examples TEXT,       -- JSON 数组
  test_cases TEXT,     -- JSON 数组
  starter_code TEXT,   -- JSON 对象 {lang: code}
  source TEXT,         -- 来源标识
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 提交记录
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER REFERENCES problems(id),
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT CHECK(status IN ('accepted','wrong_answer','compile_error','runtime_error','timeout')),
  passed_cases INTEGER DEFAULT 0,
  total_cases INTEGER DEFAULT 0,
  duration_ms INTEGER,         -- 解题耗时
  execution_time_ms INTEGER,   -- 代码运行耗时
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 错题记录
CREATE TABLE mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER REFERENCES problems(id),
  error_count INTEGER DEFAULT 1,
  error_types TEXT,            -- JSON 数组
  last_wrong_code TEXT,
  correct_code TEXT,
  ai_analysis TEXT,
  review_count INTEGER DEFAULT 0,
  next_review_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI 模型配置
CREATE TABLE ai_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,       -- 加密存储
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  task_type TEXT,              -- 绑定任务类型（chat/analysis/embedding）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 对话历史
CREATE TABLE chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  model TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 知识库文档
CREATE TABLE knowledge_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  file_type TEXT,
  content TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 知识库向量片段
CREATE TABLE knowledge_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER REFERENCES knowledge_docs(id),
  content TEXT NOT NULL,
  embedding TEXT,              -- JSON 数组（向量）
  chunk_index INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 用户设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## 6. 项目目录结构

```
D:\codehelper\
├── electron/                  # Electron 主进程
│   ├── main.ts                # 应用入口
│   ├── preload.ts             # 预加载脚本(IPC桥接)
│   ├── ipc/                   # IPC 处理器
│   │   ├── database.ts        # 数据库操作
│   │   ├── runner.ts          # 代码执行
│   │   ├── ai.ts              # AI API 代理
│   │   └── rag.ts             # 知识库检索
│   └── db/
│       └── schema.sql         # 建表语句
├── src/                       # React 渲染进程
│   ├── App.tsx                # 根组件
│   ├── main.tsx               # React 入口
│   ├── components/            # 通用组件
│   │   ├── Sidebar.tsx        # 左侧图标导航
│   │   ├── TabBar.tsx         # 标签页栏
│   │   └── Panel.tsx          # 可拖拽面板
│   ├── modules/               # 功能模块
│   │   ├── editor/            # Monaco 编辑器
│   │   ├── problems/          # 刷题系统
│   │   ├── ai-chat/           # AI 助手
│   │   ├── mistakes/          # 错题本
│   │   ├── knowledge/         # 知识库
│   │   └── settings/          # 设置页
│   └── stores/                # Zustand 状态管理
├── resources/                 # 静态资源
│   ├── problems/              # 内置题库(JSON)
│   └── icons/                 # 应用图标
├── package.json
├── electron-builder.yml       # 打包配置
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 7. 开发阶段划分

项目分6个阶段递增交付：

1. **项目脚手架**：Electron + React + Vite + TailwindCSS 初始化，基础窗口和导航框架
2. **Monaco 编辑器集成**：多标签页编辑器，代码运行，控制台输出
3. **AI 对话功能**：OpenAI 兼容 API 调用，流式对话界面
4. **刷题系统**：题库、做题界面、判题逻辑、提交记录
5. **错题本 + 知识库**：错题自动记录、AI分析、文件上传、RAG检索
6. **打包发布**：electron-builder 配置，生成 .exe

每个阶段结束时产出可运行的应用。
