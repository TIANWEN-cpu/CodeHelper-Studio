# CodeHelper 示例项目结构

## 项目目录结构概览

```
codehelper/
├── electron/                    # 主进程（Node.js）
│   ├── main.ts                  # 应用入口
│   ├── preload.ts               # 安全桥接层
│   ├── ipc/                     # IPC 处理器
│   │   ├── ai.ts               # AI 对话
│   │   ├── chat.ts             # 聊天管理
│   │   ├── database.ts         # 数据库操作
│   │   ├── mistakes.ts         # 错题本
│   │   ├── problems.ts         # 题库管理与判题
│   │   ├── rag.ts              # 知识库 RAG
│   │   └── runner.ts           # 代码执行
│   ├── utils/                   # 工具模块
│   │   ├── codeRunner.ts       # 多语言代码执行引擎
│   │   ├── problemMeta.ts      # 题目元数据推断
│   │   └── textUtils.ts        # 文本处理
│   └── db/                      # 数据库
│       ├── index.ts            # 连接管理与 Schema 迁移
│       └── schema.sql          # 建表语句
│
├── src/                         # 渲染进程（React）
│   ├── main.tsx                 # React 入口
│   ├── App.tsx                  # 根组件
│   ├── api/
│   │   └── ipc.ts              # 类型安全的 IPC 封装
│   ├── components/              # 通用组件
│   │   ├── Sidebar.tsx         # 侧边导航栏
│   │   ├── Layout.tsx          # 主布局
│   │   └── StatusBar.tsx       # 底部状态栏
│   ├── modules/                 # 功能模块
│   │   ├── editor/             # 代码编辑器
│   │   ├── problems/           # 刷题系统
│   │   ├── ai-chat/            # AI 助手
│   │   ├── mistakes/           # 错题本
│   │   ├── knowledge/          # 知识库
│   │   └── settings/           # 设置面板
│   ├── stores/                  # 状态管理
│   │   ├── problemStore.ts     # 刷题状态
│   │   ├── chatStore.ts        # 聊天状态
│   │   └── editorStore.ts      # 编辑器状态
│   └── types/                   # 类型定义
│
├── resources/                   # 静态资源
│   ├── problems/               # 题库 JSON 文件
│   │   ├── basic.json          # 基础题库
│   │   ├── leetcode.json       # LeetCode 题库
│   │   └── ...                 # 其他来源题库
│   ├── knowledge/              # 知识库参考文档
│   ├── demo/                   # 演示内容
│   └── icons/                  # 应用图标
│
├── docs/                        # 项目文档
│   ├── quickstart.md           # 快速入门
│   ├── architecture.md         # 架构文档
│   └── api.md                  # API 参考
│
└── tests/                       # 测试
    ├── electron/               # 主进程测试
    └── src/                    # 渲染进程测试
```

## 核心模块交互流程

```
用户操作 --> React 组件 --> Zustand Store --> typedInvoke() --> Preload(安全检查) --> IPC Handler --> 业务逻辑
```

## 关键设计决策

1. **IPC 通信**: 使用 Electron 标准的 invoke/handle 模式，preload 层做白名单和序列化检查
2. **数据持久化**: SQLite + better-sqlite3，WAL 模式，支持自动 Schema 迁移
3. **状态管理**: Zustand 轻量级状态，每个功能模块独立 store
4. **代码执行**: 子进程隔离，10 秒超时，1MB 输出限制，禁止 shell 模式
5. **AI 集成**: 兼容 OpenAI API 格式，SSE 流式输出，API Key 使用 safeStorage 加密
