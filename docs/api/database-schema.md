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
  - [knowledge_doc_metadata — 知识文档元数据表](#knowledge_doc_metadata--知识文档元数据表)
  - [knowledge_link_audit — 知识链接审计表](#knowledge_link_audit--知识链接审计表)
  - [knowledge_maintenance_runs — 知识维护运行表](#knowledge_maintenance_runs--知识维护运行表)
  - [knowledge_maintenance_actions — 知识维护动作表](#knowledge_maintenance_actions--知识维护动作表)
  - [settings — 设置表](#settings--设置表)
  - [prompt_presets — 提示词预设表](#prompt_presets--提示词预设表)
  - [memories — 长期记忆表](#memories--长期记忆表)
  - [editor_workspaces — 编辑器工作区表](#editor_workspaces--编辑器工作区表)
  - [editor_tabs — 编辑器标签表](#editor_tabs--编辑器标签表)
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

文档分块存储，用于混合检索。

| 列名          | 类型     | 约束                                            | 默认值              | 说明                                           |
| ------------- | -------- | ----------------------------------------------- | ------------------- | ---------------------------------------------- |
| `id`          | INTEGER  | PRIMARY KEY AUTOINCREMENT                       | —                   | 分块 ID                                        |
| `doc_id`      | INTEGER  | REFERENCES knowledge_docs(id) ON DELETE CASCADE | —                   | 关联文档                                       |
| `content`     | TEXT     | NOT NULL                                        | —                   | 分块内容                                       |
| `embedding`   | TEXT     | —                                               | `NULL`              | 模型向量嵌入预留字段；当前本地语义近似不依赖它 |
| `chunk_index` | INTEGER  | —                                               | —                   | 分块序号（从 0 开始）                          |
| `created_at`  | DATETIME | —                                               | `CURRENT_TIMESTAMP` | 创建时间                                       |

运行时迁移 `knowledge-retrieval` v2 还会创建两个 FTS5 外部内容索引：

- `knowledge_chunks_fts`：`unicode61` tokenizer，提供 BM25 关键词召回
- `knowledge_chunks_trigram`：`trigram` tokenizer，提供中文、子串和拼写近似召回

两张虚拟表由 `knowledge_chunks` 的 insert/update/delete trigger 同步。首次升级会执行 FTS `rebuild` 原地索引已有分块；若运行环境不支持 FTS5，应用保留原表并明确降级到 bounded LIKE，不阻断数据库启动。

---

### knowledge_doc_metadata — 知识文档元数据表

每个 `knowledge_docs` 行最多对应一条结构化 metadata。v1 升级到 v2 时会从 Markdown front matter、文件名和文件类型回填；后续导入在写入正文的同一事务中创建 metadata。

| 列名             | 类型    | 约束/默认值                            | 说明                                     |
| ---------------- | ------- | -------------------------------------- | ---------------------------------------- |
| `doc_id`         | INTEGER | PRIMARY KEY, FK + ON DELETE CASCADE    | 关联 `knowledge_docs.id`                 |
| `display_title`  | TEXT    | NOT NULL，非空                         | 阅读器和列表显示标题                     |
| `source_repo`    | TEXT    | 可空                                   | 来源仓库标识                             |
| `source_url`     | TEXT    | 可空                                   | 来源仓库或文档 URL                       |
| `source_path`    | TEXT    | 可空                                   | 来源文件路径                             |
| `source_commit`  | TEXT    | 可空                                   | 来源提交或版本                           |
| `category_key`   | TEXT    | 可空                                   | 稳定分类键                               |
| `category_label` | TEXT    | 可空                                   | 面向用户的分类名                         |
| `tags_json`      | TEXT    | NOT NULL，默认 `[]`，必须是 JSON array | 标签数组                                 |
| `import_target`  | TEXT    | 可空                                   | 导入目标或批次标识                       |
| `generated_at`   | TEXT    | 可空                                   | 上游资源生成时间                         |
| `document_kind`  | TEXT    | NOT NULL，默认 `document`              | `markdown` / `text` / `pdf` / `document` |
| `visibility`     | TEXT    | NOT NULL，默认 `local`                 | 文档可见性                               |
| `content_sha256` | TEXT    | NOT NULL，64 位小写十六进制            | 正文 SHA-256                             |
| `created_at`     | TEXT    | NOT NULL，UTC ISO 8601                 | metadata 创建时间                        |
| `updated_at`     | TEXT    | NOT NULL，UTC ISO 8601                 | metadata 更新时间                        |

### knowledge_link_audit — 知识链接审计表

保存文档内每个链接的解析和检查结果。唯一键为 `doc_id + line_number + raw_target`，用于稳定刷新同一来源行；删除文档时记录级联删除。

| 列名              | 类型    | 约束/默认值                      | 说明                                                                                                             |
| ----------------- | ------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`              | INTEGER | PRIMARY KEY AUTOINCREMENT        | 审计记录 ID                                                                                                      |
| `doc_id`          | INTEGER | NOT NULL，FK + ON DELETE CASCADE | 来源文档                                                                                                         |
| `line_number`     | INTEGER | NOT NULL，`>= 1`                 | Markdown 源行号                                                                                                  |
| `raw_target`      | TEXT    | NOT NULL，非空                   | 源文本中的原始目标                                                                                               |
| `resolved_target` | TEXT    | 可空                             | 解析、规范化后的目标                                                                                             |
| `link_kind`       | TEXT    | NOT NULL，非空                   | 链接类型，例如 external 或 corpus-document                                                                       |
| `status`          | TEXT    | NOT NULL，默认 `unchecked`       | `reachable` / `not_found` / `temporary_error` / `restricted` / `malformed` / `unresolved_relative` / `unchecked` |
| `http_status`     | INTEGER | 可空；非空时为 100-599           | HTTP 状态码                                                                                                      |
| `checked_at`      | TEXT    | 可空                             | 最近检查时间                                                                                                     |
| `detail`          | TEXT    | 可空                             | 失败、限制或解析说明                                                                                             |

### knowledge_maintenance_runs — 知识维护运行表

记录一次受审的知识维护执行。`run_key` 与 `plan_sha256` 绑定计划身份；备份、报告路径和清理前后计数用于验收与恢复。`summary_json` 必须是 JSON object。

| 列名                                       | 类型    | 约束/默认值                             | 说明                   |
| ------------------------------------------ | ------- | --------------------------------------- | ---------------------- |
| `id`                                       | INTEGER | PRIMARY KEY AUTOINCREMENT               | 运行 ID                |
| `run_key`                                  | TEXT    | NOT NULL，UNIQUE，非空                  | 稳定运行键             |
| `plan_sha256`                              | TEXT    | NOT NULL，64 位小写十六进制             | 维护计划 SHA-256       |
| `operation`                                | TEXT    | NOT NULL，非空                          | 操作类型               |
| `status`                                   | TEXT    | NOT NULL，默认 `running`                | 运行生命周期状态       |
| `backup_path` / `report_path`              | TEXT    | 可空                                    | 完整备份和验收报告路径 |
| `before_doc_count` / `after_doc_count`     | INTEGER | 可空，`>= 0`                            | 清理前后文档数         |
| `before_chunk_count` / `after_chunk_count` | INTEGER | 可空，`>= 0`                            | 清理前后分块数         |
| `summary_json`                             | TEXT    | NOT NULL，默认 `{}`，必须为 JSON object | 结构化摘要             |
| `notes`                                    | TEXT    | 可空                                    | 人工备注               |
| `started_at` / `completed_at`              | TEXT    | 开始时间非空，完成时间可空              | 生命周期时间戳         |

### knowledge_maintenance_actions — 知识维护动作表

记录每条删除或 metadata 更新动作。`run_id + action_id` 唯一。`doc_id` 和 `keep_doc_id` 故意不声明到 `knowledge_docs` 的外键，使删除正文后仍能保留文档 ID、保留文档 ID、理由、来源 metadata、正文哈希以及 `before_json` / `after_json` 快照；删除维护 run 时 action 才会级联删除。

| 列名                                                              | 类型    | 约束/默认值                             | 说明                   |
| ----------------------------------------------------------------- | ------- | --------------------------------------- | ---------------------- |
| `id`                                                              | INTEGER | PRIMARY KEY AUTOINCREMENT               | 动作 ID                |
| `run_id`                                                          | INTEGER | NOT NULL，FK + ON DELETE CASCADE        | 所属维护运行           |
| `action_id`                                                       | TEXT    | NOT NULL，非空                          | 计划内稳定动作 ID      |
| `doc_id` / `keep_doc_id`                                          | INTEGER | 可空，无文档外键                        | 目标文档和保留文档快照 |
| `action_type` / `reason_code`                                     | TEXT    | NOT NULL，非空                          | 动作类型与机器可读原因 |
| `reason_detail`                                                   | TEXT    | 可空                                    | 人类可读原因           |
| `filename`                                                        | TEXT    | NOT NULL，非空                          | 执行时文件名           |
| `display_title`、`source_*`、`category_*`                         | TEXT    | 可空                                    | 执行时来源和分类快照   |
| `content_sha256`、`before_content_sha256`、`after_content_sha256` | TEXT    | 可空；非空时为 64 位小写十六进制        | 内容身份与变更前后哈希 |
| `before_json` / `after_json`                                      | TEXT    | NOT NULL，默认 `{}`，必须为 JSON object | 完整结构化快照         |
| `created_at`                                                      | TEXT    | NOT NULL，UTC ISO 8601                  | 动作记录时间           |

应用 schema v2 在启动时创建以上四张表。若检测到 `schema_migrations(component = 'application') < 2`，主进程先使用 `VACUUM INTO` 创建并验证 pre-migration 备份，再在一个 SQLite 事务内执行 DDL、metadata backfill、`PRAGMA quick_check` 和 application 版本记录。任一步失败时事务回滚，原 v1 数据库和版本记录保持不变。

---

### agent_runs — Agent 运行表

| 字段              | 类型 | 约束/说明                                                      |
| ----------------- | ---- | -------------------------------------------------------------- |
| `id`              | TEXT | 主键                                                           |
| `goal`            | TEXT | 用户任务目标                                                   |
| `status`          | TEXT | `needsApproval/dispatching/running/completed/failed/cancelled` |
| `context_summary` | TEXT | JSON；保存页面、标题、语言、代码长度和 SHA-256，不保存代码正文 |
| `error`           | TEXT | 失败或取消原因                                                 |
| `created_at`      | TEXT | 创建时间                                                       |
| `updated_at`      | TEXT | 最近状态更新时间                                               |
| `completed_at`    | TEXT | 终态时间                                                       |

### agent_tool_calls — Agent 工具调用表

记录白名单工具、审批要求、输入摘要、真实输出和生命周期。`input_payload` 只用于待执行恢复；
调用或所属运行进入终态时会清空。运行失败或取消会同时终结尚未完成的工具调用。当前
`tool_id` 仅允许 `knowledge-search` 和
`strong-code-run`。

### agent_approvals — Agent 审批表

每个需审批工具调用最多一条审批记录，状态为 `pending/approved/rejected/expired`。审批绑定
`run_id + tool_call_id`，不能跨运行复用。

### agent_audit_events — Agent 审计事件表

追加记录运行创建、工具开始/完成/失败、审批决定、模型调度、取消和终态。可通过
`agent-audit-list` 按运行查询。

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

### editor_workspaces — 编辑器工作区表

保存工作区级激活状态、连续 generation 和旧 localStorage 导入版本。`generation` 用于发现跨窗口事件缺口；`legacy_storage_version` 使 v1/v2 本地数据迁移保持原子且幂等。

| 列名                     | 类型 | 约束        | 默认值   | 说明                     |
| ------------------------ | ---- | ----------- | -------- | ------------------------ |
| `workspace_id`           | TEXT | PRIMARY KEY | —        | 工作区 ID                |
| `last_active_tab_id`     | TEXT | —           | `NULL`   | 最近激活标签             |
| `generation`             | INT  | `>= 0`      | `0`      | 工作区变更序号           |
| `legacy_storage_version` | INT  | `>= 0`      | `0`      | 已导入的本地快照格式版本 |
| `updated_at`             | TEXT | NOT NULL    | 当前时间 | 工作区最后更新时间       |

### editor_tabs — 编辑器标签表

保存普通文件、题目和练习标签的内容及视图状态。内容 mutation 使用 `revision` CAS；`last_mutation_*` 与 `last_view_mutation_*` 让响应丢失后的同 ID 重试保持幂等。

| 列名                                            | 类型 | 约束/取值                       | 说明                   |
| ----------------------------------------------- | ---- | ------------------------------- | ---------------------- |
| `workspace_id`                                  | TEXT | FK + 复合主键                   | 所属工作区             |
| `tab_id`                                        | TEXT | 复合主键                        | 标签 ID                |
| `filename`                                      | TEXT | NOT NULL                        | 文件名                 |
| `language`                                      | TEXT | NOT NULL                        | 运行/高亮语言          |
| `content`                                       | TEXT | NOT NULL                        | 用户代码               |
| `tab_kind`                                      | TEXT | `file` / `problem` / `exercise` | 标签类型               |
| `problem_id`                                    | TEXT | 可空                            | 关联题目               |
| `cursor_line`                                   | INT  | 可空                            | 光标行                 |
| `cursor_column`                                 | INT  | 可空                            | 光标列                 |
| `scroll_top`                                    | REAL | `>= 0`                          | 滚动位置               |
| `tab_position`                                  | INT  | `>= 0`                          | 标签顺序               |
| `status`                                        | TEXT | `open` / `closed` / `deleted`   | 生命周期状态           |
| `revision`                                      | INT  | `>= 1`                          | 内容 CAS 版本          |
| `last_mutation_*`                               | TEXT | 可空                            | 内容 mutation 幂等记录 |
| `last_view_mutation_*`                          | TEXT | 可空                            | 视图 mutation 幂等记录 |
| `created_at` / `updated_at` / `view_updated_at` | TEXT | NOT NULL                        | 内容与视图时间戳       |
| `closed_at` / `deleted_at`                      | TEXT | 可空                            | 关闭/删除时间          |

编辑器数据库 schema 当前为 v3，并记录在 `schema_migrations(component = 'editor-workspace')`。schema v1 的 draft 表会在事务内重建，schema v2 缺少的 `tab_kind` 和 mutation 指纹列会原地补齐；两条路径都保留内容、open/closed 状态、revision、顺序、光标和滚动位置。`legacy_storage_version = 0` 表示尚未从 localStorage 导入；Renderer 仅在该状态下调用 `migrateLegacyEditorWorkspace` 灌入本地快照，**不会**因应用侧存储格式从 v1/v2/v3 升到 v4 就用空或过期本地数据覆盖已有 SQLite 标签。迁移前 localStorage 快照会另存备份；ID 的内容或状态不一致时创建确定性的 `recovered-*` 副本，不覆盖任一版本或吞掉关闭状态。

**练习标签：** `tab_kind = 'exercise'` 以及 ID 为 `exercise-*` 的练习入口导入题目行应持久化空 `content`（仅保存拓扑与视图状态）；用户代码权威在带 revision 的 `exercise_drafts` / 恢复区。若旧数据仍在 practice-backed 行内嵌代码，迁移会在同一事务中创建确定性的普通恢复文件，再清空重复 content；恢复文件插入失败会回滚，原始代码仍留在旧行。

**练习草稿旧表：** 数据库启动阶段会主动检查 `exercise_drafts`，不等待用户首次打开练习。只有 `exercise_id / title / code / updated_at` 的旧表会原地补充 `language`、`revision` 和 `deleted`；现有代码与时间戳保持不变，旧记录初始化为 `revision = 1`、`deleted = 0`。迁移幂等，仓储层仍会在每次访问前复核，避免部分升级后继续运行。

---

## 关系图

```
problems (1) ──────── (N) submissions
    │
    │ (1:1)
    ▼
mistakes (problem_id UNIQUE)

knowledge_docs (1) ── (N) knowledge_chunks
    │
    ├── (1:1) knowledge_doc_metadata（ON DELETE CASCADE）
    └── (N) knowledge_link_audit（ON DELETE CASCADE）

knowledge_maintenance_runs (1) ── (N) knowledge_maintenance_actions
    │                                  │
    │ ON DELETE CASCADE                │ 保留 source snapshot，无 docs FK
    └──────────────────────────────────┘

chat_sessions (1) ── (N) chat_history
    │                        │
    │ (逻辑关联，无 FK) ───────┘

settings           —— 独立键值表
ai_configs         —— 独立配置表
prompt_presets     —— 独立预设表
memories           —— 独立记忆表
editor_workspaces (1) ── (N) editor_tabs（ON DELETE CASCADE）
```

---

## 索引

| 索引名                                   | 表                            | 列                                      | 用途                         |
| ---------------------------------------- | ----------------------------- | --------------------------------------- | ---------------------------- |
| `idx_problems_source`                    | problems                      | `source`                                | 按来源过滤题目               |
| `idx_problems_platform`                  | problems                      | `platform`                              | 按平台过滤题目               |
| `idx_problems_difficulty`                | problems                      | `difficulty`                            | 按难度过滤题目               |
| `idx_problems_mode`                      | problems                      | `mode`                                  | 按模式过滤题目               |
| `idx_submissions_problem_status`         | submissions                   | `problem_id, status`                    | 统计题目通过状态             |
| `idx_submissions_problem_id`             | submissions                   | `problem_id`                            | 查询题目的提交记录           |
| `idx_mistakes_problem_id`                | mistakes                      | `problem_id`                            | 按题目查找错题               |
| `idx_knowledge_chunks_doc_id`            | knowledge_chunks              | `doc_id`                                | 按文档查分块（级联删除加速） |
| `idx_knowledge_doc_metadata_category`    | knowledge_doc_metadata        | `category_key, category_label, doc_id`  | 分类筛选与稳定排序           |
| `idx_knowledge_doc_metadata_source`      | knowledge_doc_metadata        | `source_repo, source_path, doc_id`      | 来源筛选                     |
| `idx_knowledge_doc_metadata_hash`        | knowledge_doc_metadata        | `content_sha256, doc_id`                | 正文去重与身份校验           |
| `idx_knowledge_link_audit_doc`           | knowledge_link_audit          | `doc_id, line_number, id`               | 按文档和源顺序读取链接       |
| `idx_knowledge_link_audit_status`        | knowledge_link_audit          | `status, checked_at, doc_id`            | 按状态筛选待复核链接         |
| `idx_knowledge_maintenance_runs_started` | knowledge_maintenance_runs    | `started_at DESC, id DESC`              | 最近维护运行                 |
| `idx_knowledge_maintenance_actions_run`  | knowledge_maintenance_actions | `run_id, id`                            | 读取运行动作                 |
| `idx_knowledge_maintenance_actions_doc`  | knowledge_maintenance_actions | `doc_id, id`                            | 读取文档审计历史             |
| `idx_chat_history_session`               | chat_history                  | `session_id, created_at, id`            | 加载会话消息（覆盖排序）     |
| `idx_chat_sessions_updated`              | chat_sessions                 | `updated_at DESC`                       | 会话列表排序                 |
| `idx_memories_enabled_pinned`            | memories                      | `enabled, pinned DESC, updated_at DESC` | 记忆列表查询与排序           |
| `idx_memories_category`                  | memories                      | `category`                              | 按分类筛选记忆               |
| `idx_memories_content_lower`             | memories                      | `lower(content)`                        | 记忆去重（大小写不敏感匹配） |
| `idx_editor_tabs_open_position`          | editor_tabs                   | `workspace_id, status, tab_position`    | 恢复打开标签顺序             |
| `idx_editor_tabs_closed_at`              | editor_tabs                   | `workspace_id, status, closed_at`       | 恢复最近关闭标签             |

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

1. **JSON 字段**：`tags`、`languages`、`examples`、`test_cases`、`starter_code`、`tracks`、`error_types` 和 `knowledge_doc_metadata.tags_json` 均为 JSON 字符串；其中 `tags_json` 必须是 JSON array，`knowledge_maintenance_runs.summary_json`、`knowledge_maintenance_actions.before_json/after_json` 必须是 JSON object。应用层负责序列化和反序列化。
2. **布尔值**：SQLite 无布尔类型，使用 `INTEGER`（0/1）表示。字段包括 `is_default`、`is_builtin`、`pinned`、`enabled`。
3. **时间戳**：所有 `*_at` 字段使用 `CURRENT_TIMESTAMP`，格式为 UTC 时间。
4. **外键**：知识库的 `knowledge_chunks.doc_id`、`knowledge_doc_metadata.doc_id` 和 `knowledge_link_audit.doc_id` 均声明 `ON DELETE CASCADE`；维护动作只外键关联 `knowledge_maintenance_runs.run_id`，不外键关联文档，以保留删除后的审计快照。`chat_history.session_id` 和 `mistakes.problem_id` 的完整性由相应迁移或应用层维护。
5. **级联删除**：删除 `knowledge_docs` 会级联删除分块、metadata 和链接审计；删除维护 run 会级联删除该 run 的 actions。维护 action 本身不会因正文删除而消失。
6. **字符串截断**：IPC 层在写入前对所有字符串参数进行长度限制和 `trim()` 处理。
7. **加密存储**：`ai_configs.api_key` 通过 `safeStorage` 加密，前缀 `enc:` 标识已加密状态。
