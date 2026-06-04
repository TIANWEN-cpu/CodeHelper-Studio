# 配置对象与 Options 校验

## 你会学到

- 会定义配置对象
- 知道 Options 模式为什么更稳
- 会给关键配置加简单校验

## 先修知识

- 类与对象
- JSON 基础

## 为什么这节课重要

项目越往后，配置越多。越晚把配置收成类型化对象，后面越容易到处散落字符串键名。

## 核心知识

- 配置对象让依赖更清晰
- 关键配置要在启动阶段就校验
- 别把 API Key、连接串写死在业务代码里

## 示例

```csharp
public class ApiOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public int TimeoutSeconds { get; set; } = 10;
}
```

## 继续练什么

- 给 API 配置写一个 Options 类
- 给 timeout 增加大于 0 的校验规则

## 参考资料

- [Options pattern in .NET](https://learn.microsoft.com/en-us/dotnet/core/extensions/options)
- [Configuration in .NET](https://learn.microsoft.com/en-us/dotnet/core/extensions/configuration)

## 推荐论文 / 经典文章

- [The Twelve-Factor App - Config](https://12factor.net/config)
