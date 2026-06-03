# 依赖注入生命周期

## 你会学到

- 理解三种常见生命周期的语义
- 知道为什么 Scoped 不能乱塞到 Singleton
- 会给典型服务做生命周期选择

## 先修知识

- 接口
- 服务注册基础

## 为什么这节课重要

会注册服务不难，难的是注册对。生命周期错了，后面就是线程问题、状态串味和资源泄漏。

## 核心知识

- Singleton 适合无状态或全局共享对象
- Scoped 常见于请求级上下文
- Transient 适合轻量、一次性依赖

## 示例

```csharp
services.AddSingleton<IClock, SystemClock>();
services.AddScoped<IUserContext, UserContext>();
services.AddTransient<ReportFormatter>();
```

## 继续练什么

- 判断日志服务、用户上下文、格式化器分别适合什么生命周期
- 解释一个 Scoped 依赖被 Singleton 引用的问题

## 参考资料

- [Dependency injection in .NET](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection)
- [Service lifetimes](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection#service-lifetimes)

## 推荐论文 / 经典文章

- [Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html)
