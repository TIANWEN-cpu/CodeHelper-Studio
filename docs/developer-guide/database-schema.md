# 数据库 Schema 参考

CodeHelper 使用 SQLite（通过 `better-sqlite3`）作为本地数据库，共 11 张表。数据库文件位于用户数据目录。

## 数据库位置

| 操作系统 | 路径                                                     |
| -------- | -------------------------------------------------------- |
| Windows  | `%APPDATA%/codehelper/codehelper.db`                     |
| macOS    | `~/Library/Application Support/codehelper/codehelper.db` |
| Linux    | `~/.config/codehelper/codehelper.db`                     |

---

## 表结构

### `problems` - 题目信息

存储所有编程题目信息，启动时从 `resources/problems/*.json` 自动同步。

```sql
CREATE TABLE IF NOT EXISTS problems (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,                              -- 题目标题
  description     TEXT NOT NULL,                              -- 题目描述（Markdown）
  difficulty      TEXT CHECK(difficulty IN ('easy','medium','hard')),  -- 难度
  tags            TEXT DEFAULT '[]',                          -- 标签 JSON 数组
  languages       TEXT DEFAULT '["python"]',                  -- 支持的语言 JSON 数组
  examples        TEXT DEFAULT '[]',                          -- 示例 JSON 数组
  test_cases      TEXT DEFAULT '[]',                          -- 测试用例 JSON 数组
  starter_code    TEXT DEFAULT '{}',                          -- 初始代码 JSON 对象
  source          TEXT DEFAULT 'custom',                      -- 来源标识
  tracks          TEXT DEFAULT '[]',                          -- 赛道 JSON 数组
  platform        TEXT DEFAULT 'internal',                    -- 平台标识
  mode            TEXT DEFAULT 'oj',                          -- 题目模式
  exam_style      TEXT DEFAULT 'acm',                         -- 考试风格
  year            INTEGER,                                    -- 年份（可选）
  official_url    TEXT,                                       -- 官方链接（可选）
  estimated_time  INTEGER,                                    -- 预估时间（分钟）
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP          -- 创建时间
);
```

**索引**:

```sql
CREATE INDEX idx_problems_source ON problems(source);
CREATE INDEX idx_problems_platform ON problems(platform);
CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_problems_mode ON problems(mode);
```

**数据来源**:

- `resources/problems/basic.json` - 基础题 48 道
- `resources/problems/leetcode.json` - 力扣经典 80 道
- `resources/problems/math-modeling.json` - 数学建模 30 道

---

### `submissions` - 代码提交记录

记录每次代码提交和判题结果。

```sql
CREATE TABLE IF NOT EXISTS submissions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id        INTEGER REFERENCES problems(id),          -- 关联题目
  language          TEXT NOT NULL,                            -- 编程语言
  code              TEXT NOT NULL,                            -- 提交的代码
  status            TEXT CHECK(status IN (
                      'accepted','wrong_answer',
                      'compile_error','runtime_error','timeout'
                    )),                                       -- 判题结果
  passed_cases      INTEGER DEFAULT 0,                        -- 通过用例数
  total_cases       INTEGER DEFAULT 0,                        -- 总用例数
  duration_ms       INTEGER,                                  -- 总耗时（毫秒）
  execution_time_ms INTEGER,                                  -- 执行时间（预留）
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP        -- 提交时间
);
```

**索引**:

```sql
CREATE INDEX idx_submissions_problem_status ON submissions(problem_id, status);
CREATE INDEX idx_submissions_problem_id ON submissions(problem_id);
```

---

### `mistakes` - 错题记录

自动收集失败的代码提交，追踪错误模式。

```sql
CREATE TABLE IF NOT EXISTS mistakes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id      INTEGER REFERENCES problems(id) UNIQUE,     -- 关联题目（唯一）
  error_count     INTEGER DEFAULT 1,                           -- 累计错误次数
  error_types     TEXT DEFAULT '[]',                           -- 错误类型 JSON 数组
  last_wrong_code TEXT,                                        -- 最后错误代码
  correct_code    TEXT,                                        -- 正确代码（通过后更新）
  ai_analysis     TEXT,                                        -- AI 分析结果
  review_count    INTEGER DEFAULT 0,                           -- 复习次数
  next_review_at  DATETIME,                                    -- 下次复习时间（预留）
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,          -- 创建时间
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP           -- 更新时间
);
```

**索引**:

```sql
CREATE INDEX idx_mistakes_problem_id ON mistakes(problem_id);
```

---

### `ai_configs` - AI 模型配置

存储 API 配置信息，API Key 使用 `safeStorage` 加密存储。

```sql
CREATE TABLE IF NOT EXISTS ai_configs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,                                   -- 配置名称
  api_key     TEXT NOT NULL,                                   -- API Key（加密存储）
  base_url    TEXT NOT NULL DEFAULT 'https://api.openai.com/v1', -- API 基础地址
  model       TEXT NOT NULL DEFAULT 'gpt-4o',                  -- 模型名称
  is_default  INTEGER DEFAULT 0,                               -- 是否默认（0/1）
  task_type   TEXT,                                            -- 任务类型（可选）
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP               -- 创建时间
);
```

