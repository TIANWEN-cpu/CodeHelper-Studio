# 项目二：日志分析器

## 项目目标

- 读取日志文件
- 解析日志级别和时间
- 输出按级别统计的汇总结果

## 推荐 MVP 范围

- 先支持 `INFO / WARNING / ERROR`
- 先做单文件输入
- 先输出到终端，不急着做图表

## 推荐拆分

- `load_lines(path)`
- `parse_level(line)`
- `summarize_levels(lines)`
- `print_report(result)`

## 验收标准

- 能正确读取日志文件
- 能统计每种级别的数量
- 能输出一份清晰的汇总结果

## 学习收获

做完这个项目，你会明显感受到：  
文件处理、字典统计和结构化输出，已经开始从“题目知识点”变成“工具能力”。

## 参考文献

- [pathlib](https://docs.python.org/3/library/pathlib.html)
- [The Python Tutorial - Input and Output](https://docs.python.org/3/tutorial/inputoutput.html)
- [SQLite SQL Language](https://sqlite.org/lang.html)

## 推荐论文 / 文章

- [MapReduce: Simplified Data Processing on Large Clusters](https://research.google.com/archive/mapreduce-osdi04.pdf)
  等你以后做更大规模日志处理时，会很自然地回想起这篇文章里的思想。
