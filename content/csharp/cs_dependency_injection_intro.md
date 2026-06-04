# 依赖注入直觉：先理解“不要在类里到处 new”

## 学习目标

- 理解依赖注入为什么存在
- 知道构造函数注入的最小写法
- 明白它是在帮你降低耦合，不是在增加术语

## 先修知识

- 类与对象
- 接口

## 为什么这节课重要

很多初学者写类时喜欢在内部直接：

```csharp
var repo = new UserRepository();
```

这在小例子里没问题，但项目变大后会带来两个问题：

- 类和具体实现绑死
- 测试和替换实现都更难

## 最小直觉

别在类里自己造依赖，而是让外部把依赖传进来。

```csharp
public interface ILogger
{
    void Log(string message);
}

public class UserService
{
    private readonly ILogger _logger;

    public UserService(ILogger logger)
    {
        _logger = logger;
    }
}
```

## 你现在先记住什么

- 依赖注入不是框架专属概念
- 构造函数传入依赖，就是最小依赖注入
- 它的核心目的是解耦

## 常见错误

- 一听依赖注入就只想到容器和配置
- 明明不复杂的依赖，也搞得过度抽象

## 小练习

- 把一个内部自己 `new` 仓储类的服务，改成构造函数注入

## 课后总结

- 依赖注入是在帮你控制耦合
- 先理解“外部传进来”，再看框架容器

## 参考文献

- Microsoft dependency injection basics: https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection

## 推荐阅读

- Martin Fowler, _Inversion of Control Containers and the Dependency Injection pattern_: https://martinfowler.com/articles/injection.html
