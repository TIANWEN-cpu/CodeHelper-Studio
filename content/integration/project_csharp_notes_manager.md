# 项目十七：C# 本地笔记管理器

## 项目目标

做一个本地笔记管理器，支持：

- 新建笔记
- 查看笔记列表
- 关键字搜索
- 保存到本地文件或 SQLite

## 为什么这个项目值得做

它能把这些知识点合并起来：

- 对象建模
- 持久化
- 搜索过滤
- 简单界面或控制台交互

## 推荐 MVP 范围

- 先只支持标题和内容
- 先用本地文件保存
- 有搜索和列表功能就够用

## 拆分建议

- `Note` 模型
- `INoteRepository`
- `SaveNote()`
- `SearchNotes()`

## 验收标准

- 能保存与读取笔记
- 能按关键字筛选
- 界面层和数据层有基本分工

## 参考文献

- System.Text.Json docs
- .NET file IO docs

## 推荐阅读

- Small desktop app architecture examples
