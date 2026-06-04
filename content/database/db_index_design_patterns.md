# 索引设计模式：不是越多越好，而是越准越好

## 学习目标

- 理解索引为什么能加速查询
- 知道索引也有成本
- 对“什么字段更适合建索引”建立直觉

## 先修知识

- WHERE、ORDER BY、JOIN

## 为什么这节课重要

很多初学者会把索引理解成“数据库加速按钮”。  
其实更准确的说法是：

- 索引让某些查找更快
- 但也会增加写入成本和维护成本

所以关键不是“多建”，而是“建对”。

## 什么时候优先考虑索引

- 常出现在 `WHERE` 条件里的列
- 经常参与连接的外键列
- 经常参与排序或唯一约束的列

## 什么时候别急着建

- 数据量很小
- 字段区分度很低
- 表主要是高频写入

## 一个直觉例子

如果你常常这样查：

```sql
SELECT *
FROM users
WHERE email = 'a@example.com';
```

那 `email` 往往是优先考虑索引的字段。

## 常见误区

- 给每一列都建索引
- 看到慢就只会加索引，不先看查询写法
- 不理解复合索引的顺序影响

## 小练习

- 说出用户表里你会优先考虑索引的 2 个字段
- 思考订单表中 `user_id` 为什么常常值得建索引

## 课后总结

- 索引是查询优化的重要工具，但不是万能药
- 查询模式决定索引价值
- 先理解业务查询，再设计索引

## 参考文献

- SQLite query planner: https://www.sqlite.org/queryplanner.html
- PostgreSQL indexes: https://www.postgresql.org/docs/current/indexes.html

## 推荐论文

- Bayer & McCreight, _Organization and Maintenance of Large Ordered Indices_: https://dl.acm.org/doi/10.1145/1734663.1734671
