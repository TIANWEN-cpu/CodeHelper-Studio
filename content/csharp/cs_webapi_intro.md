# ASP.NET Web API 的第一印象

## 你会学到

- 认识最小 API 路由是什么样
- 理解请求进来后如何被处理
- 知道 C# 也很适合后端接口开发

## 为什么这节课重要

很多人学 C# 时只接触控制台或桌面程序，但它同样是一条成熟的后端路线。先建立最小心智模型，后面再深入会轻松很多。

## 核心知识

- 路由决定 URL 对应哪段处理逻辑。
- 请求和响应是接口的核心对象。
- 最小 API 适合快速理解接口结构。

## 示例

```csharp
var app = WebApplication.Create();
app.MapGet("/ping", () => new { ok = true });
app.Run();
```

## 常见误区

- 把最小 API 当成完整架构
- 还没理解 HTTP 就急着上复杂框架
- 接口返回结构不稳定

## 继续练什么

- 给 `/ping` 返回当前时间
- 再写一个 `/hello/{name}` 路由

## 参考资料

- [ASP.NET Core minimal APIs](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis)

## 推荐论文 / 经典文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  框架不会替你做架构判断，先缩小问题范围最重要。
