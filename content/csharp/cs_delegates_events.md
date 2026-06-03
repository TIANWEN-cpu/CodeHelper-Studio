# 委托、事件与可扩展设计

## 你会学到

- 理解委托和事件的关系
- 能读懂最小事件代码
- 知道它们为什么能帮助解耦

## 为什么这节课重要

事件模型会把“谁发起变化”和“谁响应变化”分开。这种分离是桌面应用、表单和很多业务系统里非常重要的设计味道。

## 核心知识

- 委托描述可被调用的方法签名。
- 事件是对委托的一种受控封装。
- 发布者和订阅者不必强耦合在一起。

## 示例

```csharp
public class Tracker
{
    public event Action? Saved;

    public void Save()
    {
        Saved?.Invoke();
    }
}
```

## 常见误区

- 分不清委托类型和事件实例
- 事件触发前不判空
- 把所有模块直接绑死在一起

## 继续练什么

- 声明一个 `Saved` 事件并触发它
- 给控制台程序加一个“保存完成”回调

## 参考资料

- [Delegates and events](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/delegates/)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  事件驱动的好处，本质上也是模块边界更清晰。
