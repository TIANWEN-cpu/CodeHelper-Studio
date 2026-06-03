# EXPLAIN 与执行计划：开始看数据库到底怎么跑

## 学习目标

- 理解执行计划是在描述查询如何被执行
- 知道为什么它和性能优化有关
- 会读懂最小 `EXPLAIN` 输出方向

## 先修知识

- 索引
- JOIN
- WHERE

## 为什么这节课重要

慢查询不是靠猜出来的。  
执行计划的价值是让你看到数据库“准备怎么做这件事”。

## 最小例子

```sql
EXPLAIN
SELECT *
FROM users
WHERE email = 'a@example.com';
```

你现在不用一口气读懂所有细节，先看这些关键词：

- 是否走了索引
- 是否全表扫描
- 大概的连接顺序

## 常见误区

- 一看到执行计划就想全背下来
- 不先结合查询和数据规模理解
- 以为有索引就一定会用

## 小练习

- 对一条按主键查询的 SQL 写 `EXPLAIN`
- 思考为什么有些条件下数据库仍可能不走索引

## 课后总结

- `EXPLAIN` 是性能排查的重要入口
- 先读方向，不急着抠全部细节

## 参考文献

- PostgreSQL explain: https://www.postgresql.org/docs/current/using-explain.html
- SQLite explain query plan: https://www.sqlite.org/eqp.html

## 推荐阅读

- PostgreSQL official docs on EXPLAIN
