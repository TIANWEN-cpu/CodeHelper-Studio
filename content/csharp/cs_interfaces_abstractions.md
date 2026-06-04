# 接口、抽象与依赖反转直觉

## 你会学到

- 理解接口定义的是“合同”不是“实现”
- 会用接口隔离变化点
- 知道什么时候该引入抽象，什么时候不该

## 为什么这节课重要

接口不是为了显得高级，而是为了让“以后可能变的地方”不要牵连所有调用方。早一点理解这层抽象，会让你的 C# 项目更像真正的软件。

## 核心知识

- 接口只描述能力，不描述具体做法。
- 依赖接口而不是依赖具体类，替换实现会更容易。
- 抽象是有成本的，过早抽象会让代码更空。

## 示例

```csharp
public interface INotifier
{
    void Send(string message);
}

public class EmailNotifier : INotifier
{
    public void Send(string message) => Console.WriteLine(message);
}
```

## 常见误区

- 所有类都先硬拆出接口，结果代码变空
- 接口名没有表达能力边界
- 抽象层只多了一层转发，没有减少耦合

## 继续练什么

- 为日志发送定义一个 `ILogger` 接口
- 写两个实现：控制台版和文件版

## 参考资料

- [interface keyword - C# reference](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/interface)
- [Interfaces - define behavior for multiple types](https://learn.microsoft.com/en-ca/dotnet/csharp/fundamentals/types/interfaces)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  接口设计最核心的问题，其实就是模块边界放在哪里。
