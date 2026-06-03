# C# 测试起步：先守住回归，再谈扩展

## 你会学到

- 理解为什么测试不是“写完再补”的附属品
- 知道断言在验证什么
- 学会从一个纯函数开始写最小测试

## 为什么这节课重要

很多人学 C# 学到后面，功能越写越多，但一改就怕。测试不会让你一次写对所有代码，却能让你在修改时更安心，也能帮你把 bug 变成可复现的问题。

## 最小示例

```csharp
using Xunit;

public class ScoreTests
{
    [Fact]
    public void Passed_WhenScoreIs60OrMore()
    {
        Assert.True(IsPassed(80));
    }
}
```

## 核心知识

- 测试名要表达行为和预期
- 断言是在验证“结果是否符合约定”
- 最适合先写测试的是纯函数和小逻辑

## 常见误区

- 只测最顺利的路径
- 测试名随便写，过几天自己都看不懂
- 一上来就测大而复杂的流程

## 小练习

- 给一个 `Add(a, b)` 函数写两条测试
- 再给一个边界情况写测试
- 修一个 bug 后补一条回归测试

## 参考资料

- [Unit testing C# with xUnit](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-with-xunit)
- [Use unit testing in C#](https://learn.microsoft.com/en-us/training/modules/dotnet-developer-test/2-understand-unit-testing)

## 推荐论文 / 经典文章

- [An Axiomatic Basis for Computer Programming](https://research.cs.queensu.ca/home/cordy/cisc860/Biblio/drb/GS/hoare69.pdf)
  这篇文章会提醒你：验证程序行为，本来就是编程这件事的一部分。
