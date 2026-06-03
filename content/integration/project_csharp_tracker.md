# 项目五：C# 学习记录控制台应用

## 项目目标

- 记录学习条目
- 保存学习时长和主题
- 支持查看历史记录与简单统计

## 推荐 MVP 范围

- 新增记录
- 查看全部记录
- 按主题统计次数
- 把数据保存到本地文件

## 推荐拆分

- `StudyRecord` 类
- `RecordRepository`
- `RecordService`
- `Program` 入口流程

## 验收标准

- 程序能运行
- 数据能保存并再次读取
- 核心逻辑不是全部堆在 `Main`

## 学习收获

这个项目会让你第一次比较完整地体会到：  
类、集合、文件和程序入口怎么一起组成一个像样的小应用。

## 参考文献

- [Get started with C#](https://learn.microsoft.com/en-us/training/paths/get-started-c-sharp-part-1/)
- [A tour of C#](https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/overview)
- [Exceptions and exception handling](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/exceptions/)

## 推荐论文 / 文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  做这个项目时读它，会特别容易体会“模块边界”的意义。
