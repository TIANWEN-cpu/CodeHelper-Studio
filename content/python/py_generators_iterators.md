# 生成器与迭代器：让数据按需流动

## 学习目标

- 理解“可迭代对象”“迭代器”“生成器”三者的关系
- 会读懂 `for` 循环背后到底在做什么
- 能用 `yield` 写出最小生成器，减少一次性构造大列表的压力

## 先修知识

- 函数、列表、循环
- 对返回值和状态变化有基本理解

## 为什么这节课重要

很多初学者会把循环只看成“把列表一个个拿出来”。但当数据量变大、或者数据是实时产生的时候，你会发现：

- 不一定要先把所有结果都放进列表
- 不一定要一次性把所有数据都算完
- 有些数据更适合“用到哪儿，算到哪儿”

这就是迭代器和生成器最常见的价值。

## 先把概念分清

- 可迭代对象：可以被 `for` 遍历的对象，比如列表、字符串、字典
- 迭代器：真正负责“下一个元素是谁”的对象
- 生成器：一种特别方便的迭代器写法，通常由 `yield` 产生

你可以先记一句很实用的话：

> 列表像“一次性准备好一箱东西”，生成器像“边走边发货”。

## `for` 背后发生了什么

```python
items = [10, 20, 30]

for item in items:
    print(item)
```

这段代码表面上很简单，但本质上相当于：

```python
items = [10, 20, 30]
iterator = iter(items)

while True:
    try:
        item = next(iterator)
        print(item)
    except StopIteration:
        break
```

这就是为什么我们说，`for` 真正依赖的是迭代协议。

## 最小生成器

```python
def countdown(n):
    while n > 0:
        yield n
        n -= 1

for value in countdown(3):
    print(value)
```

输出：

```text
3
2
1
```

这里的重点不是语法酷不酷，而是：

- 函数没有一次性返回完整列表
- 每次被遍历时，只交出一个值
- 状态会保留到下一次继续执行

## 和列表返回值对比

```python
def squares_list(n):
    result = []
    for i in range(n):
        result.append(i * i)
    return result


def squares_gen(n):
    for i in range(n):
        yield i * i
```

第一种更适合：

- 数据量不大
- 需要多次重复访问结果

第二种更适合：

- 数据量可能很大
- 只想顺序消费
- 更关注“过程”而不是“一次性拿到全部结果”

## 常见误区

### 误区 1：生成器比列表“永远更高级”

不是。生成器只是更适合某些场景。  
如果你后面还要反复取长度、切片、随机访问，列表更顺手。

### 误区 2：`yield` 和 `return` 差不多

不一样。

- `return`：函数结束，直接交出最终结果
- `yield`：先交一个值出去，函数暂停，下次继续

### 误区 3：把生成器当成可重复消费的容器

很多生成器迭代一次就“用完了”。如果要重复使用，通常需要重新创建。

## 小练习

### 练习 1

写一个 `count_up(n)` 生成器，依次产生 `1` 到 `n`。

### 练习 2

写一个 `even_numbers(numbers)` 生成器，只产生序列中的偶数。

### 练习 3

把“返回奇数平方列表”的代码，改写成生成器版本。

## 进阶练习

尝试写一个 `read_lines(path)` 生成器，每次产生文件中的一行内容。  
这类写法在日志处理和大文本读取里很常见。

## 课后总结

- `for` 循环底层依赖迭代器
- 生成器是“按需产出值”的函数
- `yield` 让函数能暂停和继续
- 生成器不是为了炫技，而是为了更自然地表达数据流

## 参考文献

- Python 官方教程 Iterators: https://docs.python.org/3/tutorial/classes.html#iterators
- Python 官方教程 Generators: https://docs.python.org/3/tutorial/classes.html#generators
- Python 内置函数 `iter`: https://docs.python.org/3/library/functions.html#iter

## 推荐论文 / 文章

- David Beazley, _Generator Tricks for Systems Programmers_: https://www.dabeaz.com/generators/
