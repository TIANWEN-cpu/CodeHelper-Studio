# 数据库 Schema

> 本文档为精简子集参考；唯一权威为 [docs/api/database-schema.md](../api/database-schema.md)，实际列、约束与迁移以 `electron/db/schema.sql` 为准。

本文档详细说明 CodeHelper 的 SQLite 数据库结构。

## 概述

- 数据库引擎：SQLite（通过 better-sqlite3 访问）
- 日志模式：WAL（Write-Ahead Logging）
- 外键约束：启用
- 数据库路径：
  - Windows: `%APPDATA%/codehelper/codehelper.db`
  - macOS: `~/Library/Application Support/codehelper/codehelper.db`
  - Linux: `~/.config/codehelper/codehelper.db`

## 表结构

### problems — 题目表

存储所有编程题目。

```sql
CREATE TABLE IF NOT EXISTS problems (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,                    -- 题目标题
  description   TEXT NOT NULL,                    -- 题目描述（Markdown）
  difficulty    TEXT CHECK(difficulty IN ('easy','medium','hard')),  -- 难度
  tags          TEXT DEFAULT '[]',                -- 标签（JSON 数组）
  languages     TEXT DEFAULT '["python"]',        -- 支持的语言（JSON 数组）
  examples      TEXT DEFAULT '[]',                -- 示例（JSON 数组）
  test_cases    TEXT DEFAULT '[]',                -- 测试用例（JSON 数组）
  starter_code  TEXT DEFAULT '{}',                -- 初始代码（JSON 对象）
  source        TEXT DEFAULT 'custom',            -- 来源
  tracks        TEXT DEFAULT '[]',                -- 专题（JSON 数组）
  platform      TEXT DEFAULT 'internal',          -- 平台
  mode          TEXT DEFAULT 'oj',                -- 模式（oj/simulation/data-task/case-study/report-task/practice）
  exam_style    TEXT DEFAULT 'acm',               -- 考试风格（acm/oa/modeling/hdl）
  year          INTEGER,                          -- 年份
  official_url  TEXT,                             -- 官方链接
  estimated_time INTEGER,                         -- 预估时间（分钟）
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**JSON 字段说明**：

| 字段         | 格式                                | 示例                                                |
| ------------ | ----------------------------------- | --------------------------------------------------- |
| tags         | `string[]`                          | `["数组", "哈希表"]`                                |
| languages    | `string[]`                          | `["python", "cpp", "java"]`                         |
| examples     | `{input, expected, explanation?}[]` | `[{"input": "[1,2]", "expected": "3"}]`             |
| test_cases   | `{input, expected}[]`               | `[{"input": "[1,2,3]", "expected": "6"}]`           |
| starter_code | `Record<string, string>`            | `{"python": "def solve(nums):\n", "cpp": "// ..."}` |
| tracks       | `string[]`                          | `["LeetCode Hot 100"]`                              |

---

### submissions — 提交记录表

存储代码提交和测试结果。

```sql
CREATE TABLE IF NOT EXISTS submissions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id        INTEGER REFERENCES problems(id),  -- 关联题目
  language          TEXT NOT NULL,                     -- 编程语言
  code              TEXT NOT NULL,                     -- 提交的代码
  status            TEXT CHECK(status IN (
    'accepted','wrong_answer','compile_error',
    'runtime_error','timeout'
  )),                                                  -- 提交状态
  passed_cases      INTEGER DEFAULT 0,                 -- 通过的测试用例数
  total_cases       INTEGER DEFAULT 0,                 -- 总测试用例数
  duration_ms       INTEGER,                           -- 总耗时（ms）
  execution_time_ms INTEGER,                           -- 执行时间（ms）
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**状态枚举**：

| 状态            | 含义           |
| --------------- | -------------- |
| `accepted`      | 全部通过       |
| `wrong_answer`  | 输出与期望不符 |
| `compile_error` | 编译错误       |
| `runtime_error` | 运行时错误     |
| `timeout`       | 执行超时       |

---

### mistakes — 错题表

记录用户的错题，与题目一一关联。

