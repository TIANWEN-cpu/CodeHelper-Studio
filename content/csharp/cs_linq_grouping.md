# LINQ 分组与排序：把集合处理写得像查询

## 学习目标

- 会读懂 `Where`、`OrderBy`、`GroupBy` 这种 LINQ 链式写法
- 知道 LINQ 适合什么场景
- 能把一组对象做最小分组统计

## 先修知识

- 集合
- lambda 表达式的基础直觉

## 为什么这节课重要

LINQ 是 C# 很有代表性的表达能力。  
它的价值不是“写起来炫”，而是把集合处理写得更接近“我要什么结果”。

## 最小例子

```csharp
var scores = new[]
{
    new { Name = "A", Group = "G1", Score = 80 },
    new { Name = "B", Group = "G1", Score = 92 },
    new { Name = "C", Group = "G2", Score = 75 },
};

var result = scores
    .GroupBy(x => x.Group)
    .Select(g => new
    {
        Group = g.Key,
        Count = g.Count(),
        MaxScore = g.Max(x => x.Score)
    });
```

这个写法的重点是：

- `GroupBy` 负责按组聚合
- `Select` 负责投影出你真正关心的结果

## 常见错误

- 一上来链太长，自己也读不懂
- 把 LINQ 当成所有场景的唯一解
- 不知道它是延迟执行还是立即执行

## 小练习

- 用 `OrderByDescending` 给学生按分数排序
- 用 `GroupBy` 按班级统计人数

## 课后总结

- LINQ 很适合集合筛选、排序和投影
- 先写短链，再慢慢加复杂度
- 可读性始终比“写得短”更重要

## 参考文献

- LINQ overview: https://learn.microsoft.com/en-us/dotnet/csharp/linq/
- GroupBy docs: https://learn.microsoft.com/en-us/dotnet/api/system.linq.enumerable.groupby

## 推荐阅读

- Eric Lippert on LINQ series: https://ericlippert.com/category/linq/
