# SQL 查询执行顺序：别只按书写顺序理解

## 你会学到

- 理解 `SELECT`、`FROM`、`WHERE`、`GROUP BY`、`HAVING`、`ORDER BY` 的逻辑顺序
- 知道为什么有些别名在某些位置不能直接用
- 会更稳地定位分组和筛选错误

## 为什么这节课重要

很多 SQL 错误不是不会写，而是把“书写顺序”和“逻辑执行顺序”混在一起了。一旦理解执行顺序，你会更容易判断过滤发生在分组前还是分组后，也更容易写对报表查询。

## 常见逻辑顺序

1. `FROM`
2. `WHERE`
3. `GROUP BY`
4. `HAVING`
5. `SELECT`
6. `ORDER BY`

## 示例

```sql
SELECT user_id, COUNT(*) AS order_count
FROM orders
WHERE status = 'paid'
GROUP BY user_id
HAVING COUNT(*) >= 3
ORDER BY order_count DESC;
```

## 你应该形成的直觉

- `WHERE` 过滤原始行
- `GROUP BY` 开始把行聚成组
- `HAVING` 过滤分组后的结果
- `ORDER BY` 最后排序展示

## 常见误区

- 在 `WHERE` 里写聚合条件
- 不清楚 `HAVING` 和 `WHERE` 的职责分工
- 看到结果不对，只改 `SELECT`，却不回头检查分组前过滤逻辑

## 小练习

- 写一个按城市统计用户数的查询
- 只保留数量大于 5 的城市
- 按数量倒序输出

## 参考资料

- [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html)
- [SQLite SELECT documentation](https://www.sqlite.org/lang_select.html)

## 推荐论文 / 经典文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  读这篇经典文章时，你会更容易意识到：SQL 的核心是关系操作顺序，而不是把关键字背熟。
