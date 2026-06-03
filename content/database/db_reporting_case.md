# 从原始记录到业务报表

## 学习目标

- 把明细表转成汇总报表
- 理解 `CASE`、聚合和分组如何一起工作
- 开始从“写语句”转向“回答业务问题”

## 报表不是多写几行 SQL

真正的难点不在语法，而在于先把问题问清楚。  
比如：

- 我到底想看销售额，还是订单数？
- 我是按天看，还是按品类看？
- 我是看绝对值，还是看区间分布？

## 一个常见模式

```sql
SELECT
  CASE
    WHEN amount < 100 THEN 'low'
    WHEN amount < 500 THEN 'medium'
    ELSE 'high'
  END AS level,
  COUNT(*) AS total
FROM orders
GROUP BY level;
```

这类写法在业务报表里非常常见。

## 常见误区

- 还没想清楚维度和指标，就开始写 SQL
- 把所有字段都塞进 SELECT，却忘了分组逻辑
- 只会查明细，不会做汇总

## 参考文献

- [SQLite SQL Language](https://sqlite.org/lang.html)
- [PostgreSQL Conditional Expressions](https://www.postgresql.org/docs/current/functions-conditional.html)

## 推荐论文 / 文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  它会帮你从更高层看待数据组织和查询的价值。
