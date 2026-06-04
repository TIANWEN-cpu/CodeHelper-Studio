# 用测试数据验证 SQL

## 你会学到

- 会写最小可验证样例数据
- 知道边界数据为什么重要
- 能用少量数据快速卡出 SQL bug

## 先修知识

- CRUD
- WHERE / GROUP BY

## 为什么这节课重要

不会造样例数据，很多 SQL 只能靠感觉。会自己造 5 到 10 行测试数据，是从初学者走向靠谱开发者的分水岭。

## 核心知识

- 样例数据要覆盖正常值、空值、重复值和边界值
- 先构造你能手算出结果的小数据集
- 测试 SQL 就像测试函数，也要有预期输出

## 示例

```sql
CREATE TABLE users(id INTEGER, city TEXT);
INSERT INTO users VALUES
(1, Shanghai),
(2, NULL),
(3, Shenzhen);
```

## 继续练什么

- 为一条 group by SQL 设计 6 行以内测试数据
- 给 left join 场景补一行“右表缺失”的数据

## 参考资料

- [SQLite SQL Language](https://sqlite.org/lang.html)
- [Agile Data Database Testing](https://www.agiledata.org/essays/databaseTesting.html)

## 推荐论文 / 经典文章

- [An Axiomatic Basis for Computer Programming](https://bitfragment.net/notes/proglang-src-hoare-axiomatic-1969/)
