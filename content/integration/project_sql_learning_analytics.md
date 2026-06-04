# 项目十六：SQL 学习分析与指标追踪看板

## 项目目标

做一个学习分析看板，统计：

- 每日完成题数
- 各语言通过率
- 最近薄弱知识点
- 连续学习天数

## 为什么这个项目值得做

这类项目很适合把：

- SQL 报表
- 聚合统计
- 数据展示
- 学习产品思维

一起串起来。

## 推荐 MVP 范围

- 设计一张练习记录表
- 做三条核心统计 SQL
- 输出简化看板文本或表格

## 拆分建议

- `load_attempts()`
- `calc_daily_metrics()`
- `calc_track_pass_rate()`
- `render_dashboard()`

## 验收标准

- 能输出至少 3 个学习指标
- 指标含义清晰
- 能解释每条统计 SQL 为什么这样写

## 参考文献

- SQL window/reporting docs
- SQLite aggregate functions: https://sqlite.org/lang_aggfunc.html

## 推荐阅读

- Data storytelling and KPI design articles
