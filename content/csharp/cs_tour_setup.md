# C# 学习地图与 .NET 环境准备

## 学习目标

- 理解 .NET SDK、项目文件和程序入口
- 会创建并运行一个最小的 C# 控制台程序
- 知道 C# 的整体风格为什么更偏工程化

## C# 给人的第一感觉

它通常比 Python 更规整，比 C 更安全，也更强调项目结构。  
如果你以后要做桌面工具、企业应用或 .NET 后端，C# 会非常值得学。

## 一个最小项目

现在常见的做法通常是先创建项目，再运行：

```bash
dotnet new console -n HelloCs
dotnet run
```

## 先理解这些词

- SDK：开发工具包
- Project：项目配置和代码组织单元
- Build：编译
- Run：运行

## 参考文献

- [Get started with C#](https://learn.microsoft.com/en-us/training/paths/get-started-c-sharp-part-1/)
- [A tour of C#](https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/overview)

## 推荐论文 / 文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  学新语言时，很容易把工具链当魔法；这篇文章有助于你保持工程视角。
