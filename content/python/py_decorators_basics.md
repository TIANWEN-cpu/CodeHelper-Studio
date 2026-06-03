# 装饰器入门：给函数加一层能力

## 你会学到

- 理解“函数也能当数据传来传去”的意思
- 看懂最小装饰器结构
- 知道装饰器适合做什么，不适合做什么

## 为什么这节课重要

很多 Python 教程把装饰器写得像魔法，结果初学者一看就退。其实它只是“接收函数、返回新函数”的一种组织方式。你先把这个最小模型想通，后面再看日志、权限、计时这些用法就顺了。

## 核心知识

- Python 里的函数是一等对象，可以赋值、传参、返回。
- 装饰器的本质是：输入一个函数，输出一个增强版函数。
- `@decorator` 只是语法糖，本质仍然是函数包函数。

## 最小示例

```python
def log_call(func):
    def wrapper(*args, **kwargs):
        print("调用开始")
        result = func(*args, **kwargs)
        print("调用结束")
        return result
    return wrapper

@log_call
def add(a, b):
    return a + b

print(add(2, 3))
```

## 这段代码怎么读

1. `log_call` 接收一个函数 `func`
2. 它在内部定义了 `wrapper`
3. `wrapper` 先做额外逻辑，再调用原函数
4. 最后返回 `wrapper`，于是原函数被“包了一层”

## 常见误区

- 一上来就学很多层嵌套，结果只记住写法没记住原理
- 忘记返回原函数执行结果
- 装饰器里把业务逻辑和通用逻辑混在一起
- 看到 `@` 就觉得一定高级，其实很多场景普通函数更清楚

## 什么时候适合用

- 统计函数执行时间
- 打日志
- 做权限检查
- 对重复逻辑做统一封装

## 什么时候先别用

- 团队还看不懂这段代码时
- 只是一次性逻辑，不值得抽象
- 你自己还没搞清楚返回值和闭包关系时

## 小练习

- 写一个装饰器，在函数执行前打印“开始”
- 再写一个装饰器，在函数返回后打印结果
- 试着给两个不同函数复用同一个装饰器

## 参考资料

- [Python Glossary: decorator](https://docs.python.org/3/glossary.html#term-decorator)
- [Python Language Reference: function definitions](https://docs.python.org/3/reference/compound_stmts.html#function-definitions)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  装饰器真正有价值的地方，不是语法酷，而是它能帮助你把横切逻辑和业务逻辑拆开。
