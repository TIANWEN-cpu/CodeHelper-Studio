# 约束、外键与数据一致性

## 你会学到

- 理解 `NOT NULL`、`UNIQUE`、`CHECK`、`FOREIGN KEY` 的作用
- 知道为什么一致性应该尽量前移到数据库层
- 会写最小外键约束

## 为什么这节课重要

如果脏数据已经进表了，应用层再补救会越来越累。把一致性规则写进数据库，不是麻烦自己，而是帮未来的自己省时间。

## 核心知识

- 约束是数据进入表之前的第一道门。
- 外键负责表达表之间的引用关系。
- SQLite 中外键默认需要显式开启。

## 示例

```sql
CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 常见误区

- 只在应用层校验，不在数据库层兜底
- 外键列和被引用列类型不一致
- 忘记在 SQLite 连接上开启 `foreign_keys`

## 继续练什么

- 给订单表加上 `user_id` 外键
- 为 `price` 列加一个大于 0 的 `CHECK` 约束

## 参考资料

- [SQLite Foreign Key Support](https://sqlite.org/foreignkeys.html)
- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

## 推荐论文 / 经典文章

- [A Relational Model of Data for Large Shared Data Banks](https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks)
  关系模型的意义之一，就是把数据关系正式表达出来。
