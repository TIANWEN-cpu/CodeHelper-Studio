# 数据库 Schema 参考

> 本文档为精简子集参考；唯一权威为 [docs/api/database-schema.md](../api/database-schema.md)，实际列、约束与迁移以 `electron/db/schema.sql` 为准。

CodeHelper 使用 SQLite（通过 `better-sqlite3`）作为本地数据库。数据库文件位于用户数据目录；除业务表外，知识库还使用 metadata、链接审计、维护运行和维护动作表完成治理闭环。

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

### `knowledge_doc_metadata` - 文档治理元数据

每个知识文档最多一行，保存规范标题、分类、来源、展示属性和内容 SHA-256；文档删除时级联删除。

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

**索引**:

```sql
CREATE INDEX idx_knowledge_doc_metadata_category
  ON knowledge_doc_metadata(category_key, category_label, doc_id);
CREATE INDEX idx_knowledge_doc_metadata_source
  ON knowledge_doc_metadata(source_repo, source_path, doc_id);
CREATE INDEX idx_knowledge_doc_metadata_hash
  ON knowledge_doc_metadata(content_sha256, doc_id);
```

---

### `knowledge_link_audit` - 链接审计

保存文档内链接的原始值、解析目标和审计结果。状态限定为 `reachable`、`not_found`、`temporary_error`、`restricted`、`malformed`、`unresolved_relative` 或 `unchecked`。

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

**索引**:

```sql
CREATE INDEX idx_knowledge_link_audit_doc
  ON knowledge_link_audit(doc_id, line_number, id);
CREATE INDEX idx_knowledge_link_audit_status
  ON knowledge_link_audit(status, checked_at, doc_id);
```

---

### `knowledge_maintenance_runs` - 维护运行

把一次维护绑定到不可变计划哈希和已验证备份，并记录清理前后数量。成功写入的终态为 `committed`。

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

### `knowledge_maintenance_actions` - 维护动作审计

保存每条删除或 metadata 更新动作的理由、来源和前后快照。`doc_id` 故意不设置外键，确保文档删除后审计记录仍然完整。

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

**索引**:

```sql
CREATE INDEX idx_knowledge_maintenance_runs_started
  ON knowledge_maintenance_runs(started_at DESC, id DESC);
CREATE INDEX idx_knowledge_maintenance_actions_run
  ON knowledge_maintenance_actions(run_id, id);
CREATE INDEX idx_knowledge_maintenance_actions_doc
  ON knowledge_maintenance_actions(doc_id, id);
```

真实库的受审维护必须遵循[知识库维护流程](../guides/knowledge-maintenance.md)，不能把直接 SQL 修改当作日常治理路径。

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
    ├──────── (1) knowledge_doc_metadata
    └──────── (N) knowledge_link_audit

knowledge_maintenance_runs (1) ──── (N) knowledge_maintenance_actions

ai_configs (standalone)

prompt_presets (standalone)

settings (standalone, key-value)
```

## 数据迁移策略

数据库初始化先执行幂等 `CREATE TABLE IF NOT EXISTS`，再运行组件级迁移。应用 schema 版本当前为 v2；从旧版本升级前先创建并验证 `pre-migration` 备份，再在事务内创建知识治理表、回填 metadata、运行 `quick_check` 并记录新版本。编辑器工作区另使用 `schema_migrations` 记录组件版本，当前为 v3：

- v1 draft 表在 `BEGIN IMMEDIATE` 事务内重建为版本化工作区表，保留打开/关闭标签、内容、revision、顺序、光标和滚动位置
- v2 表原地补齐 `tab_kind` 与 mutation 指纹列，再记录 v3；不要求删除数据库
- Renderer 的 localStorage 工作区格式当前为 v4，v1/v2/v3 快照在原位置校验、备份并升级；只有 `legacy_storage_version = 0` 的 SQLite 工作区会接收首次导入
- practice-backed 标签的旧内嵌代码先转换为确定性的普通恢复文件，再清空重复 content；事务失败时整体回滚
- 旧 `exercise_drafts` 在启动阶段原地补齐 `language`、`revision` 和 `deleted`，保留已有代码与时间戳，并把旧行初始化为 revision 1 的有效草稿；仓储访问仍会幂等复核
- `problems` 表仍通过 JSON 文件同步机制实现题目数据更新，该流程与编辑器 schema 迁移分开

迁移测试必须使用临时 `userData` / 数据库，不得连接用户真实数据。发布门禁应在重建 `better-sqlite3` 原生模块后运行仓储迁移测试，并至少保留一个从旧磁盘数据库完整启动、干净关闭后再检查 `schema_migrations` 和内容的 Electron E2E。

---

## See Also

- [数据库 Schema 参考](../reference/database-schema.md) -- 精简版 Schema 一览
- [架构文档 - 数据库设计](../architecture.md#数据库设计) -- 数据库设计详解
- [ADR-003: SQLite 选型](../adr/003-sqlite-choice.md) -- 数据库选型决策
- [知识库维护流程](../guides/knowledge-maintenance.md) -- 证据、计划、备份和事务写入边界
- [术语表](../glossary.md) -- WAL、Schema 迁移等术语
