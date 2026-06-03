# 项目十一：Python 学习报表生成流水线

## 项目目标

把多份学习记录、练习结果或日志文件汇总成一份结构化报表，输出为终端摘要、CSV 或 Markdown。

## 这个项目为什么重要

- 文件读取
- JSON / CSV 处理
- 数据汇总逻辑
- 输出格式设计

## 推荐 MVP 范围

- 读取一个目录下的多份记录文件
- 汇总总题数、通过率、最近活动
- 输出一份清晰的日报或周报

## 拆分建议

- 先统一输入格式
- 再写解析函数
- 再写汇总函数
- 最后写导出函数

## 验收标准

- 能稳定处理多份输入文件
- 报表字段固定，不是随手 print
- 出错文件会被单独提示，不影响整体结果

## 继续升级方向

- 加图表数据导出
- 加按语言主线统计
- 加数据库入库与历史对比
- 加自动化定时生成

## 参考资料

- [json — JSON encoder and decoder](https://docs.python.org/3/library/json.html)
- [csv — CSV File Reading and Writing](https://docs.python.org/3/library/csv.html)
- [pathlib — Object-oriented filesystem paths](https://docs.python.org/3/library/pathlib.html)

## 推荐论文 / 经典文章

- [MapReduce: Simplified Data Processing on Large Clusters](https://research.google.com/archive/mapreduce-osdi04.pdf)
  这个项目规模很小，但很适合先建立“读取 → 转换 → 汇总 → 输出”的数据流水线直觉。
