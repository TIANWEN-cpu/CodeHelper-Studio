# 统计部门人数 - SQL 题解

## 题目
表结构: employees(id INT, name TEXT, department TEXT)
统计每个部门的人数。

## 解法

```sql
SELECT department, COUNT(*) as count FROM employees GROUP BY department;
```

## 核心知识点
- `COUNT(*)` 统计行数
- `GROUP BY` 按列分组，相同值的行归为一组
- `as count` 为结果列起别名
