# HttpClient 与 JSON：让 C# 也能轻松连接口

## 你会学到

- 理解 `HttpClient` 的基本角色
- 会发一个最小 GET 请求
- 知道如何把 JSON 响应转成对象或文本

## 为什么这节课重要

一旦你开始做接口、桌面同步、后台服务，网络请求就是绕不过去的能力。C# 在这方面其实很顺手，只要先掌握最小闭环：请求、读取、解析、处理。

## 示例

```csharp
using System.Net.Http;

var client = new HttpClient();
var text = await client.GetStringAsync("https://example.com/api/ping");
Console.WriteLine(text);
```

## 核心知识

- `HttpClient` 负责发请求和收响应
- 最小起步时可以先读字符串，再考虑反序列化
- JSON 解析建议和数据模型一起设计

## 常见误区

- 每次请求都随手 new 很多 `HttpClient`
- 还没理解响应结构就急着复杂建模
- 只考虑成功路径，不处理超时和失败

## 小练习

- 请求一个公开接口并打印响应文本
- 只提取其中两个字段
- 请求失败时打印友好错误提示

## 参考资料

- [HttpClient Class](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient)
- [How to serialize and deserialize JSON in .NET](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/how-to)

## 推荐论文 / 经典文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  一旦开始连接口，项目很容易瞬间膨胀，所以“先做最小成功请求”特别重要。
