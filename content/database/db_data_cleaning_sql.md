# SQL 数据清洗与脏数据处理

## 你会学到

- 会处理 `NULL`、空字符串和脏值
- 知道 `COALESCE`、`CASE` 在清洗中的作用
- 形成先清洗再分析的习惯

## 为什么这节课重要

真实数据经常不是“整整齐齐的表”，而是一堆缺失值、别名和格式不统一。能不能把脏数据先收拾干净，往往决定后面的报表是不是可信。

## 核心知识

- `NULL` 不等于空字符串。
- `COALESCE` 用来给缺失值兜底。
- `CASE` 适合做分箱、标签和清洗规则。

## 示例

```sql
SELECT
    name,
    COALESCE(phone, 'unknown') AS phone
FROM users;
```

## 常见误区

- 把 `NULL` 和 0、空串混为一谈
- 还没清洗就直接聚合分析
- 清洗规则写死但不说明原因

## 继续练什么

- 把空手机号显示成 `unknown`
- 把状态值 `y/n/yes/no` 统一成两类

## 参考资料

- [SQLite Core Functions](https://sqlite.org/lang_corefunc.html)
- [PostgreSQL Conditional Expressions](https://www.postgresql.org/docs/current/functions-conditional.html)

## 推荐论文 / 经典文章

- [Data Cleaning: Problems and Current Approaches](https://www.cs.umd.edu/~gangqu/cmsc710/papers/DataCleaning.pdf)
  这是理解脏数据问题全景的一篇经典综述。
