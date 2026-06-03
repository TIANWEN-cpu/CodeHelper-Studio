# 泛型与约束：让复用更稳

## 你会学到

- 知道泛型解决的重复代码问题
- 会写 where 约束
- 理解约束让 API 更安全

## 先修知识

- 类与对象
- 接口基础

## 为什么这节课重要

C# 很强的一点是可以把通用能力写得既复用又安全，泛型约束就是其中很关键的一步。

## 核心知识

- 泛型让算法和数据结构对多类型复用
- 约束告诉编译器“这个类型至少有什么能力”
- 先想清楚调用方真正需要什么，再设计约束

## 示例

```csharp
public static T FirstOrDefault<T>(List<T> items)
{
    return items.Count > 0 ? items[0] : default!;
}
```

## 继续练什么

- 写一个带 where T : class 约束的方法
- 思考为什么仓储接口常配合泛型使用

## 参考资料

- [Generics in C#](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/)
- [Constraints on type parameters](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/constraints-on-type-parameters)

## 推荐论文 / 经典文章

- [Design Patterns as Language Constructs](https://birrell.org/andrew/papers/pat4.pdf)
