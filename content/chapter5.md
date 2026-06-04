# 第五章：高级 SQL 与 数据库联查

## 1. 聚合函数

- `COUNT()`: 计数
- `AVG()`: 平均值
- `SUM()`: 求和

## 2. 连接查询 (JOIN)

通过外键将多张表关联起来。

```sql
SELECT students.name, courses.title
FROM students
JOIN scores ON students.id = scores.student_id;
```
