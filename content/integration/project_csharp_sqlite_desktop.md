# 项目十：C# + SQLite 本地记录桌面工具

## 项目目标

做一个本地使用的小工具，用 C# 管界面或交互逻辑，用 SQLite 存学习记录、任务记录或个人资料。

## 这个项目为什么重要

- C# 面向对象建模
- 本地数据持久化
- 界面交互与数据层分工
- 从“练语法”走向“做产品”

## 推荐 MVP 范围

- 一张主表保存记录
- 支持新增、查看、删除
- 界面上能看到列表和详情
- 关闭后数据仍然保留

## 拆分建议

- 先确定记录模型
- 再设计 SQLite 表结构
- 然后写最小 CRUD
- 最后补界面细节和错误提示

## 验收标准

- 至少一条记录能被成功创建和读取
- 删除后界面和数据库状态一致
- 数据层和界面层不混成一团

## 继续升级方向

- 加筛选和搜索
- 加导出 JSON
- 加“最近更新”排序
- 加多表关系

## 参考资料

- [SQLite documentation](https://sqlite.org/docs.html)
- [Microsoft Learn: Get started with C#](https://learn.microsoft.com/en-us/training/paths/get-started-c-sharp-part-1/)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  这个项目最适合练模块拆分：界面、模型、数据访问、应用逻辑应该分开。
