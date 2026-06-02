# 数据库 Schema 文档

CodeHelper 使用 better-sqlite3 作为嵌入式数据库，存储所有本地数据。数据库文件随 Electron 应用一同管理。

---

## 目录

- [概述](#概述)
- [表结构](#表结构)
  - [problems — 题目表](#problems--题目表)
  - [submissions — 提交记录表](#submissions--提交记录表)
  - [mistakes — 错题本表](#mistakes--错题本表)
  - [ai_configs — AI 配置表](#ai_configs--ai-配置表)
  - [chat_sessions — 聊天会话表](#chat_sessions--聊天会话表)
  - [chat_history — 聊天消息表](#chat_history--聊天消息表)
  - [knowledge_docs — 知识文档表](#knowledge_docs--知识文档表)
  - [knowledge_chunks — 知识分块表](#knowledge_chunks--知识分块表)
  - [settings — 设置表](#settings--设置表)
  - [prompt_presets — 提示词预设表](#prompt_presets--提示词预设表)
  - [memories — 长期记忆表](#memories--长期记忆表)
- [关系图](#关系图)
- [索引](#索引)
- [常用查询](#常用查询)
- [数据约定](#数据约定)

---

## 概述

- **引擎**：SQLite 3（通过 better-sqlite3 绑定）
- **字符集**：UTF-8
- **时间格式**：`CURRENT_TIMESTAMP`（ISO 8601 格式：`YYYY-MM-DD HH:MM:SS`）
- **JSON 字段**：多个表使用 `TEXT` 列存储 JSON 字符串（`tags`、`languages`、`test_cases` 等）
- **加密**：`ai_configs.api_key` 字段通过 Electron `safeStorage` 加密存储（前缀 `enc:`）

---

## 表结构

### problems — 题目表

存储所有编程题目信息。

| 列名             | 类型     | 约束                      | 默认值              | 说明                                                                       |
| ---------------- | -------- | ------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `id`             | INTEGER  | PRIMARY KEY AUTOINCREMENT | —                   | 题目 ID                                                                    |
| `title`          | TEXT     | NOT NULL                  | —                   | 题目标题                                                                   |
| `description`    | TEXT     | NOT NULL                  | —                   | 题目描述（支持 Markdown）                                                  |
| `difficulty`     | TEXT     | CHECK(IN)                 | —                   | 难度：`easy` / `medium` / `hard`                                           |
| `tags`           | TEXT     | —                         | `'[]'`              | 标签（JSON 数组）                                                          |
| `languages`      | TEXT     | —                         | `'["python"]'`      | 支持的语言（JSON 数组）                                                    |
| `examples`       | TEXT     | —                         | `'[]'`              | 示例输入输出（JSON 数组）                                                  |
| `test_cases`     | TEXT     | —                         | `'[]'`              | 测试用例（JSON 数组）                                                      |
| `starter_code`   | TEXT     | —                         | `'{}'`              | 初始代码模板（JSON 对象，键为语言）                                        |
| `source`         | TEXT     | —                         | `'custom'`          | 题目来源（如 `leetcode`、`builtin`）                                       |
| `tracks`         | TEXT     | —                         | `'[]'`              | 所属学习路径（JSON 数组）                                                  |
| `platform`       | TEXT     | —                         | `'internal'`        | 来源平台（如 `pat`、`nowcoder`）                                           |
| `mode`           | TEXT     | —                         | `'oj'`              | 题目模式：`oj` / `simulation` / `data-task` / `case-study` / `report-task` |
| `exam_style`     | TEXT     | —                         | `'acm'`             | 考试风格：`acm` / `oa` / `modeling` / `hdl`                                |
| `year`           | INTEGER  | —                         | `NULL`              | 年份                                                                       |
| `official_url`   | TEXT     | —                         | `NULL`              | 官方链接                                                                   |
| `estimated_time` | INTEGER  | —                         | `NULL`              | 预计用时（分钟）                                                           |
| `created_at`     | DATETIME | —                         | `CURRENT_TIMESTAMP` | 创建时间                                                                   |

**JSON 字段格式：**

```json
// tags
["数组", "排序", "二分查找"]

// languages
["python", "sql", "java"]

// examples
[{"input": "3", "output": "6", "explanation": "3的阶乘"}]

// test_cases
[{"input": "5", "expected": "120"}, {"input": "0", "expected": "1"}]

// starter_code
{"python": "def solve(n):\n    pass", "java": "class Solution { }"}

// tracks
["postgrad-retest", "algo-job"]
```

---

### submissions — 提交记录表

记录每次代码提交的执行结果。

| 列名                | 类型     | 约束                      | 默认值              | 说明                                                                              |
| ------------------- | -------- | ------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| `id`                | INTEGER  | PRIMARY KEY AUTOINCREMENT | —                   | 提交 ID                                                                           |
| `problem_id`        | INTEGER  | REFERENCES problems(id)   | —                   | 关联题目                                                                          |
| `language`          | TEXT     | NOT NULL                  | —                   | 编程语言                                                                          |
| `code`              | TEXT     | NOT NULL                  | —                   | 提交的代码                                                                        |
| `status`            | TEXT     | CHECK(IN)                 | —                   | 状态：`accepted` / `wrong_answer` / `compile_error` / `runtime_error` / `timeout` |
| `passed_cases`      | INTEGER  | —                         | `0`                 | 通过的测试用例数                                                                  |
| `total_cases`       | INTEGER  | —                         | `0`                 | 总测试用例数                                                                      |
| `duration_ms`       | INTEGER  | —                         | —                   | 执行耗时（毫秒）                                                                  |
| `execution_time_ms` | INTEGER  | —                         | —                   | 纯执行时间（毫秒）                                                                |
| `created_at`        | DATETIME | —                         | `CURRENT_TIMESTAMP` | 提交时间                                                                          |

---

### mistakes — 错题本表

记录用户的错题信息，每题最多一条记录（`problem_id` 唯一）。

| 列名              | 类型     | 约束                           | 默认值              | 说明                       |
| ----------------- | -------- | ------------------------------ | ------------------- | -------------------------- |
| `id`              | INTEGER  | PRIMARY KEY AUTOINCREMENT      | —                   | 错题 ID                    |
| `problem_id`      | INTEGER  | REFERENCES problems(id) UNIQUE | —                   | 关联题目（唯一）           |
| `error_count`     | INTEGER  | —                              | `1`                 | 累计错误次数               |
| `error_types`     | TEXT     | —                              | `'[]'`              | 错误类型列表（JSON 数组）  |
| `last_wrong_code` | TEXT     | —                              | —                   | 最后一次错误代码           |
| `correct_code`    | TEXT     | —                              | `NULL`              | 正确代码（题目通过后写入） |
| `ai_analysis`     | TEXT     | —                              | `NULL`              | AI 生成的错题分析          |
| `review_count`    | INTEGER  | —                              | `0`                 | 复习次数                   |
| `next_review_at`  | DATETIME | —                              | `NULL`              | 下次复习时间               |
| `created_at`      | DATETIME | —                              | `CURRENT_TIMESTAMP` | 创建时间                   |
| `updated_at`      | DATETIME | —                              | `CURRENT_TIMESTAMP` | 更新时间                   |

**error_types 示例：** `["wrong_answer", "runtime_error"]`

---

### ai_configs — AI 配置表

存储 AI 模型的连接配置。API Key 使用 Electron `safeStorage` 加密。

| 列名         | 类型     | 约束                      | 默认值                        | 说明                             |
| ------------ | -------- | ------------------------- | ----------------------------- | -------------------------------- |
| `id`         | INTEGER  | PRIMARY KEY AUTOINCREMENT | —                             | 配置 ID                          |
| `name`       | TEXT     | NOT NULL                  | —                             | 配置名称（如 "GPT-4o"）          |
| `api_key`    | TEXT     | NOT NULL                  | —                             | API Key（加密存储，前缀 `enc:`） |
| `base_url`   | TEXT     | NOT NULL                  | `'https://api.openai.com/v1'` | API 基础 URL                     |
| `model`      | TEXT     | NOT NULL                  | `'gpt-4o'`                    | 模型名称                         |
| `is_default` | INTEGER  | —                         | `0`                           | 是否为默认配置（0/1）            |
| `task_type`  | TEXT     | —                         | `NULL`                        | 任务类型                         |
| `created_at` | DATETIME | —                         | `CURRENT_TIMESTAMP`           | 创建时间                         |

**加密机制：**

- 写入时：`'enc:' + base64(safeStorage.encryptString(apiKey))`
- 读取时：若前缀为 `enc:` 则解密，否则原样返回
- 加密不可用时（如 Linux 无密钥环）：明文存储

---

### chat_sessions — 聊天会话表

| 列名            | 类型     | 约束        | 默认值              | 说明                                   |
| --------------- | -------- | ----------- | ------------------- | -------------------------------------- |
| `id`            | TEXT     | PRIMARY KEY | —                   | 会话 ID（格式：`session-{timestamp}`） |
| `title`         | TEXT     | NOT NULL    | `'新对话'`          | 会话标题                               |
| `system_prompt` | TEXT     | —           | `''`                | 系统提示词                             |
| `created_at`    | DATETIME | —           | `CURRENT_TIMESTAMP` | 创建时间                               |
| `updated_at`    | DATETIME | —           | `CURRENT_TIMESTAMP` | 最后更新时间                           |

---

### chat_history — 聊天消息表

| 列名         | 类型     | 约束                      | 默认值              | 说明                                  |
| ------------ | -------- | ------------------------- | ------------------- | ------------------------------------- |
| `id`         | INTEGER  | PRIMARY KEY AUTOINCREMENT | —                   | 消息 ID                               |
| `session_id` | TEXT     | NOT NULL                  | —                   | 关联会话 ID                           |
| `role`       | TEXT     | CHECK(IN)                 | —                   | 角色：`user` / `assistant` / `system` |
| `content`    | TEXT     | NOT NULL                  | —                   | 消息内容                              |
| `model`      | TEXT     | —                         | `NULL`              | 使用的模型名                          |
| `created_at` | DATETIME | —                         | `CURRENT_TIMESTAMP` | 发送时间                              |

**注意：** `session_id` 未声明外键约束，但逻辑上关联 `chat_sessions.id`。删除会话时由应用层级联删除消息。

---

### knowledge_docs — 知识文档表

| 列名          | 类型     | 约束                      | 默认值              | 说明                                |
| ------------- | -------- | ------------------------- | ------------------- | ----------------------------------- |
| `id`          | INTEGER  | PRIMARY KEY AUTOINCREMENT | —                   | 文档 ID                             |
| `filename`    | TEXT     | NOT NULL                  | —                   | 文件名                              |
| `file_type`   | TEXT     | —                         | —                   | 文件类型（`.txt` / `.md` / `.pdf`） |
| `content`     | TEXT     | —                         | —                   | 文档全文                            |
| `chunk_count` | INTEGER  | —                         | `0`                 | 分块数量                            |
| `created_at`  | DATETIME | —                         | `CURRENT_TIMESTAMP` | 上传时间                            |

---

### knowledge_chunks — 知识分块表

文档分块存储，用于关键词搜索。

| 列名          | 类型     | 约束                                            | 默认值              | 说明                             |
| ------------- | -------- | ----------------------------------------------- | ------------------- | -------------------------------- |
| `id`          | INTEGER  | PRIMARY KEY AUTOINCREMENT                       | —                   | 分块 ID                          |
| `doc_id`      | INTEGER  | REFERENCES knowledge_docs(id) ON DELETE CASCADE | —                   | 关联文档                         |
| `content`     | TEXT     | NOT NULL                                        | —                   | 分块内容                         |
| `embedding`   | TEXT     | —                                               | `NULL`              | 向量嵌入（预留字段，当前未使用） |
| `chunk_index` | INTEGER  | —                                               | —                   | 分块序号（从 0 开始）            |
| `created_at`  | DATETIME | —                                               | `CURRENT_TIMESTAMP` | 创建时间                         |

---

### settings — 设置表

通用键值对存储，用于应用设置和主题等配置。

| 列名    | 类型 | 约束        | 默认值 | 说明     |
| ------- | ---- | ----------- | ------ | -------- |
| `key`   | TEXT | PRIMARY KEY | —      | 设置键名 |
| `value` | TEXT | NOT NULL    | —      | 设置值   |

**已知的键：** `theme`（主题设置）

---

### prompt_presets — 提示词预设表

| 列名         | 类型     | 约束                      | 默认值              | 说明                                   |
| ------------ | -------- | ------------------------- | ------------------- | -------------------------------------- |
| `id`         | INTEGER  | PRIMARY KEY AUTOINCREMENT | —                   | 预设 ID                                |
| `name`       | TEXT     | NOT NULL                  | —                   | 预设名称                               |
| `prompt`     | TEXT     | NOT NULL                  | —                   | 提示词内容                             |
| `is_builtin` | INTEGER  | —                         | `0`                 | 是否内置（0/1，内置预设不可删除/编辑） |
| `created_at` | DATETIME | —                         | `CURRENT_TIMESTAMP` | 创建时间                               |

---

### memories — 长期记忆表

AI 对话的跨会话长期记忆存储。

| 列名           | 类型     | 约束                      | 默认值              | 说明                               |
| -------------- | -------- | ------------------------- | ------------------- | ---------------------------------- |
| `id`           | INTEGER  | PRIMARY KEY AUTOINCREMENT | —                   | 记忆 ID                            |
| `content`      | TEXT     | NOT NULL                  | —                   | 记忆内容                           |
| `category`     | TEXT     | NOT NULL                  | `'general'`         | 分类（如 `preference`、`context`） |
| `source`       | TEXT     | NOT NULL                  | `'manual'`          | 来源：`manual` / `chat`            |
| `source_ref`   | TEXT     | —                         | `NULL`              | 来源引用（如会话 ID）              |
| `pinned`       | INTEGER  | —                         | `0`                 | 是否置顶（0/1）                    |
| `enabled`      | INTEGER  | —                         | `1`                 | 是否启用（0/1）                    |
| `confidence`   | REAL     | —                         | `1`                 | 置信度（0.0-1.0）                  |
| `created_at`   | DATETIME | —                         | `CURRENT_TIMESTAMP` | 创建时间                           |
| `updated_at`   | DATETIME | —                         | `CURRENT_TIMESTAMP` | 更新时间                           |
| `last_used_at` | DATETIME | —                         | `NULL`              | 最后使用时间                       |

---

## 关系图

```
problems (1) ──────── (N) submissions
    │
    │ (1:1)
    ▼
mistakes (problem_id UNIQUE)

knowledge_docs (1) ── (N) knowledge_chunks
    │                         │
    │ ON DELETE CASCADE ───────┘

chat_sessions (1) ── (N) chat_history
    │                        │
    │ (逻辑关联，无 FK) ───────┘

settings           —— 独立键值表
ai_configs         —— 独立配置表
prompt_presets     —— 独立预设表
memories           —— 独立记忆表
```

---

## 索引

| 索引名                           | 表               | 列                                      | 用途                         |
| -------------------------------- | ---------------- | --------------------------------------- | ---------------------------- |
| `idx_problems_source`            | problems         | `source`                                | 按来源过滤题目               |
| `idx_problems_platform`          | problems         | `platform`                              | 按平台过滤题目               |
| `idx_problems_difficulty`        | problems         | `difficulty`                            | 按难度过滤题目               |
| `idx_problems_mode`              | problems         | `mode`                                  | 按模式过滤题目               |
| `idx_submissions_problem_status` | submissions      | `problem_id, status`                    | 统计题目通过状态             |
| `idx_submissions_problem_id`     | submissions      | `problem_id`                            | 查询题目的提交记录           |
| `idx_mistakes_problem_id`        | mistakes         | `problem_id`                            | 按题目查找错题               |
| `idx_knowledge_chunks_doc_id`    | knowledge_chunks | `doc_id`                                | 按文档查分块（级联删除加速） |
| `idx_chat_history_session`       | chat_history     | `session_id, created_at, id`            | 加载会话消息（覆盖排序）     |
| `idx_chat_sessions_updated`      | chat_sessions    | `updated_at DESC`                       | 会话列表排序                 |
| `idx_memories_enabled_pinned`    | memories         | `enabled, pinned DESC, updated_at DESC` | 记忆列表查询与排序           |
| `idx_memories_category`          | memories         | `category`                              | 按分类筛选记忆               |
| `idx_memories_content_lower`     | memories         | `lower(content)`                        | 记忆去重（大小写不敏感匹配） |

---

## 常用查询

### 题目查询

```sql
-- 获取题目列表（含通过计数）
SELECT p.*,
       (SELECT COUNT(*) FROM submissions s
        WHERE s.problem_id = p.id AND s.status = 'accepted') as solved
FROM problems p
WHERE 1=1
  AND p.difficulty = ?        -- 可选过滤
  AND p.tags LIKE ?           -- 模糊匹配
  AND p.source = ?            -- 精确匹配
ORDER BY p.id ASC;

-- 获取单个题目
SELECT * FROM problems WHERE id = ?;
```

### 提交查询

```sql
-- 获取题目的最近 20 条提交
SELECT * FROM submissions
WHERE problem_id = ?
ORDER BY created_at DESC
LIMIT 20;

-- 统计题目通过数
SELECT COUNT(*) FROM submissions
WHERE problem_id = ? AND status = 'accepted';
```

### 错题查询

```sql
-- 错题列表（关联题目信息）
SELECT m.*, p.title, p.difficulty, p.tags
FROM mistakes m
JOIN problems p ON m.problem_id = p.id
ORDER BY m.updated_at DESC;

-- 检查题目是否有错题记录
SELECT * FROM mistakes WHERE problem_id = ?;
```

### 聊天查询

```sql
-- 加载会话消息（按时间和 ID 升序）
SELECT * FROM chat_history
WHERE session_id = ?
ORDER BY created_at ASC, id ASC;

-- 会话列表（按更新时间倒序）
SELECT * FROM chat_sessions
ORDER BY updated_at DESC;
```

### 知识库搜索

```sql
-- 关键词搜索知识分块
SELECT kc.*, kd.filename
FROM knowledge_chunks kc
JOIN knowledge_docs kd ON kc.doc_id = kd.id
WHERE LOWER(kc.content) LIKE ?
   OR LOWER(kc.content) LIKE ?;

-- 删除文档及其分块
DELETE FROM knowledge_docs WHERE id = ?;  -- 触发 CASCADE
```

### 记忆查询

```sql
-- 获取所有启用记忆（置顶优先）
SELECT * FROM memories
ORDER BY pinned DESC, updated_at DESC, id DESC;

-- 记忆去重检查
SELECT * FROM memories
WHERE lower(content) = lower(?)
LIMIT 1;

-- 更新记忆使用时间
UPDATE memories
SET last_used_at = CURRENT_TIMESTAMP
WHERE id = ?;
```

### 设置查询

```sql
-- 读取设置
SELECT value FROM settings WHERE key = ?;

-- 写入设置（覆盖）
INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);
```

### AI 配置查询

```sql
-- 获取所有配置（默认优先）
SELECT * FROM ai_configs
ORDER BY is_default DESC, id ASC;

-- 获取默认配置
SELECT * FROM ai_configs WHERE is_default = 1;

-- 设置默认配置（先清除，再设置）
UPDATE ai_configs SET is_default = 0;
UPDATE ai_configs SET is_default = 1 WHERE id = ?;
```

---

## 数据约定

1. **JSON 字段**：`tags`、`languages`、`examples`、`test_cases`、`starter_code`、`tracks`、`error_types` 均为 JSON 字符串。应用层负责序列化和反序列化。
2. **布尔值**：SQLite 无布尔类型，使用 `INTEGER`（0/1）表示。字段包括 `is_default`、`is_builtin`、`pinned`、`enabled`。
3. **时间戳**：所有 `*_at` 字段使用 `CURRENT_TIMESTAMP`，格式为 UTC 时间。
4. **外键**：`submissions.problem_id` 和 `knowledge_chunks.doc_id` 声明了外键约束。`chat_history.session_id` 和 `mistakes.problem_id` 使用逻辑关联（应用层维护完整性）。
5. **级联删除**：`knowledge_chunks` 通过 `ON DELETE CASCADE` 随 `knowledge_docs` 一同删除。`chat_history` 的级联删除由应用层处理。
6. **字符串截断**：IPC 层在写入前对所有字符串参数进行长度限制和 `trim()` 处理。
7. **加密存储**：`ai_configs.api_key` 通过 `safeStorage` 加密，前缀 `enc:` 标识已加密状态。
