# 泛型、LINQ 与集合处理

## 学习目标

- 理解泛型为什么能提升复用性
- 会写最基础的 LINQ 查询
- 体验 C# 在数据处理上的表达力

## 泛型的朴素理解

泛型就是：  
“我先把逻辑写对，再让类型参数去适配不同数据。”

## 一个简单的 LINQ 例子

```csharp
var passed = scores.Where(x => x >= 60).ToList();
```

这类写法的价值不只是“短”，而是意图很清楚：  
我要筛选，而不是手动维护一堆流程变量。

## 常见误区

- 还没搞清集合，就急着用很复杂的 LINQ 链式写法
- 只追求写得短，不追求读得懂

## 参考文献

- [Introduction to LINQ queries](https://learn.microsoft.com/en-us/dotnet/csharp/linq/get-started/introduction-to-linq-queries)
- [Generics in C#](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/generics)

## 推荐论文 / 文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  它提醒我们：更高级的抽象不是为了炫，而是为了更好地控制复杂度。
