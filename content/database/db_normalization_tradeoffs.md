# 范式与反范式的取舍

## 你会学到

- 知道为什么会有数据冗余和更新异常
- 会识别需要拆表的典型信号
- 能说清楚反范式的收益和代价

## 先修知识

- 表、行、列与主键
- JOIN 基础

## 为什么这节课重要

数据库设计最难的不是建第一张表，而是业务变复杂以后你敢不敢拆、敢不敢冗余、知道代价在哪里。

## 核心知识

- 范式关注的是减少冗余和更新异常
- 反范式关注的是读性能和查询简化
- 先保证数据正确，再讨论是否为了读性能做冗余

## 示例

```sql
CREATE TABLE orders(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, total_amount REAL NOT NULL);
CREATE TABLE order_items(order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL, price REAL NOT NULL);
```

## 继续练什么

- 拿用户-订单-订单项结构分析为什么要拆表
- 思考报表宽表和交易库范式表的边界

## 参考资料

- [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html)
- [SQLite Foreign Keys](https://sqlite.org/foreignkeys.html)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.umd.edu/class/spring2003/cmsc838p/Design/criteria.pdf)
