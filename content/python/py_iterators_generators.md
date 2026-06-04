# 迭代器、生成器与惰性处理

## 学习目标

- 理解 `for` 循环背后的迭代协议
- 会写最基本的生成器
- 知道为什么“边生成边处理”有时更省内存

## `for` 到底在做什么

很多时候我们会写：

```python
for item in items:
    print(item)
```

但在更深一层，`for` 实际上是在不断向对象要“下一个元素”。  
这也是为什么列表、字符串、字典都能被遍历。

## 生成器为什么好用

```python
def countdown(n):
    while n > 0:
        yield n
        n -= 1
```

调用它时不会一次性得到所有结果，而是一个一个地产生。  
这种方式特别适合处理大文件、长日志或流式数据。

## 什么时候值得用

- 数据量比较大
- 不想一次性把全部结果放进内存
- 希望把“生成数据”和“消费数据”拆开

## 常见误区

- 把生成器当成列表
- 用过一次生成器后忘了它可能已经耗尽
- 还没理解普通循环时，就急着追求“高级写法”

## 参考文献

- [The Python Tutorial - Data Structures](https://docs.python.org/3/tutorial/datastructures.html)
- [Python Functional Programming HOWTO](https://docs.python.org/3/howto/functional.html)

## 推荐论文 / 文章

- [An Axiomatic Basis for Computer Programming](https://research.cs.queensu.ca/home/cordy/cisc860/Biblio/drb/GS/hoare69.pdf)
  这篇文章更偏理论，但很适合帮助你理解“程序行为是可以被描述和推理的”。
