# 递归思维与分治入门

## 你会学到

- 会写出最小递归函数
- 知道如何设计终止条件
- 理解递归和循环并不是互相替代，而是互相补充

## 为什么这节课重要

递归最有价值的地方，不是面试题，而是训练你把问题拆成“当前一步 + 更小的同类问题”。这个习惯会反过来帮助你写更好的普通函数。

## 核心知识

- 先写终止条件，再写递归关系
- 每一次递归都必须朝终止条件靠近
- 当状态很多、层级很深时，要警惕递归可读性和调用深度

## 示例

```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```

## 常见误区

- 终止条件漏掉 0 或 1
- 递归关系没有缩小问题规模
- 把递归当魔法，不画调用过程

## 继续练什么

- 写一个递归版的字符串反转函数
- 把递归版阶乘改写成循环版，对比可读性

## 参考资料

- [Python Tutorial: Defining Functions](https://docs.python.org/3/tutorial/controlflow.html#defining-functions)

## 推荐论文 / 经典文章

- [Recursive Functions of Symbolic Expressions and Their Computation by Machine, Part I](https://www-formal.stanford.edu/jmc/recursive/recursive.html)
  这是理解递归式程序设计思想的经典源头之一。
