# 子查询与 EXISTS：先想“我要判断有没有”

## 学习目标

- 理解子查询的常见用途
- 会读懂最小 `EXISTS` 查询
- 知道什么时候 `EXISTS` 比硬拼连接更自然

## 先修知识

- SELECT
- WHERE
- JOIN 基础

## 为什么这节课重要

有些问题本质上不是“我要连出所有明细”，而是：

- 某个条件是否存在
- 某个用户有没有下过单

这时 `EXISTS` 往往更自然。

## 最小例子

```sql
SELECT u.id, u.name
FROM users u
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.user_id = u.id
);
```

这条 SQL 的意思是：

- 查用户
- 只保留那些“至少有一条订单”的用户

## 子查询常见场景

- `EXISTS`
- `IN`
- 标量子查询
- 聚合后再过滤

## 常见错误

- 明明只想判断是否存在，却把所有明细全连出来
- 子查询和外层查询关系没对齐

## 小练习

- 写一条 SQL，查出“有评论的文章”
- 对比 `EXISTS` 和 `LEFT JOIN ... IS NOT NULL` 的写法差别

## 课后总结

- 子查询不是为了复杂，而是为了更贴近问题表达
- `EXISTS` 特别适合“是否存在”问题

## 参考文献

- PostgreSQL subquery expressions: https://www.postgresql.org/docs/current/functions-subquery.html
- SQLite expressions: https://www.sqlite.org/lang_expr.html

## 推荐阅读

- PostgreSQL official docs on EXISTS and subqueries
