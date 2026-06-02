# 连接查询 - SQL 题解

## 题目
表结构: orders(id INT, customer_id INT, amount INT), customers(id INT, name TEXT)
查询每个客户的订单总额。

## 解法

```sql
SELECT c.name, SUM(o.amount) as total
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY c.name;
```

## 核心知识点
- `JOIN ... ON` 连接两张表，ON 指定连接条件
- `c` 和 `o` 是表别名，简化书写
- `SUM()` 求和聚合函数
- `GROUP BY c.name` 按客户名分组
- 没有订单的客户不会出现在结果中（若需显示可用 LEFT JOIN）
