# 后台服务与周期任务入门

## 你会学到

- 知道后台服务的典型场景
- 会写最小 ExecuteAsync 循环
- 理解取消令牌为什么重要

## 先修知识

- async / await
- DI 基础

## 为什么这节课重要

很多桌面工具和后端服务都不是“点一下跑完就结束”，而是要长期监听、轮询、同步，这就要进入后台服务的视角。

## 核心知识

- 后台服务适合轮询、同步、清理和观察任务
- 循环里要尊重取消信号
- 周期任务要控制节奏，不要死循环狂跑

## 示例

```csharp
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    while (!stoppingToken.IsCancellationRequested)
    {
        await Task.Delay(1000, stoppingToken);
    }
}
```

## 继续练什么

- 写一个每 5 秒打印一次状态的后台服务
- 思考日志清理任务适不适合用 BackgroundService

## 参考资料

- [Background tasks with hosted services](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services)
- [Generic Host](https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host)

## 推荐论文 / 经典文章

- [The Datacenter as a Computer](https://static.googleusercontent.com/media/research.google.com/en//archive/gfs-sosp2003.pdf)
