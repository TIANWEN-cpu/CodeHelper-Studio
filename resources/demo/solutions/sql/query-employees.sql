# 查询所有员工 - SQL 题解

## 题目
表结构: employees(id INT, name TEXT, salary INT)
查询所有员工的姓名和薪资，按薪资降序排列。

## 解法

```sql
SELECT name, salary FROM employees ORDER BY salary DESC;
```

## 核心知识点
- `SELECT` 指定要查询的列
- `FROM` 指定数据来源的表
- `ORDER BY ... DESC` 降序排列（ASC 为升序，默认可省略）
