# 子查询、集合操作与查询拆解

## 学习目标

- 学会用子查询分步骤思考复杂查询
- 理解 `UNION` 与 `UNION ALL` 的区别
- 建立“先拆后写”的 SQL 思维

## 为什么很多 SQL 写起来痛苦

不是因为 SQL 太难，而是很多人一上来就想把所有条件一次性塞进一条长语句里。  
更稳妥的方式，是把问题拆开。

## 子查询的常见位置

- 放在 `WHERE` 中做比较
- 放在 `FROM` 中当临时结果集
- 放在 `SELECT` 中补充单列信息

## 一个典型例子

```sql
SELECT student, score
FROM scores
WHERE score > (
    SELECT AVG(score) FROM scores
);
```

这条语句的关键，不是语法炫技，而是先算平均分，再比较每个人。

## `UNION` 和 `UNION ALL`

- `UNION`：合并结果并去重
- `UNION ALL`：直接拼接，不去重

## 参考文献

- [SQLite SQL Language Expressions](https://sqlite.org/lang_expr.html)
- [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html)

## 推荐论文 / 文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  学数据库时非常值得早读的一篇源头文章。
