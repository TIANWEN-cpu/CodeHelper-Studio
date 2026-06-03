# 覆盖索引与查询命中路径

## 你会学到

- 理解覆盖索引为什么能减少回表
- 会给典型报表查询设计索引列顺序
- 知道索引不是越多越好

## 先修知识

- 索引基础
- 执行计划

## 为什么这节课重要

数据库性能问题常常不是写不出 SQL，而是写得出来却跑不动。覆盖索引是最值得先掌握的优化手感之一。

## 核心知识

- 把过滤列和排序列的顺序想清楚
- 覆盖索引的价值在于减少额外的数据页访问
- 先看真实查询，再决定是否建索引

## 示例

```sql
CREATE INDEX idx_reports_created_status
ON reports(created_at, status);
```

## 继续练什么

- 给按 created_at + status 检索的报表表设计索引
- 比较单列索引和组合索引的命中效果

## 参考资料

- [SQLite Query Planner](https://sqlite.org/queryplanner.html)
- [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html)

## 推荐论文 / 经典文章

- [Access Path Selection in a Relational Database Management System](https://stratos.seas.harvard.edu/files/stratos/files/accesspathselection.pdf)
