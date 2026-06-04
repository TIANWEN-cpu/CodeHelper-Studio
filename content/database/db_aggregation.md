# 聚合、分组与多表连接

## 学习目标

- 会统计数量、均值和总和
- 会用 `GROUP BY`
- 会写基础的 `JOIN`

## 聚合函数

常用的聚合函数有：

- `COUNT`
- `SUM`
- `AVG`
- `MAX`
- `MIN`

例如统计订单总数：

```sql
SELECT COUNT(*) AS total_orders
FROM orders;
```

## GROUP BY

按用户统计订单数：

```sql
SELECT user_id, COUNT(*) AS order_count
FROM orders
GROUP BY user_id;
```

## HAVING

如果你想过滤聚合后的结果，用 `HAVING`：

```sql
SELECT user_id, COUNT(*) AS order_count
FROM orders
GROUP BY user_id
HAVING COUNT(*) >= 3;
```

## JOIN

把用户表和订单表连起来：

```sql
SELECT users.name, orders.amount
FROM users
JOIN orders ON users.id = orders.user_id;
```

## 初学者常见问题

- 聚合字段和普通字段混写，但没 `GROUP BY`
- 不知道 `WHERE` 和 `HAVING` 的区别
- `JOIN` 时忘记写连接条件

## 本课总结

数据库真正强大的地方，不是存住数据，而是能快速从数据中提取信息。聚合和连接就是这个能力的核心。
