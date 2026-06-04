# SQLite 与 Python 的最小连接

## 你会学到

- 会在 Python 中连接 SQLite
- 会执行最小 CRUD
- 理解参数化查询为什么重要

## 为什么这节课重要

这是很多学习型项目的真正起点：一边有 Python 逻辑，一边有数据库状态。把这条链路打通，你的项目会立刻像样很多。

## 核心知识

- 连接、游标、提交是最基础的工作流。
- 参数化查询能避免拼字符串 SQL。
- 先做最小表结构，再接业务逻辑。

## 示例

```python
import sqlite3

conn = sqlite3.connect("learn.db")
cur = conn.cursor()
cur.execute("CREATE TABLE IF NOT EXISTS tasks (title TEXT)")
cur.execute("INSERT INTO tasks (title) VALUES (?)", ("study sql",))
conn.commit()
```

## 常见误区

- 直接拼接 SQL 字符串
- 写完数据却忘记 `commit`
- 把连接对象到处乱传，不做封装

## 继续练什么

- 创建一个 `tasks` 表并插入 2 条记录
- 查询出所有任务标题并打印

## 参考资料

- [sqlite3 — DB-API 2.0 interface for SQLite databases](https://docs.python.org/3/library/sqlite3.html)
- [SQLite SQL language](https://sqlite.org/lang.html)

## 推荐论文 / 经典文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  语言和数据库连接之后，更要回到“关系”本身是什么。
