# 表结构设计与范式直觉

## 你会学到

- 理解表设计比写 SQL 更决定系统质量
- 认识一对多、多对多为何需要中间表
- 建立最小范式直觉

## 为什么这节课重要

很多数据库项目后期难改，不是因为 SQL 写得不够花，而是因为表设计一开始就模糊。建模能力是数据库真正的地基。

## 核心知识

- 一个字段只表达一件事。
- 重复出现的实体要抽出来。
- 关系表解决的是“多对多”，而不是“多建几列”。

## 示例

```sql
CREATE TABLE enrollments (
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    enrolled_at TEXT NOT NULL
);
```

## 常见误区

- 把多个值塞进一个字段
- 学生和课程直接互相塞列表字段
- 先想到界面长什么样，而不是数据关系是什么

## 继续练什么

- 给“学生—课程”关系设计一张中间表
- 指出一个“电话1、电话2、电话3”表设计的问题

## 参考资料

- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [SQLite CREATE TABLE](https://sqlite.org/lang_createtable.html)

## 推荐论文 / 经典文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  关系模型的源头文章，值得在数据库学习早期就认识。
