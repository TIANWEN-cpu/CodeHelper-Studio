# 项目十二：C 日志解析与错误统计工具

## 项目目标

做一个命令行日志解析工具，读取文本日志文件，统计：

- 总行数
- ERROR 数量
- WARN 数量
- 最后输出摘要报告

## 为什么这个项目值得做

它能把这些知识点串起来：

- 文件读写
- 字符串处理
- 条件判断
- 结构化统计
- 命令行参数

## 推荐 MVP 范围

第一版只做：

- 接收日志文件路径
- 按行读取
- 用字符串匹配统计级别
- 最后打印汇总结果

## 数据结构建议

```c
typedef struct {
    int total;
    int info_count;
    int warn_count;
    int error_count;
} LogStats;
```

## 拆分建议

- `int parse_file(const char *path, LogStats *stats);`
- `void print_report(const LogStats *stats);`
- `int is_error_line(const char *line);`

## 验收标准

- 能接收文件路径
- 能按行读取日志
- 能输出每种级别数量
- 文件不存在时给出提示

## 参考文献

- cppreference `fgets`: https://en.cppreference.com/w/c/io/fgets
- GNU C string functions: https://www.gnu.org/software/libc/manual/html_node/String_002fArray-Utilities.html

## 推荐阅读

- The Practice of Programming, Chapter 2