```sql
CREATE TABLE IF NOT EXISTS mistakes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id      INTEGER REFERENCES problems(id) UNIQUE,  -- 唯一关联题目
  error_count     INTEGER DEFAULT 1,               -- 错误次数
  error_types     TEXT DEFAULT '[]',               -- 错误类型（JSON 数组）
  last_wrong_code TEXT,                            -- 最近一次错误代码
  correct_code    TEXT,                            -- 正确代码
  ai_analysis     TEXT,                            -- AI 分析内容
  review_count    INTEGER DEFAULT 0,               -- 复习次数
  next_review_at  DATETIME,                        -- 下次复习时间
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### ai_configs — AI 配置表

存储 AI 模型配置，API Key 使用 safeStorage 加密。

```sql
CREATE TABLE IF NOT EXISTS ai_configs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,                               -- 配置名称
  api_key    TEXT NOT NULL,                               -- API Key（加密存储）
  base_url   TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',  -- API 基础 URL
  model      TEXT NOT NULL DEFAULT 'gpt-4o',              -- 模型名
  is_default INTEGER DEFAULT 0,                           -- 是否默认配置
  task_type  TEXT,                                        -- 任务类型
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**加密说明**：

- API Key 使用 Electron `safeStorage` 加密存储
- 加密后的值以 `enc:` 前缀标识
- 读取时自动解密后返回给渲染进程

---

### chat_sessions — 聊天会话表

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            TEXT PRIMARY KEY,              -- 会话 ID（时间戳生成）
  title         TEXT NOT NULL DEFAULT '新对话', -- 会话标题
  system_prompt TEXT DEFAULT '',               -- 系统提示词
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### chat_history — 聊天历史表

```sql
CREATE TABLE IF NOT EXISTS chat_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,                         -- 关联会话 ID
  role       TEXT CHECK(role IN ('user','assistant','system')),  -- 角色
  content    TEXT NOT NULL,                         -- 消息内容
  model      TEXT,                                  -- 使用的模型
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### knowledge_docs — 知识库文档表

```sql
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL,           -- 文件名
  file_type   TEXT,                    -- 文件类型（txt/md/pdf）
  content     TEXT,                    -- 原始内容
  chunk_count INTEGER DEFAULT 0,       -- 分块数量
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### knowledge_chunks — 知识库分块表

