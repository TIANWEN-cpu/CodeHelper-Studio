# argparse 入门：把脚本变成真正能用的命令行工具

## 学习目标

- 理解命令行参数为什么能提升工具感
- 会写最小 `argparse` 程序
- 知道 `--help` 和位置参数的基本意义

## 先修知识

- 函数
- 字符串
- 文件读写更容易串起来

## 为什么这节课重要

当你的脚本只能靠改源码来换输入时，它还像半成品。  
一旦支持命令行参数，它就开始更像一个真正的工具。

## 最小例子

```python
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("name")
args = parser.parse_args()

print(f"hello, {args.name}")
```

命令行里运行：

```bash
python app.py Alice
```

## 带可选参数的版本

```python
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("path")
parser.add_argument("--limit", type=int, default=10)
args = parser.parse_args()

print(args.path, args.limit)
```

这里最常见的两个类型：

- 位置参数：必须给
- 可选参数：通常以 `--` 开头

## 为什么 `--help` 很重要

好的命令行工具，不该让用户猜怎么用。  
`argparse` 会自动帮你生成一份基础帮助信息，这是很划算的工程化能力。

## 常见错误

- 把所有逻辑都写在参数解析后面，不做函数拆分
- 参数名取得太随意，看不出含义
- 不给默认值和帮助说明，最后工具自己也看不懂

## 小练习

- 写一个脚本，接收文件路径和 `--top` 参数
- 用 `--help` 看自动生成的帮助文案

## 课后总结

- `argparse` 能让脚本像工具
- 参数设计本身就是产品设计的一部分
- 先做最小可用，再逐步丰富

## 参考文献

- argparse docs: https://docs.python.org/3/library/argparse.html

## 推荐阅读

- Python Packaging User Guide CLI entry points: https://packaging.python.org/en/latest/specifications/entry-points/
