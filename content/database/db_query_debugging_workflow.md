# 查询调试工作流

## 你会学到

- 会从样例数据开始复现问题
- 知道先验结果怎么写
- 会用 explain 判断索引和扫描路径

## 先修知识

- 聚合与 JOIN
- 执行计划入门

## 为什么这节课重要

真正让人卡住的通常不是不会写，而是写完以后不知道错在哪。学会调试工作流，你以后面对复杂报表就没那么慌。

## 核心知识

- 先缩小数据集，再验证结果
- 把复杂 SQL 拆成子查询和中间结果
- 执行计划是解释“为什么慢”的证据，不是装饰品

## 示例

```sql
EXPLAIN QUERY PLAN
SELECT user_id, COUNT(*)
FROM orders
WHERE created_at >= 2026-04-01
GROUP BY user_id;
```

## 继续练什么

- 拿一条 join + group by SQL，先手工算出预期结果
- 练习把复杂 SQL 拆成 2 到 3 个中间查询

## 参考资料

- [SQLite EXPLAIN QUERY PLAN](https://sqlite.org/eqp.html)
- [Use the Index, Luke](https://use-the-index-luke.com/)

## 推荐论文 / 经典文章

- [Volcano - An Extensible and Parallel Query Evaluation System](https://www.vldb.org/conf/1990/P379.PDF)
