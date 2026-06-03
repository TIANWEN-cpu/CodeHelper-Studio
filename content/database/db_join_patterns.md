# 多表连接模式与查询拆解

## 你会学到

- 分清 `INNER JOIN` 和 `LEFT JOIN` 的结果差异
- 会拆解一条两表或三表连接 SQL
- 知道什么时候该显式写表别名

## 为什么这节课重要

很多 JOIN 写不好，不是语法不会，而是脑中没有“表如何配对”的图。先把连接关系画清楚，SQL 本身就会顺很多。

## 核心知识

- 连接本质上是在定义行如何配对。
- `INNER JOIN` 只保留匹配成功的行。
- `LEFT JOIN` 保留左表所有行，并给右表未匹配部分补 `NULL`。

## 示例

```sql
SELECT u.name, o.total
FROM users AS u
LEFT JOIN orders AS o ON u.id = o.user_id;
```

## 常见误区

- 把筛选条件错放进 `WHERE`，意外改变 `LEFT JOIN` 语义
- 表别名太随意，自己都看不懂
- 一上来就 `SELECT *`

## 继续练什么

- 写出 `users` 和 `orders` 的 `LEFT JOIN`
- 再给 `orders` 连上 `order_items`，画出三表关系

## 参考资料

- [SQLite SELECT](https://www.sqlite.org/lang_select.html)
- [PostgreSQL tutorial: Joins Between Tables](https://www.postgresql.org/docs/current/tutorial-join.html)

## 推荐论文 / 经典文章

- [Access Path Selection in a Relational Database Management System](https://courses.cs.duke.edu/fall03/cps216/papers/selinger-1979.pdf)
  理解 JOIN 不只影响结果，也深刻影响性能。
