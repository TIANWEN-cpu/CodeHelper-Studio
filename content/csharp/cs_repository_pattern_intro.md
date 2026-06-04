# Repository 模式入门：把数据访问先收口

## 学习目标

- 理解为什么要把数据访问集中起来
- 知道 Repository 模式最小想解决什么问题
- 会画出“业务层”和“数据访问层”的最小边界

## 先修知识

- 接口
- 文件持久化或数据库基础

## 为什么这节课重要

如果你的业务代码里到处散着：

- SQL
- 文件读写
- JSON 序列化

后面会很难改。Repository 的最小价值就是：

- 让数据访问有一个统一入口
- 让业务层少管存储细节

## 最小接口例子

```csharp
public interface ITaskRepository
{
    void Add(TaskItem item);
    List<TaskItem> GetAll();
}
```

业务层只依赖这个接口，不关心底层到底是：

- JSON 文件
- SQLite
- 远程 API

## 常见错误

- 还没复杂到需要收口时就过度设计
- Repository 里又塞业务逻辑，边界仍然不清楚

## 小练习

- 给任务系统定义一个 `ITaskRepository`
- 想一想哪些代码应该留在业务层，哪些应该进数据访问层

## 课后总结

- Repository 模式的关键是收口和解耦
- 先做最小接口，不要一开始就设计很大

## 参考文献

- Microsoft architecture guide pattern references
- Martin Fowler on Repository: https://martinfowler.com/eaaCatalog/repository.html
