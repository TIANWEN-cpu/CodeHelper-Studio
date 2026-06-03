# ORM 的边界与 SQL 回退时机

## 你会学到

- 能说清 ORM 解决的主要问题
- 知道复杂报表和批量更新什么时候要回到 SQL
- 会避免 N+1 查询

## 先修知识

- Python + sqlite3
- SQLAlchemy 基础

## 为什么这节课重要

ORM 很好用，但把所有问题都丢给 ORM，后面你会在性能和可控性上吃亏。懂边界，项目才能稳。

## 核心知识

- ORM 擅长对象映射和简单 CRUD
- 复杂聚合、窗口函数、批量数据修复通常更适合直接写 SQL
- 先让数据层清晰，再决定封装层次

## 示例

```python
from sqlalchemy import select, func
stmt = select(User.id, func.count(Order.id)).join(Order).group_by(User.id)
```

## 继续练什么

- 找一条复杂报表，比较 ORM 写法和原生 SQL 写法
- 识别一个典型 N+1 查询场景

## 参考资料

- [SQLAlchemy Unified Tutorial](https://docs.sqlalchemy.org/en/20/tutorial/)
- [SQLite SQL Language](https://sqlite.org/lang.html)

## 推荐论文 / 经典文章

- [Object-relational impedance mismatch](https://en.wikipedia.org/wiki/Object%E2%80%93relational_impedance_mismatch)
