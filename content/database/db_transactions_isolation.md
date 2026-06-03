# 事务与隔离级别：让数据变更更可靠

## 学习目标

- 理解事务为什么存在
- 知道提交、回滚的直觉意义
- 对隔离级别先建立概念，不急着死记名词

## 先修知识

- 基础 CRUD
- 多表关系和约束更有帮助

## 为什么这节课重要

数据库不是只管“查出来”，还要管“改的时候别把数据改坏”。  
事务就是在说：

- 这一组操作要么一起成功
- 要么一起失败

## 最小事务直觉

转账场景最容易理解：

1. A 扣钱
2. B 加钱

如果只做成一半，数据就乱了。  
事务就是把这两步绑成一个整体。

## 最小 SQL 例子

```sql
BEGIN;

UPDATE accounts
SET balance = balance - 100
WHERE id = 1;

UPDATE accounts
SET balance = balance + 100
WHERE id = 2;

COMMIT;
```

如果中间失败，可以：

```sql
ROLLBACK;
```

## 隔离级别先记什么

你现在不用一口气背完整表格，先理解：

- 多个事务一起改数据时，彼此可能互相影响
- 隔离级别是在平衡“正确性”和“并发性能”

## 常见问题关键词

- 脏读
- 不可重复读
- 幻读

先把它们当成“并发时看到的数据不稳定现象”。

## 小练习

- 写一段转账事务伪代码
- 说出为什么只执行一半会有风险

## 课后总结

- 事务保证一组操作的完整性
- `COMMIT` 是确认提交
- `ROLLBACK` 是撤回变更
- 隔离级别是在控制并发下的数据稳定性

## 参考文献

- PostgreSQL transactions: https://www.postgresql.org/docs/current/tutorial-transactions.html
- SQLite transactions: https://www.sqlite.org/lang_transaction.html

## 推荐论文

- Jim Gray, _The Transaction Concept_: https://www.microsoft.com/en-us/research/publication/the-transaction-concept-virtues-and-limitations/
