# 索引、约束与事务基础

## 学习目标

- 理解索引为什么会影响查询速度
- 知道事务解决什么问题
- 会区分主键、唯一约束和外键的大致作用

## 索引不是越多越好

索引的作用很像目录。  
它能帮助查询更快找到目标，但也会增加写入和维护成本。

所以真正该问的问题不是“能不能建索引”，而是：

- 这个字段常查吗？
- 查询慢点真的在这里吗？

## 事务解决什么

事务通常用来保证“一组操作要么都成功，要么都失败”。  
比如转账时，一边扣钱一边加钱，不能只成功一半。

## 约束的直觉理解

- 主键：这条记录的身份证
- 唯一约束：这个字段不能重复
- 外键：两个表之间的引用关系

## 参考文献

- [SQLite Query Planner](https://www.sqlite.org/queryplanner.html)
- [SQLite Transaction](https://www.sqlite.org/lang_transaction.html)
- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

## 推荐论文 / 文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  它能帮助你把约束和关系看成设计的一部分，而不是补丁。
