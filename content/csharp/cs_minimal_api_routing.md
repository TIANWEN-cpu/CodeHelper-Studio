# Minimal API 路由与参数：先会表达接口入口

## 学习目标

- 会读懂最小 `MapGet` / `MapPost`
- 知道路由参数在表达什么
- 对后端接口入口建立更清晰的直觉

## 先修知识

- HttpClient
- Web API 第一印象更容易衔接

## 为什么这节课重要

很多人第一次学后端，会把注意力全放在框架配置上。  
其实第一步更重要的是：

- 接口入口长什么样
- 参数从哪来
- 返回值怎么表达

## 最小例子

```csharp
app.MapGet("/users/{id}", (int id) => new { Id = id });
```

这里的重点是：

- 路由里有 `{id}`
- 处理函数能直接拿到 `id`

## 常见错误

- 路由设计不清晰
- 参数命名随意
- 一个处理函数里塞太多逻辑

## 小练习

- 写一个 `/ping` 路由
- 写一个带 `{id}` 的最小查询路由

## 课后总结

- 路由是接口的入口设计
- 先学会把入口写清楚，再做更复杂的后端逻辑

## 参考文献

- ASP.NET Core minimal APIs: https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis

## 推荐阅读

- Microsoft Learn minimal APIs tutorials
