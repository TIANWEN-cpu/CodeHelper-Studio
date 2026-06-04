# LINQ 投影、分组与聚合

## 你会学到

- 会写 Select / GroupBy / OrderBy 组合
- 知道什么时候该回到 for 循环
- 能把 LINQ 结果映射成 DTO

## 先修知识

- 集合与循环
- LINQ 基础

## 为什么这节课重要

C# 的数据处理力很大一部分来自 LINQ。只会 Where 不够，真正常用的是投影、分组和聚合。

## 核心知识

- 投影是把原始对象变成更适合展示的数据形态
- GroupBy 之后通常要接 Select 做聚合输出
- LINQ 写法清晰比“一个链条到底”更重要

## 示例

```csharp
var result = orders
    .GroupBy(x => x.UserId)
    .Select(g => new { UserId = g.Key, Total = g.Sum(x => x.Amount) })
    .OrderByDescending(x => x.Total);
```

## 继续练什么

- 把订单列表按用户聚合总金额
- 用 Select 投影成更适合 UI 的匿名对象

## 参考资料

- [Working with LINQ](https://learn.microsoft.com/en-us/dotnet/csharp/linq/)
- [Projection operations](https://learn.microsoft.com/en-us/dotnet/csharp/linq/standard-query-operators/projection-operations)

## 推荐论文 / 经典文章

- [Language Integrated Query (LINQ)](https://www.microsoft.com/en-us/research/publication/language-integrated-query-linq/)
