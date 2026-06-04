# 窗口函数与报表思维升级

## 你会学到

- 理解窗口函数和聚合函数的区别
- 会写最小排名 SQL
- 知道报表类问题为什么离不开窗口函数

## 为什么这节课重要

一旦你开始做排行榜、累计值、分组内排序，窗口函数就会像开关一样把很多拧巴的 SQL 突然拉直。

## 核心知识

- 窗口函数不会把多行压成一行。
- `OVER` 子句定义了窗口范围。
- 排名、累计、分组内比较是最常见场景。

## 示例

```sql
SELECT
    name,
    score,
    RANK() OVER (ORDER BY score DESC) AS score_rank
FROM students;
```

## 常见误区

- 把窗口函数和 `GROUP BY` 混成一类
- 忘记写 `ORDER BY`，结果排名无意义
- 不先用小样本数据验证结果

## 继续练什么

- 给订单金额做降序排名
- 按班级分组后给每个学生排名

## 参考资料

- [SQLite Window Functions](https://www.sqlite.org/windowfunctions.html)

## 推荐论文 / 经典文章

- [Efficient Support for Advanced SQL Window Functions](https://www.vldb.org/pvldb/vol8/p1058-leis.pdf)
  如果以后要深入查询性能，这篇很值得收藏。
