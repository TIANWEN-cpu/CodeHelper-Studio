# 实体建模与本地文件持久化

## 你会学到

- 会把对象序列化为 JSON
- 理解实体类和存储层的分工
- 为数据库连接做过渡

## 为什么这节课重要

真实项目很少一上来就直连数据库。先学会把模型和持久化分层，会让你后面接数据库时思路更稳。

## 核心知识

- 实体负责表达数据形状。
- 持久化层负责保存和读取。
- 文件存储是数据库前非常好的过渡。

## 示例

```csharp
var json = JsonSerializer.Serialize(task);
File.WriteAllText("task.json", json);
```

## 常见误区

- 把 IO 逻辑塞进实体对象本身
- 模型字段改了，却没同步更新持久化逻辑
- 没有处理编码和异常

## 继续练什么

- 把任务对象保存到 `task.json`
- 读回 JSON 后输出标题字段

## 参考资料

- [System.Text.Json overview](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview)
- [File and Stream I/O](https://learn.microsoft.com/en-us/dotnet/standard/io/)

## 推荐论文 / 经典文章

- [Information Hiding and Modularization](https://www.cs.cmu.edu/~ModProb/readings/LiskovHiding80.pdf)
  把“数据长什么样”和“怎么保存”隔开，是很值得早养成的习惯。
