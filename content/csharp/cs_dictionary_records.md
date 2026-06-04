# Dictionary、record 与轻量建模

## 你会学到

- 会用 `Dictionary` 存键值数据
- 理解 `record` 适合表达轻量数据模型
- 知道什么时候用字典，什么时候用类型

## 为什么这节课重要

很多程序不是输在算法，而是输在数据结构选得不合适。`Dictionary` 和 `record` 一个偏灵活，一个偏清晰，组合起来非常适合做业务建模入门。

## 核心知识

- `Dictionary` 适合按键快速访问。
- `record` 适合表达以数据为核心的模型。
- 先问“数据有没有稳定结构”，再决定用哪种表示。

## 示例

```csharp
public record Student(string Name, int Score);

var scores = new Dictionary<string, int>
{
    ["Tom"] = 95,
    ["Amy"] = 98,
};
```

## 常见误区

- 稳定结构的数据长期放在 `Dictionary` 里
- 把 `record` 当成所有对象的默认答案
- 忽略键不存在时的访问安全

## 继续练什么

- 用 `record` 表示一本书的信息
- 用 `Dictionary` 统计课程完成次数

## 参考资料

- [Records - C# reference](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record)
- [Dictionary<TKey,TValue> API](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2)

## 推荐论文 / 经典文章

- [Data Abstraction and Hierarchy](https://www.cs.utexas.edu/~wcook/Drafts/2009/essay.pdf)
  读完会更能体会“数据模型”和“操作”如何一起设计。