---

### `chat_sessions` - 聊天会话

存储 AI 对话的会话信息。

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            TEXT PRIMARY KEY,                              -- 会话 ID（UUID）
  title         TEXT NOT NULL DEFAULT '新对话',                -- 会话标题
  system_prompt TEXT DEFAULT '',                               -- 系统提示词
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,            -- 创建时间
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP             -- 更新时间
);
```

**索引**:

```sql
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
```

---

### `chat_history` - 聊天消息历史

存储所有聊天消息。

```sql
CREATE TABLE IF NOT EXISTS chat_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,                                   -- 关联会话 ID
  role        TEXT CHECK(role IN ('user','assistant','system')), -- 角色
  content     TEXT NOT NULL,                                   -- 消息内容
  model       TEXT,                                            -- 使用的模型（可选）
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP               -- 创建时间
);
```

**索引**:

```sql
CREATE INDEX idx_chat_history_session ON chat_history(session_id, created_at, id);
```

---

### `prompt_presets` - 预设提示词

存储内置和自定义的提示词模板。

```sql
CREATE TABLE IF NOT EXISTS prompt_presets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,                                   -- 预设名称
  prompt      TEXT NOT NULL,                                   -- 提示词内容
  is_builtin  INTEGER DEFAULT 0,                               -- 是否内置（0/1）
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP               -- 创建时间
);
```

---

### `knowledge_docs` - 知识库文档

存储导入的文档元数据和原始内容。

```sql
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL,                                   -- 文件名
  file_type   TEXT,                                            -- 文件类型（.txt/.md/.pdf）
  content     TEXT,                                            -- 原始内容
  chunk_count INTEGER DEFAULT 0,                               -- 分块数量
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP               -- 导入时间
);
```

---

### `knowledge_chunks` - 文档分块

存储文档的文本分块，用于检索。

```sql
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id      INTEGER REFERENCES knowledge_docs(id) ON DELETE CASCADE, -- 关联文档
  content     TEXT NOT NULL,                                   -- 分块内容
  embedding   TEXT,                                            -- 向量嵌入（预留）
  chunk_index INTEGER,                                        -- 分块序号
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP               -- 创建时间
);
```

**索引**:

```sql
CREATE INDEX idx_knowledge_chunks_doc_id ON knowledge_chunks(doc_id);
```

---

### `memories` - 长期记忆

存储 AI 对话的长期记忆信息。

```sql
CREATE TABLE IF NOT EXISTS memories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  content      TEXT NOT NULL,                                  -- 记忆内容
  category     TEXT NOT NULL DEFAULT 'general',                -- 分类
  source       TEXT NOT NULL DEFAULT 'manual',                 -- 来源（manual/chat）
  source_ref   TEXT,                                           -- 来源引用（如会话 ID）
  pinned       INTEGER DEFAULT 0,                              -- 是否置顶（0/1）
  enabled      INTEGER DEFAULT 1,                              -- 是否启用（0/1）
  confidence   REAL DEFAULT 1,                                 -- 置信度（0-1）
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,             -- 创建时间
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,             -- 更新时间
  last_used_at DATETIME                                        -- 最后使用时间
);
```

**索引**:

```sql
CREATE INDEX idx_memories_enabled_pinned ON memories(enabled, pinned DESC, updated_at DESC);
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_content_lower ON memories(lower(content));
```

---

### `settings` - 用户设置

键值对形式存储应用设置。

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,                                      -- 设置键名
  value TEXT NOT NULL                                          -- 设置值
);
```

---

## 实体关系图

```
problems (1) ──── (N) submissions
    │
    │ (1:1, UNIQUE)
    ▼
mistakes (1) ──── (N) error_types [JSON]

chat_sessions (1) ──── (N) chat_history
    │
    │ via session_id
    ▼
memories (source_ref → session_id)

knowledge_docs (1) ──── (N) knowledge_chunks
    │                      (ON DELETE CASCADE)
    ▼
ai_configs (standalone)

prompt_presets (standalone)

settings (standalone, key-value)
```

## 数据迁移策略

当前版本没有自动迁移机制。Schema 变更通过以下方式处理：

- 使用 `CREATE TABLE IF NOT EXISTS` 确保表存在
- 新增字段时在应用层处理缺失值
- `problems` 表通过 JSON 文件同步机制实现数据更新

---

## See Also

- [数据库 Schema 参考](../reference/database-schema.md) -- 精简版 Schema 一览
- [架构文档 - 数据库设计](../architecture.md#数据库设计) -- 数据库设计详解
- [ADR-003: SQLite 选型](../adr/003-sqlite-choice.md) -- 数据库选型决策
- [术语表](../glossary.md) -- WAL、Schema 迁移等术语
