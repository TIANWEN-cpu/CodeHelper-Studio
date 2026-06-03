# 项目十四：数据库结构审计与检查清单工具

## 项目目标

做一个工具，用来检查数据库结构是否满足最小规范：

- 是否有主键
- 是否有外键
- 是否缺少必要索引
- 是否存在命名混乱

## 为什么这个项目值得做

这个项目很适合把“学过的数据库知识”变成可交付的分析工具。  
它不只是写 SQL，而是在做结构检查和规则表达。

## 推荐 MVP 范围

- 读取表和列信息
- 检查是否存在主键
- 输出一个简化检查报告

## 拆分建议

- `load_schema()`
- `check_primary_keys()`
- `check_foreign_keys()`
- `build_report()`

## 验收标准

- 能输出每张表的检查结果
- 能指出至少 2 类结构问题
- 报告格式清晰可读

## 参考文献

- SQLite pragma table_info: https://www.sqlite.org/pragma.html#pragma_table_info
- PostgreSQL information schema: https://www.postgresql.org/docs/current/information-schema.html

## 推荐阅读

- Database design review checklists from industry blog posts
