# 数据迁移基础：让表结构变化也有秩序

## 学习目标

- 理解为什么表结构变更需要管理
- 知道迁移脚本在做什么
- 对“升级数据库结构”建立最小流程感

## 先修知识

- CREATE TABLE
- ALTER TABLE

## 为什么这节课重要

项目一开始只有一张表时，直接手改还看不出问题。  
但一旦团队协作、版本迭代，结构变更如果没有记录，就会非常乱。

## 最小迁移例子

```sql
ALTER TABLE users
ADD COLUMN last_login TEXT;
```

迁移的关键不是这条 SQL 本身，而是：

- 什么时候执行
- 谁执行过
- 如何回溯版本

## 迁移先怎么理解

- 它是在记录“数据库结构从 A 变到 B”
- 它不是普通业务 SQL，而是结构演进历史

## 常见错误

- 直接在生产表上手工改，却不留记录
- 修改结构时不考虑旧数据兼容

## 小练习

- 写一个给 `users` 表加列的迁移 SQL
- 想一想怎么记录“这次改动已经执行过”

## 课后总结

- 迁移是在管理结构变化
- 越早建立迁移意识，后面越省事

## 参考文献

- Alembic docs: https://alembic.sqlalchemy.org/
- EF Core migrations: https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/

## 推荐阅读

- Fowler on Evolutionary Database Design
