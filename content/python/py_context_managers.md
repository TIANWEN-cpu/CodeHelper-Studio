# 上下文管理器：把资源打开和收尾写稳

## 学习目标

- 理解为什么 `with` 能让代码更稳
- 会使用文件上下文管理器
- 知道上下文管理器背后的“进入 / 退出”思想

## 先修知识

- 文件读写
- 异常处理

## 为什么这节课重要

很多 bug 不是因为逻辑不会写，而是因为：

- 文件开了忘记关
- 数据库连接出错后没收尾
- 临时状态设置了却没恢复

`with` 的意义，就是帮你把“开始”和“收尾”绑在一起。

## 最常见例子：读文件

```python
with open("notes.txt", "r", encoding="utf-8") as f:
    text = f.read()
```

这里最重要的不是 `as f`，而是：

- 进入 `with` 时打开文件
- 离开 `with` 时自动关闭文件

哪怕中间抛异常，也会尽量完成收尾。

## 和手动写法对比

```python
f = open("notes.txt", "r", encoding="utf-8")
try:
    text = f.read()
finally:
    f.close()
```

`with` 本质上是在帮你写一层更稳、更简洁的模板。

## 什么时候该优先想到 `with`

- 文件读写
- 临时锁
- 数据库连接 / 会话
- 临时切换配置
- 任何“必须成对出现”的资源管理

## 自定义上下文管理器的最小直觉

你暂时不用急着把协议背下来，先理解：

- 进入时做准备
- 退出时做清理

如果以后看到 `__enter__` 和 `__exit__`，就把它理解成这两个动作。

## 常见错误

### 误区 1：只有文件才能用 `with`

不是。任何需要“开始 + 收尾”成对管理的资源，都适合上下文管理器。

### 误区 2：离开 `with` 后对象还能照常长期使用

不一定。像文件这种资源，离开后往往已经关闭了。

### 误区 3：`with` 只是语法糖，不重要

它确实有“模板化”的成分，但工程里“收尾不漏”非常重要，这不是小事。

## 小练习

### 练习 1

用 `with` 读取一个 UTF-8 文本文件，并打印前两行。

### 练习 2

把一段手动 `open/close` 的代码改写成 `with` 版本。

### 练习 3

思考你现在学过的资源里，还有哪些适合“开始和结束绑定起来”。

## 课后总结

- `with` 的核心是稳定管理资源
- 它让“开始”和“收尾”自动成对出现
- 文件只是最常见场景，不是唯一场景

## 参考文献

- Python 官方教程 `with`: https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files
- Python 数据模型 `with` 协议: https://docs.python.org/3/reference/datamodel.html#context-managers

## 推荐阅读

- Raymond Hettinger, _Transforming Code into Beautiful, Idiomatic Python_: https://www.youtube.com/watch?v=OSGv2VnC0go