```sql
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id      INTEGER REFERENCES knowledge_docs(id) ON DELETE CASCADE,  -- 关联文档
  content     TEXT NOT NULL,           -- 分块内容
  embedding   TEXT,                    -- 向量嵌入（预留）
  chunk_index INTEGER,                 -- 分块序号
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### knowledge_doc_metadata — 知识文档治理元数据

为知识文档保存规范标题、分类、来源、可见性和内容哈希。每个文档最多一行，删除文档时级联删除。

```sql
CREATE TABLE IF NOT EXISTS knowledge_doc_metadata (
  doc_id INTEGER PRIMARY KEY REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  display_title TEXT NOT NULL CHECK(length(trim(display_title)) > 0),
  source_repo TEXT,
  source_url TEXT,
  source_path TEXT,
  source_commit TEXT,
  category_key TEXT,
  category_label TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid(tags_json) AND json_type(tags_json) = 'array'),
  import_target TEXT,
  generated_at TEXT,
  document_kind TEXT NOT NULL DEFAULT 'document'
    CHECK(length(trim(document_kind)) > 0),
  visibility TEXT NOT NULL DEFAULT 'local'
    CHECK(length(trim(visibility)) > 0),
  content_sha256 TEXT NOT NULL
    CHECK(length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

---

### knowledge_link_audit — 知识文档链接审计

记录 Markdown 链接的原始目标、解析结果和审计状态。`raw_target` 保留展示值，`resolved_target` 用于状态查询。

```sql
CREATE TABLE IF NOT EXISTS knowledge_link_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK(line_number >= 1),
  raw_target TEXT NOT NULL CHECK(length(trim(raw_target)) > 0),
  resolved_target TEXT,
  link_kind TEXT NOT NULL CHECK(length(trim(link_kind)) > 0),
  status TEXT NOT NULL DEFAULT 'unchecked'
    CHECK(status IN (
      'reachable','not_found','temporary_error','restricted',
      'malformed','unresolved_relative','unchecked'
    )),
  http_status INTEGER CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
  checked_at TEXT,
  detail TEXT,
  UNIQUE(doc_id, line_number, raw_target)
);
```

---

### knowledge_maintenance_runs — 知识库维护运行

记录每次受审维护的计划哈希、备份路径、清理前后数量和终态。成功写入的终态为 `committed`。

```sql
CREATE TABLE IF NOT EXISTS knowledge_maintenance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE CHECK(length(trim(run_key)) > 0),
  plan_sha256 TEXT NOT NULL
    CHECK(length(plan_sha256) = 64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
  operation TEXT NOT NULL CHECK(length(trim(operation)) > 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','committed')),
  backup_path TEXT,
  report_path TEXT,
  before_doc_count INTEGER CHECK(before_doc_count IS NULL OR before_doc_count >= 0),
  after_doc_count INTEGER CHECK(after_doc_count IS NULL OR after_doc_count >= 0),
  before_chunk_count INTEGER CHECK(before_chunk_count IS NULL OR before_chunk_count >= 0),
  after_chunk_count INTEGER CHECK(after_chunk_count IS NULL OR after_chunk_count >= 0),
  summary_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(summary_json) AND json_type(summary_json) = 'object'),
  notes TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);
```

---

### knowledge_maintenance_actions — 知识库维护动作

保存每条删除或 metadata 更新动作的理由、来源和前后快照。`doc_id` 不设置外键，以便文档删除后仍保留审计证据。

```sql
CREATE TABLE IF NOT EXISTS knowledge_maintenance_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES knowledge_maintenance_runs(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL CHECK(length(trim(action_id)) > 0),
  doc_id INTEGER,
  keep_doc_id INTEGER,
  action_type TEXT NOT NULL CHECK(length(trim(action_type)) > 0),
  reason_code TEXT NOT NULL CHECK(length(trim(reason_code)) > 0),
  reason_detail TEXT,
  filename TEXT NOT NULL CHECK(length(trim(filename)) > 0),
  display_title TEXT,
  source_repo TEXT,
  source_url TEXT,
  source_path TEXT,
  source_commit TEXT,
  category_key TEXT,
  category_label TEXT,
  content_sha256 TEXT
    CHECK(content_sha256 IS NULL OR
      (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  before_content_sha256 TEXT
    CHECK(before_content_sha256 IS NULL OR
      (length(before_content_sha256) = 64 AND before_content_sha256 NOT GLOB '*[^0-9a-f]*')),
  after_content_sha256 TEXT
    CHECK(after_content_sha256 IS NULL OR
      (length(after_content_sha256) = 64 AND after_content_sha256 NOT GLOB '*[^0-9a-f]*')),
  before_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(before_json) AND json_type(before_json) = 'object'),
  after_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(after_json) AND json_type(after_json) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(run_id, action_id)
);
```

完整维护步骤和证据边界见[知识库维护流程](../guides/knowledge-maintenance.md)。

---

### settings — 设置表

通用键值对存储。

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,    -- 设置键
  value TEXT NOT NULL        -- 设置值
);
```

**常用设置键**：

| 键         | 值                          | 说明     |
| ---------- | --------------------------- | -------- |
| `ui-theme` | `mocha` / `fjord` / `ember` | 当前主题 |

---

### prompt_presets — 提示词预设表

```sql
CREATE TABLE IF NOT EXISTS prompt_presets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,              -- 预设名称
  prompt     TEXT NOT NULL,              -- 提示词内容
  is_builtin INTEGER DEFAULT 0,         -- 是否内置（内置不可删除/编辑）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### memories — 记忆表

AI 对话的长期记忆存储。

```sql
CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content     TEXT NOT NULL,               -- 记忆内容
  category    TEXT NOT NULL DEFAULT 'general',  -- 分类
  source      TEXT NOT NULL DEFAULT 'manual',   -- 来源（manual/chat/extract）
  source_ref  TEXT,                         -- 来源引用（如会话 ID）
  pinned      INTEGER DEFAULT 0,           -- 是否置顶
  enabled     INTEGER DEFAULT 1,           -- 是否启用
  confidence  REAL DEFAULT 1,              -- 置信度（0-1）
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME                    -- 最后使用时间
);
```

**记忆分类**：

| 分类         | 说明       |
| ------------ | ---------- |
| `general`    | 通用记忆   |
| `preference` | 用户偏好   |
| `context`    | 上下文信息 |
| `skill`      | 技能水平   |

## 索引

