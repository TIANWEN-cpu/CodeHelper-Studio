# ADR-003: 选择 better-sqlite3 作为本地数据库

## 状态

已采纳

## 背景

CodeHelper 需要在本地存储大量结构化数据（题目、提交记录、聊天历史、知识库文档等）。需要选择一个合适的本地数据库方案。

### 候选方案

| 方案                  | 优势                           | 劣势                   |
| --------------------- | ------------------------------ | ---------------------- |
| **better-sqlite3**    | 同步 API、性能优秀、SQL 全功能 | 需要 native 编译       |
| **sql.js**            | 纯 WASM、无需编译              | 异步 API、性能略差     |
| **IndexedDB**         | 浏览器原生、无需安装           | API 复杂、无 SQL       |
| **lowdb / JSON 文件** | 极简、无需依赖                 | 不适合大量数据、无索引 |
| **LevelDB**           | 嵌入式 KV、性能好              | 非关系型、无 SQL       |

## 决策

选择 **better-sqlite3** 作为本地数据库。

### 理由

1. **同步 API**：better-sqlite3 是同步的。在 Electron 主进程中，同步操作是安全的（主进程不会阻塞 UI），而同步 API 大大简化了代码逻辑。

   ```typescript
   // better-sqlite3：简洁的同步 API
   const result = db.prepare('SELECT * FROM problems WHERE id = ?').get(id)
   ```

   对比异步方案：

   ```typescript
   // 异步方案：需要 await
   const result = await db.prepare('SELECT * FROM problems WHERE id = ?').get(id)
   ```

2. **SQL 全功能**：支持完整的 SQL 语法，包括 JOIN、子查询、窗口函数、CTE 等。题目筛选、统计查询等需求需要复杂的 SQL。

3. **WAL 模式**：支持 Write-Ahead Logging，允许并发读取。AI 流式响应写入聊天记录时，不会阻塞其他查询。

4. **预编译语句**：`db.prepare()` 预编译 SQL 语句，重复执行时性能极高。

   ```typescript
   const stmt = db.prepare('SELECT * FROM problems WHERE difficulty = ?')
   const easy = stmt.all('easy')
   const medium = stmt.all('medium')
   const hard = stmt.all('hard')
   ```

5. **事务支持**：原生支持事务，确保数据一致性。

   ```typescript
   const saveConfig = db.transaction(() => {
     db.prepare('UPDATE ai_configs SET is_default = 0').run()
     db.prepare('INSERT INTO ai_configs ...').run(...)
   })
   saveConfig()
   ```

6. **性能优秀**：在嵌入式数据库中，SQLite 的性能是最优秀的之一。百万级数据量下仍能保持毫秒级查询。

7. **JSON 支持**：SQLite 原生支持 JSON 函数，可以在 TEXT 列中存储和查询 JSON 数据。

   ```sql
   SELECT * FROM problems WHERE json_extract(tags, '$') LIKE '%哈希表%'
   ```

8. **外键约束**：支持 `PRAGMA foreign_keys = ON`，保证数据引用完整性。

### 权衡

- **Native 编译**：better-sqlite3 需要编译原生 C++ 模块，增加了构建复杂性
- **平台依赖**：不同平台需要各自的编译产物
- **Electron 版本匹配**：需要确保 better-sqlite3 的 ABI 与 Electron 的 Node.js 版本兼容（通过 `postinstall` 脚本解决）

## 后果

- 数据库文件存储在 `%APPDATA%/codehelper/codehelper.db`（Windows）
- 启用 WAL 模式提升并发性能
- 使用 `ensureSchemaColumns()` 实现增量 Schema 迁移
- 在 `electron/db/index.ts` 中使用单例模式管理数据库连接
- API Key 等敏感数据使用 Electron `safeStorage` 加密后存储
- 所有数据库操作在主进程中执行，通过 IPC 传递结果给渲染进程

---

## See Also

- [ADR-001: Electron 选型](001-electron-choice.md) -- 桌面框架选型
- [ADR-002: Zustand 选型](002-zustand-over-redux.md) -- 状态管理方案选型
- [数据库 Schema 参考](../reference/database-schema.md) -- 完整表结构定义
- [架构文档 - 数据库设计](../architecture.md#数据库设计) -- 数据库设计详解
- [依赖审计报告](../dependency-audit.md) -- better-sqlite3 版本与安全分析
- [术语表](../glossary.md) -- better-sqlite3、WAL 等术语
