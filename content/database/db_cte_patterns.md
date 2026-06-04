# CTE 与 WITH：把复杂查询拆成几步

## 你会学到

- 理解 CTE 不是“高级炫技”，而是查询拆解工具
- 会把长 SQL 切成可读的几段
- 知道什么时候 CTE 比子查询更顺手

## 为什么这节课重要

很多 SQL 写着写着会变成长长一坨，最后自己也不敢改。CTE 的价值就在于：先把中间结果命名出来，再把最终查询建立在这些中间结果上。这样报表、分析和排错都更稳。

## 示例

```sql
WITH sales_cte AS (
    SELECT user_id, SUM(amount) AS total_amount
    FROM orders
    GROUP BY user_id
)
SELECT user_id, total_amount
FROM sales_cte
WHERE total_amount > 1000;
```

## 核心知识

- `WITH` 先定义中间结果
- 主查询再使用这些结果
- 复杂查询拆段后，可读性和修改性都会提升

## 常见误区

- 明明一层查询就够，还硬拆成很多段
- 给 CTE 起很模糊的名字，反而更难懂
- 只会模仿写法，不知道每段结果代表什么

## 小练习

- 先按用户汇总订单金额
- 再筛出高于某阈值的用户
- 再试着把“两步查询”改写成一个 CTE 版本

## 参考资料

- [PostgreSQL WITH Queries](https://www.postgresql.org/docs/current/queries-with.html)
- [SQLite WITH clause](https://www.sqlite.org/lang_with.html)

## 推荐论文 / 经典文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  你会更容易理解，SQL 的重点并不是“写一长串语法”，而是把数据关系拆成清晰步骤。
