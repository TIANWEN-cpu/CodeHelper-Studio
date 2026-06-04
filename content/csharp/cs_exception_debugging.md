# C# 异常处理与调试起步

## 你会学到

- 会写最小 `try/catch`
- 理解异常和返回值的边界
- 知道调试时先看调用栈

## 为什么这节课重要

真正的稳定不是“永远不报错”，而是报错时你知道怎么定位、怎么缩小范围、怎么给用户合理反馈。

## 核心知识

- 异常代表异常路径，不该替代所有普通判断。
- 调用栈能告诉你问题从哪里一路传下来。
- 先保留上下文，再决定是否吞掉异常。

## 示例

```csharp
try
{
    int score = int.Parse(scoreText);
}
catch (FormatException)
{
    Console.WriteLine("分数格式不正确");
}
```

## 常见误区

- 直接 `catch (Exception)` 却不处理
- 为了省事把异常全部吞掉
- 日志里不保留任何上下文

## 继续练什么

- 把 `Parse` 改成 `TryParse`
- 写出一个带用户提示的文件读取异常处理

## 参考资料

- [Exceptions and error handling](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/exceptions/)

## 推荐论文 / 经典文章

- [An Axiomatic Basis for Computer Programming](https://research.cs.queensu.ca/home/cordy/cisc860/Biblio/drb/GS/hoare69.pdf)
  调试和正确性意识本质上是一体两面。
