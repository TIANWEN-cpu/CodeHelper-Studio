# SQL CRUD 与条件查询

## 学习目标

- 会写最核心的增删改查
- 理解查询条件和排序
- 建立“先查后改”的安全习惯

## SELECT

最常见的是查询：

```sql
SELECT name, score
FROM students;
```

## INSERT

插入数据：

```sql
INSERT INTO students (name, score)
VALUES ('Tom', 88);
```

## UPDATE

更新数据前，最好先用同样条件 `SELECT` 一遍确认范围：

```sql
UPDATE students
SET score = 90
WHERE name = 'Tom';
```

## DELETE

删除一定要带条件：

```sql
DELETE FROM students
WHERE name = 'Tom';
```

## WHERE 与 ORDER BY

```sql
SELECT name, score
FROM students
WHERE score >= 60
ORDER BY score DESC;
```

## 为什么“先查后改”很重要

很多线上事故不是不会写 SQL，而是条件写错。养成这个习惯：

1. 先写 `SELECT ... WHERE ...`
2. 确认命中范围
3. 再把它改成 `UPDATE` 或 `DELETE`

## 本课总结

CRUD 是数据库最常用的操作，但真正的专业感体现在“是否知道自己改到了哪些数据”。