```sql
-- 题目查询优化
CREATE INDEX idx_problems_source ON problems(source);
CREATE INDEX idx_problems_platform ON problems(platform);
CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_problems_mode ON problems(mode);

-- 提交记录查询优化
CREATE INDEX idx_submissions_problem_status ON submissions(problem_id, status);
CREATE INDEX idx_submissions_problem_id ON submissions(problem_id);

-- 错题查询优化
CREATE INDEX idx_mistakes_problem_id ON mistakes(problem_id);

-- 知识库分块查询优化
CREATE INDEX idx_knowledge_chunks_doc_id ON knowledge_chunks(doc_id);
CREATE INDEX idx_knowledge_doc_metadata_category
  ON knowledge_doc_metadata(category_key, category_label, doc_id);
CREATE INDEX idx_knowledge_doc_metadata_source
  ON knowledge_doc_metadata(source_repo, source_path, doc_id);
CREATE INDEX idx_knowledge_doc_metadata_hash
  ON knowledge_doc_metadata(content_sha256, doc_id);
CREATE INDEX idx_knowledge_link_audit_doc
  ON knowledge_link_audit(doc_id, line_number, id);
CREATE INDEX idx_knowledge_link_audit_status
  ON knowledge_link_audit(status, checked_at, doc_id);
CREATE INDEX idx_knowledge_maintenance_runs_started
  ON knowledge_maintenance_runs(started_at DESC, id DESC);
CREATE INDEX idx_knowledge_maintenance_actions_run
  ON knowledge_maintenance_actions(run_id, id);
CREATE INDEX idx_knowledge_maintenance_actions_doc
  ON knowledge_maintenance_actions(doc_id, id);

-- 聊天历史查询优化
CREATE INDEX idx_chat_history_session ON chat_history(session_id, created_at, id);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- 记忆查询优化
CREATE INDEX idx_memories_enabled_pinned ON memories(enabled, pinned DESC, updated_at DESC);
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_content_lower ON memories(lower(content));
```

## Schema 迁移

`electron/db/index.ts` 中的 `ensureSchemaColumns()` 函数负责增量迁移，检查 `problems` 表是否缺少新列并自动添加：

```typescript
function ensureSchemaColumns(database: Database.Database) {
  const columns = database.prepare('PRAGMA table_info(problems)').all()
  const existing = new Set(columns.map((c) => c.name))
  const additions = [
    { name: 'tracks', sql: "ALTER TABLE problems ADD COLUMN tracks TEXT DEFAULT '[]'" },
    { name: 'platform', sql: "ALTER TABLE problems ADD COLUMN platform TEXT DEFAULT 'internal'" },
    { name: 'mode', sql: "ALTER TABLE problems ADD COLUMN mode TEXT DEFAULT 'oj'" },
    // ...
  ]
  for (const item of additions) {
    if (!existing.has(item.name)) {
      database.exec(item.sql)
    }
  }
}
```

## ER 关系图

```
problems (1) ──→ (N) submissions     提交记录
problems (1) ──→ (1) mistakes        错题记录（UNIQUE）

chat_sessions (1) ──→ (N) chat_history    聊天消息
knowledge_docs (1) ──→ (N) knowledge_chunks  文档分块
knowledge_docs (1) ──→ (1) knowledge_doc_metadata  分类与来源元数据
knowledge_docs (1) ──→ (N) knowledge_link_audit  链接审计
knowledge_maintenance_runs (1) ──→ (N) knowledge_maintenance_actions  动作审计

ai_configs    独立配置表
settings      键值设置表
prompt_presets 提示词预设
memories      长期记忆（独立）
```

---

## See Also

- [架构文档 - 数据库设计](../architecture.md#数据库设计) -- 完整表结构与 Schema 迁移
- [API 参考 - 数据库 Schema](../api.md#数据库-schema) -- Schema 概览
- [IPC 通道参考](ipc-channels.md) -- 数据库操作的 IPC 通道
- [ADR-003: SQLite 选型](../adr/003-sqlite-choice.md) -- 为什么选择 better-sqlite3
- [数据库 Schema (开发者指南)](../developer-guide/database-schema.md) -- 面向开发者的数据库文档
- [知识库维护流程](../guides/knowledge-maintenance.md) -- 证据绑定、备份、应用与验证
- [术语表](../glossary.md) -- WAL、Schema 迁移等术语解释
