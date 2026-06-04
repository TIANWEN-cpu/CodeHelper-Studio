# 桌面应用的分层设计笔记

## 你会学到

- 知道 UI 层不该承载所有逻辑
- 会拆出应用服务和仓储层
- 理解 ViewModel / DTO / Entity 的边界

## 先修知识

- 类与对象
- 文件与 JSON
- LINQ 基础

## 为什么这节课重要

桌面应用最容易写成“窗体代码一把梭”。早一点建立层次感，后面加功能时就不会越改越怕。

## 核心知识

- UI 负责展示和交互，应用层负责编排，数据层负责持久化
- 领域对象和展示对象不一定一一对应
- 先把依赖方向想清楚，再写代码

## 示例

```text
UI -> Application Service -> Repository -> SQLite / File
          \-> ViewModel / DTO
```

## 继续练什么

- 把一个“保存笔记”功能拆成 UI、Service、Repository 三层
- 比较直接写文件和走仓储接口的区别

## 参考资料

- [MVVM Toolkit](https://learn.microsoft.com/en-us/dotnet/communitytoolkit/mvvm/)
- [WPF overview](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/)

## 推荐论文 / 经典文章

- [Patterns of Enterprise Application Architecture](https://martinfowler.com/books/eaa.html)
