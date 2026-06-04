# 查询计划与性能排查入门

## 学习目标

- 理解数据库执行查询前为什么要“做计划”
- 会看最基本的 `EXPLAIN` 结果
- 知道性能优化前为什么要先观察

## 为什么同样是查询，速度差这么大

因为数据库不只是“执行你写的 SQL”，它还要决定：

- 先扫哪张表
- 是否使用索引
- 是不是得做排序或临时表

这一步就是查询计划。

## 先建立一个朴素认知

如果一个查询总是在全表扫描，而你的数据量又很大，那它大概率会慢。  
但慢的原因不一定只是“没索引”，也可能是：

- 条件写法让索引失效
- 排序代价高
- 连接顺序不理想

## 学 `EXPLAIN` 的意义

你不需要一开始就看懂所有细节。  
先学会分辨：

- 有没有走索引
- 有没有做全表扫描
- 有没有出现额外排序

## 参考文献

- [SQLite Query Planner](https://www.sqlite.org/queryplanner.html)
- [SQLite EXPLAIN QUERY PLAN](https://sqlite.org/eqp.html)

## 推荐论文 / 文章

- [MapReduce: Simplified Data Processing on Large Clusters](https://research.google.com/archive/mapreduce-osdi04.pdf)
  它会帮助你逐渐建立“性能问题本质上是执行代价问题”的感觉。
