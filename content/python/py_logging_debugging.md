# 日志与调试：先让程序“会说话”

## 学习目标

- 理解日志为什么比到处 `print` 更稳
- 会写最小 `logging` 配置
- 知道调试时该看什么、记什么

## 先修知识

- 函数
- 异常处理

## 为什么这节课重要

代码一复杂，光靠肉眼猜哪里错了会越来越慢。  
日志的价值就是让程序自己把关键信息吐出来。

## 最小例子

```python
import logging

logging.basicConfig(level=logging.INFO)

logging.info("开始加载用户数据")
logging.warning("配置文件不存在，使用默认值")
```

## 为什么不建议到处乱 `print`

- 信息级别不清楚
- 难以筛选
- 后期不好统一收集

## 调试时最值得记录什么

- 当前处理到哪一步
- 关键输入值
- 关键分支是否走到
- 失败原因和上下文

## 常见错误

- 把敏感信息直接打进日志
- 所有日志都用一个级别
- 出问题时只记“失败了”，不记具体上下文

## 小练习

- 给一个文件读取函数加两条 `logging.info`
- 给一个参数校验失败场景加 `logging.warning`

## 课后总结

- 日志不是装饰，而是排错基础设施
- 先学会记录关键节点，再谈复杂日志体系

## 参考文献

- logging docs: https://docs.python.org/3/library/logging.html

## 推荐阅读

- Python Logging Cookbook: https://docs.python.org/3/howto/logging-cookbook.html
