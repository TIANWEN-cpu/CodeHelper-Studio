# async / await 与 Task：把等待写得更自然

## 学习目标

- 建立 `Task` 是“未来结果”的直觉
- 会读懂最小 `async / await` 代码
- 知道为什么异步不是“更高级”，而是“更适合某些等待型任务”

## 先修知识

- 方法
- 异常处理
- HttpClient 基础更容易串起来

## 为什么这节课重要

现代 C# 项目里，异步几乎躲不开。  
但很多人一上来就被语法和线程概念吓住。其实第一步只要想清楚：

- 某些操作要等
- 等的时候不想把主流程卡死
- 那就把“结果稍后再来”这件事写清楚

## 最小例子

```csharp
using System;
using System.Threading.Tasks;

public class Demo
{
    public static async Task Main()
    {
        string value = await GetMessageAsync();
        Console.WriteLine(value);
    }

    static async Task<string> GetMessageAsync()
    {
        await Task.Delay(300);
        return "done";
    }
}
```

你先别急着想线程池，先把它理解成：

- `Task<string>`：未来会得到一个字符串
- `await`：在这里等结果回来

## 什么时候值得考虑异步

- 网络请求
- 文件 I/O
- 数据库访问
- 任何“主要时间耗在等待”的任务

## 常见错误

- 把异步当成“让所有代码都更快”
- 在不需要等待的纯计算里乱上 async
- 忘记 `await`，结果拿到的是 `Task` 而不是最终值

## 小练习

- 写一个异步方法，等待 1 秒后返回 `"ok"`
- 用 `await` 调它并输出结果

## 课后总结

- `Task` 可以先理解成“未来结果”
- `await` 让等待写法更自然
- 异步最适合等待型任务，不是所有地方都必须用

## 参考文献

- Microsoft Learn async overview: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/
- Task class: https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task

## 推荐阅读

- Stephen Cleary, _Async/Await - Best Practices in Asynchronous Programming_: https://learn.microsoft.com/en-us/archive/msdn-magazine/2013/march/async-await-best-practices-in-asynchronous-programming
