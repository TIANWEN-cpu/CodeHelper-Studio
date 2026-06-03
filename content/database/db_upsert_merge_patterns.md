# UPSERT 与幂等写入模式

## 你会学到

- 理解 insert / update / upsert 的边界
- 知道幂等写入为什么重要
- 会给日报和指标表设计唯一键

## 先修知识

- 基础 CRUD
- 主键与唯一键

## 为什么这节课重要

只要任务会重试、会补数、会重跑，UPSERT 和幂等写入就会直接决定数据会不会脏。

## 核心知识

- 先给数据找唯一身份，再决定冲突时覆盖还是跳过
- SQLite 常用 INSERT ... ON CONFLICT DO UPDATE
- 不要把去重逻辑全扔给应用层，数据库约束更可靠

## 示例

```sql
CREATE TABLE daily_kpi(day TEXT PRIMARY KEY, total INTEGER);
INSERT INTO daily_kpi(day, total)
VALUES (2026-04-01, 8)
ON CONFLICT(day) DO UPDATE SET total = excluded.total;
```

## 继续练什么

- 给日报表补一条 upsert 语句
- 设计一个按 user_id + day 唯一的指标表

## 参考资料

- [SQLite ON CONFLICT](https://sqlite.org/lang_upsert.html)
- [PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)

## 推荐论文 / 经典文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
