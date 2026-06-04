# PostgreSQL 入门与开发者工作流

## 你会学到

- 认识服务端数据库和 SQLite 的差异
- 会用 `psql` 连接数据库
- 理解数据库、模式和表的层次

## 为什么这节课重要

SQLite 很适合本地工具，但服务端项目常常需要 PostgreSQL 这类真正的数据库服务。先把工作流看懂，再学性能和高级特性会轻松很多。

## 核心知识

- 服务端数据库需要连接、用户和权限。
- `psql` 是最基础也最重要的入口。
- 模式（schema）帮助组织对象。

## 示例

```bash
psql -d learn_db
```

## 常见误区

- 把 SQLite 的单文件心智直接套到 PostgreSQL
- 只会 GUI，不会命令行连接
- 没有建立“服务在运行中”的概念

## 继续练什么

- 连接一个本地 PostgreSQL 数据库并列出表
- 创建 schema 后在其中建一张测试表

## 参考资料

- [PostgreSQL tutorial](https://www.postgresql.org/docs/current/tutorial-start.html)
- [Joins Between Tables](https://www.postgresql.org/docs/current/tutorial-join.html)

## 推荐论文 / 经典文章

- [The Design of POSTGRES](https://dsf.berkeley.edu/papers/ERL-M85-95.pdf)
  能帮你理解 PostgreSQL 这条技术路线背后的设计取向。
