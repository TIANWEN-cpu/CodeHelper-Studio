# CodeHelper AI 助手大改进

## Context

用户反馈 AI 助手功能太基础：没有回复动画、没有聊天管理、没有记忆、没有预设提示词。需要参考 Cherry Studio 等开源 AI 助手的功能水平。

## 改动清单

### 1. 聊天会话管理系统

- 左侧会话列表面板（可收起）
- 新建/删除/重命名会话
- 会话持久化到 SQLite（chat_sessions 表）
- 消息持久化到 chat_history 表
- 重启后恢复所有会话

**新增数据库表：**

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新对话',
  system_prompt TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**修改文件：**

- `electron/db/schema.sql` — 添加 chat_sessions 表
- `electron/ipc/chat.ts` — 新建：会话 CRUD + 消息持久化 IPC
- `electron/main.ts` — 注册新 IPC

### 2. chatStore 重构

- 支持多会话（sessions 列表 + activeSessionId）
- 消息从 DB 加载
- 发送消息时自动保存到 DB
- AI 回复完成后保存到 DB

**修改文件：**

- `src/stores/chatStore.ts` — 完全重写

### 3. ChatView 重构

- 左侧：会话列表（新建、切换、删除、重命名）
- 右侧：当前对话（消息 + 输入）
- 顶部：模型选择 + 预设提示词选择
- Markdown 渲染（安装 react-markdown + remark-gfm）
- 代码块语法高亮

**修改文件：**

- `src/modules/ai-chat/ChatView.tsx` — 完全重写
- `src/modules/ai-chat/SessionList.tsx` — 新建：会话列表
- `src/modules/ai-chat/MessageBubble.tsx` — 新建：消息气泡（Markdown）

### 4. 预设提示词系统

- 内置几个预设：通用助手、代码专家、面试官、学习导师
- 用户可自定义预设（存 SQLite settings 表）
- 新建会话时可选择预设
- 预设作为 system prompt 发送

**新增数据库表：**

```sql
CREATE TABLE IF NOT EXISTS prompt_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  is_builtin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5. 依赖安装

```bash
npm install react-markdown remark-gfm react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

## 修改文件列表

1. `electron/db/schema.sql` — 新增 chat_sessions + prompt_presets 表
2. `electron/ipc/chat.ts` — 新建：会话+消息+预设 IPC
3. `electron/main.ts` — 注册 chat IPC
4. `src/stores/chatStore.ts` — 完全重写：多会话+持久化
5. `src/modules/ai-chat/ChatView.tsx` — 完全重写：左右分栏
6. `src/modules/ai-chat/SessionList.tsx` — 新建：会话列表
7. `src/modules/ai-chat/MessageBubble.tsx` — 新建：Markdown 消息渲染

## 验证

1. `npm run dev` 启动
2. 新建多个对话会话，切换正常
3. 发送消息，AI 回复有 Markdown 渲染
4. 关闭重启，会话和消息恢复
5. 预设提示词可选择和自定义
