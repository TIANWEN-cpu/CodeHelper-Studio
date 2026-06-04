# 视图与物化思维：把常用查询收成稳定接口

## 学习目标

- 理解视图的基本用途
- 知道视图不是“真实表”，而是查询封装
- 对“物化”建立第一层直觉

## 先修知识

- 多表查询
- 报表 SQL

## 为什么这节课重要

当一条查询越来越长、被越来越多地方复用时，你可以考虑把它收成视图。  
这样做的价值是：

- 查询复用
- 降低重复
- 让上层读取更简单

## 最小视图例子

```sql
CREATE VIEW user_order_summary AS
SELECT u.id,
       u.name,
       COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;
```

之后就能：

```sql
SELECT *
FROM user_order_summary;
```

## 视图先怎么理解

- 它更像“命名好的查询结果入口”
- 不一定自己存数据
- 很适合把复杂报表逻辑先收口

## 物化直觉

你先不用深挖物化视图，只要知道：

- 普通视图偏向实时查询封装
- 物化更接近“预先算好一份结果”

## 小练习

- 给“用户订单汇总”写一个最小视图
- 思考什么时候直接查原表更合适，什么时候查视图更清晰

## 课后总结

- 视图是查询封装，不是魔法表
- 它能帮助你把复杂查询变成更稳定的接口

## 参考文献

- PostgreSQL CREATE VIEW: https://www.postgresql.org/docs/current/sql-createview.html
- SQLite CREATE VIEW: https://www.sqlite.org/lang_createview.html

## 推荐阅读

- PostgreSQL docs on materialized views: https://www.postgresql.org/docs/current/rules-materializedviews.html
